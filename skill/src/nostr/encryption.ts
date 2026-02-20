/**
 * Nostr encryption helpers.
 * Provides NIP-44 (v2, preferred) and NIP-04 (legacy fallback) encryption/decryption.
 */

import { nip44, nip04 } from 'nostr-tools';

/**
 * Encrypt plaintext using NIP-44 (v2 encryption).
 * @param plaintext - The message to encrypt.
 * @param senderSecretKey - The sender's 32-byte secret key.
 * @param recipientPubkey - The recipient's hex public key.
 * @returns The encrypted ciphertext string.
 */
export function encrypt(
  plaintext: string,
  senderSecretKey: Uint8Array,
  recipientPubkey: string,
): string {
  const conversationKey = nip44.v2.utils.getConversationKey(
    senderSecretKey,
    recipientPubkey,
  );
  return nip44.v2.encrypt(plaintext, conversationKey);
}

/**
 * Decrypt ciphertext using NIP-44 (v2 encryption).
 * @param ciphertext - The encrypted payload.
 * @param receiverSecretKey - The receiver's 32-byte secret key.
 * @param senderPubkey - The sender's hex public key.
 * @returns The decrypted plaintext string.
 */
export function decrypt(
  ciphertext: string,
  receiverSecretKey: Uint8Array,
  senderPubkey: string,
): string {
  const conversationKey = nip44.v2.utils.getConversationKey(
    receiverSecretKey,
    senderPubkey,
  );
  return nip44.v2.decrypt(ciphertext, conversationKey);
}

/**
 * Encrypt plaintext using NIP-04 (legacy, AES-CBC).
 * Use NIP-44 when possible; this exists for backward compatibility.
 * @param plaintext - The message to encrypt.
 * @param senderSecretKey - The sender's 32-byte secret key.
 * @param recipientPubkey - The recipient's hex public key.
 * @returns The encrypted ciphertext string.
 */
export function encryptNip04(
  plaintext: string,
  senderSecretKey: Uint8Array,
  recipientPubkey: string,
): string {
  return nip04.encrypt(senderSecretKey, recipientPubkey, plaintext);
}

/**
 * Decrypt ciphertext using NIP-04 (legacy, AES-CBC).
 * Use NIP-44 when possible; this exists for backward compatibility.
 * @param ciphertext - The encrypted payload.
 * @param receiverSecretKey - The receiver's 32-byte secret key.
 * @param senderPubkey - The sender's hex public key.
 * @returns The decrypted plaintext string.
 */
export function decryptNip04(
  ciphertext: string,
  receiverSecretKey: Uint8Array,
  senderPubkey: string,
): string {
  return nip04.decrypt(receiverSecretKey, senderPubkey, ciphertext);
}
