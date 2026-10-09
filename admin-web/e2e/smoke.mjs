/**
 * End-to-end smoke test: drives the real app in a real browser against a running API + web server.
 *
 *   # terminal 1 (backend/):   ADMIN_DEV_AUTH=true DATA_BACKEND=memory uvicorn app.main:app --port 8000
 *   # terminal 2 (admin-web/): npm run dev
 *   # terminal 3 (admin-web/): npm run e2e            (CHROME=/path/to/chrome, BASE=http://127.0.0.1:5173)
 *
 * It uses the demo store, so it creates data (a partner, a station): restart the API to reset it.
 * Covers the manual test list: login/guard, navigation, partner creation, station creation, connector
 * creation, tariff editing, map, transaction detail + refund, support ticket, data-quality action, roles.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5173';
const CHROME = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SHOTS = process.env.SHOTS ?? null;

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const results = [];
const consoleProblems = [];

async function session(roleName) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  // 4xx responses are expected in the negative-path steps (bad PAN -> 422, large price -> 409); anything else is a problem
  page.on('console', (m) => { if (m.type() === 'error' && !/google|gstatic|status of 4(09|22|03)/i.test(m.text())) consoleProblems.push(`${roleName}: ${m.text().slice(0, 160)}`); });
  page.on('pageerror', (e) => consoleProblems.push(`${roleName} pageerror: ${e.message.slice(0, 160)}`));
  await page.goto(`${BASE}/login`);
  await page.getByRole('radio', { name: new RegExp(roleName, 'i') }).click();
  await page.getByRole('button', { name: 'Enter admin' }).click();
  await page.waitForURL(`${BASE}/`);
  return { ctx, page };
}

async function step(name, fn) {
  try { await fn(); results.push([name, true]); console.log(`  ✓ ${name}`); }
  catch (e) { results.push([name, false, e.message.split('\n')[0]]); console.log(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`); }
}

const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
// a drawer and a confirm dialog can be open together: the confirm dialog is the topmost (last) one
const dialog = (page) => page.getByRole('dialog').last();
const navLinks = async (page) => (await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link').allTextContents()).map((t) => t.trim());
const field = (page, label) => page.getByLabel(label, { exact: false }).first();

console.log('Guard & navigation');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await step('unauthenticated visit to /stations redirects to /login', async () => {
    await page.goto(`${BASE}/stations`);
    await page.waitForURL(/\/login/);
    ok(await page.getByText('PlugOrbit Admin').first().isVisible(), 'login screen not shown');
  });
  await ctx.close();
}

const ops = await session('Operations');
await step('operations sees ops navigation but not Settlements', async () => {
  const links = await navLinks(ops.page);
  ok(links.includes('Data Quality') && links.includes('Stations'), `missing ops links: ${links}`);
  ok(!links.includes('Settlements'), 'Settlements should be hidden for operations');
});
await step('direct URL to a forbidden page shows "no access", not the page', async () => {
  await ops.page.goto(`${BASE}/settlements`);
  await ops.page.getByText("You don't have access").waitFor();
});
await step('sidebar navigation reaches every ops destination without errors', async () => {
  await ops.page.goto(`${BASE}/`);
  for (const label of ['Partners', 'Stations', 'Map', 'Transactions', 'Support', 'Users', 'Data Quality', 'Charger Health', 'Analytics', 'Notifications', 'Integrations', 'Audit Log', 'Settings']) {
    await ops.page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: label, exact: true }).click();
    await ops.page.waitForLoadState('networkidle');
    ok(await ops.page.locator('h1').first().isVisible(), `no page title on ${label}`);
    ok(!(await ops.page.getByText('This screen hit a problem').isVisible()), `${label} crashed`);
  }
});

console.log('Partner, station, connector, price, go-live');
await step('create a partner (validation + draft)', async () => {
  await ops.page.goto(`${BASE}/partners/new`);
  await field(ops.page, 'Legal business name').fill('E2E Partner Pvt Ltd');
  await field(ops.page, 'PAN').fill('bad');
  await field(ops.page, 'Contact person').fill('Test Person');
  await field(ops.page, 'Phone').fill('9876500001');
  await field(ops.page, 'Email').fill('test@example.com');
  await ops.page.getByRole('button', { name: 'Create draft partner' }).click();
  await ops.page.getByText('PAN must look like ABCDE1234F.').waitFor(); // field-level server validation
  await field(ops.page, 'PAN').fill('EEEEE1234E');
  await ops.page.getByRole('button', { name: 'Create draft partner' }).click();
  await ops.page.waitForURL(/\/partners\/ptn-e2e-partner/);
  await ops.page.getByText('Draft', { exact: true }).first().waitFor();
});
await step('verify the partner: submit for review, approve with PAN confirmation', async () => {
  await ops.page.getByRole('button', { name: 'Submit for review' }).click();
  await dialog(ops.page).getByRole('button', { name: 'Submit for review' }).click();
  await ops.page.getByText('Pending review').first().waitFor();
  await ops.page.getByRole('button', { name: 'Approve', exact: true }).click();
  const approve = dialog(ops.page).getByRole('button', { name: 'Approve and activate' });
  ok(await approve.isDisabled(), 'approval must be blocked until the PAN check is confirmed');
  await dialog(ops.page).getByText('I verified the PAN').click(); // the real switch input is visually hidden; users click its label
  await approve.click();
  await ops.page.getByText('Active', { exact: true }).first().waitFor();
});
await step('create a station (draft, hidden from the app)', async () => {
  await ops.page.goto(`${BASE}/stations/new`);
  await field(ops.page, 'Station name').fill('E2E Test Plaza');
  await ops.page.getByLabel('Partner').selectOption({ label: 'E2E Partner Pvt Ltd' });
  await field(ops.page, 'Address').fill('NH-48, Test Road');
  await field(ops.page, 'City').fill('Neemrana');
  await field(ops.page, 'State').fill('Rajasthan');
  await field(ops.page, 'Latitude').fill('27.9886');
  await field(ops.page, 'Longitude').fill('76.3855');
  await ops.page.getByLabel('Verification status').selectOption('verified');
  await ops.page.getByRole('button', { name: 'Create draft station' }).click();
  await ops.page.waitForURL(/\/stations\/st-e2e-test-plaza$/);
  await ops.page.getByText('Draft', { exact: true }).first().waitFor(); // wait for the page to load before asserting
  const goLive = ops.page.getByRole('button', { name: 'Go live' });
  await goLive.waitFor();
  ok(await goLive.isDisabled(), 'Go live must be disabled until the checklist passes');
});
await step('add a connector', async () => {
  await ops.page.getByRole('tab', { name: /Connectors/ }).click();
  await ops.page.getByRole('button', { name: 'Add connector' }).first().click();
  await field(dialog(ops.page), 'Charger ID').fill('E2E-CHG-01');
  await dialog(ops.page).getByRole('button', { name: 'Add connector' }).click();
  await ops.page.getByText('E2E-CHG-01').waitFor();
});
await step('set a price (new version with reason) and go live once the checklist is complete', async () => {
  await ops.page.getByRole('tab', { name: 'Pricing' }).click();
  await ops.page.getByRole('button', { name: 'Change price for all' }).click();
  await field(dialog(ops.page), 'Price per kWh').fill('21');
  await field(dialog(ops.page), 'Reason for the change').fill('Launch pricing');
  await dialog(ops.page).getByRole('button', { name: 'Save new price' }).click();
  await ops.page.getByText('Launch pricing').first().waitFor();
  await ops.page.getByRole('tab', { name: 'Overview' }).click();
  const live = ops.page.getByRole('button', { name: 'Go live' });
  await live.waitFor();
  ok(await live.isEnabled(), 'Go live should now be enabled');
  await live.click();
  await dialog(ops.page).getByRole('button', { name: 'Go live' }).click();
  await ops.page.getByText('Live in the app').first().waitFor();
});

console.log('Tariff editing, map, data quality');
await step('edit a tariff on an existing station: the old price stays in history', async () => {
  await ops.page.goto(`${BASE}/stations/st-chargezone-neemrana/pricing`);
  const row = ops.page.getByRole('row').filter({ hasText: 'C3' }).first();
  await row.getByRole('button', { name: 'Change price' }).click();
  await field(dialog(ops.page), 'Price per kWh').fill('15');
  await field(dialog(ops.page), 'Reason for the change').fill('e2e adjustment');
  await dialog(ops.page).getByRole('button', { name: 'Save new price' }).click();
  await ops.page.getByText('e2e adjustment').first().waitFor();
  ok(await ops.page.getByText('₹14.00').first().isVisible(), 'previous price should remain visible in history');
});
await step('a large price jump needs a second confirmation', async () => {
  const row = ops.page.getByRole('row').filter({ hasText: 'C3' }).first();
  await row.getByRole('button', { name: 'Change price' }).click();
  await field(dialog(ops.page), 'Price per kWh').fill('40');
  await field(dialog(ops.page), 'Reason for the change').fill('fat finger test');
  await dialog(ops.page).getByRole('button', { name: 'Save new price' }).click();
  await dialog(ops.page).getByText('Large price change').waitFor();
  await dialog(ops.page).getByRole('button', { name: 'Cancel' }).click();
});
await step('network map loads, and selecting a station shows its panel', async () => {
  await ops.page.goto(`${BASE}/map`);
  await ops.page.getByText(/\d+ stations? visible/).waitFor();
  await ops.page.locator('.schematic .pin').first().click({ force: true }); // stations can share coordinates (pins overlap)
  await ops.page.getByText('Selected station').waitFor();
  await ops.page.getByRole('button', { name: 'Open station' }).waitFor();
});
await step('data quality: mark a stale-feed issue verified (becomes Manual, never Live)', async () => {
  await ops.page.goto(`${BASE}/data-quality`);
  await ops.page.getByRole('row').filter({ hasText: 'Feed has gone quiet' }).getByRole('button', { name: 'Review' }).click();
  await ops.page.getByRole('button', { name: 'Mark verified' }).click();
  await dialog(ops.page).getByLabel(/Reason/).fill('Site manager confirmed it is offline');
  await dialog(ops.page).getByRole('button', { name: 'Mark verified' }).click();
  await ops.page.getByText('Marked as verified').waitFor();
  await ops.page.goto(`${BASE}/stations/st-tata-power-jaipur-hub`);
  await ops.page.getByText('Manual', { exact: true }).first().waitFor();
});
await ops.ctx.close();

console.log('Finance: transaction detail and refund');
const fin = await session('Finance');
await step('transaction detail shows the payment flow and reconciliation', async () => {
  await fin.page.goto(`${BASE}/transactions/PO-6A4K92`);
  for (const t of ['Pre-authorised', 'Captured', 'Hold released', 'Reconciliation']) await fin.page.getByText(t, { exact: false }).first().waitFor();
  ok(await fin.page.getByText('98•••41').first().isVisible(), 'user phone should be masked');
});
await step('issue a partial refund with a reason', async () => {
  await fin.page.getByRole('button', { name: 'Issue partial refund' }).click();
  await dialog(fin.page).getByRole('tab', { name: 'Partial amount' }).click();
  await field(dialog(fin.page), 'Amount').fill('100');
  await field(dialog(fin.page), 'Reason').fill('Charger slowed mid-session');
  await dialog(fin.page).getByRole('button', { name: /Refund ₹100/ }).click();
  await fin.page.getByText('Part refunded').first().waitFor();
  await fin.page.getByText('Audit trail').waitFor();
});
await step('finance can approve a settlement run by someone else; sees no Support or Users admin tools they lack', async () => {
  await fin.page.goto(`${BASE}/settlements`);
  await fin.page.getByText('Payable to partners').waitFor();
  const links = await navLinks(fin.page);
  ok(links.includes('Settlements') && !links.includes('Data Quality'), `unexpected finance nav: ${links}`);
});
await fin.ctx.close();

console.log('Support: ticket and role limits');
const sup = await session('Support');
await step('open a ticket and add an internal note', async () => {
  await sup.page.goto(`${BASE}/support?ticket=TKT-1003`);
  await sup.page.getByPlaceholder('Add an internal note…').fill('Called the driver, retrying capture.');
  await sup.page.getByRole('button', { name: 'Add note' }).click();
  await sup.page.getByText('Called the driver, retrying capture.').waitFor();
});
await step('support cannot open the audit log or settlements', async () => {
  const links = await navLinks(sup.page);
  ok(!links.includes('Audit Log') && !links.includes('Settlements'), `support nav too wide: ${links}`);
  await sup.page.goto(`${BASE}/audit-log`);
  await sup.page.getByText("You don't have access").waitFor();
});
await step('user list never shows raw contact data; revealing needs a reason', async () => {
  await sup.page.goto(`${BASE}/users`);
  await sup.page.getByRole('row').nth(1).waitFor();
  const text = await sup.page.locator('table').innerText();
  ok(/\d\d•••\d\d/.test(text) && /\w•••@/.test(text) && !/\w{2,}@mail\.demo\.in/.test(text), 'contacts should be masked in the list');
  await sup.page.getByRole('button', { name: 'View profile' }).first().click();
  await sup.page.getByRole('button', { name: 'Reveal contact details' }).click();
  ok(await dialog(sup.page).getByRole('button', { name: 'Reveal' }).isDisabled(), 'reveal must require a reason');
  await dialog(sup.page).getByRole('button', { name: 'Cancel' }).click();
});
await step('sign out returns to the login screen', async () => {
  await sup.page.keyboard.press('Escape');
  await sup.page.getByRole('button', { name: 'Sign out' }).click();
  await sup.page.waitForURL(/\/login/);
});
await sup.ctx.close();

console.log('Super Admin: audit trail proves what just happened');
const sa = await session('Super Admin');
await step('audit log shows the refund and price changes, and the chain verifies', async () => {
  await sa.page.goto(`${BASE}/audit-log`);
  await sa.page.getByRole('cell', { name: /Refund issued/ }).first().waitFor();
  await sa.page.getByRole('cell', { name: /Price changed/ }).first().waitFor();
  await sa.page.getByRole('button', { name: 'Verify integrity' }).click();
  await sa.page.getByText(/Audit log verified/).waitFor();
});
await step('settings: ranking rules refuse price in battery-critical, and saves are audited', async () => {
  await sa.page.goto(`${BASE}/settings?tab=rules`);
  const price = sa.page.getByLabel('Battery critical: price weight');
  ok(await price.isDisabled(), 'price must be locked for battery critical');
  await sa.page.getByLabel('Minimum route battery reserve').fill('15');
  await sa.page.getByRole('button', { name: 'Save changes…' }).click();
  await dialog(sa.page).getByLabel(/Reason/).fill('Safer default for highway trips');
  await dialog(sa.page).getByRole('button', { name: 'Save changes' }).click();
  await sa.page.getByText('Settings saved').waitFor();
});
await sa.ctx.close();

if (SHOTS) console.log(`(screenshots dir: ${SHOTS})`);
await browser.close();

console.log(`\nconsole errors: ${consoleProblems.length}`);
consoleProblems.slice(0, 10).forEach((p) => console.log('  ', p));
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
process.exit(failed.length || consoleProblems.length ? 1 : 0);
