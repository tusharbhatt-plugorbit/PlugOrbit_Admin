import { useMemo, useState } from 'react';
import type { AdminRow, CommissionPlan, PlatformConfig, Role, RoleInfo } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { COMMERCIAL_MODEL } from '@/domain/labels';
import { timeAgo } from '@/domain/trust';
import { useResource } from '@/hooks/useResource';
import { useUrlState } from '@/hooks/useUrlState';
import { adminConfigService, type ConfigInput } from '@/services/adminConfigService';
import { AsyncView, Button, Card, CardBody, CardHeader, ConfirmDialog, DataTable, Dialog, EmptyState, NumberField, Notice, Pill, Segmented, SelectField, TextField, Toggle, usePageMeta, useToast, type Column } from '@/ui';
import { useSave } from '../common/useSave';

type Tab = 'roles' | 'rules' | 'flags' | 'plans';
const FACTORS = ['availability', 'freshness', 'reliability', 'distance', 'detour', 'speed', 'wait', 'price', 'faults', 'amenities', 'hours', 'reach'] as const;
const INTENTS: [string, string][] = [['plan_trip', 'Plan a trip'], ['charge_nearby', 'Charge nearby'], ['battery_critical', 'Battery critical']];
const ROLES: Role[] = ['super_admin', 'operations', 'finance', 'support'];

type Draft = PlatformConfig;
interface TabProps { draft: Draft; set: (patch: Partial<Draft>) => void; disabled: boolean }

// ------------------------------------------------------------------------- roles & admins --
function RoleCards({ roles }: { roles: RoleInfo[] }) {
  const [open, setOpen] = useState<Role | null>(null);
  return (
    <div className="stack">
      {roles.map((r) => {
        const groups = new Map<string, string[]>();
        r.permissions.forEach((p) => { const [g, a] = p.split(':'); groups.set(g, [...(groups.get(g) ?? []), a]); });
        return (
          <Card key={r.role} pad>
            <div className="row row--between">
              <div><div className="strong" style={{ fontSize: 15 }}>{r.label}</div><div className="caption">{r.summary}</div></div>
              <Button small variant="ghost" label={open === r.role ? 'Hide permissions' : `${r.permissions.length} permissions`} onClick={() => setOpen(open === r.role ? null : r.role)} />
            </div>
            {open === r.role && <div className="row row--wrap" style={{ marginTop: 10, alignItems: 'flex-start' }}>{[...groups.entries()].map(([g, a]) => <span key={g} className="pill pill--slate" style={{ height: 'auto', padding: '4px 9px' }}><strong>{g}</strong>&nbsp;{a.join(' · ')}</span>)}</div>}
          </Card>
        );
      })}
    </div>
  );
}

function AdminsCard() {
  const { principal } = useAuth();
  const toast = useToast();
  const admins = useResource((s) => adminConfigService.admins(s), []);
  const [invite, setInvite] = useState(false);
  const [edit, setEdit] = useState<AdminRow | null>(null);
  const [toggle, setToggle] = useState<AdminRow | null>(null);

  const columns: Column<AdminRow>[] = [
    { key: 'name', header: 'Administrator', sortValue: (a) => a.name ?? '', render: (a) => <><div className="cell-main">{a.name}{a.id === principal?.uid && <Pill label="You" tone="dark" />}</div><div className="cell-sub">{a.email}</div></> },
    { key: 'role', header: 'Role', render: (a) => a.roleLabel },
    { key: 'status', header: 'Status', render: (a) => <Pill label={a.status} tone={a.status === 'active' ? 'lime' : a.status === 'invited' ? 'info' : 'slate'} dot /> },
    { key: 'login', header: 'Last sign-in', render: (a) => <span className="muted">{a.lastLoginAt ? timeAgo(a.lastLoginAt, Date.now()) : 'Never'}</span> },
  ];
  return (
    <Card>
      <CardHeader title="Administrators" subtitle="Roles live in the database, so a change takes effect on the person's next request." actions={<Button icon="plus" label="Invite admin" onClick={() => setInvite(true)} />} />
      <div style={{ marginTop: 12 }}>
        <AsyncView resource={admins} skeleton="table" isEmpty={(d) => d.items.length === 0} empty={<EmptyState compact title="No administrators" />}>
          {(d) => <DataTable caption="Administrators" columns={columns} rows={d.items} rowKey={(a) => a.id}
            actions={(a) => a.id === principal?.uid ? <span className="caption">This is you</span> : (
              <span className="row row--end"><Button small variant="ghost" label="Change role" onClick={() => setEdit(a)} /><Button small variant={a.status === 'disabled' ? 'ghost' : 'ghost-danger'} label={a.status === 'disabled' ? 'Enable' : 'Disable'} onClick={() => setToggle(a)} /></span>)} />}
        </AsyncView>
      </div>
      {invite && <InviteDialog onClose={() => setInvite(false)} onDone={() => { admins.reload(); toast.success('Admin invited'); }} />}
      {edit && <RoleDialog admin={edit} onClose={() => setEdit(null)} onDone={admins.reload} />}
      <ConfirmDialog open={!!toggle} onClose={() => setToggle(null)} title={toggle?.status === 'disabled' ? `Re-enable ${toggle?.name}?` : `Disable ${toggle?.name}?`} tone={toggle?.status === 'disabled' ? 'primary' : 'danger'} confirmLabel={toggle?.status === 'disabled' ? 'Enable' : 'Disable and sign out'} minReason={5}
        successMessage={toggle?.status === 'disabled' ? 'Admin enabled' : 'Admin disabled'} body={toggle?.status === 'disabled' ? 'They can sign in again with their previous role.' : 'They are signed out immediately and cannot sign in until re-enabled.'}
        onConfirm={async (reason) => { await adminConfigService.patchAdmin(toggle!.id, { status: toggle!.status === 'disabled' ? 'active' : 'disabled', reason }); admins.reload(); }} />
    </Card>
  );
}

function InviteDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState({ email: '', name: '', role: 'support' as Role });
  const { saving, errors, formError, run } = useSave();
  const submit = async () => { if (await run(() => adminConfigService.invite(v))) { onDone(); onClose(); } };
  return (
    <Dialog open onClose={onClose} title="Invite an administrator" footer={<><Button variant="secondary" label="Cancel" onClick={onClose} /><Button label="Send invite" loading={saving} disabled={!v.email || v.name.length < 2} onClick={submit} /></>}>
      <div className="stack">
        <p className="soft">They sign in with this email. Until they do, the invite just reserves their role.</p>
        <TextField label="Work email" type="email" required value={v.email} onChange={(x) => setV((s) => ({ ...s, email: x }))} error={errors.email} />
        <TextField label="Full name" required value={v.name} onChange={(x) => setV((s) => ({ ...s, name: x }))} error={errors.name} />
        <SelectField label="Role" value={v.role} onChange={(x) => setV((s) => ({ ...s, role: x }))} options={ROLES.map((r) => ({ value: r, label: r.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase()) }))} />
        {formError && <Notice tone="danger" title={formError} />}
      </div>
    </Dialog>
  );
}

function RoleDialog({ admin, onClose, onDone }: { admin: AdminRow; onClose: () => void; onDone: () => void }) {
  const [role, setRole] = useState<Role>(admin.role);
  return (
    <ConfirmDialog open onClose={onClose} title={`Change ${admin.name}'s role`} confirmLabel="Change role" minReason={5} canConfirm={role !== admin.role} successMessage="Role changed"
      body="Role changes are recorded in the audit log and apply immediately."
      extra={<SelectField label="New role" value={role} onChange={setRole} options={ROLES.map((r) => ({ value: r, label: r.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase()) }))} />}
      onConfirm={async (reason) => { await adminConfigService.patchAdmin(admin.id, { role, reason }); onDone(); }} />
  );
}

function RolesTab() {
  const { can } = useAuth();
  const roles = useResource((s) => adminConfigService.roles(s), []);
  return (
    <div className="grid grid--split-even" style={{ alignItems: 'start' }}>
      <div className="stack">
        <Card><CardHeader title="Admin roles" subtitle="Defined in code and reviewed like any other change." /><CardBody><AsyncView resource={roles} skeleton="cards">{(r) => <RoleCards roles={r} />}</AsyncView></CardBody></Card>
      </div>
      <div className="stack">{can('roles:manage') ? <AdminsCard /> : <Card pad><h3 className="section-title">Administrators</h3><p className="muted">Only a Super Admin can manage administrator accounts.</p></Card>}</div>
    </div>
  );
}

// ------------------------------------------------------------------------------- rules --
function RulesTab({ draft, set, disabled }: TabProps) {
  const setWeight = (intent: string, factor: string, v: number | null) => {
    const next = { ...draft.rankingWeights, [intent]: { ...draft.rankingWeights[intent], [factor]: v ?? 0 } };
    set({ rankingWeights: next });
  };
  return (
    <div className="stack">
      <Card>
        <CardHeader title="Platform rules" subtitle="These drive what the app calls Live, how routes are planned and how long an admin can stay idle." />
        <CardBody>
          <div className="grid grid--3">
            <NumberField label="Live freshness threshold" affix="sec" min={10} max={3600} value={draft.liveMaxAgeSec} onChange={(v) => set({ liveMaxAgeSec: v ?? 0 })} disabled={disabled} help="A feed older than this is no longer called Live. Mobile default: 300 s (5 min)." />
            <NumberField label="Stale after" affix="sec" min={60} max={86400} value={draft.staleAfterSec} onChange={(v) => set({ staleAfterSec: v ?? 0 })} disabled={disabled} help="Older than this is flagged Stale. Mobile default: 1,800 s." />
            <NumberField label="Minimum route battery reserve" affix="%" min={0} max={50} value={draft.minRouteBatteryReservePct} onChange={(v) => set({ minRouteBatteryReservePct: v ?? 0 })} disabled={disabled} help="The least charge a planned trip may arrive with." />
            <NumberField label="Admin idle timeout" affix="min" min={5} max={480} value={draft.adminIdleTimeoutMinutes} onChange={(v) => set({ adminIdleTimeoutMinutes: v ?? 0 })} disabled={disabled} help="Admins are signed out after this long without activity." />
            <NumberField label="GST on PlugOrbit fee" affix="%" min={0} max={40} step="0.1" value={draft.platformFeeGstPercent} onChange={(v) => set({ platformFeeGstPercent: v ?? 0 })} disabled={disabled} help="Used in settlements. Confirm with finance." />
            <div style={{ paddingTop: 22 }}><Toggle checked={draft.settlementMakerChecker} onChange={(v) => set({ settlementMakerChecker: v })} disabled={disabled} title="Settlement maker-checker" description="A second person must approve a settlement." /></div>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Ranking weights" subtitle="How much each factor matters when the app recommends a charger. Relative importance, not percentages." />
        <CardBody>
          <Notice tone="info" title="Two rules are fixed in code">Sponsorship can never be a ranking factor, and price can never matter when the battery is critical: reaching a working charger comes first.</Notice>
          <div className="grid grid--3" style={{ marginTop: 16, alignItems: 'start' }}>
            {INTENTS.map(([intent, label]) => {
              const w = draft.rankingWeights[intent] ?? {};
              const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
              return (
                <div key={intent} className="stack stack--sm">
                  <div className="strong">{label}</div>
                  {FACTORS.map((f) => {
                    const locked = intent === 'battery_critical' && f === 'price';
                    const v = w[f] ?? 0;
                    return (
                      <div key={f} className="row" style={{ gap: 8 }}>
                        <span className="grow" style={{ textTransform: 'capitalize', color: locked ? 'var(--po-color-placeholder)' : undefined }}>{f}</span>
                        <input className="input input--sm" type="number" min={0} max={100} aria-label={`${label}: ${f} weight`} style={{ width: 70, height: 34 }} value={v} disabled={disabled || locked} onChange={(e) => setWeight(intent, f, e.target.value === '' ? 0 : Number(e.target.value))} />
                        <span className="caption num" style={{ width: 38, textAlign: 'right' }}>{v ? `${Math.round((100 * v) / total)}%` : ''}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

// -------------------------------------------------------------------------------- flags --
function FlagsTab({ draft, set, disabled }: TabProps) {
  const entries = Object.entries(draft.featureCatalog);
  const built = entries.filter(([, m]) => m.built);
  const later = entries.filter(([, m]) => !m.built);
  const toggle = (k: string, v: boolean) => set({ featureFlags: { ...draft.featureFlags, [k]: v } });
  return (
    <div className="grid grid--2" style={{ alignItems: 'start' }}>
      <Card>
        <CardHeader title="Modules in this build" subtitle="Switch a built module on or off for every admin." />
        <CardBody><div className="stack">{built.map(([k, m]) => <Toggle key={k} checked={!!draft.featureFlags[k]} onChange={(v) => toggle(k, v)} disabled={disabled} title={m.label} description={`Phase ${m.phase}`} />)}</div></CardBody>
      </Card>
      <Card tone="info">
        <CardHeader title="Future controls" subtitle="Reserved, not built. The switches exist so a later module can be enabled without a schema change." />
        <CardBody>
          <div className="stack stack--sm">{later.map(([k, m]) => <div key={k} className="row row--between"><span>{m.label}</span><span className="pill-group"><Pill label={`Phase ${m.phase}`} tone="slate" /><Pill label="Not built" tone="slate" /></span></div>)}</div>
        </CardBody>
      </Card>
    </div>
  );
}

// -------------------------------------------------------------------------------- plans --
function PlansTab({ draft, set, disabled }: TabProps) {
  const plans = draft.commissionPlans;
  const update = (i: number, patch: Partial<CommissionPlan>) => set({ commissionPlans: plans.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const columns: Column<CommissionPlan>[] = [
    { key: 'id', header: 'ID', render: (p) => <span className="mono">{p.id}</span> },
    { key: 'name', header: 'Name', render: (p) => <input className="input input--sm" aria-label={`Name of ${p.id}`} value={p.name} disabled={disabled} onChange={(e) => update(plans.indexOf(p), { name: e.target.value })} /> },
    { key: 'model', header: 'Model', render: (p) => <select className="select select--sm" aria-label={`Model of ${p.id}`} value={p.model} disabled={disabled} onChange={(e) => update(plans.indexOf(p), { model: e.target.value as CommissionPlan['model'] })}>{Object.entries(COMMERCIAL_MODEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select> },
    { key: 'pct', header: 'Commission %', align: 'right', render: (p) => <input className="input input--sm" type="number" aria-label={`Commission of ${p.id}`} style={{ width: 90 }} min={0} max={100} step="0.1" disabled={disabled || p.model !== 'revenue_share'} value={p.commissionPercent ?? ''} onChange={(e) => update(plans.indexOf(p), { commissionPercent: e.target.value === '' ? null : Number(e.target.value) })} /> },
    { key: 'flat', header: 'Flat ₹/kWh', align: 'right', render: (p) => <input className="input input--sm" type="number" aria-label={`Flat fee of ${p.id}`} style={{ width: 90 }} min={0} step="0.1" disabled={disabled || p.model !== 'flat_fee_per_kwh'} value={p.flatFeePerKwh ?? ''} onChange={(e) => update(plans.indexOf(p), { flatFeePerKwh: e.target.value === '' ? null : Number(e.target.value) })} /> },
  ];
  const [id, setId] = useState('');
  const idOk = /^[a-z0-9_-]{2,40}$/.test(id) && !plans.some((p) => p.id === id);
  return (
    <Card>
      <CardHeader title="Commission plans" subtitle="Reusable terms a partner can be put on. Partners can also have their own numbers." />
      <div style={{ marginTop: 12 }}>
        <DataTable caption="Commission plans" columns={columns} rows={plans} rowKey={(p) => p.id} pageSize={50}
          actions={disabled ? undefined : (p) => <Button small variant="ghost-danger" label="Remove" onClick={() => set({ commissionPlans: plans.filter((x) => x.id !== p.id) })} />} />
      </div>
      {!disabled && (
        <div className="card__foot" style={{ justifyContent: 'flex-start' }}>
          <input className="input input--sm" style={{ width: 220 }} aria-label="New plan ID" placeholder="new-plan-id" value={id} onChange={(e) => setId(e.target.value.toLowerCase())} />
          <Button small variant="secondary" icon="plus" label="Add plan" disabled={!idOk} onClick={() => { set({ commissionPlans: [...plans, { id, name: id, model: 'revenue_share', commissionPercent: 10, flatFeePerKwh: null, note: null }] }); setId(''); }} />
          <span className="caption">Removing a plan does not change partners that already use its numbers.</span>
        </div>
      )}
    </Card>
  );
}

export default function SettingsPage() {
  usePageMeta('Admin Settings', 'Roles, rules and platform configuration');
  const { can } = useAuth();
  const toast = useToast();
  const [f, setF] = useUrlState({ tab: 'roles' });
  const tab = (['roles', 'rules', 'flags', 'plans'] as const).includes(f.tab as Tab) ? (f.tab as Tab) : 'roles';
  const config = useResource((s) => adminConfigService.get(s), []);
  // The draft is the loaded config with the admin's unsaved edits laid over it (nothing to sync in an effect).
  const [edits, setEdits] = useState<Partial<Draft>>({});
  const draft = useMemo<Draft | null>(() => (config.data ? { ...config.data, ...edits } : null), [config.data, edits]);
  const [saving, setSaving] = useState(false);
  const writable = can('settings:write');
  const dirty = useMemo(() => !!(draft && config.data && JSON.stringify(draft) !== JSON.stringify(config.data)), [draft, config.data]);
  const set = (patch: Partial<Draft>) => setEdits((e) => ({ ...e, ...patch }));

  const save = async (reason: string) => {
    if (!draft) return;
    // The server rejects unknown fields, so send exactly the editable ones (not createdAt, version, catalog...).
    const cleaned: ConfigInput = {
      liveMaxAgeSec: draft.liveMaxAgeSec, staleAfterSec: draft.staleAfterSec, minRouteBatteryReservePct: draft.minRouteBatteryReservePct,
      adminIdleTimeoutMinutes: draft.adminIdleTimeoutMinutes, platformFeeGstPercent: draft.platformFeeGstPercent, settlementMakerChecker: draft.settlementMakerChecker,
      featureFlags: draft.featureFlags, expectedVersion: draft.version, reason,
      commissionPlans: draft.commissionPlans.map((p) => ({ id: p.id, name: p.name, model: p.model, commissionPercent: p.commissionPercent, flatFeePerKwh: p.flatFeePerKwh, note: p.note })),
      rankingWeights: Object.fromEntries(Object.entries(draft.rankingWeights).map(([k, w]) => [k, Object.fromEntries(Object.entries(w).filter(([, v]) => v > 0))])),
    };
    setSaving(true);
    try { config.set(await adminConfigService.update(cleaned)); setEdits({}); } finally { setSaving(false); }
  };
  const [confirm, setConfirm] = useState(false);

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Segmented label="Settings sections" value={tab} onChange={(t) => setF({ tab: t })} options={[{ value: 'roles', label: 'Admin roles' }, { value: 'rules', label: 'Platform rules' }, { value: 'flags', label: 'Feature flags' }, { value: 'plans', label: 'Commission plans' }]} />
        {tab !== 'roles' && !writable && <Notice tone="info" title="View only">Your role can read settings but not change them.</Notice>}
      </div>
      {tab === 'roles' && <RolesTab />}
      {tab !== 'roles' && (
        <AsyncView resource={config} skeleton="cards">
          {(c) => draft && (
            <>
              <p className="caption">Version {c.version}{c.version > 1 ? '' : ' (defaults)'}.{' '}</p>
              {tab === 'rules' && <RulesTab draft={draft} set={set} disabled={!writable} />}
              {tab === 'flags' && <FlagsTab draft={draft} set={set} disabled={!writable} />}
              {tab === 'plans' && <PlansTab draft={draft} set={set} disabled={!writable} />}
            </>
          )}
        </AsyncView>
      )}
      {dirty && writable && tab !== 'roles' && (
        <div style={{ position: 'sticky', bottom: 16, zIndex: 10 }}>
          <Card tone="dark"><div className="card__body row row--between"><span style={{ fontWeight: 700 }}>You have unsaved changes</span><span className="row"><Button variant="secondary" label="Discard" onClick={() => setEdits({})} /><Button variant="lime" label="Save changes…" loading={saving} onClick={() => setConfirm(true)} /></span></div></Card>
        </div>
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title="Save platform changes?" confirmLabel="Save changes" minReason={3} successMessage="Settings saved"
        body="Changes apply to the app and to every admin straight away. The before and after values are written to the audit log."
        onConfirm={async (reason) => { try { await save(reason); } catch (e) { toast.error('Not saved'); throw e; } }} />
    </>
  );
}
