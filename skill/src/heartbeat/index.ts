/**
 * Heartbeat module — Factory that wires up all monitors and actions into a
 * single scheduler ready to start.
 */

import { HeartbeatScheduler } from './scheduler.js';
import { createFundingMonitor } from './monitors/funding.js';
import { createHealthMonitor } from './monitors/health.js';
import { createRelayMonitor } from './monitors/relays.js';
import { createMorBalanceMonitor } from './monitors/mor-balance.js';
import { createNostrMentionsMonitor } from './monitors/nostr-mentions.js';
import { createNotifier } from './actions/notify.js';
import { createSelfHealer } from './actions/self-heal.js';
import { createSummarizer } from './actions/summarize.js';

// ---- Config & dependency types ----------------------------------------------

export interface HeartbeatConfig {
  /** Cron expression for health checks. Default: every 2 minutes. */
  healthInterval?: string;
  /** Cron expression for funding checks. Default: every 30 minutes. */
  fundingInterval?: string;
  /** Cron expression for relay checks. Default: every 5 minutes. */
  relayInterval?: string;
  /** Cron expression for MOR balance checks. Default: every hour. */
  morBalanceInterval?: string;
  /** Cron expression for mention checks. Default: every minute. */
  mentionsInterval?: string;
  /** Cron expression for daily summary. Default: once per day at 09:00 UTC. */
  summaryInterval?: string;

  /** AKT balance threshold that triggers a low-funds alert. */
  fundingThreshold?: number;
  /** Number of consecutive health failures before self-heal. */
  maxHealthFailures?: number;
  /** Minimum connected relays before reconnection is attempted. */
  minRelays?: number;
  /** Maximum self-heal retry attempts. */
  maxSelfHealRetries?: number;
  /** Nostr pubkey (hex) of the agent owner, for notifications. */
  ownerPubkey: string;
  /** Everclaw inference endpoint, if available. */
  inferenceEndpoint?: string;
  /** Callback invoked when the agent is mentioned on Nostr. */
  onMention?: (event: any) => void;
}

export interface HeartbeatDeps {
  providerManager: any;
  nostrClient: any;
  nostrIdentity: any;
  storage: any;
  config: any;
}

// ---- Factory ----------------------------------------------------------------

/**
 * Create a fully wired HeartbeatScheduler with all monitors and actions
 * registered and ready to start.
 */
export function createHeartbeat(
  heartbeatConfig: HeartbeatConfig,
  deps: HeartbeatDeps,
): HeartbeatScheduler {
  const scheduler = new HeartbeatScheduler();

  // --- Build shared actions ---
  const notifier = createNotifier({
    nostrClient: deps.nostrClient,
    nostrIdentity: deps.nostrIdentity,
    ownerPubkey: heartbeatConfig.ownerPubkey,
  });

  const selfHealer = createSelfHealer({
    providerManager: deps.providerManager,
    storage: deps.storage,
    notifier,
    maxRetries: heartbeatConfig.maxSelfHealRetries ?? 5,
  });

  const summarizer = createSummarizer({
    storage: deps.storage,
    notifier,
    inferenceEndpoint: heartbeatConfig.inferenceEndpoint,
  });

  // --- Register monitors ---

  scheduler.register(
    'health',
    createHealthMonitor({
      providerManager: deps.providerManager,
      selfHealer,
      maxFailures: heartbeatConfig.maxHealthFailures ?? 3,
    }),
    heartbeatConfig.healthInterval ?? '*/2 * * * *',
  );

  scheduler.register(
    'funding',
    createFundingMonitor({
      providerManager: deps.providerManager,
      notifier,
      threshold: heartbeatConfig.fundingThreshold ?? 1,
    }),
    heartbeatConfig.fundingInterval ?? '*/30 * * * *',
  );

  scheduler.register(
    'relays',
    createRelayMonitor({
      nostrClient: deps.nostrClient,
      minRelays: heartbeatConfig.minRelays ?? 2,
    }),
    heartbeatConfig.relayInterval ?? '*/5 * * * *',
  );

  scheduler.register(
    'mor-balance',
    createMorBalanceMonitor({
      config: deps.config,
    }),
    heartbeatConfig.morBalanceInterval ?? '0 * * * *',
  );

  scheduler.register(
    'mentions',
    createNostrMentionsMonitor({
      nostrClient: deps.nostrClient,
      nostrIdentity: deps.nostrIdentity,
      onMention: heartbeatConfig.onMention ?? (() => {}),
    }),
    heartbeatConfig.mentionsInterval ?? '* * * * *',
  );

  // --- Register actions ---

  scheduler.register(
    'daily-summary',
    () => summarizer.summarize(),
    heartbeatConfig.summaryInterval ?? '0 9 * * *',
  );

  return scheduler;
}

// ---- Re-exports -------------------------------------------------------------

export { HeartbeatScheduler } from './scheduler.js';
export type { SchedulerStatus, JobStatus } from './scheduler.js';
export { createNotifier } from './actions/notify.js';
export type { Notifier } from './actions/notify.js';
export { createSelfHealer } from './actions/self-heal.js';
export type { SelfHealer } from './actions/self-heal.js';
export { createSummarizer } from './actions/summarize.js';
export type { Summarizer } from './actions/summarize.js';
export { createFundingMonitor } from './monitors/funding.js';
export { createHealthMonitor } from './monitors/health.js';
export { createRelayMonitor } from './monitors/relays.js';
export { createMorBalanceMonitor } from './monitors/mor-balance.js';
export { createNostrMentionsMonitor } from './monitors/nostr-mentions.js';
