/**
 * hydraa_status — Comprehensive status check across all subsystems.
 */

import type { HydraaTool, HydraaContext, ToolResult } from './index.js';

export const statusTool: HydraaTool = {
  name: 'hydraa_status',
  description:
    'Check the status of the Akash container, Nostr relay connectivity, AKT balance, and memory store. Returns a comprehensive status object.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },

  async execute(_params: Record<string, unknown>, ctx: HydraaContext): Promise<ToolResult> {
    const status: Record<string, unknown> = {};

    // --- Compute status ---
    try {
      const provider = await ctx.providerManager.getPrimaryProvider();
      if (provider) {
        const deployment = await ctx.providerManager.getActiveDeployment();
        if (deployment) {
          const deploymentStatus = await provider.status(deployment);
          status.compute = { provider: provider.name, status: deploymentStatus, deploymentId: deployment.id };
        } else {
          status.compute = { provider: provider.name, status: 'no_active_deployment' };
        }
      } else {
        status.compute = { status: 'no_provider_configured' };
      }
    } catch {
      status.compute = { status: 'error_checking' };
    }

    // --- Nostr relay connectivity ---
    try {
      const relayStatus = await ctx.nostrClient.getRelayStatus();
      status.relays = {
        connected: relayStatus.connected,
        total: relayStatus.total,
        relays: relayStatus.details,
      };
    } catch {
      status.relays = { connected: 0, total: 0, error: 'unable_to_check' };
    }

    // --- AKT balance ---
    try {
      const provider = await ctx.providerManager.getPrimaryProvider();
      if (provider) {
        const balance = await provider.getBalance();
        status.balance = { amount: balance.amount, denom: balance.denom, usdEstimate: balance.usdEstimate };
      } else {
        status.balance = { status: 'no_provider' };
      }
    } catch {
      status.balance = { status: 'error_checking' };
    }

    // --- Memory stats ---
    try {
      const memStats = await ctx.storage.getStats();
      status.memory = {
        entries: memStats.entries,
        lastSync: memStats.lastSync,
      };
    } catch {
      status.memory = { entries: 0, lastSync: null };
    }

    return {
      success: true,
      message: 'Status check complete.',
      data: status,
    };
  },
};
