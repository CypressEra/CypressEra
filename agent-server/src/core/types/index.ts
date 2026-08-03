/**
 * Type definitions for MCP Server
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content?: string;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
}

export interface ChatRequest {
  messages: ChatMessage[];
  context?: {
    currentSession?: string;
    userId?: string;
    availableFiles?: string[];
    useKnowledgeBase?: boolean;
    /** When true, force a text-only response (no more tool calls) to stop chaining. */
    forceTextResponse?: boolean;
  };
}

export interface FunctionCall {
  id: string;
  call_id: string;
  name: string;
  arguments: string;
}

export interface ChatResponse {
  success: boolean;
  message?: string;
  functionCalls?: FunctionCall[];
  requiresFunctionExecution?: boolean;
  /** When true, the server used tool_choice: 'none' for this turn, so the model was forced to respond with text only (no more tool calls). Only set on continueChat responses. */
  forceTextApplied?: boolean;
  error?: string;
  /** Debug info for tool execution (only in development) */
  _debug?: {
    toolRounds: number;
    executedTools: Array<{ name: string; success: boolean }>;
  };
}

export interface FunctionResult {
  call_id: string;
  result: any;
  error?: string;
}

/**
 * Standardized shape for tool results sent to the model (in tool message content).
 * Clients should include status, message, and next_action so the model knows when to stop chaining.
 * - status: "success" | "error"
 * - message: short human-readable summary
 * - next_action: "reply" = model MUST respond with text only; "optional" = model may call more tools
 */
export type ToolResultNextAction = 'reply' | 'optional';

/**
 * Recommended shape for FunctionResult.result when sending to continueChat.
 * The MCP server forwards this to the model as tool message content. Including
 * status, message, and next_action makes model behavior (stop vs continue) explicit.
 */
export interface StandardToolResult {
  status: 'success' | 'error';
  message: string;
  next_action: ToolResultNextAction;
  [key: string]: unknown;
}

export interface FunctionResultRequest {
  messages: ChatMessage[];
  functionResults: FunctionResult[];
  context?: ChatRequest['context'];
}

/**
 * Streaming event types for Server-Sent Events (SSE)
 */
export type StreamEventType = 'chunk' | 'narration' | 'reasoning' | 'function_call' | 'complete' | 'error' | 'tool_execution' | 'tool_results' | 'done' | 'start';

export interface StreamChunk {
  type: 'chunk';
  content: string;
  delta?: string;
}

/** Pre-tool narration emitted before each round of tool calls. */
export interface StreamNarration {
  type: 'narration';
  content: string;
}

/** Model reasoning / thinking tokens streamed before the response. */
export interface StreamReasoning {
  type: 'reasoning';
  content: string;
  delta: string;
}

export interface StreamFunctionCall {
  type: 'function_call';
  call_id: string;
  name: string;
  arguments?: string;
}

export interface StreamComplete {
  type: 'complete';
  message?: string;
  functionCalls?: FunctionCall[];
  requiresFunctionExecution?: boolean;
  forceTextApplied?: boolean;
  /** Debug info for tool execution (only in development) */
  _debug?: {
    toolRounds: number;
    executedTools: Array<{ name: string; success: boolean }>;
  };
}

export interface StreamError {
  type: 'error';
  error: string;
}

/** Event sent when tools are being executed */
export interface StreamToolExecution {
  type: 'tool_execution';
  tools: Array<{ name: string; call_id: string }>;
  round: number;
}

/** Event sent when tool results are ready */
export interface StreamToolResults {
  type: 'tool_results';
  results: Array<{
    call_id: string;
    success: boolean;
    error?: string;
  }>;
}

/** Event sent at the start of streaming */
export interface StreamStart {
  type: 'start';
}

/** Event sent when streaming is done */
export interface StreamDone {
  type: 'done';
  _debug?: {
    toolRounds: number;
    executedTools: Array<{ name: string; success: boolean }>;
  };
}

export type StreamEvent = StreamChunk | StreamNarration | StreamReasoning | StreamFunctionCall | StreamComplete | StreamError | StreamToolExecution | StreamToolResults | StreamStart | StreamDone;

export interface SDKFunction {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
    additionalProperties?: boolean;
  };
  strict?: boolean;
}


export type { LLMClient, LLMResponse, LLMFunctionCall, LLMStreamEvent } from './llm-client.js';
