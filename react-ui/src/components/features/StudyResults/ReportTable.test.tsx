import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReportTable } from './ReportTable';
import { TABS } from './columns';

const thermalTab = TABS.find((t) => t.key === 'thermal')!;

/** Synthetic thermal rows with distinct loading percents. */
function makeRows(n: number): any[] {
  return Array.from({ length: n }, (_, i) => ({
    type: 'thermal',
    monitored_facility: `LINE-${i}`,
    cont_name: `CON-${i}`,
    base_loading_mva: 10,
    base_loading_pct: 50,
    cont_loading_mva: 20,
    cont_loading_pct: (i * 7919) % 5000, // deterministic pseudo-shuffle
    cont_rating_mva: 100,
    violation: true,
  }));
}

/** Data rows only (the virtual-window spacers are aria-hidden). */
function dataRows(): HTMLElement[] {
  return screen
    .getAllByRole('row')
    .filter((r) => r.querySelector('td') && r.getAttribute('aria-hidden') !== 'true');
}

test('virtualizes large reports: only the visible window is in the DOM', () => {
  const rows = makeRows(5000);
  render(<ReportTable columns={thermalTab.columns} rows={rows} />);
  // jsdom reports clientHeight 0, so the window is just the overscan — the
  // point is that 5000 rows must NOT all be mounted.
  expect(dataRows().length).toBeLessThan(100);
});

test('scrolling moves the virtual window', () => {
  const rows = makeRows(5000);
  const { container } = render(<ReportTable columns={thermalTab.columns} rows={rows} />);
  const first = dataRows()[0].textContent;
  const wrap = container.firstElementChild as HTMLElement;
  Object.defineProperty(wrap, 'clientHeight', { value: 400, configurable: true });
  wrap.scrollTop = 28 * 2500; // ROW_HEIGHT * mid-list index
  fireEvent.scroll(wrap);
  expect(dataRows()[0].textContent).not.toEqual(first);
});

test('small reports render every row without spacers', () => {
  const rows = makeRows(50);
  const { container } = render(<ReportTable columns={thermalTab.columns} rows={rows} />);
  expect(dataRows().length).toBe(50);
  expect(container.querySelector('tr[aria-hidden="true"]')).toBeNull();
});

test('worst-first default sort puts the highest contingency loading on top', () => {
  const rows = makeRows(50);
  render(
    <ReportTable columns={thermalTab.columns} rows={rows} defaultSort={thermalTab.defaultSort} />,
  );
  const worst = Math.max(...rows.map((r) => r.cont_loading_pct));
  const firstCells = dataRows()[0].textContent || '';
  expect(firstCells).toContain(`${worst.toFixed(1)}%`);
});

test('hovering a header shows the shared styled tooltip with the full name', async () => {
  const rows = makeRows(5);
  render(<ReportTable columns={thermalTab.columns} rows={rows} />);
  fireEvent.mouseEnter(screen.getByText('Cont. (% emerg.)'));
  const tip = await screen.findByRole('tooltip');
  expect(tip.textContent).toContain('Cont. (% emerg.) — Contingency loading as a percent');
  fireEvent.mouseLeave(screen.getByText('Cont. (% emerg.)'));
  expect(screen.queryByRole('tooltip')).toBeNull();
});

test('header click overrides the default sort', () => {
  const rows = makeRows(20);
  render(
    <ReportTable columns={thermalTab.columns} rows={rows} defaultSort={thermalTab.defaultSort} />,
  );
  fireEvent.click(screen.getByText('Contingency'));
  expect(dataRows()[0].textContent).toContain('CON-0');
});
