/**
 * Daily summary generator — Gathers activity stats and sends to owner.
 */

import type { Notifier } from './notify.js';

export interface SummarizerDeps {
  storage: any;
  notifier: Notifier;
  inferenceEndpoint?: string;
}

export interface Summarizer {
  summarize: () => Promise<void>;
}

/**
 * Create a daily summarizer that collects activity stats and notifies the owner.
 *
 * If an inference endpoint is available (e.g. Everclaw at localhost:8083),
 * it will generate a natural language summary. Otherwise it sends structured
 * text with the raw stats.
 */
export function createSummarizer(deps: SummarizerDeps): Summarizer {
  const { storage, notifier, inferenceEndpoint } = deps;

  return {
    async summarize(): Promise<void> {
      // Gather stats
      let stats: Record<string, unknown>;
      try {
        const memStats = await storage.getStats();
        stats = {
          memoryEntries: memStats.entries ?? 0,
          lastSync: memStats.lastSync ?? 'never',
          uptime: process.uptime(),
        };
      } catch {
        stats = { memoryEntries: 0, lastSync: 'unknown', uptime: process.uptime() };
      }

      const uptimeHours = (stats.uptime as number) / 3600;

      // Try to generate a natural language summary via inference
      if (inferenceEndpoint) {
        try {
          const res = await fetch(`${inferenceEndpoint}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [
                {
                  role: 'system',
                  content: 'You generate concise daily activity summaries for an autonomous agent. Keep it under 280 characters.',
                },
                {
                  role: 'user',
                  content: `Generate a brief daily summary from these stats: ${JSON.stringify(stats)}`,
                },
              ],
            }),
          });

          if (res.ok) {
            const data = (await res.json()) as { message?: { content?: string } };
            const summary = data.message?.content;
            if (summary) {
              await notifier.notify(summary, 'low');
              return;
            }
          }
        } catch {
          // Fall through to structured summary
        }
      }

      // Structured text fallback
      const summary =
        `Daily summary: ` +
        `${stats.memoryEntries} memory entries, ` +
        `last sync: ${stats.lastSync}, ` +
        `uptime: ${uptimeHours.toFixed(1)}h.`;

      await notifier.notify(summary, 'low');
    },
  };
}
