import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import '../../../i18n';
import { StudyResultModal } from './StudyResultModal';
import { PowerFlowApp } from '../../../sdk';

jest.mock('../../../sdk', () => ({
  PowerFlowApp: { getStudyResult: jest.fn() },
}));

const RESULT = {
  meta: {
    type: 'ac_contingency_analysis',
    created_at: '2026-07-11T09:41:00Z',
    app_version: '1.2.3',
    model_file: 'ieee25.rawx',
    sub_file: 'ieee25.sub',
    mon_file: 'ieee25.mon',
    con_file: 'ieee25.con',
    power_flow_config: {
      method: 'fnsl',
      flat_start: 'false',
      very_long_setting_name_for_layout: 'a-rather-long-value-that-must-stay-visible',
    },
  },
  report: {
    summary: { total: 44, with_violations: 2, non_converged: 1, islanded: 1 },
    results: [
      {
        type: 'thermal',
        monitored_facility: 'LINE-101-102',
        cont_name: 'C-THERM',
        base_loading_mva: 80,
        base_loading_pct: 60,
        cont_loading_mva: 130,
        cont_loading_pct: 120,
        cont_rating_mva: 110,
        violation: true,
      },
      {
        type: 'voltage',
        bus: 106,
        bus_name: 'MIDBUS',
        cont_name: 'C-VOLT',
        base_voltage_pu: 1.0,
        cont_voltage_pu: 0.63,
        volt_lower_limit_pu: 0.9,
        volt_upper_limit_pu: 1.1,
        cont_deviation_pu: -0.37,
      },
      { status: 'islanded', cont_name: 'C-ISLAND' },
      { status: 'non-converged', cont_name: 'C-DIVERGE' },
    ],
  },
};

beforeEach(() => {
  (PowerFlowApp.getStudyResult as jest.Mock).mockResolvedValue(RESULT);
});

async function openDialog() {
  render(<StudyResultModal isOpen onClose={() => {}} resultId="r1" />);
  // The report is loaded when the thermal tab appears.
  await screen.findByText('Thermal');
}

test('results-first: no metadata panel in flow, provenance in the window title', async () => {
  await openDialog();
  // The old always-visible metadata panel is gone …
  expect(screen.queryByText('Power flow setting')).toBeNull();
  // … and the document-style title carries the provenance: model, .con file,
  // and created time (locale/timezone-dependent, so match the prefix).
  expect(
    screen.getByText((text) =>
      text.startsWith('AC Contingency Analysis — ieee25.rawx · ieee25.con · '),
    ),
  ).toBeInTheDocument();
});

test('no headline counters in the toolbar — counts live on the tab pills', async () => {
  await openDialog();
  expect(screen.queryByText('Violations')).toBeNull();
  expect(screen.queryByText('Non-converged')).toBeNull();
  expect(screen.queryByText('Islanded')).toBeNull();
  // No emoji anywhere in the dialog.
  const emoji = new RegExp('[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}]', 'u');
  expect(document.body.textContent).not.toMatch(emoji);
});

test('the Status tab lists non-converged and islanded contingencies', async () => {
  await openDialog();
  fireEvent.click(screen.getByText('Non-Convergence'));
  expect(screen.getByText('C-ISLAND')).toBeInTheDocument();
  expect(screen.getByText('C-DIVERGE')).toBeInTheDocument();
});

test('Details opens the run-info popover as an overlay and Escape closes it', async () => {
  await openDialog();
  fireEvent.click(screen.getByText('Details'));
  expect(screen.getByText('Power flow setting')).toBeInTheDocument();
  // The popover carries its anchor arrow.
  const popover = screen.getByRole('dialog', { name: 'Details' });
  expect(popover.firstElementChild?.className).toContain('arrow');
  // Portalled to document.body: the modal is a transformed ancestor, which
  // would turn position:fixed into modal-relative coordinates and clip the
  // panel at the modal's edge.
  expect(popover.parentElement).toBe(document.body);
  expect(screen.getByText('fnsl')).toBeInTheDocument();
  // Keys render prettified (underscores out, first letter capitalized) …
  expect(screen.getByText('Flat start')).toBeInTheDocument();
  expect(screen.queryByText('flat_start')).toBeNull();
  // … and a long pair spans the full row so its value stays visible.
  const longVal = screen.getByText('a-rather-long-value-that-must-stay-visible');
  expect(longVal.parentElement?.className).toContain('settingItemWide');
  // The popover carries the contingency total (was the status bar's job).
  expect(screen.getByText('Contingencies')).toBeInTheDocument();
  expect(screen.getByText('44')).toBeInTheDocument();
  expect(screen.getByText('ieee25.sub')).toBeInTheDocument();
  expect(screen.getByText('CypressEra v1.2.3')).toBeInTheDocument();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByText('Power flow setting')).toBeNull();
});

test('name filter and violations-only compose', async () => {
  await openDialog();
  fireEvent.click(screen.getByLabelText('Violations only'));
  fireEvent.change(screen.getByPlaceholderText('Filter contingency…'), {
    target: { value: 'C-VOLT' },
  });
  // Thermal tab empties; voltage tab still holds its filtered row.
  fireEvent.click(screen.getByText('Voltage'));
  expect(screen.getByText('MIDBUS')).toBeInTheDocument();
});
