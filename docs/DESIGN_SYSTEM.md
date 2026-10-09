# Design system

**The mobile app is the visual source of truth.** The admin does not have a second visual language; it is the same
product on a wider canvas. Every colour, radius, type size and shadow below comes from the mobile theme
(`LoginApp/src/theme.ts`, branch `Dev_Phase1`) under the same names.

> The reference PNGs in the brief were used for **structure and information hierarchy only** (what goes where on each
> screen). Their styling was not copied.

## Where it lives and how it is enforced

| File | Role |
|---|---|
| `admin-web/src/design/tokens.ts` | The mobile `colors`, `radii`, `spacing`, `sizes`, `type`, `elevation` copied 1:1, plus a small, labelled `desktop` block |
| `admin-web/src/design/applyTokens.ts` | Writes every token to `:root` as `--po-color-*`, `--po-radius-*`, `--po-space-*`, `--po-type-*`, `--po-shadow-*`, `--po-desk-*` before first render |
| `admin-web/src/design/global.css`, `components.css` | Layout shell and component CSS. **No raw hex values**; a unit test fails if one is added |
| `admin-web/scripts/check-theme-parity.mjs` | Parses the mobile `theme.ts` and fails if any colour, radius, spacing or type value differs from the web tokens |

Change the mobile theme first, then mirror it here, then run `npm run check:theme`. The rule from the mobile
architecture applies: *if a token is missing, add it with a comment, do not inline it.*

## What was extracted from the mobile app

| Mobile element | Web equivalent |
|---|---|
| Logo mark and wordmark (`PlugOrbit`, 800 weight, tracked) | `src/assets/brand/logo-mark.svg`, `BrandLogo` |
| Dark navy screens `#0B1220`, raised `#131C2E` | Sidebar and top bar (the "chrome") |
| Light content card `#EEF1F4`, white surfaces | The rounded content sheet and cards |
| Lime `#A2F067` accent; `limeDark #33790E` for text and graphics on white; `limeSoft` fills | Selected chips, active nav, "Available/Live" pills, focus ring, primary data series |
| Primary button: dark fill, lime label, 16/800 | `Button variant="primary"` |
| Secondary: white, hairline border | `Button variant="secondary"`; ghost and danger variants follow |
| Chips: 36 px, pill radius, lime when selected | Filter chips, segmented tabs |
| Cards: radius 20, elevation 1 | `Card`, `KpiCard` |
| 24 px uppercase status pills (micro type, 11/800, 0.6 tracking) | `Pill`, status and confidence badges |
| Inputs: `inputBg #EEF2F7`, border `#D5DDE8`, lime-dark focus | `TextField`, `SelectField`, `TextArea` |
| Lucide icon set | `lucide-react` through `ui/Icon` |
| Connector artwork (CCS2, Type 2, CHAdeMO, ...) | `ConnectorImage`, the same SVGs ported |
| Empty / error / loading patterns | `EmptyState`, `ErrorState` (network, timeout, permission, integration kinds), skeletons |
| System UI font, weights 500–800, no custom font | `--po-font` = the platform stack |

## Desktop extensions (the only additions)

Each is derived from a mobile value where possible and documented in `tokens.ts`.

| Token | Value | Why |
|---|---|---|
| `control` / `controlCompact` | 40 / 32 px | A mouse does not need the 44 px touch target |
| `field` | 44 px | Dense forms (mobile is 52) |
| `sidebar` / `sidebarCollapsed` / `topbar` | 248 / 72 / 64 px | Desktop chrome |
| `drawer` / `drawerWide` | 480 / 640 px | Side panels for tickets, issues, audit entries |
| `rowPadY` | 14 px | Table cell padding (the mobile ListRow padding) |
| `hover` | ink at 3.5 % | Row hover that works on any surface |
| `maxContent` | 1560 px | Content never stretches indefinitely on very wide monitors |
| `focusRing` | `limeDark` at 28 %, 3 px | Visible keyboard focus in the mobile focus colour |

## Status semantics (shared with the mobile app)

| Meaning | Tone | Used for |
|---|---|---|
| Good / verified | lime | Available, Live, Active, Paid, Resolved, Live in app |
| Needs care | amber | Occupied, Estimated, Pending, Approved, Suspended, Stale, Hidden |
| Problem | danger | Offline, Failed, Rejected, On hold, critical issues |
| Information / a person confirmed | info (blue) | User-confirmed, Refunded, In review, Pending review |
| Unknown / neutral | slate | Unknown, Draft, Closed, Maintenance, Manual |

Colour is never the only signal: every pill carries a text label, and status dots and icons repeat it. Warning colours
for text and graphics **on the dark chrome** use `warnOnDark` / `dangerOnDark`, never the light-surface variants.

### Data-trust badge

`ConfidenceBadge` renders `Live`, `Estimated`, `User-confirmed`, `Manual` or `Unknown` plus a `Stale` pill and an
age ("12 min ago"). Lime is reserved for Live; it is impossible to render Live for data older than the live window,
because the badge re-derives trust from the timestamp on every render (`effectiveConfidence`), not just from the field
the API sent.

## Components

The kit in `src/ui/` is deliberately small. Everything reusable the brief lists is there:

`AdminShell` (app/) · `PageHeader` · `KpiCard` · `DataTable` (column definitions, sticky header, `minWidth`, keyboard
row activation, loading/empty/error rows) · `FilterBar`, `SearchField`, `FilterSelect`, `Chip` · status, confidence,
priority and partner badges · `Drawer` and `Dialog` (focus trap, Esc, scroll lock, restores focus) · `ConfirmDialog`
(optional required reason, shows the consequence) · `Toast` · `ActionMenu` (row kebab, portal-positioned so tables
never clip it) · `Diff` (before/after) · `AuditTimeline` · `ConnectorImage` · charts · `AsyncView` (one place that
chooses loading / error / empty / data) · `Notice` · `KeyValue`.

Rules: pages compose these and never restyle them; a new visual need becomes a new component here, not inline CSS.

## Charts

Built to the data-visualisation rules the project adopted:

* **One series, one hue.** Every chart is single-series in `limeDark` (`#33790E`, 5.4:1 on white, 4.8:1 on the page background). A second measure is a second chart, never a second axis (no dual-axis charts).
* **Form follows the job.** Time series → line/area; magnitude by category → ranked bars; one headline number → a KPI
  card, not a chart; part-of-whole → a bar list with percentages, not a pie.
* **Thin marks, quiet furniture.** 2 px lines, hairline solid grid, 4 px rounded bar ends, text in text tokens (never
  the series colour), direct labels only on the selected or extreme points.
* **Always a table twin.** Each chart is a `role="img"` with an `aria-label`, and `ChartCard` offers a table view of exactly the
  same values.
* **No invented precision.** Percentage deltas are shown only when the comparison period is complete
  (`previousComplete`); otherwise the card says there is not enough history.

## Layout and responsive rules

* Shell: 248 px sidebar + 64 px top bar in the dark chrome; content sheet on `body` (`#EEF1F4`) with a 20 px top-left
  radius, which gives the mobile app's "light card on dark" feel.
* Page header: title 22/800, subtitle 14/500 muted, primary action right-aligned.
* Grids collapse at 1280 px (4 → 2 columns), 1100 px (split layouts stack, sidebar → icon rail), 760 px (drawer nav).
* Tables scroll inside their container; the document itself never scrolls horizontally.
* `prefers-reduced-motion` disables transitions.

## Accessibility

Landmarks (`nav`, `main`, `header`), skip-to-content link, visible focus ring on every control, dialogs and drawers
trap focus and restore it on close, tabs and radios use the correct roles, icon-only buttons have labels, form errors
are announced and tied to their field, and every text/background pair in use measures at least 4.7:1 (limeDark on limeSoft 4.7, amber on amberSoft 5.1, info on
infoSoft 5.5, danger on dangerSoft 5.5, muted on the page 5.0, lime on the dark chrome 13.6). The one exception is
**placeholder text** (`#94A3B8` on the input fill, 2.3:1): it is the mobile app's own value and was kept to avoid a second
visual language; see [PENDING_DECISIONS](PENDING_DECISIONS.md#placeholder-contrast).
