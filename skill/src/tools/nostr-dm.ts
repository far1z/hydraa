/**
 * hydraa_nostr_dm — Send an encrypted DM to a Nostr pubkey via NIP-44.
 */

import type { HydraaTool, HydraaContext, ToolResult } from './index.js';

export const nostrDmTool: HydraaTool = {
  name: 'hydraa_nostr_dm',
  description:
    'Send an encrypted direct message to a Nostr pubkey using NIP-44 encryption.',
  parameters: {
    type: 'object',
    properties: {
      recipient: {
        type: 'string',
        description: 'Hex pubkey or npub of the recipient.',
      },
      message: {
        type: 'string',
        description: 'Plaintext message to encrypt and send.',
      },
    },
    required: ['recipient', 'message'],
    additionalProperties: false,
  },

  async execute(params: Record<string, unknown>, ctx: HydraaContext): Promise<ToolResult> {
    const recipient = params.recipient as string;
    const message = params.message as string;

    if (!recipient || recipient.trim().length === 0) {
      return { success: false, message: 'Recipient pubkey is required.' };
    }
    if (!message || message.trim().length === 0) {
      return { success: false, message: 'Message must not be empty.' };
    }

    try {
      // Resolve npub to hex if needed
      const recipientHex = await ctx.nostrIdentity.resolveToHex(recipient);

      // Encrypt with NIP-44
      const ciphertext = await ctx.nostrIdentity.nip44Encrypt(recipientHex, message);

      // Build kind 14 gift-wrapped DM (NIP-44)
      const event = {
        kind: 14,
        content: ciphertext,
        tags: [['p', recipientHex]],
        created_at: Math.floor(Date.now() / 1000),
      };

      const signed = await ctx.nostrIdentity.signEvent(event);
      const publishResult = await ctx.nostrClient.publish(signed);

      return {
        success: true,
        message: `DM sent to ${recipientHex.slice(0, 8)}...`,
        data: {
          eventId: signed.id,
          recipient: recipientHex,
          relaysAccepted: publishResult.accepted,
          relaysFailed: publishResult.failed,
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Failed to send DM: ${msg}` };
    }
  },
};
