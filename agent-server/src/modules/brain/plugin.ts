import type { PluginModule } from '@core/di/plugin.js';
import type { ServiceContainer } from '@core/di/container.js';
import type { LLMClient } from '@core/types/index.js';
import { BrainEngine } from './engine/BrainEngine.js';
import { logger } from '@core/utils/logger.js';

export class BrainPlugin implements PluginModule {
  readonly name = 'brain';

  register(container: ServiceContainer): void {
    const config = container.getConfig();
    if (!config.brain.enabled) {
      logger.info('[BrainPlugin] Brain disabled (ENABLE_BRAIN=false)');
      return;
    }

    const llmClient = container.get<LLMClient>('openaiClient');
    const brain = new BrainEngine(llmClient, config.brain);
    container.register('brain', brain);
    logger.info('[BrainPlugin] BrainEngine registered', {
      maxRounds: config.brain.maxRounds,
      maxTokens: config.brain.maxTokens,
    });
  }
}
