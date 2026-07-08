from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class Entry:
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
        return self.kind in {"training", "sleep"} and self.end_at is None


class Database:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.execute(
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
            conn.execute("CREATE INDEX IF NOT EXISTS idx_entries_user_start ON entries(user_id, start_at)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_entries_user_kind_end ON entries(user_id, kind, end_at)")

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
        now = datetime.now(tz=start_at.tzinfo)
        with self._connect() as conn:
            cursor = conn.execute(
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
        entry = self.get_entry(user_id, entry_id)
        if entry is None:
            raise RuntimeError("Created entry could not be read back from database.")
        return entry

    def get_entry(self, user_id: int, entry_id: int) -> Entry | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM entries WHERE user_id = ? AND id = ? AND deleted_at IS NULL",
                (user_id, entry_id),
            ).fetchone()
        return _row_to_entry(row) if row else None

    def get_last_entry(self, user_id: int) -> Entry | None:
        with self._connect() as conn:
            row = conn.execute(
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
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT * FROM entries
                WHERE user_id = ? AND kind = ? AND end_at IS NULL AND deleted_at IS NULL
                ORDER BY start_at DESC, id DESC
                LIMIT 1
                """,
                (user_id, kind),
            ).fetchone()
        return _row_to_entry(row) if row else None

    def end_active_entry(self, user_id: int, kind: str, end_at: datetime) -> Entry | None:
        active = self.get_active_entry(user_id, kind)
        if active is None:
            return None
        return self.update_entry(user_id, active.id, {"end_at": end_at})

    def update_entry(self, user_id: int, entry_id: int, fields: dict[str, object]) -> Entry | None:
        allowed = {"kind", "label", "text", "start_at", "end_at"}
        clean_fields = {key: value for key, value in fields.items() if key in allowed}
        if not clean_fields:
            return self.get_entry(user_id, entry_id)

        assignments: list[str] = []
        values: list[object] = []
        for key, value in clean_fields.items():
            assignments.append(f"{key} = ?")
            if isinstance(value, datetime):
                values.append(value.isoformat())
            else:
                values.append(value)

        reference = self.get_entry(user_id, entry_id)
        now = datetime.now(tz=reference.start_at.tzinfo if reference else None).isoformat()
        assignments.append("updated_at = ?")
        values.append(now)
        values.extend([user_id, entry_id])

        with self._connect() as conn:
            conn.execute(
                f"""
                UPDATE entries
                SET {", ".join(assignments)}
                WHERE user_id = ? AND id = ? AND deleted_at IS NULL
                """,
                values,
            )
        return self.get_entry(user_id, entry_id)

    def delete_entry(self, user_id: int, entry_id: int, deleted_at: datetime) -> bool:
        with self._connect() as conn:
            cursor = conn.execute(
                """
                UPDATE entries
                SET deleted_at = ?, updated_at = ?
                WHERE user_id = ? AND id = ? AND deleted_at IS NULL
                """,
                (deleted_at.isoformat(), deleted_at.isoformat(), user_id, entry_id),
            )
        return cursor.rowcount > 0

    def list_entries_between(self, user_id: int, start_at: datetime, end_at: datetime) -> list[Entry]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM entries
                WHERE user_id = ?
                  AND deleted_at IS NULL
                  AND start_at < ?
                  AND COALESCE(end_at, start_at) >= ?
                ORDER BY start_at ASC, id ASC
                """,
                (user_id, end_at.isoformat(), start_at.isoformat()),
            ).fetchall()
        return [_row_to_entry(row) for row in rows]

    def list_open_entries(self, user_id: int) -> list[Entry]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM entries
                WHERE user_id = ? AND deleted_at IS NULL AND end_at IS NULL AND kind IN ('training', 'sleep')
                ORDER BY start_at ASC
                """,
                (user_id,),
            ).fetchall()
        return [_row_to_entry(row) for row in rows]


def _row_to_entry(row: sqlite3.Row) -> Entry:
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
    grouped: dict[str, list[Entry]] = {}
    for entry in entries:
        key_date = entry.end_at if entry.kind == "sleep" and entry.end_at else entry.start_at
        key = key_date.strftime("%Y-%m")
        grouped.setdefault(key, []).append(entry)
    return grouped

