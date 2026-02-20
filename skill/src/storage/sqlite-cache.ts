/**
 * Local SQLite cache for fast reads.
 * Provides a local layer that can sync from relay storage.
 */

import Database from 'better-sqlite3';
import type { Storage, StorageEntry } from './interface.js';

const DEFAULT_DB_PATH = '/data/hydraa-cache.db';

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    metadata TEXT,
    updated_at INTEGER NOT NULL
  )
`;

export class SqliteCacheStorage implements Storage {
  private db: Database.Database;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(CREATE_TABLE_SQL);
  }

  async get(key: string): Promise<string | null> {
    const row = this.db
      .prepare('SELECT value FROM cache WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  async set(key: string, value: string, metadata?: Record<string, string>): Promise<void> {
    const metaStr = metadata ? JSON.stringify(metadata) : null;
    this.db
      .prepare(
        'INSERT OR REPLACE INTO cache (key, value, metadata, updated_at) VALUES (?, ?, ?, ?)'
      )
      .run(key, value, metaStr, Date.now());
  }

  async delete(key: string): Promise<void> {
    this.db.prepare('DELETE FROM cache WHERE key = ?').run(key);
  }

  async list(prefix: string): Promise<StorageEntry[]> {
    const rows = this.db
      .prepare('SELECT key, value, metadata, updated_at FROM cache WHERE key LIKE ?')
      .all(`${prefix}%`) as Array<{
      key: string;
      value: string;
      metadata: string | null;
      updated_at: number;
    }>;

    return rows.map((row) => ({
      key: row.key,
      value: row.value,
      metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, string>) : undefined,
      updatedAt: new Date(row.updated_at),
    }));
  }

  /** Sync all entries from relay storage into local cache */
  async sync(relayStorage: Storage): Promise<void> {
    const entries = await relayStorage.list('');
    const upsert = this.db.prepare(
      'INSERT OR REPLACE INTO cache (key, value, metadata, updated_at) VALUES (?, ?, ?, ?)'
    );

    const runSync = this.db.transaction(() => {
      for (const entry of entries) {
        const metaStr = entry.metadata ? JSON.stringify(entry.metadata) : null;
        upsert.run(entry.key, entry.value, metaStr, entry.updatedAt.getTime());
      }
    });

    runSync();
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
