/**
 * Floating Save / Load toolbar for the network diagram.
 *
 * NOT MOUNTED BY DEFAULT in the standard app shell — diagram I/O is reached
 * through the menu bar (Open, Save → Diagram, Save As → Diagram, Upload →
 * Diagram) and the file-selector modal. This component remains importable
 * directly (`import { DiagramIOToolbar } from '.../DiagramIOToolbar'`) for
 * embedded / standalone scenarios where a floating button bar makes sense.
 *
 * Spec: openspec/changes/add-diagram-save-format/specs/diagram-save-format/spec.md
 * Subsequent change: openspec/changes/integrate-diagram-into-file-management/
 */

import React, { useCallback, useRef, useState } from 'react';
import { gzip } from 'pako';

import type { NetworkDiagramRef } from './NetworkDiagramContainer';
import type { DeserializeWarning, ValidationError, SerializeResult } from '../io';

const GZIP_THRESHOLD = 1_000_000;

export interface DiagramIOToolbarProps {
  diagramRef: React.RefObject<NetworkDiagramRef | null>;
  /** Title applied to saved files. Default: derived from current ISO date. */
  saveTitle?: string;
  /** Filename basename (no extension). Default: 'diagram'. */
  fileBaseName?: string;
  /** Called whenever a load produces warnings (non-fatal). */
  onWarnings?: (warnings: DeserializeWarning[]) => void;
  /** Called whenever a load fails. Caller may surface a modal listing paths. */
  onErrors?: (errors: ValidationError[]) => void;
  /** Called when a save completes successfully (after the download fires). */
  onSaved?: (result: SerializeResult) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const DiagramIOToolbar: React.FC<DiagramIOToolbarProps> = ({
  diagramRef,
  saveTitle,
  fileBaseName = 'diagram',
  onWarnings,
  onErrors,
  onSaved,
  className,
  style,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<'save' | 'load' | null>(null);

  const handleSave = useCallback(async () => {
    if (!diagramRef.current) return;
    setBusy('save');
    try {
      const result = await diagramRef.current.saveDiagram({ title: saveTitle });
      triggerDownload(result, fileBaseName);
      onSaved?.(result);
    } finally {
      setBusy(null);
    }
  }, [diagramRef, saveTitle, fileBaseName, onSaved]);

  const handleLoadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';                                // allow re-load of the same file
    if (!file) return;
    if (!diagramRef.current) {
      onErrors?.([{ path: '/', message: 'diagram not ready', keyword: 'mount' }]);
      return;
    }
    setBusy('load');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await diagramRef.current.loadDiagram(bytes);
      if (!result.ok) {
        onErrors?.(result.errors);
      } else if (result.warnings.length > 0) {
        onWarnings?.(result.warnings);
      }
    } catch (err: any) {
      console.error('[DiagramIOToolbar] load threw:', err);
      onErrors?.([{ path: '/', message: err?.message ?? String(err), keyword: 'exception' }]);
    } finally {
      setBusy(null);
    }
  }, [diagramRef, onErrors, onWarnings]);

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        gap: 8,
        padding: 6,
        background: 'rgba(255,255,255,0.85)',
        border: '1px solid rgba(0,0,0,0.1)',
        borderRadius: 6,
        ...style,
      }}
    >
      <button
        type="button"
        onClick={handleSave}
        disabled={busy !== null}
        title="Save diagram as .cyd"
      >
        {busy === 'save' ? 'Saving…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={handleLoadClick}
        disabled={busy !== null}
        title="Load diagram from .cyd / .cyd.gz / .cyd.json"
      >
        {busy === 'load' ? 'Loading…' : 'Load'}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        // No `accept` filter: `.cyd` isn't a registered extension, and OS
        // file pickers (macOS in particular) routinely hide unknown
        // extensions even when listed. Let the user pick anything; the
        // loader validates the contents.
        style={{ display: 'none' }}
        onChange={handleFile}
      />
    </div>
  );
};

function triggerDownload(result: SerializeResult, baseName: string): void {
  const bytes = new TextEncoder().encode(result.bytes);
  const useGzip = bytes.length >= GZIP_THRESHOLD;
  const blob = useGzip
    ? new Blob([gzip(bytes, { level: 6 })], { type: 'application/gzip' })
    : new Blob([bytes],                     { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = useGzip ? `${baseName}.cyd.gz` : `${baseName}.cyd`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
