/**
 * Akash protobuf type registry for cosmjs.
 *
 * Loads all Akash message types from @akashnetwork/akash-api and registers
 * them with a cosmjs Registry so SigningStargateClient can encode/decode them.
 *
 * The key trick: importing the v1beta3/v1beta4 barrel modules triggers
 * side-effect registration into a shared messageTypeRegistry Map. We then
 * read from that Map and feed the types into a cosmjs Registry.
 */

import { createRequire } from "node:module";
import { Registry } from "@cosmjs/proto-signing";
import { defaultRegistryTypes } from "@cosmjs/stargate";

export interface AkashMessageType {
  $type: string;
  encode: (message: any, writer?: any) => any;
  decode: (input: any, length?: number) => any;
  fromPartial: (object: any) => any;
  fromJSON: (object: any) => any;
  toJSON: (message: any) => any;
}

let _registry: Registry | null = null;
let _messageTypes: Map<string, AkashMessageType> | null = null;

/**
 * Load all Akash protobuf types and create a cosmjs Registry.
 * Cached after first call.
 */
export function getAkashRegistry(): Registry {
  if (_registry) return _registry;

  const require = createRequire(import.meta.url);

  // Side-effect imports: populate the global messageTypeRegistry
  require("@akashnetwork/akash-api/v1beta3");
  require("@akashnetwork/akash-api/v1beta4");

  const { messageTypeRegistry } = require("@akashnetwork/akash-api/typeRegistry");
  _messageTypes = messageTypeRegistry;

  // Build cosmjs registry with default + all Akash types
  const registry = new Registry(defaultRegistryTypes);

  for (const [typeName, typeImpl] of messageTypeRegistry) {
    const typeUrl = `/${typeName}`;
    // cosmjs Registry.register expects (typeUrl, GeneratedType)
    // GeneratedType needs encode/decode/fromPartial — which our types have
    registry.register(typeUrl, typeImpl as any);
  }

  _registry = registry;
  return registry;
}

/**
 * Get a specific Akash protobuf message type by its $type name.
 * Call getAkashRegistry() first to ensure types are loaded.
 *
 * @example
 * ```ts
 * getAkashRegistry(); // ensure loaded
 * const MsgCreateDeployment = getAkashType("akash.deployment.v1beta3.MsgCreateDeployment");
 * const msg = MsgCreateDeployment.fromPartial({ ... });
 * ```
 */
export function getAkashType(typeName: string): AkashMessageType {
  if (!_messageTypes) getAkashRegistry();
  const type = _messageTypes!.get(typeName);
  if (!type) throw new Error(`Unknown Akash type: ${typeName}`);
  return type;
}
