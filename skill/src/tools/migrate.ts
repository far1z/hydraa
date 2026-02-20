/**
 * hydraa_migrate_memory — Sync local memory entries to Nostr relays.
 */

import type { HydraaTool, HydraaContext, ToolResult } from './index.js';

export const migrateMemoryTool: HydraaTool = {
  name: 'hydraa_migrate_memory',
  description:
    'Trigger a memory sync from local storage to Nostr relays. Shows progress and returns sync statistics.',
  parameters: {
    type: 'object',
    properties: {
      localPath: {
        type: 'string',
        description: 'Optional path to local memory store. Uses the default configured path if omitted.',
      },
    },
    required: [],
    additionalProperties: false,
  },

  async execute(params: Record<string, unknown>, ctx: HydraaContext): Promise<ToolResult> {
    const localPath = (params.localPath as string | undefined) ?? undefined;

    try {
      // Get entries from local storage
      const entries = await ctx.storage.getAll(localPath);
      if (!entries || entries.length === 0) {
        return {
          success: true,
          message: 'No local memory entries to sync.',
          data: { synced: 0, failed: 0, total: 0 },
        };
      }

      let synced = 0;
      let failed = 0;

      for (const entry of entries) {
        try {
          // Publish each memory entry as a Nostr event
          const event = {
            kind: 30078, // NIP-78 application-specific data
            content: JSON.stringify(entry.data),
            tags: [
              ['d', entry.id],
              ['t', 'hydraa-memory'],
            ],
            created_at: Math.floor(Date.now() / 1000),
          };

          const signed = await ctx.nostrIdentity.signEvent(event);
          await ctx.nostrClient.publish(signed);
          synced++;
        } catch {
          failed++;
        }
      }

      // Update last-sync timestamp
      await ctx.storage.setLastSync(new Date());

      return {
        success: true,
        message: `Memory sync complete: ${synced} synced, ${failed} failed out of ${entries.length} total.`,
        data: {
          synced,
          failed,
          total: entries.length,
          syncedAt: new Date().toISOString(),
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Memory migration failed: ${msg}` };
    }
  },
};
