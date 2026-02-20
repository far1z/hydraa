/**
 * Compute module — pluggable container deployment across decentralised and
 * self-hosted providers.
 *
 * @module compute
 */

// Core types & interfaces
export type {
  DeploymentConfig,
  Deployment,
  DeploymentStatus,
  FundingResult,
  Balance,
  HealthCheckResult,
  ComputeProvider,
  ProviderConfig,
} from './interface.js';

// Akash Network provider
export { AkashProvider } from './akash/deployer.js';
export { AkashWallet } from './akash/wallet.js';
export { AkashMonitor, type LeaseStatus } from './akash/monitor.js';
export { generateSDL } from './akash/sdl.js';

// Self-hosted Docker provider
export { SelfHostedProvider, type SelfHostedOptions } from './self-hosted/deployer.js';
export {
  SelfHostedMonitor,
  type SelfHostedMonitorOptions,
  type ContainerStats,
} from './self-hosted/monitor.js';

// Multi-provider orchestration
export { ProviderManager } from './provider-manager.js';
