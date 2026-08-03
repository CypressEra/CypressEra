import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './GraphAnalysisPanel.module.css';
import type { NeighbourElement, NeighbourElementKind } from '../NetworkDiagram/utils/graphAnalysisService';

type TabKind = NeighbourElementKind;

const TAB_ORDER: TabKind[] = [
  'Bus', 'AcLine', 'Transformer', 'Generator', 'Load', 'FixShunt', 'SwShunt', 'TwoTermDc', 'VscDc',
];

function tabLabel(kind: TabKind, t: (key: string, fb: string) => string): string {
  const map: Record<TabKind, string> = {
    Bus: t('common:graphAnalysis.neighbourElements.types.bus', 'Bus'),
    AcLine: t('common:graphAnalysis.neighbourElements.types.acLine', 'AC Line'),
    Transformer: t('common:graphAnalysis.neighbourElements.types.transformer', 'Transformer'),
    Generator: t('common:graphAnalysis.neighbourElements.types.generator', 'Generator'),
    Load: t('common:graphAnalysis.neighbourElements.types.load', 'Load'),
    FixShunt: t('common:graphAnalysis.neighbourElements.types.fixShunt', 'Fixed Shunt'),
    SwShunt: t('common:graphAnalysis.neighbourElements.types.swShunt', 'Switched Shunt'),
    TwoTermDc: t('common:graphAnalysis.neighbourElements.types.twoTermDc', 'Two-Term DC'),
    VscDc: t('common:graphAnalysis.neighbourElements.types.vscDc', 'VSC DC'),
  };
  return map[kind];
}

function fmt(v: unknown, decimals = 2): string {
  if (v === undefined || v === null) return '—';
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : n.toFixed(decimals);
}

function BusRows({ elements }: { elements: NeighbourElement[] }) {
  const { t } = useTranslation();
  return (
    <table className={styles.table}>
      <thead><tr>
        <th>{t('common:graphAnalysis.columns.level', 'Level')}</th>
        <th>{t('common:graphAnalysis.columns.busNumber', 'Bus No.')}</th>
        <th>{t('common:graphAnalysis.columns.busName', 'Bus Name')}</th>
        <th>{t('common:graphAnalysis.columns.baseKv', 'Base kV')}</th>
        <th>{t('common:graphAnalysis.columns.busType', 'Type')}</th>
      </tr></thead>
      <tbody>
        {elements.filter(e => e.kind === 'Bus').map((e) => {
          const d = (e as Extract<NeighbourElement, { kind: 'Bus' }>).data;
          return (
            <tr key={d.ibus}>
              <td className={styles.numCell}>{e.hopLevel}</td>
              <td className={styles.numCell}>{d.ibus}</td>
              <td>{d.name ?? '—'}</td>
              <td className={styles.numCell}>{d.baskv ? d.baskv.toFixed(1) : '—'}</td>
              <td>{d.ide ?? '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AcLineRows({ elements }: { elements: NeighbourElement[] }) {
  const { t } = useTranslation();
  return (
    <table className={styles.table}>
      <thead><tr>
        <th>{t('common:graphAnalysis.columns.level', 'Level')}</th>
        <th>{t('common:graphAnalysis.columns.fromBus', 'From Bus')}</th>
        <th>{t('common:graphAnalysis.columns.toBus', 'To Bus')}</th>
        <th>{t('common:graphAnalysis.columns.lineId', 'Line ID')}</th>
        <th>{t('common:graphAnalysis.columns.inService', 'In Service')}</th>
      </tr></thead>
      <tbody>
        {elements.filter(e => e.kind === 'AcLine').map((e) => {
          const d = (e as Extract<NeighbourElement, { kind: 'AcLine' }>).data;
          return (
            <tr key={`${d.ibus}-${d.jbus}-${d.ckt}-${e.hopLevel}`}>
              <td className={styles.numCell}>{e.hopLevel}</td>
              <td className={styles.numCell}>{d.ibus}</td>
              <td className={styles.numCell}>{d.jbus}</td>
              <td className={styles.numCell}>{d.ckt ?? '1'}</td>
              <td>{(d.stat ?? 1) === 1 ? '✓' : '✗'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TransformerRows({ elements }: { elements: NeighbourElement[] }) {
  const { t } = useTranslation();
  return (
    <table className={styles.table}>
      <thead><tr>
        <th>{t('common:graphAnalysis.columns.level', 'Level')}</th>
        <th>{t('common:graphAnalysis.columns.transformerId', 'Transformer ID')}</th>
        <th>{t('common:graphAnalysis.columns.fromBus', 'From Bus')}</th>
        <th>{t('common:graphAnalysis.columns.toBus', 'To Bus')}</th>
        <th>{t('common:graphAnalysis.columns.ratingMva', 'Rating (MVA)')}</th>
      </tr></thead>
      <tbody>
        {elements.filter(e => e.kind === 'Transformer').map((e) => {
          const d = (e as Extract<NeighbourElement, { kind: 'Transformer' }>).data;
          return (
            <tr key={`${d.ibus}-${d.jbus}-${d.ckt ?? '1'}-${e.hopLevel}`}>
              <td className={styles.numCell}>{e.hopLevel}</td>
              <td>{d.ckt ?? '1'}</td>
              <td className={styles.numCell}>{d.ibus}</td>
              <td className={styles.numCell}>{d.jbus}</td>
              <td className={styles.numCell}>{fmt(d.sbase1_2, 1)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function GeneratorRows({ elements }: { elements: NeighbourElement[] }) {
  const { t } = useTranslation();
  return (
    <table className={styles.table}>
      <thead><tr>
        <th>{t('common:graphAnalysis.columns.level', 'Level')}</th>
        <th>{t('common:graphAnalysis.columns.generatorId', 'Generator ID')}</th>
        <th>{t('common:graphAnalysis.columns.bus', 'Bus')}</th>
        <th>{t('common:graphAnalysis.columns.mwOutput', 'MW')}</th>
        <th>{t('common:graphAnalysis.columns.mvarOutput', 'MVAr')}</th>
      </tr></thead>
      <tbody>
        {elements.filter(e => e.kind === 'Generator').map((e) => {
          const d = (e as Extract<NeighbourElement, { kind: 'Generator' }>).data;
          return (
            <tr key={`${d.ibus}/${d.machid ?? '1'}/${e.hopLevel}`}>
              <td className={styles.numCell}>{e.hopLevel}</td>
              <td>{d.machid ?? '1'}</td>
              <td className={styles.numCell}>{d.ibus}</td>
              <td className={styles.numCell}>{fmt(d.pg)}</td>
              <td className={styles.numCell}>{fmt(d.qg)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function LoadRows({ elements }: { elements: NeighbourElement[] }) {
  const { t } = useTranslation();
  return (
    <table className={styles.table}>
      <thead><tr>
        <th>{t('common:graphAnalysis.columns.level', 'Level')}</th>
        <th>{t('common:graphAnalysis.columns.loadId', 'Load ID')}</th>
        <th>{t('common:graphAnalysis.columns.bus', 'Bus')}</th>
        <th>{t('common:graphAnalysis.columns.mwLoad', 'MW')}</th>
        <th>{t('common:graphAnalysis.columns.mvarLoad', 'MVAr')}</th>
      </tr></thead>
      <tbody>
        {elements.filter(e => e.kind === 'Load').map((e) => {
          const d = (e as Extract<NeighbourElement, { kind: 'Load' }>).data;
          return (
            <tr key={`${d.ibus}/${d.loadid ?? '1'}/${e.hopLevel}`}>
              <td className={styles.numCell}>{e.hopLevel}</td>
              <td>{d.loadid ?? '1'}</td>
              <td className={styles.numCell}>{d.ibus}</td>
              <td className={styles.numCell}>{fmt(d.pl)}</td>
              <td className={styles.numCell}>{fmt(d.ql)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function FixShuntRows({ elements }: { elements: NeighbourElement[] }) {
  const { t } = useTranslation();
  return (
    <table className={styles.table}>
      <thead><tr>
        <th>{t('common:graphAnalysis.columns.level', 'Level')}</th>
        <th>{t('common:graphAnalysis.columns.shuntId', 'Shunt ID')}</th>
        <th>{t('common:graphAnalysis.columns.bus', 'Bus')}</th>
        <th>{t('common:graphAnalysis.columns.glMw', 'GL (MW)')}</th>
        <th>{t('common:graphAnalysis.columns.blMvar', 'BL (MVAr)')}</th>
      </tr></thead>
      <tbody>
        {elements.filter(e => e.kind === 'FixShunt').map((e) => {
          const d = (e as Extract<NeighbourElement, { kind: 'FixShunt' }>).data;
          return (
            <tr key={`${d.ibus}/${d.shntid ?? '1'}/${e.hopLevel}`}>
              <td className={styles.numCell}>{e.hopLevel}</td>
              <td>{d.shntid ?? '1'}</td>
              <td className={styles.numCell}>{d.ibus}</td>
              <td className={styles.numCell}>{fmt(d.gl)}</td>
              <td className={styles.numCell}>{fmt(d.bl)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SwShuntRows({ elements }: { elements: NeighbourElement[] }) {
  const { t } = useTranslation();
  return (
    <table className={styles.table}>
      <thead><tr>
        <th>{t('common:graphAnalysis.columns.level', 'Level')}</th>
        <th>{t('common:graphAnalysis.columns.shuntId', 'Shunt ID')}</th>
        <th>{t('common:graphAnalysis.columns.bus', 'Bus')}</th>
        <th>{t('common:graphAnalysis.columns.bInitMvar', 'BInit (MVAr)')}</th>
      </tr></thead>
      <tbody>
        {elements.filter(e => e.kind === 'SwShunt').map((e) => {
          const d = (e as Extract<NeighbourElement, { kind: 'SwShunt' }>).data;
          return (
            <tr key={`${d.ibus}/${d.shntid ?? d.swid ?? '1'}/${e.hopLevel}`}>
              <td className={styles.numCell}>{e.hopLevel}</td>
              <td>{d.shntid ?? d.swid ?? '1'}</td>
              <td className={styles.numCell}>{d.ibus}</td>
              <td className={styles.numCell}>—</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TwoTermDcRows({ elements }: { elements: NeighbourElement[] }) {
  const { t } = useTranslation();
  return (
    <table className={styles.table}>
      <thead><tr>
        <th>{t('common:graphAnalysis.columns.level', 'Level')}</th>
        <th>{t('common:graphAnalysis.columns.dcLineId', 'DC Line ID')}</th>
        <th>{t('common:graphAnalysis.columns.rectifierBus', 'Rectifier Bus')}</th>
        <th>{t('common:graphAnalysis.columns.inverterBus', 'Inverter Bus')}</th>
        <th>{t('common:graphAnalysis.columns.setvl', 'Setvl')}</th>
      </tr></thead>
      <tbody>
        {elements.filter(e => e.kind === 'TwoTermDc').map((e) => {
          const d = (e as Extract<NeighbourElement, { kind: 'TwoTermDc' }>).data;
          return (
            <tr key={`${d.ipi}-${d.ipr}-${d.ckt ?? '1'}-${e.hopLevel}`}>
              <td className={styles.numCell}>{e.hopLevel}</td>
              <td>{d.name ?? d.ckt ?? '1'}</td>
              <td className={styles.numCell}>{d.ipi}</td>
              <td className={styles.numCell}>{d.ipr}</td>
              <td className={styles.numCell}>{fmt((d as any).setvl)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function VscDcRows({ elements }: { elements: NeighbourElement[] }) {
  const { t } = useTranslation();
  return (
    <table className={styles.table}>
      <thead><tr>
        <th>{t('common:graphAnalysis.columns.level', 'Level')}</th>
        <th>{t('common:graphAnalysis.columns.vscLineId', 'VSC Line ID')}</th>
        <th>{t('common:graphAnalysis.columns.bus1', 'Bus 1')}</th>
        <th>{t('common:graphAnalysis.columns.bus2', 'Bus 2')}</th>
        <th>{t('common:graphAnalysis.columns.mode', 'Mode')}</th>
      </tr></thead>
      <tbody>
        {elements.filter(e => e.kind === 'VscDc').map((e) => {
          const d = (e as Extract<NeighbourElement, { kind: 'VscDc' }>).data;
          return (
            <tr key={`${d.ibus1}-${d.ibus2}-${e.hopLevel}`}>
              <td className={styles.numCell}>{e.hopLevel}</td>
              <td>{d.name ?? '—'}</td>
              <td className={styles.numCell}>{d.ibus1}</td>
              <td className={styles.numCell}>{d.ibus2}</td>
              <td>{fmt((d as any).mode, 0)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

interface Props {
  elements: NeighbourElement[];
}

export const NeighbourElementsResultTabs: React.FC<Props> = ({ elements }) => {
  const { t } = useTranslation();

  const countByKind = new Map<TabKind, number>();
  for (const el of elements) {
    countByKind.set(el.kind, (countByKind.get(el.kind) ?? 0) + 1);
  }

  const visibleTabs = TAB_ORDER.filter((k) => (countByKind.get(k) ?? 0) > 0);
  const [activeTab, setActiveTab] = useState<TabKind>(visibleTabs[0] ?? 'Bus');

  const currentTab = visibleTabs.includes(activeTab) ? activeTab : visibleTabs[0];

  const renderTable = () => {
    switch (currentTab) {
      case 'Bus': return <BusRows elements={elements} />;
      case 'AcLine': return <AcLineRows elements={elements} />;
      case 'Transformer': return <TransformerRows elements={elements} />;
      case 'Generator': return <GeneratorRows elements={elements} />;
      case 'Load': return <LoadRows elements={elements} />;
      case 'FixShunt': return <FixShuntRows elements={elements} />;
      case 'SwShunt': return <SwShuntRows elements={elements} />;
      case 'TwoTermDc': return <TwoTermDcRows elements={elements} />;
      case 'VscDc': return <VscDcRows elements={elements} />;
      default: return null;
    }
  };

  return (
    <div className={styles.tabsContainer}>
      <div className={styles.tabBar} role="tablist">
        {visibleTabs.map((kind) => (
          <button
            key={kind}
            role="tab"
            aria-selected={kind === currentTab}
            className={`${styles.tab} ${kind === currentTab ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(kind)}
          >
            {tabLabel(kind, t)}
            <span className={styles.tabBadge}>{countByKind.get(kind)}</span>
          </button>
        ))}
      </div>
      <div className={styles.tableWrapper}>
        {renderTable()}
      </div>
    </div>
  );
};
