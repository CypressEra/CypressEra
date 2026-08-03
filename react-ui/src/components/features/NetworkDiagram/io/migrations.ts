/**
 * Schema migration framework for cypressera.diagram documents.
 *
 * MAJOR version mismatches are rejected (the loader cannot project a future
 * format onto its own knowledge). MINOR version mismatches are walked through
 * the registered migration chain in order.
 *
 * v1.0 ships with the registry skeleton and zero registered migrations.
 * Future versions register entries via `registerMigration`.
 *
 * Spec: openspec/changes/add-diagram-save-format/specs/diagram-save-format/spec.md
 * (Requirement: Versioning and migration framework)
 */

import type { MigrationEntry } from './document';
import { CURRENT_SCHEMA_VERSION } from './document';

export interface Migration {
  /** Source version this migration applies to (e.g. "1.0"). */
  from: string;
  /** Target version produced by this migration (e.g. "1.1"). */
  to: string;
  /** Pure function transforming a `from`-shaped doc to a `to`-shaped doc. */
  apply: (doc: any) => any;
}

const registry: Migration[] = [];

/** Register a migration step. Intended for v1.x+ schema additions. */
export function registerMigration(m: Migration): void {
  if (registry.some(r => r.from === m.from && r.to === m.to)) {
    throw new Error(`migration ${m.from} → ${m.to} is already registered`);
  }
  registry.push(m);
}

/** Test-only helper. */
export function _clearMigrations(): void {
  registry.length = 0;
}

/** Read-only snapshot of currently registered migrations. */
export function listMigrations(): readonly Migration[] {
  return registry.slice();
}

export interface MigrateResult {
  doc: any;
  applied: MigrationEntry[];
}

export type ParsedVersion = { major: number; minor: number; patch: number };

export function parseVersion(v: string): ParsedVersion {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(v);
  if (!m) throw new Error(`invalid version string: ${v}`);
  return { major: +m[1], minor: +m[2], patch: m[3] ? +m[3] : 0 };
}

function compareMinor(a: ParsedVersion, b: ParsedVersion): number {
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/**
 * Migrate a parsed document from its `version` to `targetVersion`.
 * Throws on MAJOR mismatch or when no migration path is registered.
 * Returns the migrated doc plus the applied chain (caller is responsible
 * for appending these entries to `doc.migrations`).
 */
export function migrate(
  doc: any,
  targetVersion: string = CURRENT_SCHEMA_VERSION
): MigrateResult {
  const source = parseVersion(String(doc.version));
  const target = parseVersion(targetVersion);

  if (source.major !== target.major) {
    throw new Error(
      `unsupported MAJOR version: document is v${doc.version}, loader supports v${target.major}.x`
    );
  }

  // Same minor & patch: nothing to do.
  if (compareMinor(source, target) === 0) {
    return { doc, applied: [] };
  }

  // Forward-only: refuse to "downgrade" — losing fields silently is worse than failing.
  if (compareMinor(source, target) > 0) {
    throw new Error(
      `cannot downgrade document v${doc.version} to v${targetVersion}; load with a matching or newer schema version`
    );
  }

  const applied: MigrationEntry[] = [];
  let current = doc;
  let currentVersion = `${source.major}.${source.minor}`;

  while (currentVersion !== `${target.major}.${target.minor}`) {
    const step = registry.find(r => r.from === currentVersion);
    if (!step) {
      throw new Error(
        `no migration path from v${currentVersion} to v${targetVersion} (missing migration entry)`
      );
    }
    current = step.apply(current);
    current.version = step.to;
    applied.push({ from: step.from, to: step.to, at: new Date().toISOString() });
    currentVersion = step.to;
  }

  return { doc: current, applied };
}
