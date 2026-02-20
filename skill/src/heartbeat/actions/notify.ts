/**
 * Notifier — Sends Nostr DMs to the agent owner with rate limiting.
 */

export interface NotifierDeps {
  nostrClient: any;
  nostrIdentity: any;
  ownerPubkey: string;
}

export interface Notifier {
  notify: (message: string, priority: 'low' | 'normal' | 'high') => Promise<void>;
}

/**
 * Create a notifier that sends Nostr DMs to the configured owner pubkey.
 *
 * Rate limits:
 * - "low"    : max 1 message per 5 minutes
 * - "normal" : max 1 message per minute
 * - "high"   : no rate limit
 */
export function createNotifier(deps: NotifierDeps): Notifier {
  const { nostrClient, nostrIdentity, ownerPubkey } = deps;

  const lastSent: Record<string, number> = {
    low: 0,
    normal: 0,
  };

  const cooldowns: Record<string, number> = {
    low: 5 * 60 * 1000,    // 5 minutes
    normal: 60 * 1000,     // 1 minute
  };

  return {
    async notify(message: string, priority: 'low' | 'normal' | 'high'): Promise<void> {
      // Apply rate limiting for non-high priority
      const cooldown = cooldowns[priority];
      if (cooldown) {
        const elapsed = Date.now() - (lastSent[priority] ?? 0);
        if (elapsed < cooldown) return;
        lastSent[priority] = Date.now();
      }

      try {
        const ciphertext = await nostrIdentity.nip44Encrypt(ownerPubkey, message);

        const event = {
          kind: 14,
          content: ciphertext,
          tags: [['p', ownerPubkey]],
          created_at: Math.floor(Date.now() / 1000),
        };

        const signed = await nostrIdentity.signEvent(event);
        await nostrClient.publish(signed);
      } catch (err) {
        console.error('[heartbeat] Failed to send notification:', err);
      }
    },
  };
}
