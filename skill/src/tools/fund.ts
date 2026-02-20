/**
 * hydraa_fund — Wallet balance, deposit address, and cost projections.
 */

import type { HydraaTool, HydraaContext, ToolResult } from './index.js';

export const fundTool: HydraaTool = {
  name: 'hydraa_fund',
  description:
    'Get the AKT wallet balance, deposit address, estimated remaining compute time, and cost projections.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },

  async execute(_params: Record<string, unknown>, ctx: HydraaContext): Promise<ToolResult> {
    try {
      const provider = await ctx.providerManager.getPrimaryProvider();
      if (!provider) {
        return { success: false, message: 'No compute provider configured.' };
      }

      const balance = await provider.getBalance();
      const depositAddress = ctx.config.walletAddress ?? 'unknown';

      // Estimate remaining hours based on hourly cost
      const hourlyCost = ctx.config.estimatedHourlyCost ?? 0.05;
      const remainingHours = hourlyCost > 0 ? balance.amount / hourlyCost : Infinity;
      const remainingDays = remainingHours / 24;

      return {
        success: true,
        message: `Balance: ${balance.amount} ${balance.denom}. Estimated ${remainingDays.toFixed(1)} days remaining.`,
        data: {
          balance: balance.amount,
          denom: balance.denom,
          usdEstimate: balance.usdEstimate,
          depositAddress,
          estimatedRemainingHours: Math.round(remainingHours),
          estimatedRemainingDays: parseFloat(remainingDays.toFixed(1)),
          hourlyCostEstimate: hourlyCost,
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Failed to get funding info: ${msg}` };
    }
  },
};
