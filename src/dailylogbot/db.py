"""SQLite persistence boundary for DailyLog entries."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterable, Iterator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Final, cast

VALID_KINDS: Final = frozenset({"meal", "training", "sleep"})
ACTIVITY_KINDS: Final = frozenset({"training", "sleep"})
type EntryFieldValue = str | datetime | None
_EDITABLE_FIELDS: Final = frozenset({"kind", "label", "text", "start_at", "end_at"})
_SCHEMA_VERSION: Final = 1


class PersistenceError(RuntimeError):
    """Raised when SQLite cannot safely complete a persistence operation."""


class ActiveActivityError(PersistenceError):
    """Raised when an operation would create a second open activity."""


@dataclass(frozen=True)
class Entry:
    """Represent one validated and persisted DailyLog record."""

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
        """Return whether this record is an unfinished activity.

        Returns:
            ``True`` when a training or sleep activity has no end timestamp.
        """
        return self.kind in ACTIVITY_KINDS and self.end_at is None


class Database:
    """Provide transactional SQLite access without leaking SQL into application code."""

    def __init__(self, path: Path) -> None:
        """Prepare a database file and create or migrate its schema.

        Args:
            path: SQLite database location.

        Raises:
            PersistenceError: If schema creation or migration fails.

        Side Effects:
            Creates the parent directory and database schema when needed.
        """
        self.path = path.expanduser()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize_schema()

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
        """Insert one validated entry atomically.

        Args:
            user_id: Telegram user that owns the entry.
            kind: One of ``meal``, ``training``, or ``sleep``.
            label: Non-empty activity or meal name.
            text: Optional detail text.
            start_at: Time at which the entry began.
            end_at: Optional time at which an activity ended.

        Returns:
            The fully persisted entry.

        Raises:
            ActiveActivityError: If another activity is open for this user.
            ValueError: If an entry value violates a domain invariant.
            PersistenceError: If SQLite cannot create or retrieve the entry.
        """
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
                    "SELECT * FROM entries WHERE id = ? AND deleted_at IS NULL",
                    (cursor.lastrowid,),
                ).fetchone()
        except sqlite3.IntegrityError as error:
            if kind in ACTIVITY_KINDS and end_at is None:
                raise ActiveActivityError("An activity is already open for this user.") from error
            raise PersistenceError("The entry could not be saved because of a database constraint.") from error
        except sqlite3.Error as error:
            raise PersistenceError("The entry could not be saved.") from error
        if row is None:
            raise PersistenceError("The created entry could not be read from the database.")
        return _row_to_entry(row)

    def get_entry(self, user_id: int, entry_id: int) -> Entry | None:
        """Retrieve one non-deleted owned entry.

        Args:
            user_id: Telegram user that owns the entry.
            entry_id: Database identifier of the entry.

        Returns:
            The matching entry, or ``None`` when it is unavailable.

        Raises:
            ValueError: If either identifier is not positive.
            PersistenceError: If SQLite cannot complete the query.
        """
        _validate_user_id(user_id)
        _validate_entry_id(entry_id)
        row = self._fetch_one(
            "SELECT * FROM entries WHERE user_id = ? AND id = ? AND deleted_at IS NULL",
            (user_id, entry_id),
        )
        return _row_to_entry(row) if row is not None else None

    def get_last_entry(self, user_id: int) -> Entry | None:
        """Retrieve the most recently created non-deleted entry for a user.

        Args:
            user_id: Telegram user that owns the entry.

        Returns:
            The latest entry, or ``None`` when no entry exists.

        Raises:
            ValueError: If ``user_id`` is not positive.
            PersistenceError: If SQLite cannot complete the query.
        """
        _validate_user_id(user_id)
        row = self._fetch_one(
            """
            SELECT * FROM entries
            WHERE user_id = ? AND deleted_at IS NULL
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            """,
            (user_id,),
        )
        return _row_to_entry(row) if row is not None else None

    def get_active_entry(self, user_id: int, kind: str) -> Entry | None:
        """Retrieve an unfinished activity of one requested kind.

        Args:
            user_id: Telegram user that owns the activity.
            kind: Activity kind to retrieve.

        Returns:
            The matching active entry, or ``None`` when none exists.

        Raises:
            ValueError: If ``user_id`` is not positive.
            PersistenceError: If SQLite cannot complete the query.
        """
        _validate_user_id(user_id)
        if kind not in ACTIVITY_KINDS:
            return None
        row = self._fetch_one(
            """
            SELECT * FROM entries
            WHERE user_id = ? AND kind = ? AND end_at IS NULL AND deleted_at IS NULL
            ORDER BY start_at ASC, id ASC
            LIMIT 1
            """,
            (user_id, kind),
        )
        return _row_to_entry(row) if row is not None else None

    def get_open_activity(self, user_id: int) -> Entry | None:
        """Retrieve the user's sole unfinished training or sleep activity.

        Args:
            user_id: Telegram user that owns the activity.

        Returns:
            The active entry, or ``None`` when none exists.

        Raises:
            ValueError: If ``user_id`` is not positive.
            PersistenceError: If SQLite cannot complete the query.
        """
        _validate_user_id(user_id)
        row = self._fetch_one(
            """
            SELECT * FROM entries
            WHERE user_id = ? AND deleted_at IS NULL AND end_at IS NULL
              AND kind IN ('training', 'sleep')
            ORDER BY start_at ASC, id ASC
            LIMIT 1
            """,
            (user_id,),
        )
        return _row_to_entry(row) if row is not None else None

    def end_active_entry(self, user_id: int, kind: str, end_at: datetime) -> Entry | None:
        """Close an open activity of one requested kind atomically.

        Args:
            user_id: Telegram user that owns the activity.
            kind: Activity kind to close.
            end_at: Time at which the activity ended.

        Returns:
            The completed activity, or ``None`` when no matching activity exists.

        Raises:
            ValueError: If an identifier, kind, or timestamp is invalid.
            PersistenceError: If SQLite cannot complete the update.
        """
        _validate_user_id(user_id)
        _validate_aware_datetime(end_at, "end_at")
        if kind not in ACTIVITY_KINDS:
            raise ValueError("kind must be training or sleep")
        return self._end_activity(user_id, end_at, kind)

    def end_open_activity(self, user_id: int, end_at: datetime) -> Entry | None:
        """Close the user's sole open training or sleep activity atomically.

        Args:
            user_id: Telegram user that owns the activity.
            end_at: Time at which the activity ended.

        Returns:
            The completed activity, or ``None`` when no activity is active.

        Raises:
            ValueError: If an identifier or timestamp is invalid.
            PersistenceError: If SQLite cannot complete the update.
        """
        _validate_user_id(user_id)
        _validate_aware_datetime(end_at, "end_at")
        return self._end_activity(user_id, end_at, None)

    def cancel_open_activity(self, user_id: int, cancelled_at: datetime) -> Entry | None:
        """Soft-delete the user's sole open activity in one write transaction.

        Args:
            user_id: Telegram user that owns the activity.
            cancelled_at: Time at which the cancellation occurred.

        Returns:
            The removed activity, or ``None`` when no activity is active.

        Raises:
            ValueError: If an identifier or timestamp is invalid.
            PersistenceError: If SQLite cannot complete the cancellation.
        """
        _validate_user_id(user_id)
        _validate_aware_datetime(cancelled_at, "cancelled_at")
        try:
            with self._connection() as connection:
                connection.execute("BEGIN IMMEDIATE")
                row = connection.execute(
                    """
                    SELECT * FROM entries
                    WHERE user_id = ? AND deleted_at IS NULL AND end_at IS NULL
                      AND kind IN ('training', 'sleep')
                    ORDER BY start_at ASC, id ASC
                    LIMIT 1
                    """,
                    (user_id,),
                ).fetchone()
                if row is None:
                    return None
                active_entry = _row_to_entry(row)
                connection.execute(
                    """
                    UPDATE entries
                    SET deleted_at = ?, updated_at = ?
                    WHERE id = ? AND deleted_at IS NULL
                    """,
                    (
                        _serialize_datetime(cancelled_at),
                        _serialize_datetime(cancelled_at),
                        active_entry.id,
                    ),
                )
        except sqlite3.Error as error:
            raise PersistenceError("The activity could not be cancelled.") from error
        return active_entry

    def update_entry(
        self,
        user_id: int,
        entry_id: int,
        fields: Mapping[str, EntryFieldValue],
    ) -> Entry | None:
        """Update approved values while preserving ownership and activity invariants.

        Args:
            user_id: Telegram user that owns the entry.
            entry_id: Database identifier of the entry.
            fields: Replacement values for editable entry attributes.

        Returns:
            The updated entry, unchanged entry, or ``None`` when unavailable.

        Raises:
            ActiveActivityError: If the edit would create a second open activity.
            ValueError: If an identifier, field, or resulting entry is invalid.
            PersistenceError: If SQLite cannot complete the update.
        """
        _validate_user_id(user_id)
        _validate_entry_id(entry_id)
        unsupported_fields = set(fields).difference(_EDITABLE_FIELDS)
        if unsupported_fields:
            raise ValueError(f"Unsupported editable fields: {', '.join(sorted(unsupported_fields))}")
        try:
            with self._connection() as connection:
                connection.execute("BEGIN IMMEDIATE")
                row = connection.execute(
                    "SELECT * FROM entries WHERE user_id = ? AND id = ? AND deleted_at IS NULL",
                    (user_id, entry_id),
                ).fetchone()
                if row is None:
                    return None
                existing_entry = _row_to_entry(row)
                if not fields:
                    return existing_entry
                candidate = _entry_candidate(existing_entry, fields)
                _validate_entry_values(*candidate)
                assignments, values = _update_assignments(fields)
                assignments.append("updated_at = ?")
                values.append(_serialize_datetime(datetime.now(UTC)))
                values.extend((user_id, entry_id))
                connection.execute(
                    f"UPDATE entries SET {', '.join(assignments)} WHERE user_id = ? AND id = ? AND deleted_at IS NULL",
                    values,
                )
                updated_row = connection.execute(
                    "SELECT * FROM entries WHERE user_id = ? AND id = ? AND deleted_at IS NULL",
                    (user_id, entry_id),
                ).fetchone()
        except sqlite3.IntegrityError as error:
            raise ActiveActivityError("An activity is already open for this user.") from error
        except sqlite3.Error as error:
            raise PersistenceError("The entry could not be updated.") from error
        if updated_row is None:
            raise PersistenceError("The updated entry could not be read from the database.")
        return _row_to_entry(updated_row)

    def delete_entry(self, user_id: int, entry_id: int, deleted_at: datetime) -> bool:
        """Soft-delete an owned entry.

        Args:
            user_id: Telegram user that owns the entry.
            entry_id: Database identifier of the entry.
            deleted_at: Time at which the deletion occurred.

        Returns:
            Whether a stored entry was deleted.

        Raises:
            ValueError: If an identifier or timestamp is invalid.
            PersistenceError: If SQLite cannot complete the update.
        """
        _validate_user_id(user_id)
        _validate_entry_id(entry_id)
        _validate_aware_datetime(deleted_at, "deleted_at")
        try:
            with self._connection() as connection:
                cursor = connection.execute(
                    """
                    UPDATE entries
                    SET deleted_at = ?, updated_at = ?
                    WHERE user_id = ? AND id = ? AND deleted_at IS NULL
                    """,
                    (
                        _serialize_datetime(deleted_at),
                        _serialize_datetime(deleted_at),
                        user_id,
                        entry_id,
                    ),
                )
        except sqlite3.Error as error:
            raise PersistenceError("The entry could not be deleted.") from error
        return cursor.rowcount > 0

    def list_entries_between(self, user_id: int, start_at: datetime, end_at: datetime) -> list[Entry]:
        """List non-deleted entries overlapping a half-open UTC-normalized interval.

        Args:
            user_id: Telegram user that owns the entries.
            start_at: Inclusive interval start.
            end_at: Exclusive interval end.

        Returns:
            Chronologically ordered matching entries.

        Raises:
            ValueError: If an identifier or interval is invalid.
            PersistenceError: If SQLite cannot complete the query.
        """
        _validate_user_id(user_id)
        _validate_aware_datetime(start_at, "start_at")
        _validate_aware_datetime(end_at, "end_at")
        if end_at <= start_at:
            raise ValueError("end_at must be after start_at")
        try:
            with self._connection() as connection:
                rows = connection.execute(
                    """
                    SELECT * FROM entries
                    WHERE user_id = ? AND deleted_at IS NULL
                      AND start_at < ?
                      AND (
                        (kind = 'meal' AND start_at >= ?)
                        OR (kind IN ('training', 'sleep') AND (end_at IS NULL OR end_at > ?))
                      )
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
        """List every non-deleted entry for one user.

        Args:
            user_id: Telegram user that owns the entries.

        Returns:
            Chronologically ordered entries.

        Raises:
            ValueError: If ``user_id`` is not positive.
            PersistenceError: If SQLite cannot complete the query.
        """
        _validate_user_id(user_id)
        try:
            with self._connection() as connection:
                rows = connection.execute(
                    """
                    SELECT * FROM entries
                    WHERE user_id = ? AND deleted_at IS NULL
                    ORDER BY start_at ASC, id ASC
                    """,
                    (user_id,),
                ).fetchall()
        except sqlite3.Error as error:
            raise PersistenceError("Entries could not be listed.") from error
        return [_row_to_entry(row) for row in rows]

    def _connect(self) -> sqlite3.Connection:
        """Open a scoped SQLite connection with resilient local settings.

        Returns:
            A connection configured for short transactions and row access.

        Raises:
            PersistenceError: If SQLite cannot open the database file.
        """
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
        """Yield a scoped connection that always commits or rolls back and closes.

        Yields:
            Open SQLite connection configured by :meth:`_connect`.

        Side Effects:
            Opens and closes one database connection for the enclosing operation.
        """
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
        """Create indexes and normalize pre-existing timestamp values to UTC.

        Raises:
            PersistenceError: If schema initialization or migration fails.

        Side Effects:
            Creates tables and indexes and may rewrite stored timestamps once.
        """
        try:
            with self._connection() as connection:
                connection.execute("PRAGMA journal_mode = WAL")
                connection.execute(
                    """
                    CREATE TABLE IF NOT EXISTS entries (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        kind TEXT NOT NULL CHECK (kind IN ('meal', 'training', 'sleep')),
                        label TEXT NOT NULL,
                        text TEXT NOT NULL DEFAULT '',
                        start_at TEXT NOT NULL,
                        end_at TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        deleted_at TEXT
                    )
                    """
                )
                self._migrate_timestamp_storage(connection)
                connection.execute("CREATE INDEX IF NOT EXISTS idx_entries_user_start ON entries(user_id, start_at)")
                connection.execute(
                    "CREATE INDEX IF NOT EXISTS idx_entries_user_kind_end ON entries(user_id, kind, end_at)"
                )
                connection.execute(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_one_open_activity
                    ON entries(user_id)
                    WHERE deleted_at IS NULL AND end_at IS NULL AND kind IN ('training', 'sleep')
                    """
                )
        except sqlite3.Error as error:
            raise PersistenceError("The database schema could not be initialized.") from error

    def _migrate_timestamp_storage(self, connection: sqlite3.Connection) -> None:
        """Normalize existing aware ISO timestamps to sortable UTC text once.

        Args:
            connection: Open connection participating in schema initialization.

        Raises:
            PersistenceError: If pre-existing timestamps are malformed.

        Side Effects:
            Rewrites timestamp columns and advances the SQLite user version.
        """
        version_row = connection.execute("PRAGMA user_version").fetchone()
        version = int(version_row[0]) if version_row is not None else 0
        if version >= _SCHEMA_VERSION:
            return
        rows = connection.execute(
            "SELECT id, start_at, end_at, created_at, updated_at, deleted_at FROM entries"
        ).fetchall()
        for row in rows:
            try:
                converted_values = tuple(
                    _serialize_datetime(datetime.fromisoformat(str(row[column]))) if row[column] is not None else None
                    for column in ("start_at", "end_at", "created_at", "updated_at", "deleted_at")
                )
            except ValueError as error:
                raise PersistenceError(f"Entry {row['id']} has an invalid timestamp.") from error
            connection.execute(
                """
                UPDATE entries
                SET start_at = ?, end_at = ?, created_at = ?, updated_at = ?, deleted_at = ?
                WHERE id = ?
                """,
                (*converted_values, row["id"]),
            )
        connection.execute(f"PRAGMA user_version = {_SCHEMA_VERSION}")

    def _fetch_one(self, query: str, parameters: tuple[object, ...]) -> sqlite3.Row | None:
        """Run one read query and return at most one row.

        Args:
            query: Parameterized SQL select statement.
            parameters: Bound query values.

        Returns:
            The selected row, or ``None`` when no record matches.

        Raises:
            PersistenceError: If SQLite cannot complete the query.
        """
        try:
            with self._connection() as connection:
                row = connection.execute(query, parameters).fetchone()
                return cast(sqlite3.Row | None, row)
        except sqlite3.Error as error:
            raise PersistenceError("The database query could not be completed.") from error

    def _end_activity(self, user_id: int, end_at: datetime, kind: str | None) -> Entry | None:
        """Close an activity inside a single write transaction.

        Args:
            user_id: Telegram user that owns the activity.
            end_at: Time at which the activity ended.
            kind: Optional activity kind to restrict the lookup.

        Returns:
            The closed activity, or ``None`` when no activity matches.

        Raises:
            ValueError: If the activity would end before it started.
            PersistenceError: If SQLite cannot complete the update.
        """
        activity_clause = "AND kind = ?" if kind is not None else "AND kind IN ('training', 'sleep')"
        parameters: tuple[object, ...] = (user_id, kind) if kind is not None else (user_id,)
        try:
            with self._connection() as connection:
                connection.execute("BEGIN IMMEDIATE")
                row = connection.execute(
                    f"""
                    SELECT * FROM entries
                    WHERE user_id = ? AND deleted_at IS NULL AND end_at IS NULL {activity_clause}
                    ORDER BY start_at ASC, id ASC
                    LIMIT 1
                    """,
                    parameters,
                ).fetchone()
                if row is None:
                    return None
                active_entry = _row_to_entry(row)
                if end_at < active_entry.start_at:
                    raise ValueError("An activity cannot end before it starts.")
                completed_at = datetime.now(UTC)
                connection.execute(
                    "UPDATE entries SET end_at = ?, updated_at = ? WHERE id = ? AND end_at IS NULL",
                    (_serialize_datetime(end_at), _serialize_datetime(completed_at), active_entry.id),
                )
                updated_row = connection.execute("SELECT * FROM entries WHERE id = ?", (active_entry.id,)).fetchone()
        except sqlite3.Error as error:
            raise PersistenceError("The activity could not be ended.") from error
        if updated_row is None:
            raise PersistenceError("The completed activity could not be read from the database.")
        return _row_to_entry(updated_row)


def _validate_user_id(user_id: int) -> None:
    """Reject invalid Telegram user identifiers.

    Args:
        user_id: Identifier to validate.

    Raises:
        ValueError: If the identifier is not a positive integer.
    """
    if isinstance(user_id, bool) or user_id <= 0:
        raise ValueError("user_id must be a positive integer")


def _validate_entry_id(entry_id: int) -> None:
    """Reject invalid database entry identifiers.

    Args:
        entry_id: Identifier to validate.

    Raises:
        ValueError: If the identifier is not a positive integer.
    """
    if isinstance(entry_id, bool) or entry_id <= 0:
        raise ValueError("entry_id must be a positive integer")


def _validate_entry_values(kind: object, label: object, text: object, start_at: object, end_at: object) -> None:
    """Validate an entry's complete value set before it reaches SQLite.

    Args:
        kind: Proposed entry category.
        label: Proposed activity or meal label.
        text: Proposed free-form details.
        start_at: Proposed start timestamp.
        end_at: Proposed optional end timestamp.

    Raises:
        ValueError: If a value violates an entry invariant.
    """
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
    """Validate that a supplied value is an offset-aware datetime.

    Args:
        value: Value to validate.
        field_name: User-facing name of the timestamp field.

    Raises:
        Timezone-aware timestamp.

    Raises:
        ValueError: If the value is not timezone-aware.
    """
    if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{field_name} must be a timezone-aware datetime")
    return value


def _entry_candidate(
    existing_entry: Entry, fields: Mapping[str, EntryFieldValue]
) -> tuple[object, object, object, object, object]:
    """Build a complete prospective entry from an existing record and replacements.

    Args:
        existing_entry: Persisted record being edited.
        fields: Replacement values for supported entry fields.

    Returns:
        Candidate kind, label, details, start, and end values.
    """
    return (
        fields.get("kind", existing_entry.kind),
        fields.get("label", existing_entry.label),
        fields.get("text", existing_entry.text),
        fields.get("start_at", existing_entry.start_at),
        fields.get("end_at", existing_entry.end_at),
    )


def _update_assignments(fields: Mapping[str, EntryFieldValue]) -> tuple[list[str], list[object]]:
    """Convert typed editable values into a safe static-column SQL update.

    Args:
        fields: Replacement values for supported entry fields.

    Returns:
        SQL assignments and their ordered bound values.
    """
    assignments: list[str] = []
    values: list[object] = []
    for field_name in ("kind", "label", "text", "start_at", "end_at"):
        if field_name not in fields:
            continue
        field_value = fields[field_name]
        assignments.append(f"{field_name} = ?")
        values.append(_serialize_datetime(field_value) if isinstance(field_value, datetime) else field_value)
    return assignments, values


def _serialize_datetime(value: datetime) -> str:
    """Serialize an aware datetime in lexicographically sortable UTC ISO format.

    Args:
        value: Offset-aware timestamp to persist.

    Returns:
        UTC ISO-8601 timestamp with a numeric offset.
    """
    return _validate_aware_datetime(value, "timestamp").astimezone(UTC).isoformat(timespec="microseconds")


def _row_to_entry(row: sqlite3.Row) -> Entry:
    """Convert one SQLite row into an immutable application record.

    Args:
        row: Database row representing an entry.

    Returns:
        Typed immutable entry.

    Raises:
        PersistenceError: If the stored data is malformed.
    """
    try:
        return Entry(
            id=int(row["id"]),
            user_id=int(row["user_id"]),
            kind=str(row["kind"]),
            label=str(row["label"]),
            text=str(row["text"] or ""),
            start_at=datetime.fromisoformat(str(row["start_at"])),
            end_at=datetime.fromisoformat(str(row["end_at"])) if row["end_at"] else None,
            created_at=datetime.fromisoformat(str(row["created_at"])),
            updated_at=datetime.fromisoformat(str(row["updated_at"])),
        )
    except (KeyError, TypeError, ValueError) as error:
        raise PersistenceError("The database contains an invalid entry.") from error


def entries_by_month(entries: Iterable[Entry]) -> dict[str, list[Entry]]:
    """Group entries by their display month while preserving input order.

    Args:
        entries: Entries to organize.

    Returns:
        Entries keyed by ``YYYY-MM`` display month.
    """
    grouped: dict[str, list[Entry]] = {}
    for entry in entries:
        timestamp = entry.end_at if entry.kind == "sleep" and entry.end_at is not None else entry.start_at
        grouped.setdefault(timestamp.strftime("%Y-%m"), []).append(entry)
    return grouped
