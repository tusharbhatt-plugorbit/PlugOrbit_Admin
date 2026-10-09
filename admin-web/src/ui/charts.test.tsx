import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { BarList, ChartCard, LineChart, Meter, niceTicks } from './charts';

describe('niceTicks: axis ticks round to clean numbers', () => {
  it('rounds a max up to clean, evenly-spaced ticks', () => {
    expect(niceTicks(20)).toEqual([0, 5, 10, 15, 20]);
    expect(niceTicks(87)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(12_400)).toEqual([0, 5000, 10000, 15000]);
  });
  it('copes with empty and zero data', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(NaN)).toEqual([0, 1]);
  });
});

describe('charts', () => {
  const points = [{ label: '1 Oct', value: 4 }, { label: '2 Oct', value: 9 }, { label: '3 Oct', value: 7 }];
  it('describes the chart for screen readers and labels only the end point', () => {
    render(<LineChart points={points} ariaLabel="Sessions per day" />);
    expect(screen.getByRole('img', { name: 'Sessions per day' })).toBeInTheDocument();
    expect(screen.getAllByText('7').length).toBe(1); // the end label: not a number on every point
  });
  it('exposes every value without hover (keyboard-focusable hit targets)', () => {
    render(<LineChart points={points} ariaLabel="x" />);
    expect(screen.getByLabelText('2 Oct: 9')).toHaveAttribute('tabindex', '0');
  });
  it('offers a table view of exactly the same values', async () => {
    render(<ChartCard title="Sessions" points={points} valueHeader="Sessions"><LineChart points={points} ariaLabel="x" /></ChartCard>);
    await userEvent.setup().click(screen.getByRole('button', { name: 'View as table' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('2 Oct').closest('tr')).toHaveTextContent('9');
  });
  it('bar lists use one colour and show the value at the tip', () => {
    render(<BarList ariaLabel="By partner" rows={[{ label: 'ChargeZone', value: 100 }, { label: 'Statiq', value: 50 }]} />);
    expect(screen.getByRole('list', { name: 'By partner' })).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });
  it('a meter exposes its value', () => {
    render(<Meter value={73} label="Fresh data" />);
    expect(screen.getByRole('meter', { name: 'Fresh data' })).toHaveAttribute('aria-valuenow', '73');
  });
});
