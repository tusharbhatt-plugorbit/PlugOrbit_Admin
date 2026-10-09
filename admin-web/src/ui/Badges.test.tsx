import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConfidenceBadge, PaymentBadge, StatusBadge } from './Badges';

const NOW = 1_800_000_000_000;

describe('ConfidenceBadge: the only component allowed to print LIVE', () => {
  it('prints Live for a fresh feed', () => {
    render(<ConfidenceBadge confidence="live" updatedAt={NOW - 20_000} now={NOW} />);
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.queryByText('Stale')).not.toBeInTheDocument();
  });
  it('refuses to print Live when the timestamp has aged out, even if the server said live', () => {
    render(<ConfidenceBadge confidence="live" updatedAt={NOW - 20 * 60_000} now={NOW} />);
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
    expect(screen.getByText('Estimated')).toBeInTheDocument();
  });
  it('adds a Stale flag past the stale window', () => {
    render(<ConfidenceBadge confidence="estimated" updatedAt={NOW - 45 * 60_000} now={NOW} />);
    expect(screen.getByText('Stale')).toBeInTheDocument();
  });
  it('labels admin-set data as Manual, never Live', () => {
    render(<ConfidenceBadge confidence="manual" updatedAt={NOW - 1000} now={NOW} />);
    expect(screen.getByText('Manual')).toBeInTheDocument();
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
  });
  it('has an accessible description so colour is never the only signal', () => {
    render(<ConfidenceBadge confidence="user" updatedAt={NOW} now={NOW} />);
    expect(screen.getByLabelText(/Data confidence: User-confirmed/)).toBeInTheDocument();
  });
});

describe('status badges carry words, not just colour', () => {
  it('connector statuses', () => {
    render(<><StatusBadge status="available" /><StatusBadge status="occupied" /><StatusBadge status="offline" /><StatusBadge status="maintenance" /><StatusBadge status="unknown" /></>);
    for (const t of ['Available', 'Occupied', 'Offline', 'Maintenance', 'Unknown']) expect(screen.getByText(t)).toBeInTheDocument();
  });
  it('distinguishes operator-paid sessions clearly', () => {
    render(<PaymentBadge status="external" />);
    expect(screen.getByText('Operator-paid')).toBeInTheDocument();
  });
});
