/**
 * AI MCP Types for Frontend
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content?: string;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
  /** Timestamp when this message was created */
  timestamp?: Date;
  /** True when the content is pre-tool narration, not a final answer */
  isNarration?: boolean;
}

export interface ChatRequest {
  messages: ChatMessage[];
  context?: {
    currentSession?: string;
    userId?: string;
    availableFiles?: string[];
    useKnowledgeBase?: boolean;
    /** When true, backend forces a text-only response (no more tool calls) to stop chaining. */
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
  /** When true, the server used tool_choice: 'none' for this turn (text-only response). Only set on continueChat. */
  forceTextApplied?: boolean;
  error?: string;
}

export interface FunctionResult {
  call_id: string;
  result: any;
  error?: string;
}

export interface FunctionResultRequest {
  messages: ChatMessage[];
  functionResults: FunctionResult[];
  context?: ChatRequest['context'];
}

/**
 * Streaming event types for Server-Sent Events (SSE)
 */
export type StreamEventType = 'start' | 'chunk' | 'narration' | 'reasoning' | 'function_call' | 'tool_execution' | 'tool_results' | 'state_update' | 'complete' | 'error' | 'done';

export interface StreamStart {
  type: 'start';
}

export interface StreamChunk {
  type: 'chunk';
  content: string;
  delta: string;
}

/** Pre-tool narration: model's one-sentence explanation before each round of tool calls. */
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

export interface StreamToolExecution {
  type: 'tool_execution';
  tools: Array<{ name: string; call_id: string }>;
  round: number;
}

export interface StreamToolResult {
  type: 'tool_results';
  results: Array<{
    call_id: string;
    name?: string;  // Tool name (now sent by server)
    success: boolean;
    error?: string;
    result?: any;  // Full result data (contains session_id for session creation tools)
  }>;
}

export interface StreamStateUpdate {
  type: 'state_update';
  updates: Array<'session' | 'network' | 'powerflow' | 'files' | 'user_sessions'>;
  sessionId?: string;
}

export interface StreamComplete {
  type: 'complete';
  message?: string;
  functionCalls?: FunctionCall[];
  requiresFunctionExecution?: boolean;
  forceTextApplied?: boolean;
  finishReason?: string;
}

export interface StreamError {
  type: 'error';
  error: string;
}

export interface StreamDone {
  type: 'done';
}

export type StreamEvent = StreamStart | StreamChunk | StreamNarration | StreamReasoning | StreamFunctionCall | StreamToolExecution | StreamToolResult | StreamStateUpdate | StreamComplete | StreamError | StreamDone;

export interface StreamingChatOptions {
  onChunk?: (chunk: StreamChunk) => void;
  onNarration?: (narration: StreamNarration) => void;
  onReasoning?: (reasoning: StreamReasoning) => void;
  onFunctionCall?: (call: StreamFunctionCall) => void;
  onToolExecution?: (execution: StreamToolExecution) => void;
  onToolResult?: (result: StreamToolResult) => void;
  onStateUpdate?: (update: StreamStateUpdate) => void;
  onComplete?: (complete: StreamComplete) => void;
  onError?: (error: StreamError) => void;
  onDone?: () => void;
}


