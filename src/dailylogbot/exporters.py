from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from io import BytesIO
from zoneinfo import ZoneInfo

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from dailylogbot.db import Entry, entries_by_month


HEADER_FILL = "CFE2F3"
BLOCK_MIN_BODY_ROWS = 6
LEFT_BLOCK_COLUMNS = (1, 2, 3)
RIGHT_BLOCK_COLUMNS = (5, 6, 7)


def export_xlsx(entries: list[Entry], start_date: date, end_date: date, tz: ZoneInfo) -> BytesIO:
    workbook = Workbook()
    first_sheet = workbook.active
    month_ranges = _month_ranges(start_date, end_date)
    entries_by_month_key = entries_by_month(entries)

    for index, (month, month_start, month_end) in enumerate(month_ranges):
        sheet = first_sheet if index == 0 else workbook.create_sheet()
        sheet.title = month
        month_entries = entries_by_month_key.get(month, [])
        _write_monitor_month_sheet(sheet, month_entries, month_start, month_end, tz)

    stream = BytesIO()
    workbook.save(stream)
    stream.seek(0)
    return stream


def export_pdf(entries: list[Entry], start_date: date, end_date: date, tz: ZoneInfo) -> BytesIO:
    stream = BytesIO()
    document = SimpleDocTemplate(stream, pagesize=A4, rightMargin=24, leftMargin=24, topMargin=24, bottomMargin=24)
    styles = getSampleStyleSheet()
    story: list[object] = [
        Paragraph("DailyLogBot Monitor", styles["Title"]),
        Paragraph(f"{start_date.isoformat()} to {end_date.isoformat()}", styles["Normal"]),
        Spacer(1, 12),
    ]

    day_entries = _entries_by_day(entries, tz)
    for month, month_start, month_end in _month_ranges(start_date, end_date):
        story.append(Paragraph(month, styles["Heading2"]))
        for left_day, right_day in _day_pairs(month_start, month_end):
            left_block = _pdf_day_block(left_day, day_entries.get(left_day, []), tz, styles)
            right_block = _pdf_day_block(right_day, day_entries.get(right_day, []), tz, styles) if right_day else ""
            outer = Table([[left_block, "", right_block]], colWidths=[255, 12, 255])
            outer.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
            story.append(outer)
            story.append(Spacer(1, 8))

    document.build(story)
    stream.seek(0)
    return stream


def range_bounds(start_date: date, end_date: date, tz: ZoneInfo) -> tuple[datetime, datetime]:
    return (
        datetime.combine(start_date, time.min, tzinfo=tz),
        datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=tz),
    )


def _write_monitor_month_sheet(sheet, entries: list[Entry], start_date: date, end_date: date, tz: ZoneInfo) -> None:
    sheet.sheet_view.showGridLines = False
    widths = {"A": 13, "B": 13, "C": 56.38, "D": 4, "E": 13, "F": 13, "G": 56.38}
    for column, width in widths.items():
        sheet.column_dimensions[column].width = width

    day_entries = _entries_by_day(entries, tz)
    row = 1
    for left_day, right_day in _day_pairs(start_date, end_date):
        left_rows = _monitor_rows(day_entries.get(left_day, []), tz)
        right_rows = _monitor_rows(day_entries.get(right_day, []), tz) if right_day else []
        body_rows = max(len(left_rows), len(right_rows), BLOCK_MIN_BODY_ROWS)
        _write_xlsx_day_block(sheet, row, LEFT_BLOCK_COLUMNS, left_day, left_rows, body_rows)
        if right_day:
            _write_xlsx_day_block(sheet, row, RIGHT_BLOCK_COLUMNS, right_day, right_rows, body_rows)
        row += body_rows + 2

    sheet.freeze_panes = "A1"


def _write_xlsx_day_block(sheet, row: int, columns: tuple[int, int, int], day: date, rows: list[list[str]], body_rows: int) -> None:
    label_col, time_col, details_col = columns
    sheet.merge_cells(start_row=row, start_column=label_col, end_row=row, end_column=details_col)

    header = sheet.cell(row=row, column=label_col, value=day)
    header.number_format = "ddd dd/mm"
    header.fill = PatternFill("solid", fgColor=HEADER_FILL)
    header.font = Font(size=14, bold=True)
    header.alignment = Alignment(horizontal="center", vertical="center")
    header.border = _border(top=True, bottom=True, left=True, right=True)
    for col in range(label_col + 1, details_col + 1):
        cell = sheet.cell(row=row, column=col)
        cell.fill = PatternFill("solid", fgColor=HEADER_FILL)
        cell.border = _border(top=True, bottom=True, right=col == details_col)

    for offset in range(body_rows):
        current_row = row + offset + 1
        values = rows[offset] if offset < len(rows) else ["", "", ""]
        is_last = offset == body_rows - 1
        sheet.row_dimensions[current_row].height = 30
        for col_offset, value in enumerate(values):
            col = label_col + col_offset
            cell = sheet.cell(row=current_row, column=col, value=value)
            cell.alignment = Alignment(vertical="center", wrap_text=col == details_col)
            cell.border = _border(left=col == label_col, right=col == details_col, bottom=is_last)

    sheet.row_dimensions[row].height = 30


def _border(*, top: bool = False, bottom: bool = False, left: bool = False, right: bool = False) -> Border:
    thick = Side(style="thick", color="000000")
    return Border(
        top=thick if top else Side(style=None),
        bottom=thick if bottom else Side(style=None),
        left=thick if left else Side(style=None),
        right=thick if right else Side(style=None),
    )


def _entries_by_day(entries: list[Entry], tz: ZoneInfo) -> dict[date, list[Entry]]:
    grouped: dict[date, list[Entry]] = defaultdict(list)
    for entry in entries:
        key_dt = entry.end_at if entry.kind == "sleep" and entry.end_at else entry.start_at
        grouped[key_dt.astimezone(tz).date()].append(entry)
    return dict(sorted(grouped.items(), key=lambda item: item[0]))


def _daily_order(entries: list[Entry]) -> list[Entry]:
    order = {"sleep": 0, "meal": 1, "training": 2}
    meal_order = {"Breakfast": 0, "Snack 1": 1, "Lunch": 2, "Snack 2": 3, "Dinner": 4}
    return sorted(
        entries,
        key=lambda entry: (
            order.get(entry.kind, 9),
            meal_order.get(entry.label, 9) if entry.kind == "meal" else 0,
            entry.start_at,
            entry.id,
        ),
    )


def _kind_name(entry: Entry) -> str:
    return {"meal": "Meal", "training": "Training", "sleep": "Sleep"}[entry.kind]


def _monitor_rows(entries: list[Entry], tz: ZoneInfo) -> list[list[str]]:
    return [_monitor_row(entry, tz) for entry in _daily_order(entries)]


def _monitor_row(entry: Entry, tz: ZoneInfo) -> list[str]:
    if entry.kind == "sleep":
        return ["Dormito", _compact_time_range(entry, tz), ""]
    if entry.kind == "training":
        details = entry.label if not entry.text else f"{entry.label}: {entry.text}"
        return ["Attivita", _compact_time_range(entry, tz), details]
    return [_meal_label(entry.label), entry.start_at.astimezone(tz).strftime("%H:%M"), entry.text]


def _meal_label(label: str) -> str:
    return {
        "Breakfast": "Colazione",
        "Snack 1": "Merenda",
        "Lunch": "Pranzo",
        "Snack 2": "Merenda",
        "Dinner": "Cena",
    }.get(label, label)


def _time_range(entry: Entry, tz: ZoneInfo) -> str:
    start = entry.start_at.astimezone(tz).strftime("%H:%M")
    if entry.end_at:
        end = entry.end_at.astimezone(tz).strftime("%H:%M")
        if entry.end_at.astimezone(tz).date() != entry.start_at.astimezone(tz).date():
            return f"{_format_dt(entry.start_at, tz)} - {_format_dt(entry.end_at, tz)}"
        return f"{start} - {end}"
    return start if entry.kind == "meal" else f"{start} - open"


def _format_dt(value: datetime, tz: ZoneInfo) -> str:
    return value.astimezone(tz).strftime("%Y-%m-%d %H:%M")


def _compact_time_range(entry: Entry, tz: ZoneInfo) -> str:
    start = entry.start_at.astimezone(tz).strftime("%H:%M")
    if entry.end_at is None:
        return f"{start}-open"
    end = entry.end_at.astimezone(tz).strftime("%H:%M")
    return f"{start}-{end}"


def _month_ranges(start_date: date, end_date: date) -> list[tuple[str, date, date]]:
    ranges: list[tuple[str, date, date]] = []
    current = start_date.replace(day=1)
    while current <= end_date:
        if current.month == 12:
            next_month = current.replace(year=current.year + 1, month=1)
        else:
            next_month = current.replace(month=current.month + 1)
        month_start = max(start_date, current)
        month_end = min(end_date, next_month - timedelta(days=1))
        ranges.append((current.strftime("%Y-%m"), month_start, month_end))
        current = next_month
    return ranges


def _day_pairs(start_date: date, end_date: date) -> list[tuple[date, date | None]]:
    days: list[date] = []
    current = start_date
    while current <= end_date:
        days.append(current)
        current += timedelta(days=1)
    return [(days[index], days[index + 1] if index + 1 < len(days) else None) for index in range(0, len(days), 2)]


def _pdf_day_block(day: date, entries: list[Entry], tz: ZoneInfo, styles) -> Table:
    rows = [[day.strftime("%a %d/%m"), "", ""]]
    monitor_rows = _monitor_rows(entries, tz)
    body_rows = max(len(monitor_rows), BLOCK_MIN_BODY_ROWS)
    for index in range(body_rows):
        row = monitor_rows[index] if index < len(monitor_rows) else ["", "", ""]
        rows.append([row[0], row[1], Paragraph(row[2] or " ", styles["BodyText"])])

    table = Table(rows, colWidths=[55, 58, 142])
    table.setStyle(
        TableStyle(
            [
                ("SPAN", (0, 0), (-1, 0)),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(f"#{HEADER_FILL}")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 10),
                ("ALIGN", (0, 0), (-1, 0), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BOX", (0, 0), (-1, -1), 1.25, colors.black),
                ("LINEBELOW", (0, 0), (-1, 0), 1.25, colors.black),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table
