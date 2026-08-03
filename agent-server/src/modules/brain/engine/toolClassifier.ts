import type { BrainToolCall, ToolCategory } from '../types.js';

const WRITE_TOOLS = new Set<string>([
  'addElement',
  'modifyElement',
  'deleteElement',
  'solveFlow',
  'createSessionFromFile',
  'saveSessionToUserFile',
  'saveSessionAsUserFile',
  'uploadUserFile',
  // Contingency-analysis writes: start creates a job on the api-server,
  // cancel mutates that job. Status/report are reads — not listed here.
  'startContingencyAnalysis',
  'cancelContingencyJob',
  // Study-file lifecycle: loading mutates the session's mon/con/sub slot,
  // deletion removes a file from the user library. Validate is a read.
  'loadStudyFile',
  'deleteUserFile',
]);

export function classifyTool(name: string): ToolCategory {
  return WRITE_TOOLS.has(name) ? 'write' : 'read';
}

export function classifyToolCalls(calls: BrainToolCall[]): {
  reads: BrainToolCall[];
  writes: BrainToolCall[];
} {
  const reads: BrainToolCall[] = [];
  const writes: BrainToolCall[] = [];
  for (const call of calls) {
    if (classifyTool(call.name) === 'write') {
      writes.push(call);
    } else {
      reads.push(call);
    }
  }
  return { reads, writes };
}
