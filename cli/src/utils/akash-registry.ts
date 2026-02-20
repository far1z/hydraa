/**
 * Akash protobuf type registry for cosmjs.
 *
 * Uses @akashnetwork/akashjs's built-in getAkashTypeRegistry() which returns
 * all Akash message types pre-registered. We merge them into a cosmjs Registry
 * alongside the default Cosmos SDK types.
 */

import { createRequire } from "node:module";
import { Registry } from "@cosmjs/proto-signing";
import { defaultRegistryTypes } from "@cosmjs/stargate";

/** Cached registry and types. */
let _registry: Registry | null = null;
let _akashTypes: [string, any][] | null = null;

/**
 * Build a cosmjs Registry containing both default Cosmos SDK types
 * and all Akash Network message types. Cached after first call.
 */
export function getAkashRegistry(): Registry {
  if (_registry) return _registry;

  const require = createRequire(import.meta.url);

  // Side-effect imports populate the shared messageTypeRegistry
  require("@akashnetwork/akash-api/v1beta3");
  require("@akashnetwork/akash-api/v1beta4");

  // Use akashjs's built-in helper to get all registered types
  const { getAkashTypeRegistry } = require("@akashnetwork/akashjs/build/stargate");
  _akashTypes = getAkashTypeRegistry();

  const registry = new Registry(defaultRegistryTypes);
  for (const [typeUrl, type] of _akashTypes!) {
    registry.register(typeUrl, type as any);
  }

  _registry = registry;
  return registry;
}

/**
 * Get a specific Akash protobuf type by typeUrl (e.g. "/akash.deployment.v1beta3.MsgCreateDeployment").
 * The returned type has fromPartial(), encode(), and decode() methods.
 */
export function getAkashType(typeUrl: string): any {
  if (!_akashTypes) getAkashRegistry();
  const entry = _akashTypes!.find(([url]) => url === typeUrl);
  if (!entry) throw new Error(`Unknown Akash type: ${typeUrl}`);
  return entry[1];
}
