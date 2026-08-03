import { getCoordinatorSystemPrompt } from './coordinator.js';
import { getPowerflowDomainPrompt, injectSessionContext, type BrainSessionContext } from './powerflow.js';

export type { BrainSessionContext };

export function buildBrainSystemPrompt(context: BrainSessionContext): string {
  return [
    getCoordinatorSystemPrompt(),
    getPowerflowDomainPrompt(),
    injectSessionContext(context),
  ].join('\n\n');
}
