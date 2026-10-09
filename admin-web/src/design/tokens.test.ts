import { describe, expect, it } from 'vitest';
import { tokenVariables } from './applyTokens';
import { colors, cssVar, radii, spacing, type } from './tokens';

describe('design tokens (ported 1:1 from the mobile theme.ts)', () => {
  it('keeps the brand colours exactly as the mobile app defines them', () => {
    expect(colors).toMatchObject({ bg: '#0B1220', bgRaised: '#131C2E', lime: '#A2F067', limeDark: '#33790E', limeSoft: '#E3F6D5', danger: '#B42318', body: '#EEF1F4', amber: '#A94C08', info: '#1D4ED8' });
  });
  it('keeps the shape scale', () => {
    expect(radii).toEqual({ sm: 8, md: 14, lg: 20, xl: 24, pill: 999 });
    expect(spacing).toEqual({ xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 });
    expect(type.brand).toMatchObject({ fontSize: 24, fontWeight: 800 });
  });
  it('turns every token into a CSS custom property', () => {
    const vars = tokenVariables();
    expect(vars['--po-color-bg']).toBe('#0B1220');
    expect(vars['--po-color-lime-dark']).toBe('#33790E');
    expect(vars['--po-radius-lg']).toBe('20px');
    expect(vars['--po-type-micro-weight']).toBe('800');
    expect(vars[cssVar('color', 'warnOnDark')]).toBe('#FCD34D');
  });
  it('never emits a raw hex outside the token set in the stylesheets', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    // (not `new URL(.., import.meta.url)`: Vite would rewrite that into an asset reference)
    const css = ['global.css', 'components.css'].map((f) => fs.readFileSync(path.resolve(process.cwd(), 'src/design', f), 'utf8')).join('\n');
    const allowed = new Set(['#fff', '#cbd5e1', '#d9e0e8', '#f1f5f9', '#000']); // a few neutrals the mobile kit also inlines (switch track, skeleton)
    const hexes = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase()).filter((h) => !allowed.has(h));
    expect(hexes).toEqual([]);
  });
});
