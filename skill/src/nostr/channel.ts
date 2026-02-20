/**
 * Nostr messaging channel for Hydraa agents.
 * Listens for encrypted DMs (NIP-04 kind 4 and NIP-59 gift-wrapped kind 1059)
 * and provides send/receive capabilities with deduplication and ordering.
 */

import { EventEmitter } from 'node:events';
import { finalizeEvent } from 'nostr-tools/pure';
import { nip59 } from 'nostr-tools';
import type { Event, EventTemplate } from 'nostr-tools';
import type { SubCloser } from 'nostr-tools/pool';
import type { NostrClient } from './client.js';
import type { NostrIdentity } from './identity.js';
import {
  encrypt,
  decrypt,
  encryptNip04,
  decryptNip04,
} from './encryption.js';

/** An incoming message received on the channel. */
export interface IncomingMessage {
  senderPubkey: string;
  content: string;
  timestamp: number;
  eventId: string;
}

/** Events emitted by NostrChannel. */
export interface NostrChannelEvents {
  message: [msg: IncomingMessage];
  error: [err: Error];
}

/** NIP-04 encrypted DM kind. */
const KIND_ENCRYPTED_DM = 4;

/** NIP-59 gift wrap kind. */
const KIND_GIFT_WRAP = 1059;

/**
 * Nostr-based messaging channel using encrypted DMs.
 * Supports both NIP-04 (legacy kind 4) and NIP-59 (gift-wrapped, kind 1059) messages.
 * Uses EventEmitter pattern to deliver incoming messages.
 */
export class NostrChannel extends EventEmitter {
  private client: NostrClient;
  private identity: NostrIdentity;
  private seenEventIds: Set<string> = new Set();
  private subscriptions: SubCloser[] = [];
  private running: boolean = false;

  /**
   * @param client - A connected NostrClient instance.
   * @param identity - The agent's NostrIdentity for decryption and signing.
   */
  constructor(client: NostrClient, identity: NostrIdentity) {
    super();
    this.client = client;
    this.identity = identity;
  }

  /**
   * Start listening for incoming DMs addressed to this agent.
   * Subscribes to both NIP-04 (kind 4) and NIP-59 (kind 1059) events.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Subscribe to NIP-04 encrypted DMs (kind 4) addressed to us
    const nip04Sub = this.client.subscribe(
      {
        kinds: [KIND_ENCRYPTED_DM],
        '#p': [this.identity.publicKey],
      },
      (event) => this.handleNip04Event(event),
    );
    this.subscriptions.push(nip04Sub);

    // Subscribe to NIP-59 gift-wrapped messages (kind 1059) addressed to us
    const giftWrapSub = this.client.subscribe(
      {
        kinds: [KIND_GIFT_WRAP],
        '#p': [this.identity.publicKey],
      },
      (event) => this.handleGiftWrapEvent(event),
    );
    this.subscriptions.push(giftWrapSub);
  }

  /**
   * Stop listening and close all subscriptions.
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    for (const sub of this.subscriptions) {
      sub.close();
    }
    this.subscriptions = [];
  }

  /**
   * Send an encrypted DM to a recipient using NIP-59 gift wrap (preferred).
   * @param recipientPubkey - The hex public key of the recipient.
   * @param content - The plaintext message content.
   */
  async sendMessage(recipientPubkey: string, content: string): Promise<void> {
    const wrappedEvent = nip59.wrapEvent(
      {
        kind: 14,
        tags: [['p', recipientPubkey]],
        content,
        created_at: Math.floor(Date.now() / 1000),
      },
      this.identity.secretKey,
      recipientPubkey,
    );

    await this.client.publish(wrappedEvent);
  }

  /**
   * Send an encrypted DM using NIP-04 (legacy format, kind 4).
   * Use sendMessage() (NIP-59) when possible.
   * @param recipientPubkey - The hex public key of the recipient.
   * @param content - The plaintext message content.
   */
  async sendNip04Message(
    recipientPubkey: string,
    content: string,
  ): Promise<void> {
    const encrypted = encryptNip04(
      content,
      this.identity.secretKey,
      recipientPubkey,
    );

    const template: EventTemplate = {
      kind: KIND_ENCRYPTED_DM,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', recipientPubkey]],
      content: encrypted,
    };

    const event = finalizeEvent(template, this.identity.secretKey);
    await this.client.publish(event);
  }

  /** Whether the channel is currently listening for messages. */
  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Handle a NIP-04 encrypted DM event (kind 4).
   */
  private handleNip04Event(event: Event): void {
    if (this.isDuplicate(event.id)) return;

    try {
      const content = decryptNip04(
        event.content,
        this.identity.secretKey,
        event.pubkey,
      );

      this.emitMessage({
        senderPubkey: event.pubkey,
        content,
        timestamp: event.created_at,
        eventId: event.id,
      });
    } catch (err) {
      this.emit(
        'error',
        new Error(
          `Failed to decrypt NIP-04 message ${event.id}: ${err instanceof Error ? err.message : err}`,
        ),
      );
    }
  }

  /**
   * Handle a NIP-59 gift-wrapped event (kind 1059).
   * Unwraps the seal and rumor to extract the plaintext content.
   */
  private handleGiftWrapEvent(event: Event): void {
    if (this.isDuplicate(event.id)) return;

    try {
      const rumor = nip59.unwrapEvent(event, this.identity.secretKey);

      this.emitMessage({
        senderPubkey: rumor.pubkey,
        content: rumor.content,
        timestamp: rumor.created_at,
        eventId: event.id,
      });
    } catch (err) {
      this.emit(
        'error',
        new Error(
          `Failed to unwrap NIP-59 message ${event.id}: ${err instanceof Error ? err.message : err}`,
        ),
      );
    }
  }

  /**
   * Check if an event has already been processed (deduplication).
   */
  private isDuplicate(eventId: string): boolean {
    if (this.seenEventIds.has(eventId)) return true;
    this.seenEventIds.add(eventId);
    return false;
  }

  /**
   * Emit a message event with the parsed incoming message.
   */
  private emitMessage(msg: IncomingMessage): void {
    this.emit('message', msg);
  }
}
