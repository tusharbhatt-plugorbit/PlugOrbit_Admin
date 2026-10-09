/**
 * PlugOrbit design tokens for the web.
 *
 * SOURCE OF TRUTH: the mobile app's `LoginApp/src/theme.ts` (branch Dev_Phase1). The values in
 * `colors`, `radii`, `spacing`, `sizes` (the first block), `type` and `elevation` are copied
 * from it 1:1, with the same names, so a token means the same thing in both products. Do not
 * "tidy" them here: change the mobile theme first, then mirror the change.
 *
 * What is *added* for the desktop admin lives under `desktop` and is deliberately small and
 * labelled, in the mobile architecture's own words: "If a token is missing, add it with a
 * comment, don't inline it."
 *
 * The tokens are applied as CSS custom properties (see applyTokens.ts), so the stylesheets
 * never contain a raw hex value.
 */

export const colors = {
  bg: '#0B1220',
  bgRaised: '#131C2E',
  surface: '#FFFFFF',
  lime: '#A2F067',
  limeDark: '#33790E',
  limeSoft: '#E3F6D5',
  danger: '#B42318',
  dangerSoft: '#FDE4E4',
  ink: '#0F172A',
  inkSoft: '#334155',
  muted: '#58687E',
  placeholder: '#94A3B8',
  chipBorder: '#334155',
  chipText: '#E2E8F0',
  mapBg: '#EEF1F4',
  // Body of every content screen (the light surface under the dark shell).
  body: '#EEF1F4',
  divider: '#E2E8F0',
  inputBg: '#EEF2F7',
  inputBorder: '#D5DDE8',
  // Data-trust semantics. Lime = verified live; amber = estimated; blue = a person confirmed
  // it; slate = unknown.
  amber: '#A94C08',
  amberSoft: '#FEF3C7',
  info: '#1D4ED8',
  infoSoft: '#DBEAFE',
  slateSoft: '#E2E8F0',
  // Amber / red for text and graphics ON the dark shell.
  warnOnDark: '#FCD34D',
  dangerOnDark: '#FCA5A5',
  limeHalo: 'rgba(162, 240, 103, 0.08)',
  limeHaloBorder: 'rgba(162, 240, 103, 0.28)',
  scrim: 'rgba(2, 6, 23, 0.55)',
  road: '#FFFFFF',
  roadMinor: '#E1E5EA',
  park: '#D9EBD2',
  water: '#CFE3F2',
} as const;

export const radii = { sm: 8, md: 14, lg: 20, xl: 24, pill: 999 } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;

/** Mobile control sizes (kept for reference and for the login screen, which is touch-friendly). */
export const sizes = {
  tap: 44,
  chip: 36,
  field: 52,
  button: 54,
  buttonLarge: 64,
  buttonCompact: 44,
  header: 44,
  tabBar: 64,
  maxContent: 560,
} as const;

/**
 * Type scale lifted from the mobile app (weights 500-800, no custom font: the platform's own
 * UI font, which on the web is the system stack below).
 */
export const type = {
  brand: { fontSize: 24, fontWeight: 800, letterSpacing: 0.5 },
  display: { fontSize: 26, fontWeight: 700 },
  h1: { fontSize: 22, fontWeight: 800 },
  title: { fontSize: 18, fontWeight: 700, letterSpacing: 0.2 },
  heading: { fontSize: 16, fontWeight: 800 },
  button: { fontSize: 16, fontWeight: 800 },
  bodyStrong: { fontSize: 14, fontWeight: 700 },
  body: { fontSize: 14, fontWeight: 500 },
  label: { fontSize: 13, fontWeight: 700 },
  caption: { fontSize: 12.5, fontWeight: 500 },
  micro: { fontSize: 11, fontWeight: 800, letterSpacing: 0.6 },
  hero: { fontSize: 56, fontWeight: 800, letterSpacing: -1 },
} as const;

/**
 * The mobile `elevation()` recipe (shadowColor #020617, opacity 0.12/0.18/0.24, radius 4/10/18,
 * y-offset level*2), expressed as CSS box-shadows.
 */
export const elevation = {
  1: '0 2px 4px rgba(2, 6, 23, 0.12)',
  2: '0 4px 10px rgba(2, 6, 23, 0.18)',
  3: '0 6px 18px rgba(2, 6, 23, 0.24)',
} as const;

/** Platform UI font on every OS, exactly as the mobile app (it ships no custom font). */
export const fontFamily =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif";

/**
 * DESKTOP EXTENSIONS. Not in the mobile theme because a pointer-driven, dense, wide layout needs
 * them. Each is derived from a mobile token where possible.
 */
export const desktop = {
  /** Mobile `sizes.buttonCompact` (44) is a touch target; a mouse can use 40/32. */
  control: 40,
  controlCompact: 32,
  /** Mobile `sizes.field` is 52; dense desktop forms use 44. */
  field: 44,
  sidebar: 248,
  sidebarCollapsed: 72,
  topbar: 64,
  drawer: 480,
  drawerWide: 640,
  /** Table cells use caption-sized text with 14px vertical padding (mobile ListRow padding). */
  rowPadY: 14,
  /** Hover wash on rows: ink at 3 %, so it works on any surface. */
  hover: 'rgba(15, 23, 42, 0.035)',
  /** Light page content never grows beyond this on very wide monitors. */
  maxContent: 1560,
  /** Focus ring: the mobile focused-field colour (limeDark) at 3 px. */
  focusRing: '0 0 0 3px rgba(51, 121, 14, 0.28)',
} as const;

/** CSS custom property name for a token, e.g. ('color', 'limeDark') -> --po-color-lime-dark. */
export function cssVar(group: string, key: string): string {
  return `--po-${group}-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
}
