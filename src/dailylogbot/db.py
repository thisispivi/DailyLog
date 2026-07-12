"""SQLite persistence boundary for DailyLog records and user preferences."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Final, cast

VALID_KINDS: Final = frozenset({"meal", "training", "sleep"})
ACTIVITY_KINDS: Final = frozenset({"training", "sleep"})
VALID_LOCALES: Final = frozenset({"en", "it"})
VALID_WEIGHT_UNITS: Final = frozenset({"kg", "lb"})
TRASH_RETENTION_DAYS: Final = 30
type EntryFieldValue = str | datetime | None
_EDITABLE_FIELDS: Final = frozenset({"kind", "label", "text", "start_at", "end_at"})
_SOFT_DELETE_QUERIES: Final = {
    "entries": (
        "UPDATE entries SET deleted_at = ?, updated_at = ? WHERE user_id = ? AND id = ? AND deleted_at IS NULL"
    ),
    "weigh_ins": (
        "UPDATE weigh_ins SET deleted_at = ?, updated_at = ? WHERE user_id = ? AND id = ? AND deleted_at IS NULL"
    ),
}


class PersistenceError(RuntimeError):
    """Raised when SQLite cannot safely complete a persistence operation."""


class ActiveActivityError(PersistenceError):
    """Raised when an operation would create a second open activity."""


@dataclass(frozen=True)
class Entry:
    """One validated meal, training, or sleep record."""

    id: int
    user_id: int
    kind: str
    label: str
    text: str
    start_at: datetime
    end_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @property
    def is_open(self) -> bool:
        """Whether this is the user's unfinished activity."""
        return self.kind in ACTIVITY_KINDS and self.end_at is None


@dataclass(frozen=True)
class UserSettings:
    """The persisted presentation choices for one Telegram user."""

    user_id: int
    locale: str
    weight_unit: str


@dataclass(frozen=True)
class WeighIn:
    """A body-weight reading, always stored as integer metric grams."""

    id: int
    user_id: int
    weight_grams: int
    recorded_at: datetime
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class TrashItem:
    """A recoverable deleted entry or weigh-in."""

    record_type: str
    record_id: int
    label: str
    deleted_at: datetime


class Database:
    """Provide transactional SQLite access without leaking SQL into handlers."""

    def __init__(self, path: Path) -> None:
        """Initialize storage, schema, and expired-trash maintenance.

        Args:
            path: SQLite database file to create or open.

        Side Effects:
            Creates missing parent directories, initializes or migrates the schema, and removes expired trash.
        """
        self.path = path.expanduser()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize_schema()
        self.purge_deleted_before(datetime.now(UTC) - timedelta(days=TRASH_RETENTION_DAYS))

    def get_or_create_settings(self, user_id: int, initial_locale: str) -> UserSettings:
        """Read a user's preferences, seeding them once from Telegram's locale."""
        _validate_user_id(user_id)
        locale = _validate_locale(initial_locale)
        try:
            with self._connection() as connection:
                connection.execute("BEGIN IMMEDIATE")
                row = connection.execute("SELECT * FROM user_settings WHERE user_id = ?", (user_id,)).fetchone()
                if row is None:
                    connection.execute(
                        "INSERT INTO user_settings (user_id, locale, weight_unit) VALUES (?, ?, 'kg')",
                        (user_id, locale),
                    )
                    row = connection.execute("SELECT * FROM user_settings WHERE user_id = ?", (user_id,)).fetchone()
        except sqlite3.Error as error:
            raise PersistenceError("User settings could not be loaded.") from error
        if row is None:
            raise PersistenceError("User settings could not be read after creation.")
        return _row_to_settings(row)

    def update_settings(
        self, user_id: int, *, locale: str | None = None, weight_unit: str | None = None
    ) -> UserSettings:
        """Replace one or both saved presentation choices."""
        _validate_user_id(user_id)
        if locale is not None:
            _validate_locale(locale)
        if weight_unit is not None:
            _validate_weight_unit(weight_unit)
        try:
            with self._connection() as connection:
                existing = connection.execute("SELECT * FROM user_settings WHERE user_id = ?", (user_id,)).fetchone()
                if existing is None:
                    raise PersistenceError("User settings must be initialized before they can be updated.")
                next_locale = locale or str(existing["locale"])
                next_unit = weight_unit or str(existing["weight_unit"])
                connection.execute(
                    "UPDATE user_settings SET locale = ?, weight_unit = ? WHERE user_id = ?",
                    (next_locale, next_unit, user_id),
                )
                row = connection.execute("SELECT * FROM user_settings WHERE user_id = ?", (user_id,)).fetchone()
        except sqlite3.Error as error:
            raise PersistenceError("User settings could not be updated.") from error
        if row is None:
            raise PersistenceError("Updated user settings could not be read.")
        return _row_to_settings(row)

    def add_entry(
        self,
        *,
        user_id: int,
        kind: str,
        label: str,
        text: str,
        start_at: datetime,
        end_at: datetime | None = None,
    ) -> Entry:
        """Insert one validated log entry atomically."""
        _validate_user_id(user_id)
        _validate_entry_values(kind, label, text, start_at, end_at)
        recorded_at = datetime.now(UTC)
        try:
            with self._connection() as connection:
                connection.execute("BEGIN IMMEDIATE")
                cursor = connection.execute(
                    """
                    INSERT INTO entries (user_id, kind, label, text, start_at, end_at, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        user_id,
                        kind,
                        label,
                        text,
                        _serialize_datetime(start_at),
                        _serialize_datetime(end_at) if end_at is not None else None,
                        _serialize_datetime(recorded_at),
                        _serialize_datetime(recorded_at),
                    ),
                )
                row = connection.execute(
                    "SELECT * FROM entries WHERE id = ? AND deleted_at IS NULL", (cursor.lastrowid,)
                ).fetchone()
        except sqlite3.IntegrityError as error:
            if kind in ACTIVITY_KINDS and end_at is None:
                raise ActiveActivityError("An activity is already open for this user.") from error
            raise PersistenceError("The entry could not be saved because of a database constraint.") from error
        except sqlite3.Error as error:
            raise PersistenceError("The entry could not be saved.") from error
        if row is None:
            raise PersistenceError("The created entry could not be read.")
        return _row_to_entry(row)

    def get_entry(self, user_id: int, entry_id: int) -> Entry | None:
        """Retrieve one non-deleted owned entry."""
        _validate_user_id(user_id)
        _validate_record_id(entry_id)
        row = self._fetch_one(
            "SELECT * FROM entries WHERE user_id = ? AND id = ? AND deleted_at IS NULL", (user_id, entry_id)
        )
        return _row_to_entry(row) if row is not None else None

    def get_last_entry(self, user_id: int) -> Entry | None:
        """Retrieve the most recently created non-deleted entry."""
        _validate_user_id(user_id)
        row = self._fetch_one(
            "SELECT * FROM entries WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1",
            (user_id,),
        )
        return _row_to_entry(row) if row is not None else None

    def get_open_activity(self, user_id: int) -> Entry | None:
        """Retrieve the user's sole unfinished training or sleep entry."""
        _validate_user_id(user_id)
        row = self._fetch_one(
            """
            SELECT * FROM entries WHERE user_id = ? AND deleted_at IS NULL AND end_at IS NULL
              AND kind IN ('training', 'sleep') ORDER BY start_at ASC, id ASC LIMIT 1
            """,
            (user_id,),
        )
        return _row_to_entry(row) if row is not None else None

    def end_active_entry(self, user_id: int, kind: str, end_at: datetime) -> Entry | None:
        """Close one requested kind of open activity."""
        if kind not in ACTIVITY_KINDS:
            raise ValueError("kind must be training or sleep")
        return self._end_activity(user_id, end_at, kind)

    def end_open_activity(self, user_id: int, end_at: datetime) -> Entry | None:
        """Close the user's sole open activity."""
        return self._end_activity(user_id, end_at, None)

    def cancel_open_activity(self, user_id: int, cancelled_at: datetime) -> Entry | None:
        """Move the open activity to the recoverable trash."""
        _validate_user_id(user_id)
        _validate_aware_datetime(cancelled_at, "cancelled_at")
        try:
            with self._connection() as connection:
                connection.execute("BEGIN IMMEDIATE")
                row = connection.execute(
                    """
                    SELECT * FROM entries WHERE user_id = ? AND deleted_at IS NULL AND end_at IS NULL
                      AND kind IN ('training', 'sleep') ORDER BY start_at ASC, id ASC LIMIT 1
                    """,
                    (user_id,),
                ).fetchone()
                if row is None:
                    return None
                entry = _row_to_entry(row)
                connection.execute(
                    "UPDATE entries SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
                    (_serialize_datetime(cancelled_at), _serialize_datetime(cancelled_at), entry.id),
                )
        except sqlite3.Error as error:
            raise PersistenceError("The activity could not be cancelled.") from error
        return entry

    def update_entry(self, user_id: int, entry_id: int, fields: Mapping[str, EntryFieldValue]) -> Entry | None:
        """Update allowed entry fields while preserving activity invariants."""
        _validate_user_id(user_id)
        _validate_record_id(entry_id)
        unsupported_fields = set(fields).difference(_EDITABLE_FIELDS)
        if unsupported_fields:
            raise ValueError(f"Unsupported editable fields: {', '.join(sorted(unsupported_fields))}")
        try:
            with self._connection() as connection:
                connection.execute("BEGIN IMMEDIATE")
                row = connection.execute(
                    "SELECT * FROM entries WHERE user_id = ? AND id = ? AND deleted_at IS NULL", (user_id, entry_id)
                ).fetchone()
                if row is None:
                    return None
                entry = _row_to_entry(row)
                if not fields:
                    return entry
                _validate_entry_values(*_entry_candidate(entry, fields))
                start_at = fields.get("start_at")
                end_at = fields.get("end_at")
                connection.execute(
                    """
                    UPDATE entries
                    SET kind = CASE WHEN ? THEN ? ELSE kind END,
                        label = CASE WHEN ? THEN ? ELSE label END,
                        text = CASE WHEN ? THEN ? ELSE text END,
                        start_at = CASE WHEN ? THEN ? ELSE start_at END,
                        end_at = CASE WHEN ? THEN ? ELSE end_at END,
                        updated_at = ?
                    WHERE user_id = ? AND id = ? AND deleted_at IS NULL
                    """,
                    (
                        "kind" in fields,
                        fields.get("kind", ""),
                        "label" in fields,
                        fields.get("label", ""),
                        "text" in fields,
                        fields.get("text", ""),
                        "start_at" in fields,
                        _serialize_datetime(start_at) if isinstance(start_at, datetime) else "",
                        "end_at" in fields,
                        _serialize_datetime(end_at) if isinstance(end_at, datetime) else end_at,
                        _serialize_datetime(datetime.now(UTC)),
                        user_id,
                        entry_id,
                    ),
                )
                updated_row = connection.execute(
                    "SELECT * FROM entries WHERE user_id = ? AND id = ? AND deleted_at IS NULL", (user_id, entry_id)
                ).fetchone()
        except sqlite3.IntegrityError as error:
            raise ActiveActivityError("An activity is already open for this user.") from error
        except sqlite3.Error as error:
            raise PersistenceError("The entry could not be updated.") from error
        if updated_row is None:
            raise PersistenceError("The updated entry could not be read.")
        return _row_to_entry(updated_row)

    def delete_entry(self, user_id: int, entry_id: int, deleted_at: datetime) -> bool:
        """Soft-delete one owned entry."""
        return self._soft_delete("entries", user_id, entry_id, deleted_at)

    def delete_entries_between(self, user_id: int, start_at: datetime, end_at: datetime, deleted_at: datetime) -> int:
        """Atomically soft-delete entries overlapping a half-open interval."""
        _validate_user_id(user_id)
        _validate_interval(start_at, end_at)
        _validate_aware_datetime(deleted_at, "deleted_at")
        try:
            with self._connection() as connection:
                connection.execute("BEGIN IMMEDIATE")
                cursor = connection.execute(
                    """
                    UPDATE entries SET deleted_at = ?, updated_at = ?
                    WHERE user_id = ? AND deleted_at IS NULL AND start_at < ?
                      AND ((kind = 'meal' AND start_at >= ?)
                        OR (kind IN ('training', 'sleep') AND (end_at IS NULL OR end_at > ?)))
                    """,
                    (
                        _serialize_datetime(deleted_at),
                        _serialize_datetime(deleted_at),
                        user_id,
                        _serialize_datetime(end_at),
                        _serialize_datetime(start_at),
                        _serialize_datetime(start_at),
                    ),
                )
        except sqlite3.Error as error:
            raise PersistenceError("Entries could not be deleted for the requested period.") from error
        return cursor.rowcount

    def restore_entry(self, user_id: int, entry_id: int) -> Entry | None:
        """Restore a deleted entry, respecting the one-open-activity rule."""
        _validate_user_id(user_id)
        _validate_record_id(entry_id)
        try:
            with self._connection() as connection:
                connection.execute("BEGIN IMMEDIATE")
                row = connection.execute(
                    "SELECT * FROM entries WHERE user_id = ? AND id = ? AND deleted_at IS NOT NULL", (user_id, entry_id)
                ).fetchone()
                if row is None:
                    return None
                connection.execute(
                    "UPDATE entries SET deleted_at = NULL, updated_at = ? "
                    "WHERE user_id = ? AND id = ? AND deleted_at IS NOT NULL",
                    (_serialize_datetime(datetime.now(UTC)), user_id, entry_id),
                )
                restored_row = connection.execute(
                    "SELECT * FROM entries WHERE user_id = ? AND id = ?", (user_id, entry_id)
                ).fetchone()
        except sqlite3.IntegrityError as error:
            raise ActiveActivityError("End or cancel the current activity before restoring this one.") from error
        except sqlite3.Error as error:
            raise PersistenceError("The entry could not be restored.") from error
        return _row_to_entry(restored_row) if restored_row is not None else None

    def list_entries_between(self, user_id: int, start_at: datetime, end_at: datetime) -> list[Entry]:
        """List entries overlapping a half-open local-period interval."""
        _validate_user_id(user_id)
        _validate_interval(start_at, end_at)
        try:
            with self._connection() as connection:
                rows = connection.execute(
                    """
                    SELECT * FROM entries WHERE user_id = ? AND deleted_at IS NULL AND start_at < ?
                      AND ((kind = 'meal' AND start_at >= ?)
                        OR (kind IN ('training', 'sleep') AND (end_at IS NULL OR end_at > ?)))
                    ORDER BY start_at ASC, id ASC
                    """,
                    (
                        user_id,
                        _serialize_datetime(end_at),
                        _serialize_datetime(start_at),
                        _serialize_datetime(start_at),
                    ),
                ).fetchall()
        except sqlite3.Error as error:
            raise PersistenceError("Entries could not be listed for the requested period.") from error
        return [_row_to_entry(row) for row in rows]

    def list_entries(self, user_id: int) -> list[Entry]:
        """List every non-deleted entry in chronological order."""
        _validate_user_id(user_id)
        try:
            with self._connection() as connection:
                rows = connection.execute(
                    "SELECT * FROM entries WHERE user_id = ? AND deleted_at IS NULL ORDER BY start_at ASC, id ASC",
                    (user_id,),
                ).fetchall()
        except sqlite3.Error as error:
            raise PersistenceError("Entries could not be listed.") from error
        return [_row_to_entry(row) for row in rows]

    def add_weigh_in(self, user_id: int, weight_grams: int, recorded_at: datetime) -> WeighIn:
        """Store one validated metric body-weight reading."""
        _validate_user_id(user_id)
        _validate_weight_grams(weight_grams)
        _validate_aware_datetime(recorded_at, "recorded_at")
        now = datetime.now(UTC)
        try:
            with self._connection() as connection:
                cursor = connection.execute(
                    """
                    INSERT INTO weigh_ins (user_id, weight_grams, recorded_at, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        user_id,
                        weight_grams,
                        _serialize_datetime(recorded_at),
                        _serialize_datetime(now),
                        _serialize_datetime(now),
                    ),
                )
                row = connection.execute("SELECT * FROM weigh_ins WHERE id = ?", (cursor.lastrowid,)).fetchone()
        except sqlite3.Error as error:
            raise PersistenceError("The weigh-in could not be saved.") from error
        if row is None:
            raise PersistenceError("The saved weigh-in could not be read.")
        return _row_to_weigh_in(row)

    def get_weigh_in(self, user_id: int, weigh_in_id: int) -> WeighIn | None:
        """Retrieve one non-deleted owned weigh-in."""
        _validate_user_id(user_id)
        _validate_record_id(weigh_in_id)
        row = self._fetch_one(
            "SELECT * FROM weigh_ins WHERE user_id = ? AND id = ? AND deleted_at IS NULL", (user_id, weigh_in_id)
        )
        return _row_to_weigh_in(row) if row is not None else None

    def update_weigh_in(
        self, user_id: int, weigh_in_id: int, *, weight_grams: int | None = None, recorded_at: datetime | None = None
    ) -> WeighIn | None:
        """Update a body-weight value and/or its timestamp."""
        _validate_user_id(user_id)
        _validate_record_id(weigh_in_id)
        if weight_grams is not None:
            _validate_weight_grams(weight_grams)
        if recorded_at is not None:
            _validate_aware_datetime(recorded_at, "recorded_at")
        try:
            with self._connection() as connection:
                row = connection.execute(
                    "SELECT * FROM weigh_ins WHERE user_id = ? AND id = ? AND deleted_at IS NULL",
                    (user_id, weigh_in_id),
                ).fetchone()
                if row is None:
                    return None
                connection.execute(
                    """
                    UPDATE weigh_ins
                    SET weight_grams = CASE WHEN ? THEN ? ELSE weight_grams END,
                        recorded_at = CASE WHEN ? THEN ? ELSE recorded_at END,
                        updated_at = ?
                    WHERE user_id = ? AND id = ? AND deleted_at IS NULL
                    """,
                    (
                        weight_grams is not None,
                        weight_grams if weight_grams is not None else 0,
                        recorded_at is not None,
                        _serialize_datetime(recorded_at) if recorded_at is not None else "",
                        _serialize_datetime(datetime.now(UTC)),
                        user_id,
                        weigh_in_id,
                    ),
                )
                updated_row = connection.execute(
                    "SELECT * FROM weigh_ins WHERE user_id = ? AND id = ? AND deleted_at IS NULL",
                    (user_id, weigh_in_id),
                ).fetchone()
        except sqlite3.Error as error:
            raise PersistenceError("The weigh-in could not be updated.") from error
        return _row_to_weigh_in(updated_row) if updated_row is not None else None

    def delete_weigh_in(self, user_id: int, weigh_in_id: int, deleted_at: datetime) -> bool:
        """Soft-delete one owned weigh-in."""
        return self._soft_delete("weigh_ins", user_id, weigh_in_id, deleted_at)

    def restore_weigh_in(self, user_id: int, weigh_in_id: int) -> WeighIn | None:
        """Restore one deleted weigh-in."""
        _validate_user_id(user_id)
        _validate_record_id(weigh_in_id)
        try:
            with self._connection() as connection:
                cursor = connection.execute(
                    """
                    UPDATE weigh_ins SET deleted_at = NULL, updated_at = ?
                    WHERE user_id = ? AND id = ? AND deleted_at IS NOT NULL
                    """,
                    (_serialize_datetime(datetime.now(UTC)), user_id, weigh_in_id),
                )
                if cursor.rowcount == 0:
                    return None
                row = connection.execute(
                    "SELECT * FROM weigh_ins WHERE user_id = ? AND id = ?", (user_id, weigh_in_id)
                ).fetchone()
        except sqlite3.Error as error:
            raise PersistenceError("The weigh-in could not be restored.") from error
        return _row_to_weigh_in(row) if row is not None else None

    def list_weigh_ins_between(self, user_id: int, start_at: datetime, end_at: datetime) -> list[WeighIn]:
        """List non-deleted readings in a half-open interval."""
        _validate_user_id(user_id)
        _validate_interval(start_at, end_at)
        try:
            with self._connection() as connection:
                rows = connection.execute(
                    """
                    SELECT * FROM weigh_ins WHERE user_id = ? AND deleted_at IS NULL
                      AND recorded_at >= ? AND recorded_at < ? ORDER BY recorded_at ASC, id ASC
                    """,
                    (user_id, _serialize_datetime(start_at), _serialize_datetime(end_at)),
                ).fetchall()
        except sqlite3.Error as error:
            raise PersistenceError("Weigh-ins could not be listed for the requested period.") from error
        return [_row_to_weigh_in(row) for row in rows]

    def list_weigh_ins(self, user_id: int) -> list[WeighIn]:
        """List every non-deleted reading in chronological order."""
        _validate_user_id(user_id)
        try:
            with self._connection() as connection:
                rows = connection.execute(
                    "SELECT * FROM weigh_ins WHERE user_id = ? AND deleted_at IS NULL ORDER BY recorded_at ASC, id ASC",
                    (user_id,),
                ).fetchall()
        except sqlite3.Error as error:
            raise PersistenceError("Weigh-ins could not be listed.") from error
        return [_row_to_weigh_in(row) for row in rows]

    def list_trash(self, user_id: int, *, limit: int = 100) -> list[TrashItem]:
        """List recoverable user-owned records, newest deletion first."""
        _validate_user_id(user_id)
        if limit < 1 or limit > 100:
            raise ValueError("limit must be between 1 and 100")
        try:
            with self._connection() as connection:
                rows = connection.execute(
                    """
                    SELECT 'entry' AS record_type, id AS record_id, label, deleted_at FROM entries
                    WHERE user_id = ? AND deleted_at IS NOT NULL
                    UNION ALL
                    SELECT 'weigh_in' AS record_type, id AS record_id,
                           CAST(weight_grams AS TEXT) || ' g', deleted_at
                    FROM weigh_ins
                    WHERE user_id = ? AND deleted_at IS NOT NULL
                    ORDER BY deleted_at DESC LIMIT ?
                    """,
                    (user_id, user_id, limit),
                ).fetchall()
        except sqlite3.Error as error:
            raise PersistenceError("Trash could not be listed.") from error
        return [_row_to_trash_item(row) for row in rows]

    def purge_deleted_before(self, cutoff: datetime) -> int:
        """Permanently remove data whose recovery window has expired."""
        _validate_aware_datetime(cutoff, "cutoff")
        try:
            with self._connection() as connection:
                entry_count = connection.execute(
                    "DELETE FROM entries WHERE deleted_at IS NOT NULL AND deleted_at < ?",
                    (_serialize_datetime(cutoff),),
                ).rowcount
                weigh_in_count = connection.execute(
                    "DELETE FROM weigh_ins WHERE deleted_at IS NOT NULL AND deleted_at < ?",
                    (_serialize_datetime(cutoff),),
                ).rowcount
        except sqlite3.Error as error:
            raise PersistenceError("Expired deleted records could not be purged.") from error
        return entry_count + weigh_in_count

    def _soft_delete(self, table: str, user_id: int, record_id: int, deleted_at: datetime) -> bool:
        """Move one record from a fixed table into recoverable trash."""
        if table not in {"entries", "weigh_ins"}:
            raise ValueError("Unsupported record table")
        _validate_user_id(user_id)
        _validate_record_id(record_id)
        _validate_aware_datetime(deleted_at, "deleted_at")
        try:
            with self._connection() as connection:
                cursor = connection.execute(
                    _SOFT_DELETE_QUERIES[table],
                    (_serialize_datetime(deleted_at), _serialize_datetime(deleted_at), user_id, record_id),
                )
        except sqlite3.Error as error:
            raise PersistenceError("The record could not be deleted.") from error
        return cursor.rowcount > 0

    def _connect(self) -> sqlite3.Connection:
        """Open one SQLite connection with the required safety pragmas."""
        try:
            connection = sqlite3.connect(self.path, timeout=30.0)
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA foreign_keys = ON")
            connection.execute("PRAGMA busy_timeout = 30000")
            connection.execute("PRAGMA synchronous = NORMAL")
        except sqlite3.Error as error:
            raise PersistenceError("The database connection could not be opened.") from error
        return connection

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        """Yield a transaction that commits on success and rolls back on failure."""
        connection = self._connect()
        try:
            yield connection
            connection.commit()
        except BaseException:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _initialize_schema(self) -> None:
        """Create current tables and indexes, then migrate legacy timestamp storage."""
        try:
            with self._connection() as connection:
                connection.execute("PRAGMA journal_mode = WAL")
                connection.execute(
                    """
                    CREATE TABLE IF NOT EXISTS entries (
                        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
                        kind TEXT NOT NULL CHECK (kind IN ('meal', 'training', 'sleep')),
                        label TEXT NOT NULL, text TEXT NOT NULL DEFAULT '', start_at TEXT NOT NULL, end_at TEXT,
                        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
                    )
                    """
                )
                version_row = connection.execute("PRAGMA user_version").fetchone()
                version = int(version_row[0]) if version_row is not None else 0
                if version < 1:
                    self._migrate_timestamp_storage(connection)
                connection.execute(
                    """
                    CREATE TABLE IF NOT EXISTS user_settings (
                        user_id INTEGER PRIMARY KEY, locale TEXT NOT NULL CHECK (locale IN ('en', 'it')),
                        weight_unit TEXT NOT NULL CHECK (weight_unit IN ('kg', 'lb'))
                    )
                    """
                )
                connection.execute(
                    """
                    CREATE TABLE IF NOT EXISTS weigh_ins (
                        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
                        weight_grams INTEGER NOT NULL CHECK (weight_grams > 0 AND weight_grams <= 1000000),
                        recorded_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
                    )
                    """
                )
                connection.execute("CREATE INDEX IF NOT EXISTS idx_entries_user_start ON entries(user_id, start_at)")
                connection.execute(
                    "CREATE INDEX IF NOT EXISTS idx_entries_user_kind_end ON entries(user_id, kind, end_at)"
                )
                connection.execute(
                    "CREATE INDEX IF NOT EXISTS idx_weigh_ins_user_recorded ON weigh_ins(user_id, recorded_at)"
                )
                connection.execute(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_one_open_activity ON entries(user_id)
                    WHERE deleted_at IS NULL AND end_at IS NULL AND kind IN ('training', 'sleep')
                    """
                )
                connection.execute("PRAGMA user_version = 2")
        except sqlite3.Error as error:
            raise PersistenceError("The database schema could not be initialized.") from error

    def _migrate_timestamp_storage(self, connection: sqlite3.Connection) -> None:
        """Normalize legacy entry timestamps to UTC ISO values in the active transaction."""
        rows = connection.execute(
            "SELECT id, start_at, end_at, created_at, updated_at, deleted_at FROM entries"
        ).fetchall()
        for row in rows:
            try:
                values = tuple(
                    _serialize_datetime(datetime.fromisoformat(str(row[column]))) if row[column] is not None else None
                    for column in ("start_at", "end_at", "created_at", "updated_at", "deleted_at")
                )
            except ValueError as error:
                raise PersistenceError(f"Entry {row['id']} has an invalid timestamp.") from error
            connection.execute(
                """
                UPDATE entries SET start_at = ?, end_at = ?, created_at = ?, updated_at = ?, deleted_at = ? WHERE id = ?
                """,
                (*values, row["id"]),
            )

    def _fetch_one(self, query: str, parameters: tuple[object, ...]) -> sqlite3.Row | None:
        """Execute one parameterized lookup and translate SQLite failures."""
        try:
            with self._connection() as connection:
                return cast(sqlite3.Row | None, connection.execute(query, parameters).fetchone())
        except sqlite3.Error as error:
            raise PersistenceError("The database query could not be completed.") from error

    def _end_activity(self, user_id: int, end_at: datetime, kind: str | None) -> Entry | None:
        """Close the earliest active activity, optionally restricted to one kind."""
        _validate_user_id(user_id)
        _validate_aware_datetime(end_at, "end_at")
        if kind is None:
            query = (
                "SELECT * FROM entries WHERE user_id = ? AND deleted_at IS NULL "
                "AND end_at IS NULL AND kind IN ('training', 'sleep') ORDER BY start_at ASC, id ASC LIMIT 1"
            )
            parameters: tuple[object, ...] = (user_id,)
        else:
            query = (
                "SELECT * FROM entries WHERE user_id = ? AND deleted_at IS NULL "
                "AND end_at IS NULL AND kind = ? ORDER BY start_at ASC, id ASC LIMIT 1"
            )
            parameters = (user_id, kind)
        try:
            with self._connection() as connection:
                connection.execute("BEGIN IMMEDIATE")
                row = connection.execute(query, parameters).fetchone()
                if row is None:
                    return None
                entry = _row_to_entry(row)
                if end_at < entry.start_at:
                    raise ValueError("An activity cannot end before it starts.")
                now = datetime.now(UTC)
                connection.execute(
                    "UPDATE entries SET end_at = ?, updated_at = ? WHERE id = ? AND end_at IS NULL",
                    (_serialize_datetime(end_at), _serialize_datetime(now), entry.id),
                )
                updated_row = connection.execute("SELECT * FROM entries WHERE id = ?", (entry.id,)).fetchone()
        except sqlite3.Error as error:
            raise PersistenceError("The activity could not be ended.") from error
        return _row_to_entry(updated_row) if updated_row is not None else None


def _validate_user_id(user_id: int) -> None:
    """Reject non-positive or boolean Telegram user identifiers."""
    if isinstance(user_id, bool) or user_id <= 0:
        raise ValueError("user_id must be a positive integer")


def _validate_record_id(record_id: int) -> None:
    """Reject non-positive or boolean database identifiers."""
    if isinstance(record_id, bool) or record_id <= 0:
        raise ValueError("record id must be a positive integer")


def _validate_locale(locale: str) -> str:
    """Return a supported locale or reject an unsupported value."""
    if locale not in VALID_LOCALES:
        raise ValueError("locale must be en or it")
    return locale


def _validate_weight_unit(weight_unit: str) -> str:
    """Return a supported presentation unit or reject an unsupported value."""
    if weight_unit not in VALID_WEIGHT_UNITS:
        raise ValueError("weight_unit must be kg or lb")
    return weight_unit


def _validate_weight_grams(weight_grams: int) -> None:
    """Reject body-weight values outside the supported persisted range."""
    if isinstance(weight_grams, bool) or not isinstance(weight_grams, int) or not 0 < weight_grams <= 1_000_000:
        raise ValueError("weight must be between 0.001 and 1000 kg")


def _validate_entry_values(kind: object, label: object, text: object, start_at: object, end_at: object) -> None:
    """Validate the complete set of user-controlled entry fields."""
    if not isinstance(kind, str) or kind not in VALID_KINDS:
        raise ValueError("kind must be meal, training, or sleep")
    if not isinstance(label, str) or not label.strip() or len(label) > 120:
        raise ValueError("label must contain 1 to 120 characters")
    if not isinstance(text, str) or len(text) > 4000:
        raise ValueError("text must contain at most 4000 characters")
    start_timestamp = _validate_aware_datetime(start_at, "start_at")
    if end_at is not None:
        end_timestamp = _validate_aware_datetime(end_at, "end_at")
        if end_timestamp < start_timestamp:
            raise ValueError("end_at cannot be before start_at")
    if kind == "meal" and end_at is not None:
        raise ValueError("meal entries cannot have an end_at value")


def _validate_aware_datetime(value: object, field_name: str) -> datetime:
    """Return an aware datetime or raise a field-specific validation error."""
    if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{field_name} must be a timezone-aware datetime")
    return value


def _validate_interval(start_at: datetime, end_at: datetime) -> None:
    """Require an ordered, timezone-aware half-open interval."""
    _validate_aware_datetime(start_at, "start_at")
    _validate_aware_datetime(end_at, "end_at")
    if end_at <= start_at:
        raise ValueError("end_at must be after start_at")


def _entry_candidate(
    entry: Entry, fields: Mapping[str, EntryFieldValue]
) -> tuple[object, object, object, object, object]:
    """Combine an entry with a partial update for whole-record validation."""
    return (
        fields.get("kind", entry.kind),
        fields.get("label", entry.label),
        fields.get("text", entry.text),
        fields.get("start_at", entry.start_at),
        fields.get("end_at", entry.end_at),
    )


def _serialize_datetime(value: datetime) -> str:
    """Convert an aware datetime to the canonical UTC persistence representation."""
    return _validate_aware_datetime(value, "timestamp").astimezone(UTC).isoformat(timespec="microseconds")


def _row_to_entry(row: sqlite3.Row) -> Entry:
    """Deserialize one SQLite entry row while enforcing expected value types."""
    try:
        return Entry(
            id=int(row["id"]),
            user_id=int(row["user_id"]),
            kind=str(row["kind"]),
            label=str(row["label"]),
            text=str(row["text"]),
            start_at=datetime.fromisoformat(str(row["start_at"])),
            end_at=datetime.fromisoformat(str(row["end_at"])) if row["end_at"] is not None else None,
            created_at=datetime.fromisoformat(str(row["created_at"])),
            updated_at=datetime.fromisoformat(str(row["updated_at"])),
        )
    except (KeyError, TypeError, ValueError) as error:
        raise PersistenceError("An entry row is malformed.") from error


def _row_to_settings(row: sqlite3.Row) -> UserSettings:
    """Deserialize one SQLite user-settings row with value validation."""
    try:
        return UserSettings(
            user_id=int(row["user_id"]),
            locale=_validate_locale(str(row["locale"])),
            weight_unit=_validate_weight_unit(str(row["weight_unit"])),
        )
    except (KeyError, TypeError, ValueError) as error:
        raise PersistenceError("A user settings row is malformed.") from error


def _row_to_weigh_in(row: sqlite3.Row) -> WeighIn:
    """Deserialize one SQLite weigh-in row while enforcing expected value types."""
    try:
        return WeighIn(
            id=int(row["id"]),
            user_id=int(row["user_id"]),
            weight_grams=int(row["weight_grams"]),
            recorded_at=datetime.fromisoformat(str(row["recorded_at"])),
            created_at=datetime.fromisoformat(str(row["created_at"])),
            updated_at=datetime.fromisoformat(str(row["updated_at"])),
        )
    except (KeyError, TypeError, ValueError) as error:
        raise PersistenceError("A weigh-in row is malformed.") from error


def _row_to_trash_item(row: sqlite3.Row) -> TrashItem:
    """Deserialize one SQLite recoverable-record row."""
    try:
        return TrashItem(
            record_type=str(row["record_type"]),
            record_id=int(row["record_id"]),
            label=str(row["label"]),
            deleted_at=datetime.fromisoformat(str(row["deleted_at"])),
        )
    except (KeyError, TypeError, ValueError) as error:
        raise PersistenceError("A trash row is malformed.") from error
