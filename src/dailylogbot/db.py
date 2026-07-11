from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable


VALID_KINDS = frozenset({"meal", "training", "sleep"})
ACTIVITY_KINDS = frozenset({"training", "sleep"})


class ActiveActivityError(RuntimeError):
    """Raised when an operation would create a second open activity."""


@dataclass(frozen=True)
class Entry:
    """A validated, persisted user log entry."""

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
        """Return whether this record is an unfinished activity."""
        return self.kind in ACTIVITY_KINDS and self.end_at is None


class Database:
    """SQLite repository that isolates and validates all persistence operations."""

    def __init__(self, path: Path) -> None:
        """Create the database directory and initialize the schema and indexes."""
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        """Open a short-lived SQLite connection with resilient local settings."""
        connection = sqlite3.connect(self.path, timeout=30, isolation_level=None)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 30000")
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute("PRAGMA synchronous = NORMAL")
        return connection

    def _init_schema(self) -> None:
        """Create the entries table and indexes, including the open-activity guard."""
        with self._connect() as connection:
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
            connection.execute("CREATE INDEX IF NOT EXISTS idx_entries_user_start ON entries(user_id, start_at)")
            connection.execute("CREATE INDEX IF NOT EXISTS idx_entries_user_kind_end ON entries(user_id, kind, end_at)")
            connection.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_one_open_activity
                ON entries(user_id)
                WHERE deleted_at IS NULL AND end_at IS NULL AND kind IN ('training', 'sleep')
                """
            )

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
        """Insert one entry after validating its shape and temporal bounds."""
        _validate_entry_values(kind, label, text, start_at, end_at)
        now = datetime.now(tz=start_at.tzinfo)
        try:
            with self._connect() as connection:
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
                        start_at.isoformat(),
                        end_at.isoformat() if end_at else None,
                        now.isoformat(),
                        now.isoformat(),
                    ),
                )
                entry_id = int(cursor.lastrowid)
        except sqlite3.IntegrityError as exc:
            if kind in ACTIVITY_KINDS and end_at is None:
                raise ActiveActivityError("An activity is already open for this user.") from exc
            raise
        entry = self.get_entry(user_id, entry_id)
        if entry is None:
            raise RuntimeError("Created entry could not be read back from the database.")
        return entry

    def get_entry(self, user_id: int, entry_id: int) -> Entry | None:
        """Return one non-deleted entry when it belongs to the requested user."""
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM entries WHERE user_id = ? AND id = ? AND deleted_at IS NULL",
                (user_id, entry_id),
            ).fetchone()
        return _row_to_entry(row) if row else None

    def get_last_entry(self, user_id: int) -> Entry | None:
        """Return the most recently created non-deleted entry for a user."""
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT * FROM entries
                WHERE user_id = ? AND deleted_at IS NULL
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                """,
                (user_id,),
            ).fetchone()
        return _row_to_entry(row) if row else None

    def get_active_entry(self, user_id: int, kind: str) -> Entry | None:
        """Return the currently open activity of one requested kind."""
        if kind not in ACTIVITY_KINDS:
            return None
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT * FROM entries
                WHERE user_id = ? AND kind = ? AND end_at IS NULL AND deleted_at IS NULL
                ORDER BY start_at ASC, id ASC
                LIMIT 1
                """,
                (user_id, kind),
            ).fetchone()
        return _row_to_entry(row) if row else None

    def get_open_activity(self, user_id: int) -> Entry | None:
        """Return the sole open training or sleep record for a user, if present."""
        with self._connect() as connection:
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
        return _row_to_entry(row) if row else None

    def end_active_entry(self, user_id: int, kind: str, end_at: datetime) -> Entry | None:
        """Close an open activity of the requested kind and return its updated record."""
        active = self.get_active_entry(user_id, kind)
        if active is None:
            return None
        if end_at < active.start_at:
            raise ValueError("An activity cannot end before it starts.")
        return self.update_entry(user_id, active.id, {"end_at": end_at})

    def end_open_activity(self, user_id: int, end_at: datetime) -> Entry | None:
        """Close whichever training or sleep activity is currently open for a user."""
        active = self.get_open_activity(user_id)
        if active is None:
            return None
        return self.end_active_entry(user_id, active.kind, end_at)

    def update_entry(self, user_id: int, entry_id: int, fields: dict[str, object]) -> Entry | None:
        """Update approved fields while preserving database ownership and invariants."""
        allowed = {"kind", "label", "text", "start_at", "end_at"}
        clean_fields = {key: value for key, value in fields.items() if key in allowed}
        existing = self.get_entry(user_id, entry_id)
        if existing is None:
            return None
        if not clean_fields:
            return existing

        candidate = {
            "kind": clean_fields.get("kind", existing.kind),
            "label": clean_fields.get("label", existing.label),
            "text": clean_fields.get("text", existing.text),
            "start_at": clean_fields.get("start_at", existing.start_at),
            "end_at": clean_fields.get("end_at", existing.end_at),
        }
        _validate_entry_values(**candidate)
        if candidate["kind"] in ACTIVITY_KINDS and candidate["end_at"] is None:
            open_activity = self.get_open_activity(user_id)
            if open_activity is not None and open_activity.id != entry_id:
                raise ActiveActivityError("An activity is already open for this user.")

        assignments: list[str] = []
        values: list[object] = []
        for key, value in clean_fields.items():
            assignments.append(f"{key} = ?")
            values.append(value.isoformat() if isinstance(value, datetime) else value)
        assignments.append("updated_at = ?")
        values.append(datetime.now(tz=existing.start_at.tzinfo).isoformat())
        values.extend([user_id, entry_id])
        try:
            with self._connect() as connection:
                connection.execute(
                    f"UPDATE entries SET {', '.join(assignments)} WHERE user_id = ? AND id = ? AND deleted_at IS NULL",
                    values,
                )
        except sqlite3.IntegrityError as exc:
            raise ActiveActivityError("An activity is already open for this user.") from exc
        return self.get_entry(user_id, entry_id)

    def delete_entry(self, user_id: int, entry_id: int, deleted_at: datetime) -> bool:
        """Soft-delete an owned entry and report whether a row was updated."""
        with self._connect() as connection:
            cursor = connection.execute(
                """
                UPDATE entries
                SET deleted_at = ?, updated_at = ?
                WHERE user_id = ? AND id = ? AND deleted_at IS NULL
                """,
                (deleted_at.isoformat(), deleted_at.isoformat(), user_id, entry_id),
            )
        return cursor.rowcount > 0

    def list_entries_between(self, user_id: int, start_at: datetime, end_at: datetime) -> list[Entry]:
        """Return non-deleted entries that overlap a half-open datetime range."""
        with self._connect() as connection:
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
                (user_id, end_at.isoformat(), start_at.isoformat(), start_at.isoformat()),
            ).fetchall()
        return [_row_to_entry(row) for row in rows]

    def list_entries(self, user_id: int) -> list[Entry]:
        """Return every non-deleted entry for a user in chronological order."""
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM entries
                WHERE user_id = ? AND deleted_at IS NULL
                ORDER BY start_at ASC, id ASC
                """,
                (user_id,),
            ).fetchall()
        return [_row_to_entry(row) for row in rows]


def _validate_entry_values(
    kind: object,
    label: object,
    text: object,
    start_at: object,
    end_at: object,
) -> None:
    """Reject malformed entry values before they reach SQLite."""
    if not isinstance(kind, str) or kind not in VALID_KINDS:
        raise ValueError("kind must be meal, training, or sleep")
    if not isinstance(label, str) or not label.strip() or len(label) > 120:
        raise ValueError("label must contain 1 to 120 characters")
    if not isinstance(text, str) or len(text) > 4000:
        raise ValueError("text must contain at most 4000 characters")
    if not isinstance(start_at, datetime) or start_at.tzinfo is None:
        raise ValueError("start_at must be a timezone-aware datetime")
    if end_at is not None:
        if not isinstance(end_at, datetime) or end_at.tzinfo is None:
            raise ValueError("end_at must be a timezone-aware datetime or None")
        if end_at < start_at:
            raise ValueError("end_at cannot be before start_at")
    if kind == "meal" and end_at is not None:
        raise ValueError("meal entries cannot have an end_at value")
    if kind in ACTIVITY_KINDS and end_at is None and not label.strip():
        raise ValueError("activities need a label")


def _row_to_entry(row: sqlite3.Row) -> Entry:
    """Convert one SQLite row into an immutable application record."""
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


def entries_by_month(entries: Iterable[Entry]) -> dict[str, list[Entry]]:
    """Group entries by the month where their most relevant timestamp occurs."""
    grouped: dict[str, list[Entry]] = {}
    for entry in entries:
        key_date = entry.end_at if entry.kind == "sleep" and entry.end_at else entry.start_at
        grouped.setdefault(key_date.strftime("%Y-%m"), []).append(entry)
    return grouped
