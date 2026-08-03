import React from 'react';
import { useTranslation } from 'react-i18next';
import styles from './GraphAnalysisPanel.module.css';
import type { BusWithHop } from '../NetworkDiagram/utils/graphAnalysisService';

const BUS_TYPE_LABEL: Record<number, string> = {
  1: 'Load',
  2: 'Gen',
  3: 'Slack',
  4: 'Isolated',
};

interface Props {
  path: BusWithHop[];
}

export const ShortestPathResultTable: React.FC<Props> = ({ path }) => {
  const { t } = useTranslation();
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{t('common:graphAnalysis.columns.level', 'Level')}</th>
            <th>{t('common:graphAnalysis.columns.busNumber', 'Bus No.')}</th>
            <th>{t('common:graphAnalysis.columns.busName', 'Bus Name')}</th>
            <th>{t('common:graphAnalysis.columns.baseKv', 'Base kV')}</th>
            <th>{t('common:graphAnalysis.columns.busType', 'Type')}</th>
          </tr>
        </thead>
        <tbody>
          {path.map((row) => (
            <tr key={`${row.busNumber}-${row.hop}`}>
              <td className={styles.numCell}>{row.hop}</td>
              <td className={styles.numCell}>{row.busNumber}</td>
              <td>{row.busName}</td>
              <td className={styles.numCell}>{row.baseKv > 0 ? row.baseKv.toFixed(1) : '—'}</td>
              <td>{BUS_TYPE_LABEL[row.busType] ?? row.busType}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
