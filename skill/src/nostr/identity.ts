/**
 * Nostr keypair management for Hydraa agents.
 * Handles generation, import/export of Nostr identities using NIP-19 bech32 encoding.
 */

import {
  generateSecretKey,
  getPublicKey as derivePublicKey,
} from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';

/** A complete Nostr identity with secret key, public key, and bech32-encoded forms. */
export interface NostrIdentity {
  secretKey: Uint8Array;
  publicKey: string;
  nsec: string;
  npub: string;
}

/**
 * Generate a new random Nostr keypair.
 * @returns A full NostrIdentity with secret key, public key, nsec, and npub.
 */
export function generateKeypair(): NostrIdentity {
  const secretKey = generateSecretKey();
  const publicKey = derivePublicKey(secretKey);
  return {
    secretKey,
    publicKey,
    nsec: nip19.nsecEncode(secretKey),
    npub: nip19.npubEncode(publicKey),
  };
}

/**
 * Import a Nostr identity from an nsec bech32 string.
 * @param nsec - The nsec-encoded secret key (e.g. "nsec1...")
 * @returns A full NostrIdentity derived from the secret key.
 * @throws If the nsec string is invalid.
 */
export function importFromNsec(nsec: string): NostrIdentity {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== 'nsec') {
    throw new Error(`Expected nsec, got ${decoded.type}`);
  }
  const secretKey = decoded.data;
  const publicKey = derivePublicKey(secretKey);
  return {
    secretKey,
    publicKey,
    nsec: nip19.nsecEncode(secretKey),
    npub: nip19.npubEncode(publicKey),
  };
}

/**
 * Export a secret key to nsec bech32 format.
 * @param secretKey - The raw 32-byte secret key.
 * @returns The nsec-encoded string.
 */
export function exportToNsec(secretKey: Uint8Array): string {
  return nip19.nsecEncode(secretKey);
}

/**
 * Export a public key (hex) to npub bech32 format.
 * @param publicKey - The hex-encoded public key.
 * @returns The npub-encoded string.
 */
export function exportToNpub(publicKey: string): string {
  return nip19.npubEncode(publicKey);
}

/**
 * Derive the public key from a secret key.
 * @param secretKey - The raw 32-byte secret key.
 * @returns The hex-encoded public key.
 */
export function getPublicKey(secretKey: Uint8Array): string {
  return derivePublicKey(secretKey);
}
