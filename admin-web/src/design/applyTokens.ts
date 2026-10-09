import { colors, cssVar, desktop, elevation, fontFamily, radii, spacing, type } from './tokens';

/** Writes every token onto :root as a CSS custom property. Called once, before first render. */
export function tokenVariables(): Record<string, string> {
  const vars: Record<string, string> = { '--po-font': fontFamily };
  for (const [k, v] of Object.entries(colors)) vars[cssVar('color', k)] = v;
  for (const [k, v] of Object.entries(radii)) vars[cssVar('radius', k)] = `${v}px`;
  for (const [k, v] of Object.entries(spacing)) vars[cssVar('space', k)] = `${v}px`;
  for (const [k, v] of Object.entries(elevation)) vars[`--po-shadow-${k}`] = v;
  for (const [k, v] of Object.entries(desktop)) {
    vars[cssVar('desk', k)] = typeof v === 'number' ? `${v}px` : v;
  }
  for (const [name, t] of Object.entries(type)) {
    vars[`--po-type-${name}-size`] = `${t.fontSize}px`;
    vars[`--po-type-${name}-weight`] = String(t.fontWeight);
    vars[`--po-type-${name}-tracking`] = 'letterSpacing' in t ? `${t.letterSpacing}px` : 'normal';
  }
  return vars;
}

export function applyTokens(root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(tokenVariables())) root.style.setProperty(name, value);
}
