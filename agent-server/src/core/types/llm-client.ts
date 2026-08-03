import type { ChatMessage } from './index.js';

export interface LLMFunctionCall {
  id: string;
  call_id: string;
  name: string;
  arguments: string;
}

export interface LLMResponse {
  message?: string;
  functionCalls?: LLMFunctionCall[];
  finishReason: string;
}

/** Events yielded by LLMClient.chatStream */
export type LLMStreamEvent =
  | { type: 'reasoning_delta'; delta: string; accumulated: string }
  | { type: 'text_delta'; delta: string; accumulated: string }
  | { type: 'done'; message: string; functionCalls?: LLMFunctionCall[]; reasoning?: string };

export interface LLMClient {
  chat(messages: ChatMessage[], signal?: AbortSignal): Promise<LLMResponse>;
  chatStream(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<LLMStreamEvent>;
}
