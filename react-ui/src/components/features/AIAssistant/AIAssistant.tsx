import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAIChat, BrainRound } from '../../../ai-client/useAIChat';
import { ChatMessage } from '../../../ai-client/types';
import { PowerFlowApp } from '../../../sdk';
import { useAuth } from '../../../auth';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { Tooltip } from '../../common/Tooltip';
import './AIAssistant.css';

/** Custom code block component with syntax highlighting and theme detection. */
function CodeBlock({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLPreElement>) {
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const codeContent = String(children).replace(/\n$/, '');

  // Detect dark mode from document
  const isDark = document.documentElement.classList.contains('dark');
  const syntaxTheme = isDark ? vscDarkPlus : vs;

  return match ? (
    <SyntaxHighlighter
      style={syntaxTheme as any}
      language={language}
      PreTag="div"
      customStyle={{
        borderRadius: '4px',
        margin: '4px 0',
        fontSize: '11px',
        lineHeight: '1.3'
      }}
      codeTagProps={{
        style: {
          fontFamily: "'Fira Code', 'JetBrains Mono', 'SF Mono', Consolas, monospace",
          fontSize: '11px'
        }
      } as any}
      {...props}
    >
      {codeContent}
    </SyntaxHighlighter>
  ) : (
    <pre className="inline-code-block" {...props}>
      <code>{children}</code>
    </pre>
  );
}

/** Format message content with markdown rendering using default styles. */
function formatMessageContent(content: string): React.ReactNode {
  if (!content || typeof content !== 'string') return content;
  const trimmed = content.trim();
  if (!trimmed) return trimmed;

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code: CodeBlock,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
      }}
    >
      {trimmed}
    </ReactMarkdown>
  );
}

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  functionCalls?: Array<{ name: string; arguments: string }>;
  isToolCallStatus?: boolean;
  /** True when content is pre-tool narration rather than a final answer */
  isNarration?: boolean;
}

interface AIAssistantProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  baseURL?: string;
  /** Model file names already loaded by the app (e.g. from loadModelFileList). Passed as context.availableFiles so the AI can skip calling getUserFiles when opening a file. */
  modelFiles?: string[];
  isTransitioning?: boolean;
  /** Whether knowledge base is enabled (controlled from parent) */
  useKnowledgeBase?: boolean;
  /** Callback when knowledge base toggle changes */
  onKnowledgeBaseChange?: (enabled: boolean) => void;
  /** Callback when tool execution completes - used to update UI state */
  onToolResults?: (results: Array<{ call_id: string; name: string; success: boolean; error?: string }>) => void;
}

/** Shows live reasoning text before the first tool call (same visual style as tool call bar). */
function ThinkingBar({ streamingReasoning }: { streamingReasoning: string }) {
  const reasoningRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when reasoning text updates
  useEffect(() => {
    if (reasoningRef.current) {
      reasoningRef.current.scrollTop = reasoningRef.current.scrollHeight;
    }
  }, [streamingReasoning]);

  return (
    <div className="brain-activity-log" ref={reasoningRef}>
      <p className="brain-reasoning-inline">{streamingReasoning}</p>
    </div>
  );
}

/** Shows only the current tool name in the tool call bar. */
function BrainActivityLog({ rounds }: { rounds: BrainRound[] }) {
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when rounds update
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [rounds]);

  if (rounds.length === 0) return null;
  const currentTool = rounds[rounds.length - 1].tools[0];
  if (!currentTool) return null;
  return (
    <div className="brain-activity-log" ref={logRef}>
      <div className="brain-tool-row">
        <span className="brain-tool-name">{currentTool.name}</span>
      </div>
    </div>
  );
}

export const AIAssistant: React.FC<AIAssistantProps> = ({
  isCollapsed = false,
  onToggleCollapse,
  baseURL = 'http://localhost:3001',
  modelFiles = [],
  isTransitioning = false,
  useKnowledgeBase: useKnowledgeBaseProp = true,
  onKnowledgeBaseChange,
  onToolResults
}) => {
  const { t } = useTranslation();
  const { accessToken, user, requireAuth } = useAuth();
  const {
    sendMessageStream,
    stopGeneration,
    isStreaming,
    messages: chatMessages,
    loading: chatLoading,
    error: chatError,
    brainRounds,
    streamingReasoning
  } = useAIChat({
    baseURL,
    accessToken
  });

  const [inputValue, setInputValue] = useState('');
  const [useKnowledgeBaseLocal, setUseKnowledgeBaseLocal] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const welcomeTimestampRef = useRef(new Date());

  // Use prop value if provided, otherwise use local state
  const useKnowledgeBase = onKnowledgeBaseChange ? useKnowledgeBaseProp : useKnowledgeBaseLocal;

  // Handler for knowledge base toggle
  const handleKnowledgeBaseToggle = () => {
    if (onKnowledgeBaseChange) {
      onKnowledgeBaseChange(!useKnowledgeBaseProp);
    } else {
      setUseKnowledgeBaseLocal(!useKnowledgeBaseLocal);
    }
  };

  // Register user with knowledge base after login.
  // We use the authenticated user's backend ID and avoid registering for anonymous users.
  const lastRegisteredUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    const registerUser = async () => {
      try {
        // Require a valid login before registering with the knowledge base.
        if (!accessToken || !user?.id) return;

        const userId = user.id;

        // Avoid re-registering the same user id repeatedly.
        if (lastRegisteredUserIdRef.current === userId) return;

        // Import AIClient dynamically to avoid circular dependencies
        const { AIClient } = await import('../../../ai-client/client');
        const client = new AIClient({ baseURL, accessToken });

        await client.registerUser(userId);
        lastRegisteredUserIdRef.current = userId;
        console.log('[AIAssistant] ✅ User registered with knowledge base:', userId);
      } catch (error: any) {
        // Log but don't fail - file watcher might still work
        console.warn('[AIAssistant] ⚠️ Failed to register user with knowledge base:', error.message);
      }
    };

    registerUser();
  }, [baseURL, accessToken, user?.id]);

  // Convert chat messages to component Message format
  const messages: Message[] = React.useMemo(() => {
    // Always include welcome message as the first message
    const welcomeMessage: Message = {
      id: 'welcome-msg',
      content: t('aiAssistant:welcomeMessage'),
      role: 'assistant' as const,
      timestamp: welcomeTimestampRef.current
    };

    // Convert chat messages to component format, with aggregation:
    // - Consecutive assistant *tool-call-only* messages are grouped into ONE
    //   \"Calling Xolution engine…\" status bubble with multiple function names.
    // - Consecutive assistant text messages are merged into a single bubble,
    //   so the user doesn't see many small AI boxes.
    const conversationMessages: Message[] = [];

    let userIndex = 0;
    let assistantIndex = 0;

    chatMessages.forEach((msg: ChatMessage) => {
      if (msg.role !== 'user' && msg.role !== 'assistant') {
        return;
      }

      // User messages are always shown one-by-one
      if (msg.role === 'user') {
        conversationMessages.push({
          id: `user-${userIndex++}`,
          content: msg.content || '',
          role: 'user',
          timestamp: msg.timestamp || new Date()
        });
        return;
      }

      // Assistant messages: decide if this is a tool-call-only status or real text
      const hasFunctionCall = !!msg.function_call;
      const hasContent = !!msg.content && msg.content.trim().length > 0;

      const last = conversationMessages[conversationMessages.length - 1];

      if (hasFunctionCall && hasContent && msg.function_call) {
        conversationMessages.push({
          id: `assistant-${assistantIndex++}`,
          content: msg.content || '',
          role: 'assistant',
          timestamp: msg.timestamp || new Date(),
          isToolCallStatus: true,
          isNarration: msg.isNarration,
          functionCalls: [{ name: msg.function_call.name, arguments: msg.function_call.arguments }]
        });
      } else if (hasFunctionCall && msg.function_call) {
        // Tool call only (no content)
        // Case 1: Previous message is a tool-call status → aggregate
        if (last && last.role === 'assistant' && last.isToolCallStatus) {
          last.functionCalls = [
            ...(last.functionCalls || []),
            {
              name: msg.function_call.name,
              arguments: msg.function_call.arguments
            }
          ];
        }
        // Case 2: Previous message is a text-only assistant message → merge into it
        else if (last && last.role === 'assistant' && !last.isToolCallStatus && last.content) {
          // Convert the previous text message into a combined message with tool call
          last.isToolCallStatus = true;
          last.functionCalls = [
            {
              name: msg.function_call.name,
              arguments: msg.function_call.arguments
            }
          ];
        }
        // Case 3: No previous message or previous is user → create new tool-call message
        else {
          conversationMessages.push({
            id: `assistant-tool-${assistantIndex++}`,
            content: '',
            role: 'assistant',
            timestamp: msg.timestamp || new Date(),
            isToolCallStatus: true,
            functionCalls: [
              {
                name: msg.function_call.name,
                arguments: msg.function_call.arguments
              }
            ]
          });
        }
      } else if (hasContent) {
        // Content only (no function call): show text
        const text = msg.content || '';

        if (last && last.role === 'assistant' && !last.isToolCallStatus) {
          // Merge consecutive assistant text messages into a single bubble
          last.content = last.content
            ? `${last.content}\n\n${text}`
            : text;
        } else {
          // Add as new text message (even after tool-call status)
          conversationMessages.push({
            id: `assistant-${assistantIndex++}`,
            content: text,
            role: 'assistant',
            timestamp: msg.timestamp || new Date()
          });
        }
      }
      // If assistant without content and without function_call, we ignore it.
    });

    // Always return welcome message first, followed by conversation messages
    return [welcomeMessage, ...conversationMessages];
  }, [chatMessages, t]);

  // Helper: detect if the CURRENT turn has an active tool-call status message,
  // so we don't also show a separate generic typing bubble.
  // Only look at messages after the last user message to avoid suppressing the
  // loading indicator on subsequent turns due to tool calls from previous turns.
  const hasToolCallStatus = React.useMemo(() => {
    const lastUserIdx = messages.reduce((idx, m, i) => (m.role === 'user' ? i : idx), -1);
    return messages.slice(lastUserIdx + 1).some((m) => m.isToolCallStatus);
  }, [messages]);

  // Check if last message is from user (waiting for AI response)
  // Use chatMessages instead of messages to exclude welcome message
  const lastMessageIsUser = chatMessages.length > 0 && chatMessages[chatMessages.length - 1].role === 'user';

  // Loading: show when waiting for response and we don't have assistant text at the end yet.
  // (Streaming content is written into the messages list on each chunk, so no separate bubble.)
  const lastMcp = chatMessages[chatMessages.length - 1];
  const hasAssistantTextAtEnd =
    lastMcp?.role === 'assistant' &&
    typeof lastMcp.content === 'string' &&
    lastMcp.content.trim().length > 0 &&
    !lastMcp.function_call;

  // Show loading indicator when:
  // 1. Chat is loading or streaming OR last message is from user (waiting for response)
  // 2. AND we don't have a final assistant text response yet
  // 3. AND we don't have an active tool-call status message (thinking is shown in tool bar)
  const showLoading = Boolean(
    (chatLoading || isStreaming || lastMessageIsUser) &&
    !hasAssistantTextAtEnd &&
    !hasToolCallStatus
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Keep input focused when panel is open and not loading
  useEffect(() => {
    if (!isCollapsed && !chatLoading && !isStreaming) {
      inputRef.current?.focus();
    }
  }, [isCollapsed, chatLoading, isStreaming]);

  // Note: Welcome message is handled in the useMemo above
  // It will update automatically when the translation changes

  const submitMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || chatLoading || isStreaming) return;

    const ok = await requireAuth({ reason: 'ai-chat' });
    if (!ok) return;

    try {
      const config = PowerFlowApp.getConfig();
      const userId = (config && 'userId' in config && typeof config.userId === 'string')
        ? config.userId
        : undefined;
      const context = {
        currentSession: PowerFlowApp.getSession() || undefined,
        userId,
        availableFiles: modelFiles,
        useKnowledgeBase
      };

      await sendMessageStream(
        trimmed,
        context,
        {
          onChunk: (chunk) => {
            // streamingMessage state is updated automatically
          },
          onFunctionCall: (functionCall) => {
            console.log('[AIAssistant] Function call:', functionCall);
          },
          onToolResults: (results) => {
            console.log('[AIAssistant] Tool results:', results);
            onToolResults?.(results);
          }
        }
      );
    } catch (error: any) {
      console.error('Error sending message:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;
    const text = inputValue.trim();
    setInputValue('');
    await submitMessage(text);
  };

  const handlePresetClick = (preset: string) => {
    submitMessage(preset);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const presetQuestions = t('aiAssistant:presetQuestions', {
    returnObjects: true,
    defaultValue: []
  }) as string[];
  const validPresets = Array.isArray(presetQuestions) ? presetQuestions : [];
  const isEmptyConversation =
    messages.length === 1 && messages[0].id === 'welcome-msg';
  const showPresets =
    isEmptyConversation && validPresets.length > 0 && !chatLoading && !isStreaming;

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Show error if MCP has an error
  useEffect(() => {
    if (chatError) {
      console.error('MCP Error:', chatError);
    }
  }, [chatError]);

  // When collapsed and NOT transitioning, show collapsed view
  // When transitioning, stay in expanded layout but hide content
  if (isCollapsed && !isTransitioning) {
    return (
      <div className="ai-assistant collapsed" onClick={onToggleCollapse}>
        <div className="collapsed-label">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="expand-arrow">
            <path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div className={`ai-assistant ${isTransitioning ? 'transitioning' : ''}`}>
      <div className="ai-header">
        <div className="ai-title">
          {/* <span className="ai-icon">🤖</span> */}
          <span>{t('aiAssistant:title')}</span>
        </div>
        <button className="collapse-btn" onClick={onToggleCollapse}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <div
        className={`chat-container ${isTransitioning ? 'content-hidden' : ''}`}
        onClick={(e) => {
          if (!isCollapsed) {
            // Check if user has selected text first
            const selection = window.getSelection();
            const hasSelection = selection && selection.toString().length > 0;
            
            // If text is selected, don't focus input (preserve selection)
            if (hasSelection) {
              return;
            }
            
            // Only focus input if clicking on empty space, not on messages
            const target = e.target as HTMLElement;
            const isClickOnMessage = target.closest('.message, .message-text, .message-content');
            
            // Don't focus if clicking on a message area
            if (!isClickOnMessage) {
              inputRef.current?.focus();
            }
          }
        }}
      >
        <div className="messages-container">
          {(() => {
            const chatActive = isStreaming || chatLoading;
            // Hide the bar as soon as the final answer starts streaming (not just after full completion)
            const showBar = chatActive && !hasAssistantTextAtEnd;
            
            // Find the last assistant message (regardless of type)
            const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
            // Only show tool bar on the last assistant message if it's a tool call and chat is active
            const lastToolCallId = showBar && lastAssistantMessage?.isToolCallStatus
              ? lastAssistantMessage.id
              : undefined;

            return messages.map((message) => {
              const isToolCallOnly = message.isToolCallStatus;
              // Among active tool-call messages, only the last one shows the bar
              const showToolBar = message.id === lastToolCallId;

              // Only the last active tool-call message (with the bar) is shown; all others return null
              if (isToolCallOnly && !showToolBar) {
                return null;
              }

              return (
                <div
                  key={message.id}
                  className={`message ${message.role} ${showToolBar ? 'tool-call' : ''}`}
                >
                  <div className="message-avatar">
                    {message.role === 'user' ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor"/>
                    </svg>
                    ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="currentColor"/>
                    </svg>
                    )}
                  </div>
                  <div className="message-content">
                    <div className="message-text">
                      {/* Regular (non-tool-call) messages show content */}
                      {message.content && !isToolCallOnly && (
                        <div className={`message-text-content${message.isNarration ? ' narration' : ''}`}>
                          {formatMessageContent(message.content)}
                        </div>
                      )}
                      {/* Tool-call bar — only on the last active round */}
                      {showToolBar && (
                        <>
                          <div className="tool-call-title">
                            <svg className="tool-call-clock" width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                              <line className="clock-hand" x1="12" y1="12" x2="12" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                            {t('aiAssistant:engineCallingTitle', 'Calling X-solution Engine')}
                          </div>
                          <div className="tool-call-details">
                            <BrainActivityLog rounds={brainRounds} />
                          </div>
                          {/* Below-title slot: reasoning (priority) or narration */}
                          {(streamingReasoning || message.content) && <div className="tool-call-divider" />}
                          {streamingReasoning ? (
                            <ThinkingBar streamingReasoning={streamingReasoning} />
                          ) : message.content ? (
                            <div className={`message-text-content${message.isNarration ? ' narration' : ''}`}>
                              {formatMessageContent(message.content)}
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                    <div className="message-time">{formatTime(message.timestamp)}</div>
                  </div>
                </div>
              );
            });
          })()}
          {showPresets && (
            <div className="preset-questions">
              <div className="preset-questions-label">
                {t('aiAssistant:presetQuestionsLabel', 'You can ask')}
              </div>
              <div className="preset-questions-list" role="list">
                {validPresets.map((preset, idx) => (
                  <button
                    key={`preset-${idx}`}
                    type="button"
                    role="listitem"
                    className="preset-question-chip"
                    onClick={() => handlePresetClick(preset)}
                    disabled={chatLoading || isStreaming}
                  >
                    <span className="preset-question-text">{preset}</span>
                    <svg
                      className="preset-question-arrow"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M5 12h14M13 6l6 6-6 6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Loading: before first chunk or while waiting for response (content comes from messages list) */}
          {showLoading && (
            <div className={`message assistant${streamingReasoning ? ' tool-call' : ''}`}>
              <div className="message-avatar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="currentColor"/>
                </svg>
              </div>
              <div className="message-content">
                {streamingReasoning ? (
                  <div className="message-text">
                    <div className="tool-call-title">
                      <svg className="tool-call-clock" width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                        <line className="clock-hand" x1="12" y1="12" x2="12" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                      Thinking
                    </div>
                    <div className="tool-call-details">
                      <ThinkingBar streamingReasoning={streamingReasoning} />
                    </div>
                  </div>
                ) : (
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                )}
              </div>
            </div>
          )}
          {chatError && (
            <div className="message assistant">
              <div className="message-avatar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="currentColor"/>
                </svg>
              </div>
              <div className="message-content">
                <div className="message-text" style={{ background: '#fee', color: '#c33' }}>
                  Error: {chatError}
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-container">
          <div className="input-wrapper">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={t('aiAssistant:placeholder')}
              className="message-input"
              rows={1}
              disabled={chatLoading || isStreaming}
            />
            <div className="input-actions">
              <Tooltip content={t('aiAssistant:useKnowledgeBase')} disabled={useKnowledgeBase}>
                <button
                  type="button"
                  className={`kb-toggle-button ${useKnowledgeBase ? 'active' : ''}`}
                  onClick={handleKnowledgeBaseToggle}
                  disabled={chatLoading}
                >
                  <div className="kb-icon-wrapper">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                    </svg>
                  </div>
                  <span className="kb-text">{t('aiAssistant:knowledgeBaseButton')}</span>
                </button>
              </Tooltip>
              {(chatLoading || isStreaming) ? (
                <button
                  type="button"
                  onClick={stopGeneration}
                  className="stop-button"
                  title={t('aiAssistant:stopGeneration', 'Stop')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="1"/>
                  </svg>
                  <span className="stop-button-label">{t('aiAssistant:stopGeneration', 'Stop')}</span>
                </button>
              ) : (
                <button
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim()}
                  className="send-button"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};