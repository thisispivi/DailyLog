"""XLSX and PDF report generation isolated from Telegram delivery."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from datetime import date, datetime, time, timedelta
from io import BytesIO
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo

from openpyxl import Workbook
from openpyxl.cell.cell import Cell
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.worksheet import Worksheet
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.platypus.doctemplate import BaseDocTemplate

from dailylogbot.db import Entry, WeighIn
from dailylogbot.i18n import format_report_date, report
from dailylogbot.measurements import format_weight

NAVY = "16324F"
TEAL = "1B998B"
BLUE = "2E75B6"
AMBER = "F4A261"
VIOLET = "7B61FF"
INK = "1F2937"
MUTED = "64748B"
MIST = "F4F7FB"
LINE = "D8E1EB"
WHITE = "FFFFFF"


def export_xlsx(
    entries: list[Entry],
    start_date: date,
    end_date: date,
    tz: ZoneInfo,
    *,
    weigh_ins: list[WeighIn] | None = None,
    locale: str = "en",
    weight_unit: str = "kg",
) -> BytesIO:
    """Create a polished, month-by-month Excel log with summaries and dated sections."""
    workbook = Workbook()
    workbook.properties.creator = "DailyLog"
    workbook.properties.title = f"{report(locale, 'title')} export"
    workbook.properties.subject = f"{start_date.isoformat()} to {end_date.isoformat()}"
    first_sheet = workbook.active
    for index, (month_key, month_start, month_end) in enumerate(_month_ranges(start_date, end_date)):
        sheet = first_sheet if index == 0 else workbook.create_sheet()
        sheet.title = month_key
        month_entries = [entry for entry in entries if month_start <= _entry_day(entry, tz) <= month_end]
        month_weigh_ins = [
            weigh_in
            for weigh_in in (weigh_ins or [])
            if month_start <= weigh_in.recorded_at.astimezone(tz).date() <= month_end
        ]
        _write_month_sheet(sheet, month_entries, month_weigh_ins, month_start, month_end, tz, locale, weight_unit)
    stream = BytesIO()
    workbook.save(stream)
    stream.seek(0)
    return stream


def export_pdf(
    entries: list[Entry],
    start_date: date,
    end_date: date,
    tz: ZoneInfo,
    *,
    weigh_ins: list[WeighIn] | None = None,
    locale: str = "en",
    weight_unit: str = "kg",
) -> BytesIO:
    """Create a print-ready PDF report with a clear hierarchy and coloured data table."""
    stream = BytesIO()
    document = SimpleDocTemplate(
        stream,
        pagesize=A4,
        rightMargin=10 * mm,
        leftMargin=10 * mm,
        topMargin=21 * mm,
        bottomMargin=17 * mm,
        title=f"{report(locale, 'title')} export",
        author="DailyLog",
    )
    styles = _pdf_styles()
    story: list[object] = [
        Paragraph(report(locale, "title"), styles["title"]),
        Paragraph(
            report(
                locale,
                "subtitle",
                start=format_report_date(start_date, locale),
                end=format_report_date(end_date, locale),
            ),
            styles["subtitle"],
        ),
        Spacer(1, 6 * mm),
    ]
    for index, (month_key, month_start, month_end) in enumerate(_month_ranges(start_date, end_date)):
        month_entries = [entry for entry in entries if month_start <= _entry_day(entry, tz) <= month_end]
        month_weigh_ins = [
            weigh_in
            for weigh_in in (weigh_ins or [])
            if month_start <= weigh_in.recorded_at.astimezone(tz).date() <= month_end
        ]
        story.extend(_pdf_month_section(month_key, month_entries, month_weigh_ins, styles, tz, locale, weight_unit))
        if index < len(_month_ranges(start_date, end_date)) - 1:
            story.append(PageBreak())

    def draw_page(canvas: Canvas, report_document: BaseDocTemplate) -> None:
        _draw_pdf_page(canvas, report_document, locale)

    document.build(story, onFirstPage=draw_page, onLaterPages=draw_page)
    stream.seek(0)
    return stream


def range_bounds(start_date: date, end_date: date, tz: ZoneInfo) -> tuple[datetime, datetime]:
    """Return timezone-aware half-open datetime bounds for an inclusive date range."""
    return (
        datetime.combine(start_date, time.min, tzinfo=tz),
        datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=tz),
    )


def _write_month_sheet(
    sheet: Worksheet,
    entries: list[Entry],
    weigh_ins: list[WeighIn],
    month_start: date,
    month_end: date,
    tz: ZoneInfo,
    locale: str,
    weight_unit: str,
) -> None:
    """Lay out one Excel worksheet as a compact, readable monthly report."""
    sheet.sheet_view.showGridLines = False
    sheet.sheet_properties.pageSetUpPr.fitToPage = True
    sheet.page_setup.orientation = "landscape"
    sheet.page_setup.fitToWidth = 1
    sheet.page_setup.fitToHeight = 0
    sheet.page_margins.left = 0.25
    sheet.page_margins.right = 0.25
    sheet.page_margins.top = 0.45
    sheet.page_margins.bottom = 0.45
    sheet.freeze_panes = "A9"
    widths = {"A": 16, "B": 16, "C": 24, "D": 15, "E": 15, "F": 14, "G": 56, "H": 4}
    for column_name, width in widths.items():
        sheet.column_dimensions[column_name].width = width

    sheet.merge_cells("A1:H1")
    title_cell = sheet["A1"]
    title_cell.value = report(locale, "title").upper()
    title_cell.font = Font(name="Aptos Display", size=22, bold=True, color=WHITE)
    title_cell.fill = PatternFill("solid", fgColor=NAVY)
    title_cell.alignment = Alignment(horizontal="left", vertical="center")
    sheet.row_dimensions[1].height = 38
    sheet.merge_cells("A2:H2")
    subtitle_cell = sheet["A2"]
    subtitle_cell.value = (
        f"{report(locale, f'month_{month_start.month:02d}')} {month_start.year}  |  "
        f"{format_report_date(month_start, locale)} - {format_report_date(month_end, locale)}"
    )
    subtitle_cell.font = Font(name="Aptos", size=11, color=MUTED)
    subtitle_cell.alignment = Alignment(horizontal="left", vertical="center")
    sheet.row_dimensions[2].height = 24
    _write_metric_cards(sheet, entries, locale)
    headers = [report(locale, key) for key in ("date", "type", "activity", "start", "end", "duration", "details")]
    for column, value in enumerate(headers, start=1):
        cell = sheet.cell(row=8, column=column, value=value)
        cell.fill = PatternFill("solid", fgColor=NAVY)
        cell.font = Font(name="Aptos", size=10, bold=True, color=WHITE)
        cell.alignment = Alignment(horizontal="left", vertical="center")
        cell.border = _bottom_border(NAVY)
    sheet.row_dimensions[8].height = 23
    row = 9
    for day, day_entries in _group_by_day(entries, tz).items():
        sheet.merge_cells(start_row=row, start_column=1, end_row=row, end_column=7)
        day_cell = sheet.cell(row=row, column=1, value=format_report_date(day, locale, weekday=True).upper())
        day_cell.fill = PatternFill("solid", fgColor="DCEAF7")
        day_cell.font = Font(name="Aptos", size=10, bold=True, color=BLUE)
        day_cell.alignment = Alignment(horizontal="left", vertical="center")
        day_cell.border = _bottom_border("B8D3EB")
        sheet.row_dimensions[row].height = 22
        row += 1
        for entry in _daily_order(day_entries):
            values = _xlsx_row(entry, tz, locale)
            for column, value in enumerate(values, start=1):
                cell = sheet.cell(row=row, column=column, value=value)
                cell.font = Font(name="Aptos", size=10, color=INK)
                cell.fill = PatternFill("solid", fgColor=WHITE if row % 2 else MIST)
                cell.alignment = Alignment(
                    horizontal="left",
                    vertical="top" if column == 7 else "center",
                    wrap_text=column in {3, 7},
                )
                cell.border = _bottom_border(LINE)
            _style_category_cell(sheet.cell(row=row, column=2), entry.kind)
            sheet.row_dimensions[row].height = _xlsx_row_height(entry.text)
            row += 1
    if row == 9:
        sheet.merge_cells("A9:G9")
        empty_cell = sheet["A9"]
        empty_cell.value = report(locale, "empty")
        empty_cell.font = Font(name="Aptos", size=11, italic=True, color=MUTED)
        empty_cell.alignment = Alignment(horizontal="center", vertical="center")
        empty_cell.fill = PatternFill("solid", fgColor=MIST)
        sheet.row_dimensions[9].height = 30
        row = 10
    row = _write_weight_section(sheet, row + 1, weigh_ins, tz, locale, weight_unit)
    sheet.merge_cells(start_row=row + 1, start_column=1, end_row=row + 1, end_column=7)
    footer_cell = sheet.cell(row=row + 1, column=1, value=report(locale, "footer"))
    footer_cell.font = Font(name="Aptos", size=9, italic=True, color=MUTED)
    footer_cell.alignment = Alignment(horizontal="right", vertical="center")
    sheet.row_dimensions[row + 1].height = 22
    sheet.sheet_properties.outlinePr.summaryBelow = False
    sheet.auto_filter.ref = f"A8:G{max(9, row - 1)}"


def _write_metric_cards(sheet: Worksheet, entries: list[Entry], locale: str) -> None:
    """Write four visual metric cards above the sheet's detailed activity table."""
    metrics = [
        (report(locale, "entries"), len(entries), BLUE),
        (report(locale, "meals"), sum(entry.kind == "meal" for entry in entries), TEAL),
        (report(locale, "training"), sum(entry.kind == "training" for entry in entries), AMBER),
        (report(locale, "sleep"), sum(entry.kind == "sleep" for entry in entries), VIOLET),
    ]
    for index, (label, value, color) in enumerate(metrics):
        start_column = index * 2 + 1
        sheet.merge_cells(start_row=4, start_column=start_column, end_row=4, end_column=start_column + 1)
        sheet.merge_cells(start_row=5, start_column=start_column, end_row=5, end_column=start_column + 1)
        label_cell = sheet.cell(row=4, column=start_column, value=label)
        value_cell = sheet.cell(row=5, column=start_column, value=value)
        for cell in (label_cell, value_cell):
            cell.fill = PatternFill("solid", fgColor=color)
            cell.alignment = Alignment(horizontal="center", vertical="center")
        label_cell.font = Font(name="Aptos", size=9, bold=True, color=WHITE)
        value_cell.font = Font(name="Aptos Display", size=20, bold=True, color=WHITE)
    sheet.row_dimensions[4].height = 19
    sheet.row_dimensions[5].height = 31


def _write_weight_section(
    sheet: Worksheet,
    start_row: int,
    weigh_ins: list[WeighIn],
    tz: ZoneInfo,
    locale: str,
    weight_unit: str,
) -> int:
    """Append a compact localized monthly body-weight table when readings exist."""
    if not weigh_ins:
        return start_row - 1
    row = start_row
    sheet.merge_cells(start_row=row, start_column=1, end_row=row, end_column=7)
    title = sheet.cell(row=row, column=1, value=report(locale, "weight_summary"))
    title.fill = PatternFill("solid", fgColor=VIOLET)
    title.font = Font(name="Aptos", size=11, bold=True, color=WHITE)
    title.alignment = Alignment(horizontal="left", vertical="center")
    sheet.row_dimensions[row].height = 22
    row += 1
    headers = [
        report(locale, "date"),
        report(locale, "time"),
        report(locale, "weight"),
        report(locale, "latest"),
        report(locale, "average"),
    ]
    for column, value in enumerate(headers, start=1):
        cell = sheet.cell(row=row, column=column, value=value)
        cell.fill = PatternFill("solid", fgColor=NAVY)
        cell.font = Font(name="Aptos", size=9, bold=True, color=WHITE)
        cell.alignment = Alignment(horizontal="center", vertical="center")
    row += 1
    average = round(sum(item.weight_grams for item in weigh_ins) / len(weigh_ins))
    latest = max(weigh_ins, key=lambda item: (item.recorded_at, item.id))
    for item in weigh_ins:
        local = item.recorded_at.astimezone(tz)
        values = [
            format_report_date(local.date(), locale),
            local.strftime("%H:%M"),
            format_weight(item.weight_grams, weight_unit),
            format_weight(latest.weight_grams, weight_unit),
            format_weight(average, weight_unit),
        ]
        for column, value in enumerate(values, start=1):
            cell = sheet.cell(row=row, column=column, value=value)
            cell.font = Font(name="Aptos", size=10, color=INK)
            cell.fill = PatternFill("solid", fgColor=WHITE if row % 2 else MIST)
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = _bottom_border(LINE)
        row += 1
    return row - 1


def _style_category_cell(cell: Cell, kind: str) -> None:
    """Apply a distinct colour treatment for an entry category in the Excel table."""
    color = {"meal": TEAL, "training": AMBER, "sleep": VIOLET}[kind]
    cell.fill = PatternFill("solid", fgColor=color)
    cell.font = Font(name="Aptos", size=10, bold=True, color=WHITE)
    cell.alignment = Alignment(horizontal="center", vertical="center")


def _bottom_border(color: str) -> Border:
    """Create a lightweight single bottom border for clean table separation."""
    return Border(bottom=Side(style="thin", color=color))


def _xlsx_row(entry: Entry, tz: ZoneInfo, locale: str) -> list[str]:
    """Return a sanitized presentation row for a single Excel entry."""
    start = entry.start_at.astimezone(tz)
    end = entry.end_at.astimezone(tz) if entry.end_at else None
    return [
        format_report_date(start.date(), locale),
        _kind_label(entry.kind, locale),
        _safe_excel_text(_entry_title(entry)),
        start.strftime("%H:%M"),
        end.strftime("%H:%M") if end and entry.kind != "meal" else "",
        _duration(entry, locale),
        _safe_excel_text(entry.text),
    ]


def _xlsx_row_height(text: str) -> float:
    """Estimate a comfortable Excel row height for wrapped user-provided details."""
    return min(90, max(24, 15 * (1 + len(text) // 85)))


def _pdf_styles() -> dict[str, ParagraphStyle]:
    """Create the compact typography system shared by the generated PDF report."""
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "DailyLogTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=25,
            leading=29,
            textColor=colors.HexColor(f"#{NAVY}"),
            spaceAfter=2,
        ),
        "subtitle": ParagraphStyle(
            "DailyLogSubtitle",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=colors.HexColor(f"#{MUTED}"),
        ),
        "month": ParagraphStyle(
            "DailyLogMonth",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=18,
            textColor=colors.HexColor(f"#{NAVY}"),
            spaceBefore=1,
            spaceAfter=7,
        ),
        "metric_label": ParagraphStyle(
            "DailyLogMetricLabel",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=7,
            leading=9,
            textColor=colors.white,
            alignment=TA_CENTER,
        ),
        "metric_value": ParagraphStyle(
            "DailyLogMetricValue",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=18,
            textColor=colors.white,
            alignment=TA_CENTER,
        ),
        "header": ParagraphStyle(
            "DailyLogTableHeader",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=7.5,
            leading=9,
            textColor=colors.white,
        ),
        "day": ParagraphStyle(
            "DailyLogDay",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor(f"#{BLUE}"),
        ),
        "cell": ParagraphStyle(
            "DailyLogCell",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=7.6,
            leading=10,
            textColor=colors.HexColor(f"#{INK}"),
            alignment=TA_LEFT,
        ),
        "cell_bold": ParagraphStyle(
            "DailyLogCellBold",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=7.6,
            leading=10,
            textColor=colors.HexColor(f"#{INK}"),
        ),
        "empty": ParagraphStyle(
            "DailyLogEmpty",
            parent=base["Normal"],
            fontName="Helvetica-Oblique",
            fontSize=10,
            leading=14,
            textColor=colors.HexColor(f"#{MUTED}"),
            alignment=TA_CENTER,
        ),
    }


def _pdf_month_section(
    month_key: str,
    entries: list[Entry],
    weigh_ins: list[WeighIn],
    styles: dict[str, ParagraphStyle],
    tz: ZoneInfo,
    locale: str,
    weight_unit: str,
) -> list[object]:
    """Build one PDF month section with summary cards and a grouped data table."""
    year, month = (int(value) for value in month_key.split("-", 1))
    month_date = date(year, month, 1)
    month_title = f"{report(locale, f'month_{month_date.month:02d}')} {month_date.year}"
    section: list[object] = [
        Paragraph(month_title, styles["month"]),
        _pdf_metric_cards(entries, styles, locale),
        Spacer(1, 5 * mm),
    ]
    if entries:
        section.append(_pdf_entries_table(entries, styles, tz, locale))
    if weigh_ins:
        section.extend(_pdf_weight_section(weigh_ins, styles, tz, locale, weight_unit))
    if not entries and not weigh_ins:
        section.append(Paragraph(report(locale, "empty"), styles["empty"]))
    return section


def _pdf_entries_table(entries: list[Entry], styles: dict[str, ParagraphStyle], tz: ZoneInfo, locale: str) -> Table:
    """Create the localized entry table for one PDF month section."""
    headers = [report(locale, key) for key in ("date", "type", "activity", "time", "duration", "details")]
    data: list[list[object]] = [[Paragraph(header, styles["header"]) for header in headers]]
    commands: list[tuple[object, ...]] = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(f"#{NAVY}")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, 0), 5),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 5),
        ("TOPPADDING", (0, 1), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
        ("LINEBELOW", (0, 0), (-1, -1), 0.35, colors.HexColor(f"#{LINE}")),
    ]
    for day, day_entries in _group_by_day(entries, tz).items():
        row = len(data)
        data.append(
            [Paragraph(format_report_date(day, locale, weekday=True).upper(), styles["day"]), "", "", "", "", ""]
        )
        commands.extend(
            [("SPAN", (0, row), (-1, row)), ("BACKGROUND", (0, row), (-1, row), colors.HexColor("#E8F1F9"))]
        )
        for entry in _daily_order(day_entries):
            row = len(data)
            data.append(_pdf_entry_row(entry, styles, tz, locale))
            commands.append(("BACKGROUND", (1, row), (1, row), colors.HexColor(f"#{_kind_color(entry.kind)}")))
            commands.append(("TEXTCOLOR", (1, row), (1, row), colors.white))
    table = Table(data, colWidths=[55, 57, 94, 83, 56, 181], repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle(commands))
    return table


def _pdf_metric_cards(entries: list[Entry], styles: dict[str, ParagraphStyle], locale: str) -> Table:
    """Create a four-card visual summary for a PDF month section."""
    values = [
        (report(locale, "entries"), len(entries), BLUE),
        (report(locale, "meals"), sum(entry.kind == "meal" for entry in entries), TEAL),
        (report(locale, "training"), sum(entry.kind == "training" for entry in entries), AMBER),
        (report(locale, "sleep"), sum(entry.kind == "sleep" for entry in entries), VIOLET),
    ]
    data = [
        [Paragraph(label, styles["metric_label"]) for label, _, _ in values],
        [Paragraph(str(value), styles["metric_value"]) for _, value, _ in values],
    ]
    table = Table(data, colWidths=[134.75] * 4, hAlign="LEFT")
    commands: list[tuple[object, ...]] = [
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]
    for index, (_, _, color) in enumerate(values):
        commands.append(("BACKGROUND", (index, 0), (index, -1), colors.HexColor(f"#{color}")))
    table.setStyle(TableStyle(commands))
    return table


def _pdf_entry_row(entry: Entry, styles: dict[str, ParagraphStyle], tz: ZoneInfo, locale: str) -> list[Paragraph]:
    """Render one entry into PDF-safe table cells without interpreting user text as markup."""
    return [
        Paragraph(format_report_date(_entry_day(entry, tz), locale), styles["cell"]),
        Paragraph(_kind_label(entry.kind, locale), styles["cell_bold"]),
        Paragraph(_escape_pdf(_entry_title(entry)), styles["cell_bold"]),
        Paragraph(_escape_pdf(_time_range(entry, tz, locale)), styles["cell"]),
        Paragraph(_duration(entry, locale), styles["cell"]),
        Paragraph(_escape_pdf(entry.text) if entry.text else "-", styles["cell"]),
    ]


def _pdf_weight_section(
    weigh_ins: list[WeighIn], styles: dict[str, ParagraphStyle], tz: ZoneInfo, locale: str, weight_unit: str
) -> list[object]:
    """Build a localized body-weight summary and readings table for a PDF month."""
    latest = max(weigh_ins, key=lambda item: (item.recorded_at, item.id))
    average = round(sum(item.weight_grams for item in weigh_ins) / len(weigh_ins))
    summary = Table(
        [
            [
                Paragraph(report(locale, "weigh_ins"), styles["metric_label"]),
                Paragraph(report(locale, "latest"), styles["metric_label"]),
                Paragraph(report(locale, "average"), styles["metric_label"]),
            ],
            [
                Paragraph(str(len(weigh_ins)), styles["metric_value"]),
                Paragraph(format_weight(latest.weight_grams, weight_unit), styles["metric_value"]),
                Paragraph(format_weight(average, weight_unit), styles["metric_value"]),
            ],
        ],
        colWidths=[179.66] * 3,
        hAlign="LEFT",
    )
    summary.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(f"#{VIOLET}")),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    headers = [report(locale, key) for key in ("date", "time", "weight")]
    data: list[list[object]] = [[Paragraph(header, styles["header"]) for header in headers]]
    for item in weigh_ins:
        local = item.recorded_at.astimezone(tz)
        data.append(
            [
                Paragraph(format_report_date(local.date(), locale), styles["cell"]),
                Paragraph(local.strftime("%H:%M"), styles["cell"]),
                Paragraph(format_weight(item.weight_grams, weight_unit), styles["cell_bold"]),
            ]
        )
    readings = Table(data, colWidths=[180, 180, 179], repeatRows=1, hAlign="LEFT")
    readings.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(f"#{NAVY}")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, -1), 0.35, colors.HexColor(f"#{LINE}")),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return [
        Spacer(1, 5 * mm),
        Paragraph(report(locale, "weight_summary"), styles["month"]),
        summary,
        Spacer(1, 4 * mm),
        readings,
    ]


def _draw_pdf_page(canvas: Canvas, document: BaseDocTemplate, locale: str) -> None:
    """Draw the shared navy report header and quiet page-number footer on each page."""
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(colors.HexColor(f"#{NAVY}"))
    canvas.rect(0, height - 14 * mm, width, 14 * mm, stroke=0, fill=1)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(10 * mm, height - 8.5 * mm, report(locale, "title").upper())
    canvas.setFillColor(colors.HexColor(f"#{MUTED}"))
    canvas.setFont("Helvetica", 7.5)
    canvas.drawRightString(width - 10 * mm, 9 * mm, report(locale, "page", page=document.page))
    canvas.restoreState()


def _group_by_day(entries: Iterable[Entry], tz: ZoneInfo) -> dict[date, list[Entry]]:
    """Group entries by their display day while retaining stable chronological ordering."""
    grouped: dict[date, list[Entry]] = defaultdict(list)
    for entry in entries:
        grouped[_entry_day(entry, tz)].append(entry)
    return dict(sorted(grouped.items()))


def _entry_day(entry: Entry, tz: ZoneInfo) -> date:
    """Return the day used to present an entry, placing sleep on its wake-up day."""
    timestamp = entry.end_at if entry.kind == "sleep" and entry.end_at else entry.start_at
    return timestamp.astimezone(tz).date()


def _daily_order(entries: Iterable[Entry]) -> list[Entry]:
    """Order daily records by category, conventional meal order, then clock time."""
    kind_order = {"sleep": 0, "meal": 1, "training": 2}
    meal_order = {"Breakfast": 0, "Snack 1": 1, "Lunch": 2, "Snack 2": 3, "Dinner": 4}
    return sorted(
        entries,
        key=lambda entry: (
            kind_order[entry.kind],
            meal_order.get(entry.label, 9) if entry.kind == "meal" else 0,
            entry.start_at,
            entry.id,
        ),
    )


def _entry_title(entry: Entry) -> str:
    """Return the concise primary label appropriate to an entry's category."""
    if entry.kind == "sleep":
        return "Sleep"
    return entry.label


def _kind_label(kind: str, locale: str) -> str:
    """Return the report-localized category label."""
    return report(locale, f"{kind if kind != 'sleep' else 'sleep'}_kind" if kind != "meal" else "meal")


def _kind_color(kind: str) -> str:
    """Return the visual category colour used consistently in PDF and XLSX exports."""
    return {"meal": TEAL, "training": AMBER, "sleep": VIOLET}[kind]


def _time_range(entry: Entry, tz: ZoneInfo, locale: str) -> str:
    """Format an activity's local start and end times, including overnight clarity."""
    start = entry.start_at.astimezone(tz)
    if entry.kind == "meal":
        return start.strftime("%H:%M")
    if entry.end_at is None:
        return f"{start:%H:%M} - {report(locale, 'open')}"
    end = entry.end_at.astimezone(tz)
    if start.date() != end.date():
        start_text = f"{format_report_date(start.date(), locale)} {start:%H:%M}"
        end_text = f"{format_report_date(end.date(), locale)} {end:%H:%M}"
        return f"{start_text} - {end_text}"
    return f"{start:%H:%M} - {end:%H:%M}"


def _duration(entry: Entry, locale: str) -> str:
    """Return a compact, non-negative elapsed duration for a closed activity."""
    if entry.kind == "meal":
        return "-"
    if entry.end_at is None:
        return report(locale, "open")
    seconds = max(0, int((entry.end_at - entry.start_at).total_seconds()))
    hours, remainder = divmod(seconds, 3600)
    minutes = remainder // 60
    if hours:
        return f"{hours}h {minutes:02d}m"
    return f"{minutes}m"


def _safe_excel_text(value: str) -> str:
    """Remove unsupported control characters and neutralize spreadsheet formula injection."""
    cleaned = "".join(character for character in value if character >= " " or character in "\n\r\t")
    return f"'{cleaned}" if cleaned.lstrip().startswith(("=", "+", "-", "@")) else cleaned


def _escape_pdf(value: str) -> str:
    """Escape text before passing it into ReportLab's lightweight paragraph markup."""
    cleaned = " ".join(value.replace("\r", " ").replace("\n", " ").split())
    return escape(cleaned)


def _month_ranges(start_date: date, end_date: date) -> list[tuple[str, date, date]]:
    """Split an inclusive range into the month-specific boundaries used by exports."""
    ranges: list[tuple[str, date, date]] = []
    current = start_date.replace(day=1)
    while current <= end_date:
        next_month = (
            current.replace(year=current.year + 1, month=1)
            if current.month == 12
            else current.replace(month=current.month + 1)
        )
        ranges.append(
            (current.strftime("%Y-%m"), max(start_date, current), min(end_date, next_month - timedelta(days=1)))
        )
        current = next_month
    return ranges
