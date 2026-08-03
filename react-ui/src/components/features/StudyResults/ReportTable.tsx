import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Tooltip } from '../../common/Tooltip';
import type { Column, SortSpec } from './columns';
import styles from './ReportTable.module.css';

/** Must match the fixed `.td` height in the CSS module — the virtual window
 *  is computed from it. */
const ROW_HEIGHT = 28;
/** Rows rendered beyond each edge of the visible window. */
const OVERSCAN = 12;
/** Below this row count plain rendering is cheaper than windowing. */
const VIRTUALIZE_MIN = 200;

export interface ReportTableProps {
  columns: Column[];
  rows: any[];
  /** Ordering before any header click (worst-first per tab). */
  defaultSort?: SortSpec;
}

/** Sortable, virtualized report table. Fixed row height + fixed table layout
 *  keep the scroll geometry exact, so only the visible row window (plus
 *  spacers preserving scrollbar proportions) is in the DOM. */
export const ReportTable: React.FC<ReportTableProps> = ({ columns, rows, defaultSort }) => {
  const [userSort, setUserSort] = useState<SortSpec | null>(null);
  const sort = userSort ?? defaultSort ?? null;

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    // Deterministic tiebreak: first column's label, then contingency name.
    const tie = (a: any, b: any) => {
      const fa = String(columns[0].value(a) ?? '');
      const fb = String(columns[0].value(b) ?? '');
      const byFirst = fa.localeCompare(fb, undefined, { sensitivity: 'base' });
      if (byFirst !== 0) return byFirst;
      return String(a.cont_name ?? '').localeCompare(String(b.cont_name ?? ''), undefined, {
        sensitivity: 'base',
      });
    };
    return [...rows].sort((a, b) => {
      const av = col.value(a);
      const bv = col.value(b);
      if (col.numeric) {
        const an = typeof av === 'number' ? av : null;
        const bn = typeof bv === 'number' ? bv : null;
        // Missing values always sort last, regardless of direction.
        if (an == null && bn == null) return tie(a, b);
        if (an == null) return 1;
        if (bn == null) return -1;
        return (an - bn) * dir || tie(a, b);
      }
      return (
        String(av ?? '').localeCompare(String(bv ?? ''), undefined, { sensitivity: 'base' }) * dir ||
        tie(a, b)
      );
    });
  }, [rows, columns, sort]);

  const toggleSort = (key: string) => {
    if (sort?.key === key) {
      setUserSort({ key, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    } else {
      setUserSort({ key, dir: 'asc' });
    }
  };

  // Row selection by object identity (macOS list-view highlight).
  const [selected, setSelected] = useState<any | null>(null);

  // Virtual window over the sorted rows.
  const wrapRef = useRef<HTMLDivElement>(null);
  const virtual = sorted.length >= VIRTUALIZE_MIN;
  const [range, setRange] = useState({ start: 0, end: VIRTUALIZE_MIN });

  useEffect(() => {
    if (!virtual) return;
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const start = Math.max(0, Math.floor(el.scrollTop / ROW_HEIGHT) - OVERSCAN);
      const visible = Math.ceil(el.clientHeight / ROW_HEIGHT) + 2 * OVERSCAN;
      setRange((prev) => {
        const next = { start, end: Math.min(sorted.length, start + visible) };
        return prev.start === next.start && prev.end === next.end ? prev : next;
      });
    };
    update();
    el.addEventListener('scroll', update);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro?.disconnect();
    };
  }, [virtual, sorted.length]);

  const start = virtual ? range.start : 0;
  const visibleRows = virtual ? sorted.slice(range.start, range.end) : sorted;
  const topPad = virtual ? range.start * ROW_HEIGHT : 0;
  const bottomPad = virtual ? Math.max(0, (sorted.length - range.end) * ROW_HEIGHT) : 0;

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <table className={styles.table}>
        <colgroup>
          {columns.map((col) => (
            <col key={col.key} style={col.width ? { width: col.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((col) => (
              <Tooltip
                key={col.key}
                placement="bottom"
                content={col.titleHint ? `${col.label} — ${col.titleHint}` : col.label}
                onlyWhenTruncated={!col.titleHint}
              >
                <th
                  className={`${styles.th} ${col.numeric ? styles.thNumeric : ''}`}
                  onClick={() => toggleSort(col.key)}
                >
                  {col.label}
                  <span className={styles.sortArrow}>
                    {sort?.key === col.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </span>
                </th>
              </Tooltip>
            ))}
          </tr>
        </thead>
        <tbody>
          {topPad > 0 && (
            <tr aria-hidden="true">
              <td colSpan={columns.length} className={styles.spacer} style={{ height: topPad }} />
            </tr>
          )}
          {visibleRows.map((v, i) => {
            const idx = start + i;
            const rowClass = [
              idx % 2 === 1 ? styles.rowStripe : '',
              selected === v ? styles.rowSelected : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <tr key={idx} className={rowClass || undefined} onClick={() => setSelected(v)}>
                {columns.map((col) => (
                  <Tooltip
                    key={col.key}
                    content={col.numeric ? '' : String(col.value(v) ?? '')}
                    onlyWhenTruncated
                  >
                    <td className={`${styles.td} ${col.numeric ? styles.tdNumeric : ''}`}>
                      {col.render(v)}
                    </td>
                  </Tooltip>
                ))}
              </tr>
            );
          })}
          {bottomPad > 0 && (
            <tr aria-hidden="true">
              <td colSpan={columns.length} className={styles.spacer} style={{ height: bottomPad }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
