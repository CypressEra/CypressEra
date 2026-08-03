import React from 'react';
import styles from './columns.module.css';

/** Format a number to fixed digits, or '—' when it is missing. */
function fmt(x: any, digits: number): string {
  return typeof x === 'number' ? x.toFixed(digits) : '—';
}

/** Format a percentage value, or '—' when missing. */
function pct(x: any, digits = 0): string {
  return typeof x === 'number' ? `${x.toFixed(digits)}%` : '—';
}

/** Monitored-element label for a thermal row. */
function thermalElement(v: any): string {
  const base =
    v.monitored_facility || `Branch ${v.from_bus}–${v.to_bus} ${v.ckt || ''}`.trim();
  return typeof v.winding === 'number' ? `${base} (W${v.winding})` : base;
}

/** Monitored-bus label for a voltage row. */
function voltageElement(v: any): string {
  return v.monitored_facility || v.bus_name || `Bus ${v.bus}`;
}

/** Whether a contingency thermal row's monitored element was already overloaded
 *  in the base case — i.e. at or above 100% of its normal rating before any
 *  contingency. Base-case rows are excluded: such a row *is* the base case. */
function isPreExistingOverload(v: any): boolean {
  return (
    typeof v.base_loading_pct === 'number' &&
    v.base_loading_pct >= 100 &&
    v.cont_name !== 'Base Case'
  );
}

/** Whether a voltage row's contingency voltage is outside its monitor band. */
function isOutOfBand(v: any): boolean {
  if (typeof v.cont_voltage_pu !== 'number') return false;
  return (
    (typeof v.volt_lower_limit_pu === 'number' && v.cont_voltage_pu < v.volt_lower_limit_pu) ||
    (typeof v.volt_upper_limit_pu === 'number' && v.cont_voltage_pu > v.volt_upper_limit_pu)
  );
}

/** A table column over raw `EngineViolation` rows. `value` drives sorting,
 *  `render` is the cell content, `width` feeds the fixed-layout colgroup. */
export interface Column {
  key: string;
  label: string;
  numeric?: boolean;
  /** Column width for the fixed table layout (e.g. '10%'). */
  width?: string;
  /** Optional tooltip shown on the column header. */
  titleHint?: string;
  value: (v: any) => number | string | null;
  render: (v: any) => React.ReactNode;
}

/** Initial ordering of a tab before any header click. */
export interface SortSpec {
  key: string;
  dir: 'asc' | 'desc';
}

const contingencyCol = (width: string): Column => ({
  key: 'contingency',
  label: 'Contingency',
  width,
  value: (v) => v.cont_name || '',
  render: (v) => v.cont_name || '(unnamed)',
});

const THERMAL_COLUMNS: Column[] = [
  {
    key: 'element',
    label: 'Monitored Element',
    width: '24%',
    value: thermalElement,
    render: (v) => (
      <>
        {thermalElement(v)}
        {isPreExistingOverload(v) && (
          <span
            className={styles.preExistingTag}
            title="Already above its normal rating in the base case — this overload pre-dates the contingency"
          >
            base overload
          </span>
        )}
      </>
    ),
  },
  contingencyCol('17%'),
  { key: 'baseMva', label: 'Base (MVA)', numeric: true, width: '9%', value: (v) => v.base_loading_mva ?? null, render: (v) => fmt(v.base_loading_mva, 1) },
  { key: 'basePct', label: 'Base (% normal)', numeric: true, width: '10%', titleHint: 'Base-case loading as a percent of the normal rating (RATE A)', value: (v) => v.base_loading_pct ?? null, render: (v) => pct(v.base_loading_pct) },
  { key: 'contMva', label: 'Cont. (MVA)', numeric: true, width: '9%', value: (v) => v.cont_loading_mva ?? null, render: (v) => fmt(v.cont_loading_mva, 1) },
  {
    key: 'contPct',
    label: 'Cont. (% emerg.)',
    numeric: true,
    width: '11%',
    titleHint: 'Contingency loading as a percent of the emergency rating (RATE B)',
    value: (v) => v.cont_loading_pct ?? null,
    render: (v) => {
      const p = v.cont_loading_pct;
      const cls =
        typeof p === 'number' && p >= 100
          ? styles.sevHigh
          : v.violation !== false
            ? styles.sevWarn
            : undefined;
      return <span className={cls}>{pct(p, 1)}</span>;
    },
  },
  { key: 'rating', label: 'Rating (MVA)', numeric: true, width: '10%', value: (v) => v.cont_rating_mva ?? null, render: (v) => fmt(v.cont_rating_mva, 0) },
  {
    key: 'result',
    label: 'Result',
    width: '10%',
    value: (v) => (v.violation === false ? 0 : 1),
    render: (v) => {
      const below = v.violation === false;
      return (
        <span className={below ? styles.resultBelow : styles.resultViolation}>
          {below ? 'Below limit' : 'Violation'}
        </span>
      );
    },
  },
];

const VOLTAGE_COLUMNS: Column[] = [
  { key: 'element', label: 'Monitored Bus', width: '22%', value: voltageElement, render: voltageElement },
  contingencyCol('18%'),
  { key: 'baseV', label: 'Base (pu)', numeric: true, width: '10%', value: (v) => v.base_voltage_pu ?? null, render: (v) => fmt(v.base_voltage_pu, 3) },
  {
    key: 'contV',
    label: 'Cont. (pu)',
    numeric: true,
    width: '10%',
    value: (v) => v.cont_voltage_pu ?? null,
    render: (v) => (
      <span className={isOutOfBand(v) ? styles.sevHigh : undefined}>
        {fmt(v.cont_voltage_pu, 3)}
      </span>
    ),
  },
  { key: 'lower', label: 'Lower (pu)', numeric: true, width: '10%', value: (v) => v.volt_lower_limit_pu ?? null, render: (v) => fmt(v.volt_lower_limit_pu, 3) },
  { key: 'upper', label: 'Upper (pu)', numeric: true, width: '10%', value: (v) => v.volt_upper_limit_pu ?? null, render: (v) => fmt(v.volt_upper_limit_pu, 3) },
  {
    key: 'dev',
    label: 'Deviation (pu)',
    numeric: true,
    width: '10%',
    titleHint: 'Sorted by magnitude — the largest excursion in either direction is worst',
    value: (v) => (typeof v.cont_deviation_pu === 'number' ? Math.abs(v.cont_deviation_pu) : null),
    render: (v) => fmt(v.cont_deviation_pu, 3),
  },
  {
    key: 'result',
    label: 'Result',
    width: '10%',
    value: () => 1,
    render: () => <span className={styles.resultViolation}>Violation</span>,
  },
];

const INTERFACE_COLUMNS: Column[] = [
  { key: 'element', label: 'Interface', width: '26%', value: (v) => v.name || '', render: (v) => v.name || '(unnamed)' },
  contingencyCol('22%'),
  { key: 'contMva', label: 'Cont. (MVA)', numeric: true, width: '13%', value: (v) => v.cont_loading_mva ?? null, render: (v) => fmt(v.cont_loading_mva, 1) },
  {
    key: 'contPct',
    label: 'Cont. (%)',
    numeric: true,
    width: '13%',
    value: (v) => v.cont_loading_pct ?? null,
    render: (v) => {
      const p = v.cont_loading_pct;
      const cls = typeof p === 'number' && p >= 100 ? styles.sevHigh : styles.sevWarn;
      return <span className={cls}>{pct(p, 1)}</span>;
    },
  },
  { key: 'rating', label: 'Rating (MVA)', numeric: true, width: '13%', value: (v) => v.cont_rating_mva ?? null, render: (v) => fmt(v.cont_rating_mva, 0) },
  {
    key: 'result',
    label: 'Result',
    width: '13%',
    value: () => 1,
    render: () => <span className={styles.resultViolation}>Violation</span>,
  },
];

const STATUS_COLUMNS: Column[] = [
  contingencyCol('60%'),
  {
    key: 'status',
    label: 'Status',
    width: '40%',
    value: (v) => v.status || '',
    render: (v) => (
      <span className={styles.resultStatus}>
        {v.status === 'islanded' ? 'Islanded' : 'Non-converged'}
      </span>
    ),
  },
];

export type TabKey = 'thermal' | 'voltage' | 'interface' | 'status';

export const TABS: {
  key: TabKey;
  titleKey: string;
  fallback: string;
  columns: Column[];
  /** Worst-first ordering before any header click. */
  defaultSort: SortSpec;
}[] = [
  { key: 'thermal', titleKey: 'studyResult.sectionThermal', fallback: 'Thermal', columns: THERMAL_COLUMNS, defaultSort: { key: 'contPct', dir: 'desc' } },
  { key: 'voltage', titleKey: 'studyResult.sectionVoltage', fallback: 'Voltage', columns: VOLTAGE_COLUMNS, defaultSort: { key: 'dev', dir: 'desc' } },
  { key: 'interface', titleKey: 'studyResult.sectionInterface', fallback: 'Interface', columns: INTERFACE_COLUMNS, defaultSort: { key: 'contPct', dir: 'desc' } },
  { key: 'status', titleKey: 'studyResult.sectionStatus', fallback: 'Non-Convergence', columns: STATUS_COLUMNS, defaultSort: { key: 'contingency', dir: 'asc' } },
];

/** The tab a report row belongs to. */
export function rowTab(v: any): TabKey {
  if (v.type === 'voltage') return 'voltage';
  if (v.type === 'interface') return 'interface';
  if (v.type === 'thermal') return 'thermal';
  return 'status';
}
