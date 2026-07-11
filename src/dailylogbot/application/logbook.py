"""Framework-independent use cases for DailyLog entries and reports."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Protocol
from zoneinfo import ZoneInfo

from dailylogbot.db import Entry, EntryFieldValue, UserSettings, WeighIn
from dailylogbot.exporters import range_bounds


class EntryRepository(Protocol):
    """Define the persistence operations required by the logbook use cases."""

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
        """Persist a validated entry and return its stored representation.

        Args:
            user_id: Telegram user that owns the entry.
            kind: Persisted category for the entry.
            label: Human-readable activity or meal label.
            text: Optional user-provided detail text.
            start_at: Time the entry began.
            end_at: Optional time the activity ended.

        Returns:
            The persisted entry.
        """

    def get_entry(self, user_id: int, entry_id: int) -> Entry | None:
        """Retrieve one non-deleted entry owned by a user.

        Args:
            user_id: Telegram user that owns the entry.
            entry_id: Database identifier of the entry.

        Returns:
            The matching entry, or ``None`` when it is unavailable.
        """

    def get_last_entry(self, user_id: int) -> Entry | None:
        """Retrieve the most recently created entry for a user.

        Args:
            user_id: Telegram user that owns the entry.

        Returns:
            The newest entry, or ``None`` when no entry exists.
        """

    def get_open_activity(self, user_id: int) -> Entry | None:
        """Retrieve the user's sole unfinished activity.

        Args:
            user_id: Telegram user that owns the activity.

        Returns:
            The open activity, or ``None`` when no activity is active.
        """

    def end_open_activity(self, user_id: int, end_at: datetime) -> Entry | None:
        """Close the user's open activity.

        Args:
            user_id: Telegram user that owns the activity.
            end_at: Time at which the activity ended.

        Returns:
            The closed activity, or ``None`` when no activity is active.
        """

    def cancel_open_activity(self, user_id: int, cancelled_at: datetime) -> Entry | None:
        """Delete the user's open activity as one atomic operation.

        Args:
            user_id: Telegram user that owns the activity.
            cancelled_at: Time at which the cancellation occurred.

        Returns:
            The cancelled activity, or ``None`` when no activity is active.
        """

    def update_entry(
        self,
        user_id: int,
        entry_id: int,
        fields: dict[str, EntryFieldValue],
    ) -> Entry | None:
        """Update approved values on an owned entry.

        Args:
            user_id: Telegram user that owns the entry.
            entry_id: Database identifier of the entry.
            fields: Parsed, typed values to replace.

        Returns:
            The updated entry, or ``None`` when it is unavailable.
        """

    def delete_entry(self, user_id: int, entry_id: int, deleted_at: datetime) -> bool:
        """Soft-delete an owned entry.

        Args:
            user_id: Telegram user that owns the entry.
            entry_id: Database identifier of the entry.
            deleted_at: Time at which the deletion occurred.

        Returns:
            Whether an entry was deleted.
        """

    def list_entries_between(self, user_id: int, start_at: datetime, end_at: datetime) -> list[Entry]:
        """List user entries overlapping a half-open interval.

        Args:
            user_id: Telegram user that owns the entries.
            start_at: Inclusive interval start.
            end_at: Exclusive interval end.

        Returns:
            Chronologically ordered matching entries.
        """

    def list_entries(self, user_id: int) -> list[Entry]:
        """List all non-deleted entries for a user.

        Args:
            user_id: Telegram user that owns the entries.

        Returns:
            Chronologically ordered entries.
        """

    def get_or_create_settings(self, user_id: int, initial_locale: str) -> UserSettings:
        """Return persisted settings, creating a default when missing."""

    def update_settings(
        self, user_id: int, *, locale: str | None = None, weight_unit: str | None = None
    ) -> UserSettings:
        """Persist one or both presentation preferences."""

    def add_weigh_in(self, user_id: int, weight_grams: int, recorded_at: datetime) -> WeighIn:
        """Persist one canonical-metric weigh-in."""

    def list_weigh_ins_between(self, user_id: int, start_at: datetime, end_at: datetime) -> list[WeighIn]:
        """List weigh-ins inside one half-open interval."""

    def list_weigh_ins(self, user_id: int) -> list[WeighIn]:
        """List all non-deleted weigh-ins."""


@dataclass(frozen=True)
class ExportPeriod:
    """Represent an inclusive local-date interval selected for a report."""

    start_date: date
    end_date: date

    def __post_init__(self) -> None:
        """Reject date ranges whose end precedes their start.

        Raises:
            ValueError: If ``end_date`` is earlier than ``start_date``.
        """
        if self.end_date < self.start_date:
            raise ValueError("The end date cannot precede the start date.")


@dataclass(frozen=True)
class ReportData:
    """All reportable data selected for one inclusive period."""

    entries: list[Entry]
    weigh_ins: list[WeighIn]


class LogbookService:
    """Coordinate entry persistence without depending on Telegram classes."""

    def __init__(self, repository: EntryRepository) -> None:
        """Create the service with its explicit persistence dependency.

        Args:
            repository: Store used for all DailyLog entries.
        """
        self._repository = repository

    def create_entry(
        self,
        *,
        user_id: int,
        kind: str,
        label: str,
        text: str,
        start_at: datetime,
        end_at: datetime | None = None,
    ) -> Entry:
        """Create one meal or activity entry.

        Args:
            user_id: Telegram user that owns the entry.
            kind: Persisted category for the entry.
            label: Human-readable activity or meal label.
            text: Optional user-provided detail text.
            start_at: Time the entry began.
            end_at: Optional time the activity ended.

        Returns:
            The persisted entry.
        """
        return self._repository.add_entry(
            user_id=user_id,
            kind=kind,
            label=label,
            text=text,
            start_at=start_at,
            end_at=end_at,
        )

    def active_activity(self, user_id: int) -> Entry | None:
        """Return the user's sole unfinished activity.

        Args:
            user_id: Telegram user that owns the activity.

        Returns:
            The active entry, or ``None`` when no activity is active.
        """
        return self._repository.get_open_activity(user_id)

    def finish_active_activity(self, user_id: int, end_at: datetime) -> Entry | None:
        """Close the user's open training or sleep entry.

        Args:
            user_id: Telegram user that owns the activity.
            end_at: Time at which the activity ended.

        Returns:
            The completed entry, or ``None`` when no activity is active.
        """
        return self._repository.end_open_activity(user_id, end_at)

    def cancel_active_activity(self, user_id: int, cancelled_at: datetime) -> Entry | None:
        """Remove an unfinished activity and return the removed entry.

        Args:
            user_id: Telegram user that owns the activity.
            cancelled_at: Time at which the cancellation occurred.

        Returns:
            The cancelled entry, or ``None`` when no activity is active.
        """
        return self._repository.cancel_open_activity(user_id, cancelled_at)

    def latest_entry(self, user_id: int) -> Entry | None:
        """Return the user's newest persisted entry.

        Args:
            user_id: Telegram user that owns the entry.

        Returns:
            The newest entry, or ``None`` when no entry exists.
        """
        return self._repository.get_last_entry(user_id)

    def delete_latest_entry(self, user_id: int, deleted_at: datetime) -> bool:
        """Delete the user's newest entry when one exists.

        Args:
            user_id: Telegram user that owns the entry.
            deleted_at: Time at which the deletion occurred.

        Returns:
            Whether an entry was deleted.
        """
        latest_entry = self._repository.get_last_entry(user_id)
        return (
            self._repository.delete_entry(user_id, latest_entry.id, deleted_at) if latest_entry is not None else False
        )

    def delete_entry(self, user_id: int, entry_id: int, deleted_at: datetime) -> bool:
        """Delete one owned entry.

        Args:
            user_id: Telegram user that owns the entry.
            entry_id: Database identifier of the entry.
            deleted_at: Time at which the deletion occurred.

        Returns:
            Whether an entry was deleted.
        """
        return self._repository.delete_entry(user_id, entry_id, deleted_at)

    def update_entry(self, user_id: int, entry_id: int, fields: dict[str, EntryFieldValue]) -> Entry | None:
        """Update one owned entry.

        Args:
            user_id: Telegram user that owns the entry.
            entry_id: Database identifier of the entry.
            fields: Parsed, typed values to replace.

        Returns:
            The updated entry, or ``None`` when it is unavailable.
        """
        return self._repository.update_entry(user_id, entry_id, fields)

    def entries_in_period(self, user_id: int, period: ExportPeriod, timezone: ZoneInfo) -> list[Entry]:
        """Return entries that overlap an inclusive local-date period.

        Args:
            user_id: Telegram user that owns the entries.
            period: Inclusive date period to retrieve.
            timezone: Timezone used to derive the local-day boundaries.

        Returns:
            Matching entries in chronological order.
        """
        start_at, end_at = range_bounds(period.start_date, period.end_date, timezone)
        return self._repository.list_entries_between(user_id, start_at, end_at)

    def entries_today(self, user_id: int, current_time: datetime, timezone: ZoneInfo) -> list[Entry]:
        """Return entries that overlap the supplied local day.

        Args:
            user_id: Telegram user that owns the entries.
            current_time: Current time in the user's timezone.
            timezone: Timezone used to derive local-day boundaries.

        Returns:
            Matching entries in chronological order.
        """
        return self.entries_in_period(user_id, ExportPeriod(current_time.date(), current_time.date()), timezone)

    def all_entries_period(self, user_id: int, timezone: ZoneInfo) -> tuple[ExportPeriod, list[Entry]] | None:
        """Return every entry with the smallest local-date period containing them.

        Args:
            user_id: Telegram user that owns the entries.
            timezone: Timezone used to calculate dates.

        Returns:
            The containing period and its entries, or ``None`` when no entries exist.
        """
        entries = self._repository.list_entries(user_id)
        if not entries:
            return None
        start_date = min(entry.start_at.astimezone(timezone).date() for entry in entries)
        end_date = max((entry.end_at or entry.start_at).astimezone(timezone).date() for entry in entries)
        return ExportPeriod(start_date, end_date), entries

    def get_or_create_settings(self, user_id: int, initial_locale: str) -> UserSettings:
        """Load saved settings, using the Telegram locale only on first use."""
        return self._repository.get_or_create_settings(user_id, initial_locale)

    def update_settings(
        self, user_id: int, *, locale: str | None = None, weight_unit: str | None = None
    ) -> UserSettings:
        """Save one or both user presentation preferences."""
        return self._repository.update_settings(user_id, locale=locale, weight_unit=weight_unit)

    def create_weigh_in(self, user_id: int, weight_grams: int, recorded_at: datetime) -> WeighIn:
        """Create one metric-normalized body-weight reading."""
        return self._repository.add_weigh_in(user_id, weight_grams, recorded_at)

    def weigh_ins_in_period(self, user_id: int, period: ExportPeriod, timezone: ZoneInfo) -> list[WeighIn]:
        """Return weigh-ins recorded during an inclusive local-date period."""
        start_at, end_at = range_bounds(period.start_date, period.end_date, timezone)
        return self._repository.list_weigh_ins_between(user_id, start_at, end_at)

    def report_data_in_period(self, user_id: int, period: ExportPeriod, timezone: ZoneInfo) -> ReportData:
        """Load entries and weigh-ins for a report in one consistent period."""
        return ReportData(
            entries=self.entries_in_period(user_id, period, timezone),
            weigh_ins=self.weigh_ins_in_period(user_id, period, timezone),
        )

    def all_data_period(self, user_id: int, timezone: ZoneInfo) -> tuple[ExportPeriod, ReportData] | None:
        """Find the narrowest local-date period containing all current data."""
        entries = self._repository.list_entries(user_id)
        weigh_ins = self._repository.list_weigh_ins(user_id)
        if not entries and not weigh_ins:
            return None
        dates = [entry.start_at.astimezone(timezone).date() for entry in entries]
        dates.extend((entry.end_at or entry.start_at).astimezone(timezone).date() for entry in entries)
        dates.extend(weigh_in.recorded_at.astimezone(timezone).date() for weigh_in in weigh_ins)
        period = ExportPeriod(min(dates), max(dates))
        return period, ReportData(entries=entries, weigh_ins=weigh_ins)
