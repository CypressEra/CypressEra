import { loadConfig } from '@core/config/index.js';
import { ServiceContainer } from '@core/di/container.js';
import type { LLMClient } from '@core/types/index.js';
import { KnowledgeBasePlugin } from '@features/knowledge-base/plugin.js';
import { ChatController } from '@features/chat/controllers/chat.controller.js';
import { RetrievalService } from '@features/knowledge-base/services/retrieval.service.js';
import { BrainPlugin } from '@modules/brain/plugin.js';
import type { Brain } from '@modules/brain/types.js';

export function createApp(): ServiceContainer {
  const config = loadConfig();
  const container = new ServiceContainer(config);

  container.registerPlugin(new KnowledgeBasePlugin());
  container.registerPlugin(new BrainPlugin());

  // Wire ChatController after all plugins (so brain is available when enabled)
  const openaiClient = container.get<LLMClient>('openaiClient');
  const retrievalService = container.get<RetrievalService>('retrievalService');
  let brain: Brain | undefined;
  try { brain = container.get<Brain>('brain'); } catch { /* brain not enabled */ }
  container.register('chatController', new ChatController(openaiClient as any, retrievalService, config, brain));

  return container;
}
