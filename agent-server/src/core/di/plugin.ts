import type { ServiceContainer } from './container.js';

export interface PluginModule {
  readonly name: string;
  register(container: ServiceContainer): void;
  initialize?(): Promise<void>;
  shutdown?(): Promise<void>;
}
