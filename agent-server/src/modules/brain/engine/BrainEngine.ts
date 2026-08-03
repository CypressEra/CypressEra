import type { Response } from 'express';
import type { LLMClient, LLMFunctionCall } from '@core/types/index.js';
import { executeToolCalls, type ToolExecutionContext } from '@core/utils/toolExecutor.js';
import { logger } from '@core/utils/logger.js';
import type { BrainConfig } from '@core/config/index.js';
import type { Brain, BrainRunOptions } from '../types.js';
import { classifyToolCalls } from './toolClassifier.js';
import { buildBrainSystemPrompt } from '../prompts/index.js';

function sendSSE(res: Response, event: object): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

// Tools whose repeated invocation within a single chat turn is a waste of
// tokens — the result will not have changed in the seconds between calls.
// The brain intercepts a second call for the same (tool, key-arg) pair per
// run() and returns a synthetic "already polled this turn" result without
// hitting the api-server. The model sees the error and naturally yields the
// turn, letting the user drive the next status check.
const GUARDED_POLLING_TOOLS: ReadonlySet<string> = new Set([
  'getContingencyJobStatus',
]);

// Returns the polling-guard key for a guarded tool call, or null if the call
// lacks a usable key (e.g. missing/unparseable jobId) — in which case we let
// the call execute normally and the executor returns its own error.
function pollingGuardKey(fc: LLMFunctionCall): string | null {
  if (!GUARDED_POLLING_TOOLS.has(fc.name)) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(fc.arguments);
  } catch {
    return null;
  }
  const jobId = typeof parsed.jobId === 'string' ? parsed.jobId.trim() : '';
  if (!jobId) return null;
  return `${fc.name}:${jobId}`;
}

// Synthetic tool result for a blocked second poll. Shaped to mirror what
// executeToolCalls produces so downstream SSE / message-history paths don't
// need to special-case it.
function syntheticPollGuardResult(callId: string): {
  call_id: string;
  result: unknown;
  error: string;
} {
  return {
    call_id: callId,
    result: {
      success: false,
      error: 'already_polled_this_turn',
      message:
        'You already checked this job in the current turn. The state will not have meaningfully changed. Tell the user the last known status and ask them to message you again to check progress.',
    },
    error: 'already_polled_this_turn',
  };
}

export class BrainEngine implements Brain {
  private llmClient: LLMClient;
  private config: BrainConfig;

  constructor(llmClient: LLMClient, config: BrainConfig) {
    this.llmClient = llmClient;
    this.config = config;
  }

  async run({ messages, context, res }: BrainRunOptions): Promise<void> {
    const abortController = new AbortController();
    const systemPrompt = buildBrainSystemPrompt(context);

    const mutableMessages: any[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    let toolContext: ToolExecutionContext = {
      sessionId: context.sessionId,
      userId: context.userId,
      userToken: context.userToken,
    };

    let rounds = 0;
    const maxRounds = this.config.maxRounds;

    // Per-run polling guard: keys of (toolName:jobId) we've already polled
    // this turn. Resets when run() is invoked again (new user message).
    const polledThisTurn = new Set<string>();

    try {
      while (rounds < maxRounds) {
        if (abortController.signal.aborted) break;

        // Stream the LLM response — reasoning and text tokens arrive in real-time
        let accumulated = '';
        let reasoningAccumulated = '';
        let functionCalls: LLMFunctionCall[] | undefined;

        for await (const event of this.llmClient.chatStream(mutableMessages, abortController.signal)) {
          if (event.type === 'reasoning_delta') {
            reasoningAccumulated = event.accumulated;
            sendSSE(res, { type: 'reasoning', content: reasoningAccumulated, delta: event.delta });
          } else if (event.type === 'text_delta') {
            accumulated = event.accumulated;
            sendSSE(res, { type: 'chunk', content: accumulated, delta: event.delta });
          } else if (event.type === 'done') {
            functionCalls = event.functionCalls;
          }
        }

        if (!functionCalls || functionCalls.length === 0) {
          // Final answer — text already streamed via chunk events above
          sendSSE(res, { type: 'complete', message: accumulated });
          break;
        }

        // Intermediate round with tool calls
        mutableMessages.push({
          role: 'assistant',
          content: accumulated || null,
          tool_calls: functionCalls.map(fc => ({
            id: fc.call_id,
            type: 'function',
            function: { name: fc.name, arguments: fc.arguments },
          })),
        });

        rounds++;
        logger.info(`[Brain] round ${rounds}`, { tools: functionCalls.map(f => f.name) });

        for (const fc of functionCalls) {
          sendSSE(res, { type: 'function_call', call_id: fc.call_id, name: fc.name, arguments: fc.arguments });
        }

        sendSSE(res, {
          type: 'tool_execution',
          tools: functionCalls.map(fc => ({ name: fc.name, call_id: fc.call_id })),
          round: rounds,
        });

        // Reads in parallel, writes sequential.
        const { reads, writes } = classifyToolCalls(functionCalls);
        const allResults: Array<{ call_id: string; result: unknown; error?: string; name: string }> = [];

        // Apply the polling guard synchronously, in declaration order, BEFORE
        // dispatching anything. First call for a (tool, jobId) key executes
        // normally; subsequent calls get a synthetic "already_polled_this_turn"
        // result without touching the api-server.
        const partition = (calls: LLMFunctionCall[]) => {
          const toExecute: LLMFunctionCall[] = [];
          const synthetic: Array<{ call_id: string; result: unknown; error?: string; name: string }> = [];
          for (const fc of calls) {
            const key = pollingGuardKey(fc);
            if (key && polledThisTurn.has(key)) {
              logger.info('[Brain] polling guard intercepted call', { tool: fc.name, key });
              const r = syntheticPollGuardResult(fc.call_id);
              synthetic.push({ ...r, name: fc.name });
              continue;
            }
            if (key) polledThisTurn.add(key);
            toExecute.push(fc);
          }
          return { toExecute, synthetic };
        };

        const readPart = partition(reads);
        const writePart = partition(writes);

        if (readPart.toExecute.length > 0) {
          const readResults = await Promise.all(
            readPart.toExecute.map(fc =>
              executeToolCalls([fc], toolContext).then(r => ({
                ...r.results[0],
                name: fc.name,
                sessionId: r.sessionId,
              })),
            ),
          );
          for (const r of readResults) {
            if (r.sessionId) toolContext = { ...toolContext, sessionId: r.sessionId };
            allResults.push({ call_id: r.call_id, result: r.result, error: r.error, name: r.name });
          }
        }
        for (const r of readPart.synthetic) {
          allResults.push(r);
        }

        for (const fc of writePart.toExecute) {
          const { results, sessionId } = await executeToolCalls([fc], toolContext);
          if (sessionId) toolContext = { ...toolContext, sessionId };
          allResults.push({ ...results[0], name: fc.name });
        }
        for (const r of writePart.synthetic) {
          allResults.push(r);
        }

        sendSSE(res, {
          type: 'tool_results',
          results: allResults.map(r => ({
            call_id: r.call_id,
            name: r.name,
            success: !r.error,
            error: r.error,
            result: r.result,
          })),
        });

        for (const r of allResults) {
          mutableMessages.push({
            role: 'tool',
            tool_call_id: r.call_id,
            content: JSON.stringify(r.result),
          });
        }
      }

      if (rounds >= maxRounds) {
        // Stream the forced summary too
        let summaryText = '';
        for await (const event of this.llmClient.chatStream(mutableMessages, abortController.signal)) {
          if (event.type === 'reasoning_delta') {
            sendSSE(res, { type: 'reasoning', content: event.accumulated, delta: event.delta });
          } else if (event.type === 'text_delta') {
            summaryText = event.accumulated;
            sendSSE(res, { type: 'chunk', content: summaryText, delta: event.delta });
          } else if (event.type === 'done') {
            sendSSE(res, { type: 'complete', message: summaryText });
          }
        }
        sendSSE(res, { type: 'warning', code: 'max_rounds_reached', roundsExecuted: rounds });
      }
    } catch (error: any) {
      if (abortController.signal.aborted) {
        logger.info('[Brain] run aborted');
        return;
      }
      logger.error('[Brain] run failed', error);
      sendSSE(res, { type: 'error', error: error.message || 'Brain engine failed' });
    }
  }
}
