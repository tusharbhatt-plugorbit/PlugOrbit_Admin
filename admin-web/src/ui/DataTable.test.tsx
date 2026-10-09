import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataTable, type Column } from './DataTable';

interface Row { id: string; name: string; kwh: number }
const rows: Row[] = [{ id: 'a', name: 'Bravo', kwh: 30 }, { id: 'b', name: 'Alpha', kwh: 50 }, { id: 'c', name: 'Charlie', kwh: 10 }];
const columns: Column<Row>[] = [
  { key: 'name', header: 'Station', sortValue: (r) => r.name, render: (r) => r.name },
  { key: 'kwh', header: 'kWh', align: 'right', sortValue: (r) => r.kwh, render: (r) => r.kwh },
];
const names = () => within(screen.getAllByRole('rowgroup')[1]).getAllByRole('row').map((r) => r.querySelector('td')!.textContent);

describe('DataTable', () => {
  it('sorts ascending, then descending, then back to the original order', async () => {
    render(<DataTable caption="t" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const user = userEvent.setup();
    expect(names()).toEqual(['Bravo', 'Alpha', 'Charlie']);
    await user.click(screen.getByRole('columnheader', { name: /Station/ }));
    expect(names()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    await user.click(screen.getByRole('columnheader', { name: /Station/ }));
    expect(names()).toEqual(['Charlie', 'Bravo', 'Alpha']);
    await user.click(screen.getByRole('columnheader', { name: /Station/ }));
    expect(names()).toEqual(['Bravo', 'Alpha', 'Charlie']);
  });
  it('sorts numbers numerically, not as text', async () => {
    render(<DataTable caption="t" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    await userEvent.setup().click(screen.getByRole('columnheader', { name: /kWh/ }));
    expect(names()).toEqual(['Charlie', 'Bravo', 'Alpha']); // 10, 30, 50
  });
  it('opens a row on click and on Enter, but not when an inline action is used', async () => {
    const onRow = vi.fn(), onAction = vi.fn();
    render(<DataTable caption="t" columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={onRow} actions={(r) => <button onClick={() => onAction(r.id)}>Act {r.id}</button>} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Alpha'));
    expect(onRow).toHaveBeenCalledWith(rows[1]);
    await user.click(screen.getByText('Act a'));
    expect(onAction).toHaveBeenCalledWith('a');
    expect(onRow).toHaveBeenCalledTimes(1);
  });
  it('pages long lists and says where you are', async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: String(i), name: `S${i}`, kwh: i }));
    render(<DataTable caption="t" columns={columns} rows={many} rowKey={(r) => r.id} pageSize={25} />);
    expect(screen.getByText('Showing 1–25 of 60')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Showing 26–50 of 60')).toBeInTheDocument();
  });
  it('is announced with a caption for screen readers', () => {
    render(<DataTable caption="Stations" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.getByRole('table', { name: 'Stations' })).toBeInTheDocument();
  });
});
