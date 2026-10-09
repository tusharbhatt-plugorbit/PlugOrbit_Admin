import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { describeError } from '@/api/http';
import { Button } from './Button';
import { Icon } from './Icon';
import { TextArea } from './Fields';
import { useToast } from './Toast';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Escape closes, Tab stays inside, focus returns to whatever opened the overlay, background does not scroll. */
function useModal(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = node?.querySelector<HTMLElement>('[data-autofocus]') ?? node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) { e.preventDefault(); return; }
      const [a, z] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, [ref]);
}

/** Right-side detail panel: the preferred way to look at a record without leaving the list. */
export function Drawer({ open, title, subtitle, onClose, children, footer, wide }: {
  open: boolean; title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  if (!open) return null;
  return <DrawerInner title={title} subtitle={subtitle} onClose={onClose} footer={footer} wide={wide}>{children}</DrawerInner>;
}

function DrawerInner({ title, subtitle, onClose, children, footer, wide }: Omit<Parameters<typeof Drawer>[0], 'open'>) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModal(ref, onClose);
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <aside ref={ref} className={`drawer ${wide ? 'drawer--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="drawer__head">
          <div style={{ minWidth: 0 }}>
            <h2 className="drawer__title" id={titleId}>{title}</h2>
            {subtitle && <div className="drawer__sub">{subtitle}</div>}
          </div>
          <button type="button" className="drawer__close" onClick={onClose} aria-label="Close panel"><Icon name="x" size={18} /></button>
        </div>
        <div className="drawer__body">{children}</div>
        {footer && <div className="drawer__foot">{footer}</div>}
      </aside>
    </>,
    document.body,
  );
}

export function Dialog({ open, title, icon, onClose, children, footer, wide }: {
  open: boolean; title: ReactNode; icon?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  if (!open) return null;
  return <DialogInner title={title} icon={icon} onClose={onClose} footer={footer} wide={wide}>{children}</DialogInner>;
}

function DialogInner({ title, icon, onClose, children, footer, wide }: Omit<Parameters<typeof Dialog>[0], 'open'>) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModal(ref, onClose);
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog-wrap">
        <div ref={ref} className={`dialog ${wide ? 'dialog--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
          <h2 className="dialog__title" id={titleId}>{icon}{title}</h2>
          {children}
          {footer && <div className="dialog__foot">{footer}</div>}
        </div>
      </div>
    </>,
    document.body,
  );
}

/**
 * Confirmation for anything destructive or sensitive (refunds, restrictions, hiding a station, role
 * changes). Optionally collects a mandatory reason, which the API stores in the audit trail. The
 * dialog stays open and shows the server's message if the action fails.
 */
export function ConfirmDialog({ open, title, body, confirmLabel, tone = 'primary', reasonLabel = 'Reason', reasonHelp, minReason = 0, extra, canConfirm = true, successMessage, onConfirm, onClose }: {
  open: boolean; title: string; body?: ReactNode; confirmLabel: string; tone?: 'primary' | 'danger'; reasonLabel?: string; reasonHelp?: string;
  /** 0 = no reason field. Otherwise the minimum length. */
  minReason?: number; extra?: ReactNode; canConfirm?: boolean; successMessage?: string; onConfirm: (reason: string) => Promise<unknown>; onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  if (!open) return null;

  const reasonOk = minReason === 0 || reason.trim().length >= minReason;
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      if (successMessage) toast.success(successMessage);
      setReason('');
      onClose();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };
  const close = () => { if (!busy) { setError(null); setReason(''); onClose(); } };

  return (
    <Dialog open title={title} onClose={close} icon={tone === 'danger' ? <Icon name="shield-alert" size={20} color="var(--po-color-danger)" /> : undefined}
      footer={<>
        <Button variant="secondary" label="Cancel" onClick={close} disabled={busy} data-autofocus />
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} label={confirmLabel} loading={busy} disabled={!reasonOk || !canConfirm} onClick={submit} />
      </>}>
      {body && <div className="dialog__body">{body}</div>}
      {extra}
      {minReason > 0 && (
        <TextArea label={reasonLabel} required value={reason} onChange={setReason} rows={3} help={reasonHelp ?? `Recorded in the audit log (at least ${minReason} characters).`} />
      )}
      {error && <div className="notice notice--danger" role="alert"><Icon name="circle-alert" size={18} /><div className="notice__body"><div className="notice__title">{error}</div></div></div>}
    </Dialog>
  );
}
