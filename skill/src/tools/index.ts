/**
 * Tools module — exposes agent capabilities as callable tools.
 *
 * Each tool follows the {@link HydraaTool} interface so the skill runtime can
 * discover, validate, and invoke them uniformly.
 */

import { deployTool } from './deploy.js';
import { statusTool } from './status.js';
import { fundTool } from './fund.js';
import { nostrPostTool } from './nostr-post.js';
import { nostrDmTool } from './nostr-dm.js';
import { migrateMemoryTool } from './migrate.js';
import { destroyTool } from './self-destruct.js';

// ---- Type definitions -------------------------------------------------------

/** Contextual dependencies injected into every tool at execution time. */
export interface HydraaContext {
  nostrClient: any;
  nostrIdentity: any;
  storage: any;
  providerManager: any;
  config: any;
}

/** Standardised result returned by every tool execution. */
export interface ToolResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

/** Contract that every Hydraa tool must satisfy. */
export interface HydraaTool {
  /** Unique tool name (snake_case, prefixed with `hydraa_`). */
  name: string;
  /** Human-readable description shown in tool listings. */
  description: string;
  /** JSON Schema describing accepted parameters. */
  parameters: Record<string, unknown>;
  /** Execute the tool with validated params and injected context. */
  execute(params: Record<string, unknown>, context: HydraaContext): Promise<ToolResult>;
}

// ---- Public exports ---------------------------------------------------------

/** All available Hydraa tools, ready for registration with the skill runtime. */
export const tools: HydraaTool[] = [
  deployTool,
  statusTool,
  fundTool,
  nostrPostTool,
  nostrDmTool,
  migrateMemoryTool,
  destroyTool,
];

export {
  deployTool,
  statusTool,
  fundTool,
  nostrPostTool,
  nostrDmTool,
  migrateMemoryTool,
  destroyTool,
};
