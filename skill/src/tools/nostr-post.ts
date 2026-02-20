/**
 * hydraa_nostr_post — Post a kind 1 text note on Nostr as the agent's npub.
 */

import type { HydraaTool, HydraaContext, ToolResult } from './index.js';

export const nostrPostTool: HydraaTool = {
  name: 'hydraa_nostr_post',
  description:
    'Post a kind 1 (text note) event on Nostr as the agent\'s identity. Optionally attach NIP-10/NIP-27 tags.',
  parameters: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The text content of the note.',
      },
      tags: {
        type: 'array',
        items: {
          type: 'array',
          items: { type: 'string' },
        },
        description: 'Optional NIP-compliant tags (e.g. [["p", "<pubkey>"], ["t", "hydraa"]]).',
      },
    },
    required: ['content'],
    additionalProperties: false,
  },

  async execute(params: Record<string, unknown>, ctx: HydraaContext): Promise<ToolResult> {
    const content = params.content as string;
    const tags = (params.tags as string[][] | undefined) ?? [];

    if (!content || content.trim().length === 0) {
      return { success: false, message: 'Content must not be empty.' };
    }

    try {
      const event = {
        kind: 1,
        content,
        tags,
        created_at: Math.floor(Date.now() / 1000),
      };

      const signed = await ctx.nostrIdentity.signEvent(event);
      const publishResult = await ctx.nostrClient.publish(signed);

      return {
        success: true,
        message: `Note published (id: ${signed.id}).`,
        data: {
          eventId: signed.id,
          pubkey: signed.pubkey,
          relaysAccepted: publishResult.accepted,
          relaysFailed: publishResult.failed,
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Failed to post note: ${msg}` };
    }
  },
};
