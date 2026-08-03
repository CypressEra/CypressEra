import type { Response } from 'express';
import type { BrainSessionContext } from './prompts/index.js';

export type { BrainSessionContext };

export type ToolCategory = 'read' | 'write';

export interface BrainToolCall {
  id: string;
  call_id: string;
  name: string;
  arguments: string;
}

export interface BrainToolResult {
  call_id: string;
  result: unknown;
  error?: string;
}

export type BrainSSEEvent =
  | { type: 'tool_call'; toolName: string; callId: string; arguments: string }
  | { type: 'tool_result'; callId: string; toolName: string; success: boolean; summary?: string }
  | { type: 'message'; content: string }
  | { type: 'warning'; code: 'max_rounds_reached'; roundsExecuted: number }
  | { type: 'error'; error: string };

export interface BrainResult {
  success: boolean;
  rounds: number;
  finalMessage?: string;
  error?: string;
}

export interface BrainRunOptions {
  messages: any[];
  context: BrainSessionContext;
  res: Response;
}

export interface Brain {
  run(options: BrainRunOptions): Promise<void>;
}
