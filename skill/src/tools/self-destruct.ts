/**
 * hydraa_destroy — Tear down compute deployment and optionally wipe relay memory.
 */

import type { HydraaTool, HydraaContext, ToolResult } from './index.js';

export const destroyTool: HydraaTool = {
  name: 'hydraa_destroy',
  description:
    'Tear down the active Akash deployment and optionally wipe all memory from Nostr relays. Requires explicit confirmation.',
  parameters: {
    type: 'object',
    properties: {
      confirm: {
        type: 'boolean',
        description: 'Must be true to proceed with destruction. Safety gate.',
      },
      wipeMemory: {
        type: 'boolean',
        description: 'If true, also delete memory events from Nostr relays.',
      },
    },
    required: ['confirm'],
    additionalProperties: false,
  },

  async execute(params: Record<string, unknown>, ctx: HydraaContext): Promise<ToolResult> {
    const confirm = params.confirm as boolean;
    const wipeMemory = (params.wipeMemory as boolean | undefined) ?? false;

    if (!confirm) {
      return {
        success: false,
        message: 'Destruction aborted. Set confirm=true to proceed.',
      };
    }

    const results: Record<string, unknown> = {};

    // --- Tear down compute deployment ---
    try {
      const provider = await ctx.providerManager.getPrimaryProvider();
      const deployment = await ctx.providerManager.getActiveDeployment();

      if (provider && deployment) {
        await provider.destroy(deployment);
        results.compute = { destroyed: true, deploymentId: deployment.id };
      } else {
        results.compute = { destroyed: false, reason: 'no_active_deployment' };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.compute = { destroyed: false, error: msg };
    }

    // --- Optionally wipe relay memory ---
    if (wipeMemory) {
      try {
        const deleted = await ctx.storage.deleteAllFromRelays(ctx.nostrClient, ctx.nostrIdentity);
        results.memory = { wiped: true, deletedEvents: deleted };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.memory = { wiped: false, error: msg };
      }
    } else {
      results.memory = { wiped: false, reason: 'not_requested' };
    }

    const computeOk = (results.compute as any)?.destroyed === true;
    return {
      success: computeOk,
      message: computeOk
        ? `Deployment destroyed.${wipeMemory ? ' Memory wiped from relays.' : ''}`
        : 'Destruction attempted — see data for details.',
      data: results,
    };
  },
};
