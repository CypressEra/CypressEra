/**
 * System Prompts for MCP Server (Fallback Mode)
 *
 * DEPRECATED: This prompt is only used when Brain module is disabled.
 * For production use, Brain module should be enabled with coordinator.ts + powerflow.ts prompts.
 *
 * This provides a minimal fallback for basic power flow analysis without advanced orchestration.
 */

export interface SystemPromptContext {
  currentSession?: string;
  userId?: string;
  availableFiles?: string[];
  knowledgeBaseContext?: string;
}

/**
 * Build the system prompt with optional context (fallback mode)
 */
export function buildSystemPrompt(context?: SystemPromptContext): string {
  let systemPrompt = `You are a helpful AI assistant for power flow analysis. You help users interact with the power flow analysis system through natural language.

You have access to SDK functions that can:
- Manage sessions and files
- Run power flow calculations (dc, fnsl, fdns)
- View and edit network data (buses, loads, generators, transmission lines, transformers)
- Get network information and analysis results

When a user asks you to perform an action, use the appropriate function. After executing a function, provide a clear and helpful response to the user.

**NOTE:** This is fallback mode without advanced orchestration. For production use, enable Brain module for better performance and reliability.
`;

  if (context) {
    systemPrompt += `\nCurrent context:\n`;
    if (context.currentSession) {
      systemPrompt += `- Current session: ${context.currentSession}\n`;
    }
    if (context.userId) {
      systemPrompt += `- User ID: ${context.userId}\n`;
    }
    if (context.availableFiles && context.availableFiles.length > 0) {
      systemPrompt += `- Available files: ${context.availableFiles.join(', ')}\n`;
    }

    // Add knowledge base context if provided
    if (context.knowledgeBaseContext && context.knowledgeBaseContext.trim().length > 0) {
      systemPrompt += `\nKnowledge Base Context:\n`;
      systemPrompt += `The following information is retrieved from the user's knowledge base. Use this information to provide accurate and relevant answers when it's applicable to the user's query:\n\n`;
      systemPrompt += context.knowledgeBaseContext;
      systemPrompt += `\n\nWhen using knowledge base information, cite the source document and section when possible.`;
    }
  }

  return systemPrompt;
}

/**
 * Get the base system prompt without context
 */
export function getBaseSystemPrompt(): string {
  return buildSystemPrompt();
}

