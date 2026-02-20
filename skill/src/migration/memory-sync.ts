/**
 * Sync local OpenClaw memory files to Nostr relay storage.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Storage } from '../storage/interface.js';

export interface SyncResult {
  /** Number of entries successfully synced */
  synced: number;
  /** Number of entries that failed to sync */
  failed: number;
  /** Total entries attempted */
  total: number;
}

interface SyncOpts {
  /** Path to the local OpenClaw memory directory */
  localPath: string;
  /** Storage backend to sync to */
  storage: Storage;
  /** Progress callback (0-100) */
  onProgress?: (pct: number) => void;
}

/** Recursively collect all files under a directory */
function collectFiles(dirPath: string, base: string = dirPath): string[] {
  const files: string[] = [];
  if (!existsSync(dirPath)) return files;

  const entries = readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, base));
    } else {
      files.push(relative(base, fullPath));
    }
  }
  return files;
}

/** Derive a storage key from a memory file path */
function filePathToStorageKey(filePath: string): string {
  // Convert path separators and remove extension to form a key
  // e.g. "conversations/user123.json" -> "conversation:user123"
  // e.g. "knowledge/topic-name.json" -> "knowledge:topic-name"
  const normalized = filePath.replace(/\\/g, '/');
  const withoutExt = normalized.replace(/\.[^/.]+$/, '');
  const parts = withoutExt.split('/');

  if (parts.length >= 2) {
    // Singularize common directory names
    let type = parts[0];
    if (type.endsWith('s') && type.length > 1) {
      type = type.slice(0, -1);
    }
    const subkey = parts.slice(1).join('/');
    return `${type}:${subkey}`;
  }

  return `memory:${withoutExt}`;
}

/**
 * Sync local OpenClaw memory files to Nostr relay storage.
 * Reads all files from the local memory directory, encrypts them
 * via the storage layer, and tracks progress.
 */
export async function syncMemoryToRelays(opts: SyncOpts): Promise<SyncResult> {
  const { localPath, storage, onProgress } = opts;

  const files = collectFiles(localPath);
  const total = files.length;
  let synced = 0;
  let failed = 0;

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    const storageKey = filePathToStorageKey(filePath);

    try {
      const fullPath = join(localPath, filePath);
      const content = readFileSync(fullPath, 'utf-8');

      await storage.set(storageKey, content, {
        source: 'local-sync',
        originalPath: filePath,
      });

      synced++;
    } catch (err) {
      console.error(`[hydraa] Failed to sync ${filePath}:`, err);
      failed++;
    }

    if (onProgress) {
      const pct = Math.round(((i + 1) / total) * 100);
      onProgress(pct);
    }
  }

  return { synced, failed, total };
}
