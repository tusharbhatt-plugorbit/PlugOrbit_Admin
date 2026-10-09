import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/http';
import { ConfirmDialog, Drawer } from './Overlays';
import { ToastProvider } from './Toast';

const setup = (props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) => {
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(<ToastProvider><ConfirmDialog open title="Issue refund" confirmLabel="Refund" minReason={5} onConfirm={onConfirm} onClose={onClose} {...props} /></ToastProvider>);
  return { onConfirm, onClose };
};

describe('ConfirmDialog (destructive actions)', () => {
  it('blocks the action until a reason of the required length is given', async () => {
    const { onConfirm } = setup();
    const user = userEvent.setup();
    const confirm = screen.getByRole('button', { name: 'Refund' });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText(/Reason/), 'abc');
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText(/Reason/), 'de');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith('abcde');
  });

  it('stays open and shows the server message when the action fails', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new ApiError(409, 'STALE_VERSION', 'Someone else changed this record.'));
    const { onClose } = setup({ onConfirm });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Reason/), 'long enough');
    await user.click(screen.getByRole('button', { name: 'Refund' }));
    expect(await screen.findByText('Someone else changed this record.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes and confirms with a toast on success', async () => {
    const { onClose } = setup({ successMessage: 'Refund issued', minReason: 0 });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Refund' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await screen.findByText('Refund issued')).toBeInTheDocument();
  });

  it('can be cancelled with Escape', async () => {
    const { onClose } = setup();
    await userEvent.setup().keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('does not render when closed', () => {
    setup({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('can be held shut by canConfirm (e.g. the PAN-checked toggle)', () => {
    setup({ minReason: 0, canConfirm: false });
    expect(screen.getByRole('button', { name: 'Refund' })).toBeDisabled();
  });
});

describe('Drawer', () => {
  it('is a labelled modal that closes on Escape and returns focus to the opener', async () => {
    const onClose = vi.fn();
    render(<><button>opener</button><Drawer open title="Station" onClose={onClose}>body</Drawer></>);
    expect(screen.getByRole('dialog', { name: 'Station' })).toBeInTheDocument();
    await userEvent.setup().keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
