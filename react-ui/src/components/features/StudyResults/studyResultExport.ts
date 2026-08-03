/**
 * Export helpers for a stored study result (an ACCC report).
 *
 * JSON export is the faithful raw record (metadata + full report); XLSX export
 * is a presentational workbook — a Summary sheet plus one sheet per element
 * type (Thermal, Voltage, Interface, Non-Convergence). Both cover the full
 * report, independent of any on-screen filter or sort.
 *
 * The XLSX export performs no row-level filtering: every record in
 * `report.results` is written to exactly one sheet, routed only by its
 * `type` field. Each row's `Violation` column mirrors the flow-solver's
 * `is_violation()` — `FALSE` only when the backend record has
 * `violation === false`, `TRUE` otherwise (including voltage and interface
 * records where the backend omits the field).
 */
import writeXlsxFile, { type Cell, type CellObject, type SheetData } from 'write-excel-file/browser';

/** Slugify a study-result `type` for use in a file name. */
function typeSlug(type: string | undefined): string {
  return (type || 'study-result').replace(/_/g, '-');
}

/** Build a download file name like `ac-contingency-analysis-2026-05-18.json`. */
export function studyResultFileName(meta: any, ext: string): string {
  const created = meta?.created_at ? new Date(meta.created_at) : new Date();
  const date = isNaN(created.getTime())
    ? new Date().toISOString().slice(0, 10)
    : created.toISOString().slice(0, 10);
  return `${typeSlug(meta?.type)}-${date}.${ext}`;
}

/** Trigger a browser download of a Blob. */
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Format a config object as a one-line "k: v, k: v" summary. */
function formatConfig(cfg: Record<string, any> | undefined): string {
  if (!cfg) return '';
  return Object.entries(cfg)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
}

/** A thermal row's monitored-element label (with the winding for 3-winding). */
function thermalElement(v: any): string {
  const base = v.monitored_facility || `Branch ${v.from_bus}–${v.to_bus} ${v.ckt || ''}`.trim();
  return typeof v.winding === 'number' ? `${base} (W${v.winding})` : base;
}

/** A voltage row's monitored-bus label. */
function voltageElement(v: any): string {
  return v.monitored_facility || v.bus_name || `Bus ${v.bus}`;
}

/** Mirrors the flow-solver's `is_violation()`: only an explicit `false` counts
 *  as below-limit; missing/`true`/`null`/`undefined` all count as a violation. */
function isViolation(v: any): boolean {
  return v.violation !== false;
}

/** A contingency-status row's label. */
function statusLabel(v: any): string {
  return v.status === 'islanded' ? 'Islanded' : 'Non-converged';
}

/** Download the study result as a faithful JSON file (metadata + full report). */
export function exportStudyResultJson(meta: any, report: any): void {
  const payload = JSON.stringify({ meta, report }, null, 2);
  downloadBlob(
    new Blob([payload], { type: 'application/json' }),
    studyResultFileName(meta, 'json'),
  );
}

/** A bold header cell. */
function headerCell(text: string): CellObject {
  return { value: text, type: String, fontWeight: 'bold' };
}

/** A native XLSX boolean cell — renders as TRUE/FALSE in spreadsheets. */
function boolCell(b: boolean): CellObject {
  return { value: b, type: Boolean };
}

/** A cell — typed Number when numeric, String otherwise, empty when missing.
 *  A column callback can also hand back a pre-built `CellObject` (e.g. from
 *  `boolCell`); pass those through untouched so the explicit type wins. */
function cell(value: any): Cell {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object' && 'type' in value) return value as CellObject;
  if (typeof value === 'number') return { value, type: Number };
  return { value: String(value), type: String };
}

/** One column of a per-type result sheet. */
interface Column {
  header: string;
  value: (v: any) => any;
}

// Each result type gets its own sheet with the full columns for that type.
// The monitored facility is the first column — the mon side of the mon/con pair.
const THERMAL_COLUMNS: Column[] = [
  { header: 'Monitored Element', value: thermalElement },
  { header: 'Contingency', value: (v) => v.cont_name || '(unnamed)' },
  { header: 'Base Loading (MVA)', value: (v) => v.base_loading_mva },
  { header: 'Base Loading (% normal rating)', value: (v) => v.base_loading_pct },
  { header: 'Cont. Loading (MVA)', value: (v) => v.cont_loading_mva },
  { header: 'Cont. Loading (% emergency rating)', value: (v) => v.cont_loading_pct },
  { header: 'Rating (MVA)', value: (v) => v.cont_rating_mva },
  { header: 'Violation', value: (v) => boolCell(isViolation(v)) },
];

const VOLTAGE_COLUMNS: Column[] = [
  { header: 'Monitored Bus', value: voltageElement },
  { header: 'Contingency', value: (v) => v.cont_name || '(unnamed)' },
  { header: 'Base Voltage (pu)', value: (v) => v.base_voltage_pu },
  { header: 'Cont. Voltage (pu)', value: (v) => v.cont_voltage_pu },
  { header: 'Lower Limit (pu)', value: (v) => v.volt_lower_limit_pu },
  { header: 'Upper Limit (pu)', value: (v) => v.volt_upper_limit_pu },
  { header: 'Deviation (pu)', value: (v) => v.cont_deviation_pu },
  { header: 'Violation', value: () => boolCell(true) },
];

const INTERFACE_COLUMNS: Column[] = [
  { header: 'Interface', value: (v) => v.name || '(unnamed)' },
  { header: 'Contingency', value: (v) => v.cont_name || '(unnamed)' },
  { header: 'Cont. Loading (MVA)', value: (v) => v.cont_loading_mva },
  { header: 'Cont. Loading (%)', value: (v) => v.cont_loading_pct },
  { header: 'Rating (MVA)', value: (v) => v.cont_rating_mva },
  { header: 'Violation', value: () => boolCell(true) },
];

const STATUS_COLUMNS: Column[] = [
  { header: 'Contingency', value: (v) => v.cont_name || '(unnamed)' },
  { header: 'Status', value: statusLabel },
];

/** Build a sheet's data: a bold header row followed by one row per record. */
function buildSheet(columns: Column[], rows: any[]): SheetData {
  return [
    columns.map((c) => headerCell(c.header)),
    ...rows.map((v) => columns.map((c) => cell(c.value(v)))),
  ];
}

/** Download the study result as an XLSX workbook: a Summary sheet plus a sheet
 *  per element type present in the report. */
export async function exportStudyResultXlsx(meta: any, report: any): Promise<void> {
  const s = report?.summary || {};
  const summaryData: SheetData = [
    [headerCell('Field'), headerCell('Value')],
    [cell('Analysis Type'), cell(meta?.type)],
    [cell('App Version'), cell(meta?.app_version)],
    [cell('Created'), cell(meta?.created_at ? new Date(meta.created_at).toLocaleString() : '')],
    [cell('Model File'), cell(meta?.model_file)],
    [cell('Subsystem File'), cell(meta?.sub_file)],
    [cell('Monitor File'), cell(meta?.mon_file)],
    [cell('Contingency File'), cell(meta?.con_file)],
    [cell('Session ID'), cell(meta?.session_id)],
    [cell('Power Flow Settings'), cell(formatConfig(meta?.power_flow_config))],
    [],
    [cell('Total Contingencies'), cell(s.total ?? 0)],
    [cell('With Violations'), cell(s.with_violations ?? 0)],
    [cell('Non-Converged'), cell(s.non_converged ?? 0)],
    [cell('Islanded'), cell(s.islanded ?? 0)],
  ];

  const results: any[] = report?.results || [];
  const sheets: { data: SheetData; sheet: string }[] = [
    { data: summaryData, sheet: 'Summary' },
  ];

  // One sheet per element type, in the same order as the viewer's tabs.
  // `match` routes records to a sheet by `type`; it never filters out
  // below-limit thermal rows or any other "non-violating" record — the full
  // contents of `report.results` end up in the workbook.
  const addSheet = (name: string, columns: Column[], match: (v: any) => boolean) => {
    const rows = results.filter(match);
    if (rows.length === 0) return;
    sheets.push({ data: buildSheet(columns, rows), sheet: name });
  };
  addSheet('Thermal', THERMAL_COLUMNS, (v) => v.type === 'thermal');
  addSheet('Voltage', VOLTAGE_COLUMNS, (v) => v.type === 'voltage');
  addSheet('Interface', INTERFACE_COLUMNS, (v) => v.type === 'interface');
  addSheet('Non-Convergence', STATUS_COLUMNS, (v) => !v.type);

  try {
    await writeXlsxFile(sheets).toFile(studyResultFileName(meta, 'xlsx'));
  } catch (err) {
    console.error('[studyResultExport] XLSX export failed:', err);
  }
}
