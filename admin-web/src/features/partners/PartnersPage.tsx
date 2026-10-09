import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Partner, PartnerStatus } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { COMMERCIAL_MODEL, INTEGRATION_METHOD, PARTNER_STATUS } from '@/domain/labels';
import { formatDate } from '@/domain/format';
import { useDebounced } from '@/hooks/useDebounced';
import { useResource } from '@/hooks/useResource';
import { useUrlState } from '@/hooks/useUrlState';
import { adminPartnerService } from '@/services/adminPartnerService';
import { AsyncView, Button, Card, Chip, ConfirmDialog, DataTable, EmptyState, FilterBar, NoResults, PageHeader, PartnerStatusBadge, SearchField, usePageMeta, type Column } from '@/ui';

const STATUS_CHIPS: (PartnerStatus | '')[] = ['', 'active', 'pending_review', 'draft', 'suspended', 'rejected'];

export default function PartnersPage() {
  usePageMeta('Partners', 'Internal partner records, verification and commercial terms');
  const navigate = useNavigate();
  const { can } = useAuth();
  const [f, setF] = useUrlState({ q: '', status: '' });
  const q = useDebounced(f.q);
  const list = useResource((s) => adminPartnerService.list({ q, status: f.status }, s), [q, f.status]);
  const [toggle, setToggle] = useState<Partner | null>(null);
  const canReview = can('partners:review');

  const columns: Column<Partner>[] = [
    { key: 'name', header: 'Partner', sortValue: (p) => p.name.toLowerCase(), render: (p) => <><div className="cell-main">{p.name}</div><div className="cell-sub">{p.contactName} · {p.email}</div></> },
    { key: 'stations', header: 'Stations', align: 'right', sortValue: (p) => p.stationCount, render: (p) => <><span className="strong num">{p.stationCount}</span><div className="cell-sub">{p.liveStationCount} live</div></> },
    { key: 'integration', header: 'Integration', sortValue: (p) => p.integrationMethod, render: (p) => INTEGRATION_METHOD[p.integrationMethod] },
    { key: 'model', header: 'Commercial model', render: (p) => <><div>{COMMERCIAL_MODEL[p.commercialModel]}</div><div className="cell-sub">{p.commercialModel === 'revenue_share' ? (p.commissionPercent !== null ? `${p.commissionPercent}% of gross` : `Plan: ${p.commissionPlanId}`) : p.commercialModel === 'flat_fee_per_kwh' ? `₹${p.flatFeePerKwh}/kWh` : 'No fee'}</div></> },
    { key: 'status', header: 'Status', sortValue: (p) => p.status, render: (p) => <PartnerStatusBadge status={p.status} /> },
    { key: 'updated', header: 'Updated', sortValue: (p) => p.updatedAt, render: (p) => <span className="muted">{formatDate(p.updatedAt)}</span> },
  ];

  return (
    <>
      <PageHeader actions={can('partners:write') && <Button icon="plus" label="Add partner" onClick={() => navigate('/partners/new')} />} />
      <FilterBar>
        <SearchField value={f.q} onChange={(v) => setF({ q: v })} placeholder="Search partner, contact, email" />
        <div className="chips" role="group" aria-label="Status">
          {STATUS_CHIPS.map((s) => <Chip key={s || 'all'} label={s ? PARTNER_STATUS[s].label : 'All'} selected={f.status === s} onClick={() => setF({ status: s })} />)}
        </div>
      </FilterBar>
      <Card>
        <AsyncView resource={list} isEmpty={(d) => d.items.length === 0}
          empty={f.q || f.status ? <NoResults what="partners" onClear={() => setF({ q: '', status: '' })} /> : <EmptyState icon="handshake" title="No partners yet" body="Create the first partner record, then verify it before adding its stations." action={can('partners:write') && <Button icon="plus" label="Add partner" onClick={() => navigate('/partners/new')} />} />}>
          {(d) => (
            <DataTable caption="Partners" columns={columns} rows={d.items} rowKey={(p) => p.id} onRowClick={(p) => navigate(`/partners/${p.id}`)}
              actions={(p) => (
                <span className="row row--end">
                  {p.status === 'pending_review' && canReview && <Button small variant="secondary" label="Review" onClick={() => navigate(`/partners/${p.id}`)} />}
                  {(p.status === 'active' || p.status === 'suspended') && canReview && (
                    <Button small variant={p.status === 'active' ? 'ghost-danger' : 'ghost'} label={p.status === 'active' ? 'Deactivate' : 'Activate'} onClick={() => setToggle(p)} />
                  )}
                  <Button small variant="ghost" label="Open" onClick={() => navigate(`/partners/${p.id}`)} />
                </span>
              )} />
          )}
        </AsyncView>
      </Card>
      <ConfirmDialog open={!!toggle} onClose={() => setToggle(null)}
        title={toggle?.status === 'active' ? `Deactivate ${toggle?.name}?` : `Activate ${toggle?.name}?`}
        body={toggle?.status === 'active' ? 'Deactivating suspends the partner and hides all of its stations from the PlugOrbit app until it is activated again.' : 'The partner and its live stations will show in the app again.'}
        confirmLabel={toggle?.status === 'active' ? 'Deactivate partner' : 'Activate partner'} tone={toggle?.status === 'active' ? 'danger' : 'primary'}
        minReason={toggle?.status === 'active' ? 5 : 0} successMessage={toggle?.status === 'active' ? 'Partner deactivated' : 'Partner activated'}
        onConfirm={async (reason) => { await adminPartnerService.transition(toggle!.id, { to: toggle!.status === 'active' ? 'suspended' : 'active', reason: reason || undefined }); list.reload(); }} />
    </>
  );
}
