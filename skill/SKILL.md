---
name: hydraa
description: Make your OpenClaw agent unstoppable. Deploys to decentralized compute (Akash), adds Nostr messaging, and migrates memory to encrypted relay storage. Nobody can shut it down.
metadata:
  openclaw:
    emoji: "\U0001F513"
    requires:
      bins: ["node"]
    optional_skills: ["everclaw"]
    install:
      - id: npm
        kind: npm
        package: "hydraa"
        bins: ["hydraa"]
        label: "Install Hydraa"
---

# Hydraa — Decentralize Your OpenClaw Agent

Hydraa makes your OpenClaw agent unstoppable by migrating it to fully decentralized infrastructure.

## What It Does

When you install Hydraa, your agent gains the ability to:

1. **Deploy itself to Akash Network** — decentralized cloud compute, no single provider controls it
2. **Communicate over Nostr** — censorship-resistant messaging via encrypted DMs
3. **Store memory on Nostr relays** — encrypted, replicated across multiple relays, survives any single node failure
4. **Self-heal** — automatically redeploys if the Akash container goes down
5. **Alert you** — proactive Nostr DMs when funding is low or infrastructure needs attention

## Prerequisites

- AKT tokens for Akash compute (0.5 CPU / 512MB container costs ~$3-5/month)
- A Nostr keypair (Hydraa can generate one for you)
- Optional: Everclaw skill for decentralized inference via Morpheus (not required — Hydraa works with whatever model provider you're already using)

## Quick Start

Tell your agent: "Deploy yourself to Akash and set up Nostr"

Or use the CLI:
```bash
npx hydraa init
npx hydraa deploy
```

## Available Tools

### hydraa_deploy
Deploy the current OpenClaw configuration to Akash Network.

### hydraa_status
Check the health of all decentralized infrastructure: Akash container, Nostr relay connectivity, AKT balance, MOR stake status.

### hydraa_fund
Check AKT wallet balance and get instructions for topping up.

### hydraa_migrate_memory
Sync local conversation history and knowledge to encrypted Nostr relay storage.

### hydraa_nostr_post
Post a note on Nostr as the agent's identity (npub).

### hydraa_nostr_dm
Send an encrypted DM to a Nostr pubkey.

### hydraa_destroy
Tear down the Akash deployment and optionally wipe relay memory.

## How Memory Works

Hydraa stores memory as encrypted NIP-78 events on Nostr relays. Each memory entry is:
- Encrypted with the agent's Nostr keypair (only the agent can read it)
- Replicated across 3-5 relays for redundancy
- Namespaced as `hydraa:{type}:{key}` to avoid collisions
- Cached locally in SQLite for fast access (ephemeral, rebuilt from relays on restart)

Memory types:
- `hydraa:conversation:{user_pubkey}` — conversation history per user
- `hydraa:knowledge:{topic}` — long-term facts the agent has learned
- `hydraa:preferences:{user_pubkey}` — user preferences
- `hydraa:state:{key}` — agent operational state (heartbeat timestamps, etc.)

## How Heartbeat Works

Two-tier proactive monitoring:

**Cheap tier (no inference, runs every 1-5 min):**
- New Nostr mentions or DMs
- AKT wallet balance check
- Akash container health ping
- MOR stake status (via Everclaw)
- Scheduled reminder triggers

**Expensive tier (uses inference, runs on triggers):**
- Daily activity summary via Nostr DM to user
- Analyze batched notifications for importance
- Self-healing decisions (should I redeploy? switch providers?)

## Nostr as a Messaging Channel

Hydraa registers Nostr as an additional OpenClaw channel. The agent listens for encrypted DMs on its npub and routes them through the standard OpenClaw message pipeline. Responses are sent back as encrypted DMs.

This means the user can talk to their agent from ANY Nostr client:
- Damus (iOS)
- Amethyst (Android)
- Primal (web/mobile)
- Any NIP-04/NIP-44 compatible client

Existing WhatsApp/Telegram/Discord channels continue to work as fallbacks.
