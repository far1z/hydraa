/**
 * AKT wallet management — key derivation, balance queries, and tx signing.
 *
 * Uses cosmjs libraries to interact with the Akash chain.
 */

import { DirectSecp256k1HdWallet, type Registry } from '@cosmjs/proto-signing';
import {
  SigningStargateClient,
  type StdFee,
} from '@cosmjs/stargate';
import type { EncodeObject } from '@cosmjs/proto-signing';
import type { Balance } from '../interface.js';

/** Default Akash RPC if none provided. */
const DEFAULT_RPC = 'https://rpc.akashnet.net:443';
/** Bech32 prefix for Akash addresses. */
const AKASH_PREFIX = 'akash';
/** Coin denomination on the Akash chain. */
const DENOM = 'uakt';
/** HD derivation path (Cosmos SDK standard). */
const HD_PATH = "m/44'/118'/0'/0/0";

export class AkashWallet {
  private mnemonic: string;
  private rpcEndpoint: string;
  private registry: Registry | undefined;
  private wallet: DirectSecp256k1HdWallet | null = null;
  private client: SigningStargateClient | null = null;

  constructor(mnemonic: string, rpcEndpoint?: string, registry?: Registry) {
    this.mnemonic = mnemonic;
    this.rpcEndpoint = rpcEndpoint ?? DEFAULT_RPC;
    this.registry = registry;
  }

  /** Lazily initialise the HD wallet from the stored mnemonic. */
  private async getWallet(): Promise<DirectSecp256k1HdWallet> {
    if (!this.wallet) {
      this.wallet = await DirectSecp256k1HdWallet.fromMnemonic(this.mnemonic, {
        prefix: AKASH_PREFIX,
        hdPaths: [
          // cosmjs expects a slip10-style path array; the string form is
          // accepted by the helper below.
          stringToHdPath(HD_PATH),
        ] as any,
      });
    }
    return this.wallet;
  }

  /** Lazily create (or reuse) a signing Stargate client with Akash type registry. */
  private async getClient(): Promise<SigningStargateClient> {
    if (!this.client) {
      const wallet = await this.getWallet();
      this.client = await SigningStargateClient.connectWithSigner(
        this.rpcEndpoint,
        wallet,
        this.registry ? { registry: this.registry } : undefined,
      );
    }
    return this.client;
  }

  /** Derive the Akash bech32 address from the mnemonic. */
  async getAddress(): Promise<string> {
    const wallet = await this.getWallet();
    const [account] = await wallet.getAccounts();
    return account.address;
  }

  /** Query the on-chain AKT balance. */
  async getBalance(): Promise<Balance> {
    const client = await this.getClient();
    const address = await this.getAddress();
    const coin = await client.getBalance(address, DENOM);
    const uakt = parseInt(coin.amount, 10);
    return {
      amount: uakt / 1_000_000, // Convert uakt -> AKT
      denom: 'AKT',
    };
  }

  /** Sign and broadcast an array of Cosmos SDK messages. */
  async signAndBroadcast(
    msgs: readonly EncodeObject[],
    fee: StdFee,
  ): Promise<string> {
    const client = await this.getClient();
    const address = await this.getAddress();
    const result = await client.signAndBroadcast(address, [...msgs], fee);

    if (result.code !== 0) {
      throw new Error(
        `Transaction failed (code ${result.code}): ${result.rawLog ?? 'unknown error'}`,
      );
    }
    return result.transactionHash;
  }

  /** Return the deposit address (same as the derived address). */
  async getDepositAddress(): Promise<string> {
    return this.getAddress();
  }

  /** Disconnect the RPC client and release resources. */
  disconnect(): void {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal HD-path parser — cosmjs v0.32 expects a `HdPath` (number[]) but
 * the convenience import isn't always re-exported cleanly. We keep things
 * simple by parsing the standard "m/44'/118'/0'/0/0" form ourselves.
 */
function stringToHdPath(path: string): number[] {
  return path
    .replace(/^m\//, '')
    .split('/')
    .map((seg) => {
      const hardened = seg.endsWith("'");
      const val = parseInt(seg.replace("'", ''), 10);
      return hardened ? val + 0x80000000 : val;
    });
}
