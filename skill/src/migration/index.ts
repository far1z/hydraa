/**
 * Migration module — packaging, memory sync, and config bridging.
 */

export { packageWorkspace, type PackageResult } from './packager.js';
export { syncMemoryToRelays, type SyncResult } from './memory-sync.js';
export { bridgeConfig, type ContainerConfig } from './config-bridge.js';
