# DailyLog design system

How DailyLog looks, feels, and behaves. Read this before any UI change, and follow it for new screens, components, and exports. Paths are relative to `daily-log/`.

If something you need isn't covered here, match the closest existing screen and add the rule to this file in the same change.

## Principles

- **Soft wellness, normal monitoring app.** Calm pastels on a lavender canvas, rounded shapes, friendly but plain copy. No mascot, no gamified cheering, no illustrations.
- **Fewest clicks.** Logging is one tap on a tile, then type, then Add. Settings save on change. Export is one button per format. Prefill everything that can be guessed (time of day → meal type, last activity, last weight).
- **Every record type has a colour**, used everywhere: meal green, training orange, sleep blue, weight purple.
- **Light and dark are equal citizens.** Every colour has both values; check both.
- **Phones first for logging, desktop for reviewing.** Today and the logger must work one-handed at 375px.

## Colour

All colours are CSS custom properties in `src/app/globals.css`, each written once as `light-dark(light, dark)`. The theme setting (System / Light / Dark) switches `color-scheme` on `<html>`, so never write a separate dark-mode block and never use a literal colour in component CSS.

### Neutrals and brand

| Token                        | Light                 | Dark                  | Use                                                       |
| ---------------------------- | --------------------- | --------------------- | --------------------------------------------------------- |
| `--canvas`                   | `#f4f1ff`             | `#17142b`             | Page background                                           |
| `--surface`                  | `#ffffff`             | `#221e3d`             | Cards, sheet, sidebar                                     |
| `--surface-muted`            | `#ece8fb`             | `#2c2750`             | Inputs, hover fills, neutral chips                        |
| `--text`                     | `#2e2a4f`             | `#ece9ff`             | Body text and headings                                    |
| `--text-muted`               | `#6e6a8f`             | `#a9a4cc`             | Secondary text, labels, axis ticks, placeholders          |
| `--line`                     | `#e3def7`             | `#343058`             | Hairlines, chart grid, chip outlines                      |
| `--primary`                  | `#6a5ae0`             | `#9d90ff`             | Primary buttons, active nav, links, focus                 |
| `--primary-hover`            | `#5a4bcc`             | `#b2a8ff`             | Hover on primary                                          |
| `--primary-soft`             | `#e9e5ff`             | `#322b5e`             | Selected chips, active nav background, today in calendars |
| `--on-primary`               | `#ffffff`             | `#17142b`             | Text on `--primary`                                       |
| `--danger` / `--danger-soft` | `#c2384b` / `#ffe4e8` | `#ff9aa8` / `#43213a` | Destructive buttons and errors                            |
| `--success`                  | `#1e7a4c`             | `#8be3b0`             | "Saved" confirmations                                     |
| `--focus`                    | `#6a5ae0`             | `#b2a8ff`             | Focus rings                                               |

### Record types

| Type     | `--*-tile` light / dark | `--*-ink` light / dark | Icon (lucide) |
| -------- | ----------------------- | ---------------------- | ------------- |
| Meal     | `#d7f5e3` / `#1f3b2e`   | `#1e7a4c` / `#8be3b0`  | `Utensils`    |
| Training | `#ffe3cc` / `#3d2a1c`   | `#a8530f` / `#ffb37a`  | `Footprints`  |
| Sleep    | `#dce6ff` / `#1e2847`   | `#2f4fb0` / `#9db7ff`  | `Moon`        |
| Weight   | `#eddcff` / `#2e2147`   | `#6a3db0` / `#cda8ff`  | `Scale`       |

How to use them:

- Put `data-kind="meal|training|sleep|weight"` on an element. It sets `--kind-tile` and `--kind-ink` for that subtree.
- **Tiles are backgrounds only.** Text and icons on a tile always use `--kind-ink`. This keeps every pairing at WCAG AA. Never put `--text` or white on a pastel tile.
- On a tile, nested icon squares use `--surface` as their background so they stand out.
- In charts, bars and lines use `--*-ink`; soft areas use `--*-tile`.
- Exports can't read CSS variables, so `src/features/reports/report-palette.ts` holds the light values as hex. Change both together.

## Typography

- Font: **Nunito** (`@fontsource-variable/nunito`, bundled, no network). Fallback `ui-rounded, system-ui`.
- Body: 15px, weight 500, line height 1.5.
- `h1`: `clamp(26px, 3.4vw, 36px)`, weight 800, letter-spacing −0.02em. One per page.
- `h2` (card titles): 18px, weight 800.
- `.eyebrow` (small label above a title, e.g. the date on Today): 13px, weight 700, `--text-muted`.
- Labels: 13px, weight 700, `--text-muted`.
- Numbers that change or line up (durations, weights, counts, times) get `.numeric` (tabular figures).
- Big stat values on tiles: 20–22px, weight 800.
- Long dates capitalise only the first letter (`::first-letter`), never `text-transform: capitalize`, because Italian month names are lowercase ("Giovedì 8 ottobre").

## Spacing, shape, elevation

- Spacing scale: `--space-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 · `-6` 24 · `-8` 32 · `-10` 40 (px). Gaps between cards are `--space-6`; inside cards `--space-3` to `--space-4`.
- Radii: cards and the sheet `--radius-card` 24px · tiles `--radius-tile` 16px · inputs `--radius-field` 14px · buttons, chips, pills fully round (999px) · icon squares 10/14/18px by size.
- Elevation: cards use `--shadow-soft`; floating things (sheet, popovers, mobile tab bar, the floating add button) use `--shadow-float`. No borders on cards; separation comes from shadow and colour.
- Content max width `--content` 1120px; sidebar `--sidebar` 240px.

## Base components

Reuse these before writing new CSS. They live in `src/app/globals.css` unless noted.

| Class / component                                                            | What it is                                                                                                                                                                                            |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.card`                                                                      | White (or dark) rounded panel with soft shadow, 22px padding (18px on phones). Use `.card-heading` for a title row with an optional `.pill` on the right.                                             |
| `.tile` + `data-kind`                                                        | Pastel record-type panel (16px radius). Today tiles, summary tiles, the running-activity card.                                                                                                        |
| `KindIcon` (`src/ui/kind-icon.tsx`)                                          | The record-type icon on its tile, sizes `small` 30, `medium` 40, `large` 52.                                                                                                                          |
| `.button`                                                                    | Round, min height 44px, weight 800. Variants: `.button-primary` (one per view), `.button-danger` (destructive, soft red), `.button-ghost` (secondary).                                                |
| `.icon-button`                                                               | 44×44 round icon-only button; always give it an `aria-label`.                                                                                                                                         |
| `.chip`                                                                      | Round toggle. As a `<button aria-pressed>` or a `<label>` around a hidden radio. Selected chips take `--kind-tile/--kind-ink` when inside a `data-kind`, otherwise `--primary-soft/--primary`.        |
| `.pill`                                                                      | Small read-only tag (counts, streak, chart averages).                                                                                                                                                 |
| `.field`, `.input`, `.textarea`, `.form-grid`, `.form-wide`, `.form-actions` | Form layout. Inputs are filled `--surface-muted`, no border, 2px inset `--primary` ring on focus.                                                                                                     |
| `Select` (`src/ui/select.tsx`)                                               | The only dropdown. Radix Select styled with `.select-trigger` / `.select-content`. Never use a native `<select>`.                                                                                     |
| `DateTimeField` (`src/ui/date-time-field.tsx`)                               | The only date or date-time input: a trigger showing the formatted value, a calendar popover (react-day-picker) with a time field, "Now", and "Done". Never use native `type="date"`/`datetime-local`. |
| `Sheet` (`src/ui/sheet.tsx`)                                                 | The only modal: native `<dialog>`, bottom sheet on phones, centred 520px dialog on desktop. Dropdowns and popovers inside it portal into the dialog automatically.                                    |
| `.status-message` + `data-tone="error"` or `"success"`                       | Inline feedback next to the control that caused it. Wrap in `aria-live="polite"`.                                                                                                                     |
| `.empty-state` + `.state-icon`                                               | Centred lucide icon in a soft violet square plus one helpful sentence.                                                                                                                                |
| `.switch` (`src/ui/controls.css`)                                            | Toggle for a boolean checkbox (used in export).                                                                                                                                                       |
| `LanguageFlag` (`src/ui/language-flag.tsx`)                                  | Round flag next to a language name.                                                                                                                                                                   |
| `Logo` (`src/ui/logo.tsx`)                                                   | Pulse-line mark in a violet rounded square + "DailyLog".                                                                                                                                              |

Icons are **lucide-react**, stroke width 2–2.2, sizes 16–24px. Decorative icons get `aria-hidden="true"`.

## Layout

- **Desktop (> 860px):** a fixed white sidebar (logo, nav, Meal plan and Profile links, sign out) and the content area. The sidebar never scrolls with the page.
- **Phone (≤ 860px):** a sticky top bar (logo, meal plan, profile, and sign-out icons), a floating rounded bottom tab bar with 5 destinations, and content padded 16px at the sides and 120px at the bottom so nothing hides behind the tab bar.
- Page header: `.page-header` with an `.eyebrow` and the `h1`; actions go on the right and wrap under on phones.
- Breakpoints in use: 1100px (two-column pages stack), 960px (Today columns stack), 860px (phone shell), 720px (compact cards, 2-column tiles, calendar dots). Reuse these; don't invent new ones.
- No horizontal scrolling at 375px. Chip rows that can't wrap scroll sideways with the scrollbar hidden.

## Screens and patterns

**Today:** greeting with the date as eyebrow, streak pill, "Add record" button. Then the running-activity card (if any), four record-type tiles (each opens its own form directly), and a two-column row with the day timeline and the day's notes.

**Logging:** always through the logger sheet. Order of fields: what (type, label/activity, details), then when (start, optional end), then actions (Back ghost on the left, primary on the right). The primary label is "Start" for an activity without an end and "Add" otherwise. Prefill sensible defaults and focus the first field the user must type in.

**Timeline (`DayTimeline`):** newest first. Each row has the time, a `KindIcon`, a bold title, and a muted detail line. Activities show `start–end · duration`; an activity that crosses midnight shows only that day's part (ends 23:59, or starts 00:00). A soft vertical rail joins the icons.

**History:** a search field and date filter on one row, type chips below, then a list card. A row opens the editor in the sheet; delete lives inside the editor, never on the row.

**Calendar:** month grid starting Monday, with arrows and a "Today" link. Each day shows small figures as record-type chips (dots on phones), a note marker, a filled violet circle for today, and a violet outline for the selected day. Details for the selected day appear beside the grid (below it on phones).

**Reports:** a "Last 7 days" summary of tiles, charts, and an export card with one download button per format.

**Settings:** one card per preference with an icon square, title, and hint. Options are chips, and **every change saves immediately** with a floating "Saved" pill. There are no save buttons. The Backup card has two chips: "Download JSON" (entries, weigh-ins, notes, profile, and settings; not the diet or meal plan) and "Import JSON" (confirms first, adds missing records, never deletes, and reports the result inline).

**Profile:** reached from the account links next to sign-out (bottom of the sidebar, top bar on phones), so the tab bar keeps five destinations. A "Body" card of stats (age, height, latest weight, BMI with its WHO category on a weight tile), a "Weight goal" card (progress bar; start, now, goal, and to-go tiles; recent weekly pace from the last four weeks, the date it reaches the goal, and the weekly change needed by the goal date), a BMI chart with dashed guides at 18.5, 25, and 30, the weight chart with the goal as a dashed line, and an "About you" form that also holds the goal weight and optional goal date. Changing the goal weight restarts the goal from the latest weigh-in. Text fields save on blur and the birth date on pick; tapping the birth date calendar caption opens a year grid, then a month grid (Android style).

**Meal plan:** reached from the account links like Profile. DailyLog has no AI of its own: the "Your diet" card explains three steps, copies a prompt for any AI assistant (`dietPrompt`, with the JSON Schema of the diet), and uploads the JSON it returns (replacing a diet confirms first and clears the plan); the diet's "with every meal" notes sit on top. The week is one full-width table read across: a row per day (today tinted violet) and a column per meal, headed by the meal name in meal ink. Each cell shows the variant, each pick with its quantities, and a re-roll icon button. On phones (≤ 720px) each day becomes a block of meal tiles that name their meal. "Generate week" (then "New week", which confirms) sits above the table. Below it, the diet card and a shopping list card (the week added up per food, in two columns) sit side by side, stacking at 1100px. Weekly and daily limits in the diet are hard limits; a gap that nothing fits says so instead of breaking a limit.

**Notes:** a plain textarea that autosaves 800ms after typing stops, with a "Saving… / Saved" status.

## Charts

- Library: **Recharts** only. Don't hand-draw charts in SVG.
- One question per chart, used as its title ("How am I sleeping?"), with a `KindIcon` before it. An optional summary pill (e.g. the average) goes on the right of the title.
- Colours from the record type (`--*-ink` for marks, `--*-tile` for soft areas). Grid: dashed horizontal `--line`, no vertical lines. Axis ticks 12px, weight 600, `--text-muted`, no axis lines or tick marks.
- Axes must say what they measure (hours, weight) and use round ticks (`niceTicks` in `features/reports/chart-scale.ts`). Dates are short ("8 ott") on axes and long in tooltips.
- Tooltips use the shared `.chart-tooltip`: muted heading (date or label), bold value in `--kind-ink`.
- Animations off (`isAnimationActive={false}`).
- Empty data shows the muted "Add a few records…" sentence instead of an empty chart.

## Interaction

- **Cursors** live in one block in `globals.css`: pointer for anything clickable (including chip and switch labels), not-allowed for disabled controls, progress for buttons with `aria-busy`. Set `aria-busy={pending}` on buttons that wait for the server.
- **Feedback:** every mutation shows pending (busy button), success ("Saved"), and failure ("Something went wrong…") inline. Destructive actions confirm first and say the item can be restored from trash.
- **Spinners:** a `.button`, `.chip`, `.icon-button`, or `.account-link` with `aria-busy="true"` swaps its icon for a spinner automatically; never draw one by hand. Page loads use the three-dot `.page-loading` (the route `loading.tsx` and the demo's first load).
- **Toasts:** `showToast` from `src/ui/toast.tsx` (rendered by the `Toaster` in the app shell) confirms a success whose control is gone afterwards: the logger sheet closing, the running activity finishing, an edited, trashed, or restored record. A floating pill at the bottom, above the phone tab bar, gone after 4 seconds. Errors stay inline next to their control.
- **Motion:** short and functional only: 120ms hover and press (150ms on `.switch`), a 180ms sheet slide, a slow pulse on the running activity. Everything is disabled under `prefers-reduced-motion`.
- **Focus:** a visible 3px `--focus` ring (35% transparent) on every interactive element. Never remove outlines without a replacement.
- **Touch targets:** at least 44px.

## Copy

- Plain, friendly, short; no exclamation marks, no "please", no emoji. Sentence case everywhere.
- Buttons are verbs: "Add record", "Start", "Download PDF". Errors say what happened: "Something went wrong. Your changes were not saved."
- Empty states invite the next step: "Nothing logged yet. Add the first detail while it is still fresh."
- Every string lives in `src/core/i18n/catalogs.ts` in English and Italian. Strings with a `{count}` use `{ one, other }` plural forms.
- Meal types and sleep are stored with the bot's English labels; show them through `entryDisplayLabel` so they're translated.
- Dates, times, and numbers go through `Intl` with the user’s locale, 12- or 24-hour preference, and the configured time zone.

## Accessibility

- WCAG 2.2 AA contrast in both themes (this is why text on tiles uses the ink colour).
- Semantic HTML first: real buttons and links, labelled inputs, one `h1`, lists for lists.
- Charts have an accessible label; screen-reader text uses `.sr-only`.
- Live regions (`aria-live="polite"`) for save status and errors; `aria-current` for the active nav item and the selected calendar day; `aria-pressed` for toggle chips.

## Exports

Both exports use the light palette from `report-palette.ts` and the same structure as the app.

- Both headers carry the profile line from `profileLine` (name · age · height · BMI from the period's last weigh-in), leaving out what is not set.
- **PDF** (`features/reports/pdf-report.ts`): lavender header band with the logo drawn as vectors, the period and export date; four summary tiles; one section per day (activities clipped per day as in the timeline) with a time column, a coloured type pill, a bold title, and a muted detail line; the note in a violet box with a left accent bar; a footer with the period and page count. Nunito WOFF files (not WOFF2) are embedded from `features/reports/fonts/`.
- **XLSX** (`features/reports/workbook.ts`): two sheets. Journal holds the title, period, profile line, and summary figures, then one table per day (time, colour-coded type, title, detail) and the day's note. Weight has real Excel dates in local time and numeric weights with the change. Violet title, lavender header rows, zebra rows with hairline separators.

## Don't

- Don't use literal colours, new fonts, or new breakpoints.
- Don't use native `<select>`, date, or time inputs; use `Select` and `DateTimeField`.
- Don't add custom overlays or modals; use `Sheet`.
- Don't put dark text on a pastel tile, or pastel text on white.
- Don't add save buttons where a change can save on its own.
- Don't add decorative illustrations, mascots, gradients behind text, or animations that replay on every visit.
- Don't hardcode user-facing text or English-only labels.
