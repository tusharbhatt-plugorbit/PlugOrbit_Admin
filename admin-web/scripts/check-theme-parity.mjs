#!/usr/bin/env node
/**
 * Verifies that the web design tokens still match the mobile app's theme.ts (the visual source of truth).
 *
 *   node scripts/check-theme-parity.mjs /path/to/plugorbit/LoginApp/src/theme.ts
 *
 * Compares every colour, radius and spacing value, plus the type scale. Exits 1 on any drift, so run it in
 * CI whenever the mobile repo is checked out next to this one. Without an argument it uses $PLUGORBIT_MOBILE_THEME,
 * then ../../plugorbit/LoginApp/src/theme.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobilePath = process.argv[2] ?? process.env.PLUGORBIT_MOBILE_THEME ?? path.resolve(here, '../../../plugorbit/LoginApp/src/theme.ts');
if (!fs.existsSync(mobilePath)) {
  console.error(`Mobile theme not found at ${mobilePath}. Pass the path as the first argument.`);
  process.exit(2);
}

const read = (file) => fs.readFileSync(file, 'utf8');
const block = (src, name) => {
  const m = src.match(new RegExp(`export const ${name} = \\{([\\s\\S]*?)\\} as const;`));
  if (!m) throw new Error(`Cannot find ${name}`);
  return m[1];
};
// "key: 'value'" and "key: 12" pairs; ignores comments
const pairs = (body) => {
  const out = {};
  for (const line of body.replace(/\/\/.*$/gm, '').split('\n')) {
    for (const m of line.matchAll(/(\w+):\s*('([^']*)'|(-?\d+(?:\.\d+)?))/g)) out[m[1]] = m[3] ?? Number(m[4]);
  }
  return out;
};
// type scale: "name: {fontSize: 24, fontWeight: '800', letterSpacing: 0.5}"
const typeScale = (body) => {
  const out = {};
  for (const m of body.replace(/\/\/.*$/gm, '').matchAll(/(\w+):\s*\{([^}]*)\}/g)) {
    const o = {};
    for (const p of m[2].matchAll(/(\w+):\s*('([^']*)'|(-?\d+(?:\.\d+)?))/g)) o[p[1]] = p[3] !== undefined ? Number(p[3]) : Number(p[4]);
    out[m[1]] = o;
  }
  return out;
};

const mobile = read(mobilePath);
const web = read(path.resolve(here, '../src/design/tokens.ts'));
let drift = 0;
const compare = (label, a, b) => {
  for (const k of Object.keys(a)) {
    if (!(k in b)) { console.error(`✗ ${label}.${k} exists on mobile but not on web`); drift++; }
    else if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) { console.error(`✗ ${label}.${k}: mobile ${JSON.stringify(a[k])} vs web ${JSON.stringify(b[k])}`); drift++; }
  }
  for (const k of Object.keys(b)) if (!(k in a)) { console.error(`✗ ${label}.${k} exists on web but not on mobile`); drift++; }
};

for (const name of ['colors', 'radii', 'spacing', 'sizes']) compare(name, pairs(block(mobile, name)), pairs(block(web, name)));
compare('type', typeScale(block(mobile, 'type')), typeScale(block(web, 'type')));

if (drift) { console.error(`\n${drift} token(s) drifted from the mobile theme.`); process.exit(1); }
console.log(`✓ Web tokens match the mobile theme (${mobilePath})`);
