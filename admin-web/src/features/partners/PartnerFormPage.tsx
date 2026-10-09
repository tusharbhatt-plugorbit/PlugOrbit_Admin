import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { CommercialModel, IntegrationMethod, Partner, PartnerInput, PartnerStatus } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { COMMERCIAL_MODEL, INTEGRATION_METHOD } from '@/domain/labels';
import { formatDateTime } from '@/domain/format';
import { useResource } from '@/hooks/useResource';
import { adminConfigService } from '@/services/adminConfigService';
import { adminPartnerService } from '@/services/adminPartnerService';
import { adminStationService } from '@/services/adminStationService';
import { AsyncView, Button, Card, CardBody, CardHeader, ConfirmDialog, KeyValue, NumberField, Notice, PageHeader, PartnerStatusBadge, SelectField, TextArea, TextField, Toggle, usePageMeta, useToast } from '@/ui';
import { useSave } from '../common/useSave';

const EMPTY: PartnerInput = {
  legalName: '', displayName: '', contactName: '', phone: '', email: '', pan: '', gstin: '', payoutReference: '',
  commercialModel: 'revenue_share', commissionPercent: 12, flatFeePerKwh: null, commissionPlanId: null, integrationMethod: 'manual', notes: '',
};

const FIELD_KEYS: (keyof PartnerInput)[] = ['legalName', 'displayName', 'contactName', 'phone', 'email', 'pan', 'gstin', 'payoutReference', 'commercialModel', 'commissionPercent', 'flatFeePerKwh', 'commissionPlanId', 'integrationMethod', 'notes'];

const MODEL_OPTIONS = (Object.keys(COMMERCIAL_MODEL) as CommercialModel[]).map((v) => ({ value: v, label: COMMERCIAL_MODEL[v] }));
const METHOD_OPTIONS = (Object.keys(INTEGRATION_METHOD) as IntegrationMethod[]).map((v) => ({ value: v, label: INTEGRATION_METHOD[v] }));

type Action = 'submit' | 'approve' | 'reject' | 'suspend' | 'reactivate' | 'reopen';

const ACTION_COPY: Record<Action, { to: PartnerStatus; title: string; confirm: string; body: string; tone?: 'danger'; reason?: number; done: string }> = {
  submit: { to: 'pending_review', title: 'Send for review?', confirm: 'Submit for review', body: 'A reviewer will check the PAN, GSTIN and commercial terms before this partner can be activated.', done: 'Submitted for review' },
  approve: { to: 'active', title: 'Approve this partner?', confirm: 'Approve and activate', body: 'Approved partners can have stations go live in the PlugOrbit app. Confirm the identity checks below.', done: 'Partner approved' },
  reject: { to: 'rejected', title: 'Reject this partner?', confirm: 'Reject partner', body: 'The partner stays on record as rejected. Give a clear reason so it can be corrected.', tone: 'danger', reason: 5, done: 'Partner rejected' },
  suspend: { to: 'suspended', title: 'Suspend this partner?', confirm: 'Suspend partner', body: 'All of this partner’s stations are hidden from the app immediately. Settlements are not affected.', tone: 'danger', reason: 5, done: 'Partner suspended' },
  reactivate: { to: 'active', title: 'Reactivate this partner?', confirm: 'Reactivate', body: 'Its live stations will show in the app again.', done: 'Partner reactivated' },
  reopen: { to: 'draft', title: 'Move back to draft?', confirm: 'Move to draft', body: 'Use this to correct details before submitting again.', done: 'Moved to draft' },
};

export default function PartnerFormPage() {
  const { partnerId } = useParams();
  const isNew = !partnerId;
  usePageMeta(isNew ? 'Add partner' : 'Partner', isNew ? 'Create a draft record, then send it for verification' : 'Edit details and manage verification');
  const resource = useResource((s) => (partnerId ? adminPartnerService.get(partnerId, s) : Promise.resolve(undefined)), [partnerId]);

  if (isNew) return <PartnerForm />;
  return <AsyncView resource={resource} skeleton="detail">{(p) => (p ? <PartnerForm partner={p} onChanged={(next) => resource.set(next)} /> : null)}</AsyncView>;
}

function PartnerForm({ partner, onChanged }: { partner?: Partner; onChanged?: (p: Partner) => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const isNew = !partner;
  const [values, setValues] = useState<PartnerInput>(() => (partner ? Object.fromEntries(FIELD_KEYS.map((k) => [k, partner[k] ?? EMPTY[k]])) as unknown as PartnerInput : EMPTY));
  const { saving, errors, conflict, formError, run, clearError } = useSave();
  const [action, setAction] = useState<Action | null>(null);
  const [panOk, setPanOk] = useState(false);
  const [gstOk, setGstOk] = useState(false);
  const plans = useResource((s) => adminConfigService.get(s), [], { enabled: can('settings:read') });
  const stations = useResource((s) => adminStationService.list({ partnerId: partner?.id }, s), [partner?.id], { enabled: !!partner && can('stations:read') });
  const readOnly = !can('partners:write') || (!!partner && (partner.status === 'pending_review' || partner.status === 'rejected'));
  const choose = (a: Action | null) => { setPanOk(false); setGstOk(false); setAction(a); };

  const set = <K extends keyof PartnerInput>(key: K, v: PartnerInput[K]) => { setValues((s) => ({ ...s, [key]: v })); clearError(key as string); };
  const err = (k: keyof PartnerInput) => errors[k as string] ?? null;
  const payload = (): PartnerInput => ({
    ...values, displayName: values.displayName || null, gstin: values.gstin || null, payoutReference: values.payoutReference || null, notes: values.notes || null,
    commissionPercent: values.commercialModel === 'revenue_share' ? values.commissionPercent : null, flatFeePerKwh: values.commercialModel === 'flat_fee_per_kwh' ? values.flatFeePerKwh : null,
    commissionPlanId: values.commissionPlanId || null,
  });

  const save = async () => {
    const saved = await run(() => (isNew ? adminPartnerService.create(payload()) : adminPartnerService.update(partner!.id, payload(), partner!.version)), isNew ? 'Partner created as a draft' : 'Partner saved');
    if (!saved) return;
    if (isNew) navigate(`/partners/${saved.id}`, { replace: true });
    else onChanged?.(saved);
  };

  const copy = action ? ACTION_COPY[action] : null;
  const plan = plans.data?.commissionPlans.find((p) => p.id === values.commissionPlanId);

  return (
    <>
      <PageHeader back={{ to: '/partners', label: 'All partners' }} actions={partner && <PartnerStatusBadge status={partner.status} />} />
      <div className="grid grid--split-even" style={{ alignItems: 'start' }}>
        <div className="stack">
          {conflict && <Notice tone="warn" title="Someone else changed this partner while you were editing" actions={<Button small variant="secondary" label="Reload their version" onClick={() => window.location.reload()} />}>Reload to see their changes, then re-apply yours.</Notice>}
          {formError && !conflict && <Notice tone="danger" title={formError} />}
          {!isNew && readOnly && can('partners:write') && <Notice tone="info" title="Locked while in review">Details can be edited again once the partner is approved, or after it is moved back to draft.</Notice>}

          <Card>
            <CardHeader title="Business details" />
            <CardBody>
              <div className="grid grid--2">
                <TextField label="Legal business name" required value={values.legalName} onChange={(v) => set('legalName', v)} error={err('legalName')} disabled={readOnly} className="" />
                <TextField label="Display name" help="Shown in lists. Defaults to the legal name." value={values.displayName} onChange={(v) => set('displayName', v)} error={err('displayName')} disabled={readOnly} />
                <TextField label="PAN" required value={values.pan} onChange={(v) => set('pan', v.toUpperCase())} error={err('pan')} disabled={readOnly} placeholder="ABCDE1234F" maxLength={10} />
                <TextField label="GSTIN" help="Only if GST-registered. Must include the PAN." value={values.gstin} onChange={(v) => set('gstin', v.toUpperCase())} error={err('gstin')} disabled={readOnly} placeholder="27AAPFU0939F1ZV" maxLength={15} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Primary contact" />
            <CardBody>
              <div className="grid grid--2">
                <TextField label="Contact person" required value={values.contactName} onChange={(v) => set('contactName', v)} error={err('contactName')} disabled={readOnly} />
                <TextField label="Phone" required help="10-digit mobile or +country code" value={values.phone} onChange={(v) => set('phone', v)} error={err('phone')} disabled={readOnly} />
                <TextField label="Email" required type="email" value={values.email} onChange={(v) => set('email', v)} error={err('email')} disabled={readOnly} className="" />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Commercial terms" subtitle="Used by settlement runs. Changes are audited." />
            <CardBody>
              <div className="grid grid--2">
                <SelectField label="Commercial model" value={values.commercialModel} onChange={(v) => set('commercialModel', v)} options={MODEL_OPTIONS} disabled={readOnly} error={err('commercialModel')} />
                <SelectField label="Integration method" help="How this partner's chargers report status." value={values.integrationMethod} onChange={(v) => set('integrationMethod', v)} options={METHOD_OPTIONS} disabled={readOnly} />
                {values.commercialModel === 'revenue_share' && (
                  <>
                    <NumberField label="Commission / revenue share" affix="%" min={0} max={100} step={0.1} value={values.commissionPercent} onChange={(v) => set('commissionPercent', v)} error={err('commissionPercent')} disabled={readOnly} help="PlugOrbit's share of what drivers pay" />
                    {plans.data && (
                      <SelectField label="Commission plan" placeholder="No plan (use the % above)" value={values.commissionPlanId ?? ''} onChange={(v) => set('commissionPlanId', v || null)} disabled={readOnly}
                        options={plans.data.commissionPlans.map((p) => ({ value: p.id, label: p.name }))} help={plan ? `${plan.commissionPercent ?? 0}% · ${plan.note ?? ''}` : 'Optional. The % above wins when both are set.'} />
                    )}
                  </>
                )}
                {values.commercialModel === 'flat_fee_per_kwh' && <NumberField label="Flat fee" affix="₹/kWh" min={0} step={0.1} value={values.flatFeePerKwh} onChange={(v) => set('flatFeePerKwh', v)} error={err('flatFeePerKwh')} disabled={readOnly} />}
                <TextField label="Bank / payout reference" help="A gateway vendor ID or masked reference. Never a raw bank account number." value={values.payoutReference} onChange={(v) => set('payoutReference', v)} error={err('payoutReference')} disabled={readOnly} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Internal notes" subtitle="Only PlugOrbit admins see these." />
            <CardBody><TextArea value={values.notes} onChange={(v) => set('notes', v)} disabled={readOnly} rows={4} placeholder="Onboarding context, contract terms, escalation contacts…" /></CardBody>
          </Card>

          {!readOnly && (
            <div className="row row--end">
              <Button variant="secondary" label="Cancel" onClick={() => navigate('/partners')} />
              <Button icon="save" label={isNew ? 'Create draft partner' : 'Save changes'} loading={saving} onClick={save} />
            </div>
          )}
        </div>

        <div className="stack">
          <Card pad>
            <h2 className="card__title">Verification</h2>
            {isNew ? (
              <p className="muted" style={{ marginTop: 8 }}>A new partner starts as a <strong>draft</strong>. After you save it you can send it for review, and a reviewer approves it before any station can go live.</p>
            ) : (
              <div style={{ marginTop: 8 }}>
                <KeyValue label="Status" value={<PartnerStatusBadge status={partner!.status} />} />
                <KeyValue label="PAN checked" value={partner!.verification.panVerified ? 'Yes' : 'No'} />
                <KeyValue label="GSTIN checked" value={partner!.gstin ? (partner!.verification.gstinVerified ? 'Yes' : 'No') : 'Not applicable'} />
                <KeyValue label="Reviewed" value={partner!.verification.reviewedAt ? formatDateTime(partner!.verification.reviewedAt, true) : 'Not yet'} />
                {partner!.verification.rejectionReason && <KeyValue label="Rejection reason" value={partner!.verification.rejectionReason} />}
                {partner!.statusReason && partner!.status === 'suspended' && <KeyValue label="Suspension reason" value={partner!.statusReason} />}
                <div className="row row--wrap" style={{ marginTop: 14 }}>
                  {partner!.status === 'draft' && can('partners:write') && <Button label="Submit for review" icon="check" onClick={() => choose('submit')} />}
                  {partner!.status === 'pending_review' && can('partners:review') && (<>
                    <Button label="Approve" icon="badge-check" onClick={() => choose('approve')} />
                    <Button variant="secondary" label="Send back to draft" onClick={() => choose('reopen')} />
                    <Button variant="ghost-danger" label="Reject" onClick={() => choose('reject')} />
                  </>)}
                  {partner!.status === 'active' && can('partners:review') && <Button variant="danger" label="Suspend" icon="ban" onClick={() => choose('suspend')} />}
                  {partner!.status === 'suspended' && can('partners:review') && <Button label="Reactivate" onClick={() => choose('reactivate')} />}
                  {partner!.status === 'rejected' && can('partners:write') && <Button variant="secondary" label="Reopen as draft" onClick={() => choose('reopen')} />}
                </div>
              </div>
            )}
          </Card>

          <Card tone="lime" pad>
            <h2 className="card__title">Phase 1 approach</h2>
            <p className="soft" style={{ marginTop: 6, lineHeight: 1.5 }}>Partners do not log in yet. PlugOrbit admins create and verify partner records, add their stations and set prices. Partner self-service comes later.</p>
          </Card>

          {partner && can('stations:read') && (
            <Card>
              <CardHeader title="Stations" subtitle={`${partner.stationCount} on record`} actions={can('stations:write') && partner.status === 'active' ? <Button small variant="secondary" icon="plus" label="Add station" onClick={() => navigate('/stations/new')} /> : undefined} />
              <CardBody>
                {stations.data?.items.length ? (
                  <div className="checklist">
                    {stations.data.items.map((s) => <Link key={s.id} className="checklist__item" to={`/stations/${s.id}`} style={{ color: 'inherit' }}><span className="grow strong">{s.name}</span><span className="caption">{s.city}</span></Link>)}
                  </div>
                ) : <p className="muted">No stations yet{partner.status !== 'active' ? ' (the partner must be active first)' : ''}.</p>}
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog open={!!action} onClose={() => choose(null)} title={copy?.title ?? ''} confirmLabel={copy?.confirm ?? ''} tone={copy?.tone ?? 'primary'} minReason={copy?.reason ?? 0}
        body={copy?.body} canConfirm={action !== 'approve' || (panOk && (!partner?.gstin || gstOk))}
        extra={action === 'approve' ? (
          <div className="stack stack--sm">
            <Toggle checked={panOk} onChange={setPanOk} title="I verified the PAN against the company documents" />
            {partner?.gstin && <Toggle checked={gstOk} onChange={setGstOk} title="I verified the GSTIN on the GST portal" />}
          </div>
        ) : undefined}
        onConfirm={async (reason) => {
          const next = await adminPartnerService.transition(partner!.id, { to: copy!.to, reason: reason || undefined, ...(action === 'approve' ? { panVerified: panOk, gstinVerified: gstOk } : {}) });
          onChanged?.(next);
          toast.success(copy!.done);
        }} />
    </>
  );
}
