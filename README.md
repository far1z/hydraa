# hydraa

**Install Hydra. Your agent becomes unkillable.**

Hydraa is an [OpenClaw](https://openclaw.org) skill that migrates your agent to fully decentralized infrastructure. No single company, server, or API can shut it down.

Your agent keeps running, keeps remembering, keeps communicating -- even if your laptop dies, your VPS gets nuked, or an API provider cuts you off.

---

## Before and After

| Layer | Before Hydraa | After Hydraa |
|------------|------------------------------|--------------------------------------|
| Inference  | Centralized API              | Morpheus via Everclaw                |
| Compute    | Your laptop / VPS            | Akash Network                        |
| Messaging  | WhatsApp/Telegram/Discord    | Nostr + existing channels            |
| Memory     | Local SQLite / filesystem    | Encrypted Nostr relay events         |
| Identity   | Phone number / email         | Nostr keypair                        |

Every layer that can be a single point of failure gets replaced with a decentralized alternative. Your existing channels (WhatsApp, Telegram, Discord) still work as fallbacks.

---

## How It Works

Hydraa handles compute, messaging, memory, and identity. Pair it with [Everclaw](https://github.com/openclaw/everclaw) for decentralized inference via the Morpheus network, and your entire OpenClaw agent stack is censorship-resistant.

```
Hydraa    = compute + messaging + memory + identity
Everclaw  = decentralized inference (Morpheus)
─────────────────────────────────────────────────────
Together  = fully decentralized OpenClaw
```

---

## Install

```bash
openclaw skill install hydraa
```

Or, if you prefer the CLI directly:

```bash
npx hydraa init
npx hydraa deploy
```

---

## What You Need

- **OpenClaw** -- the agent framework Hydraa extends
- **AKT tokens** -- ~$3-5/month for a lightweight container on Akash Network
- **Everclaw** (optional) -- for decentralized inference via Morpheus. Without it, Hydraa works with whatever model provider you already use.

---

## Architecture

```
                          +-----------------------+
                          |   You (any device)    |
                          +----------+------------+
                                     |
                    +----------------+----------------+
                    |                                  |
            Nostr DMs                    WhatsApp / Telegram / Discord
            (any client)                      (existing channels)
                    |                                  |
                    +----------------+----------------+
                                     |
                                     v
                          +----------+------------+
                          |    Agent on Akash     |
                          |  (decentralized VM)   |
                          +----------+------------+
                                     |
               +---------------------+---------------------+
               |                     |                      |
               v                     v                      v
     +---------+--------+  +--------+--------+  +----------+---------+
     |  Nostr Relays     |  |  Akash Network  |  |  Morpheus / LLM    |
     |  (memory store)   |  |  (compute)      |  |  (inference)       |
     |  encrypted events |  |  self-healing   |  |  via Everclaw      |
     +------------------+  +-----------------+  +--------------------+
```

Messages come in from Nostr DMs or your existing chat channels. The agent runs on Akash -- decentralized compute where no single provider can shut you down. Memory lives as encrypted events on multiple Nostr relays. Inference goes through Morpheus if Everclaw is installed, or your existing provider otherwise.

---

## Self-Healing

Hydraa doesn't just deploy your agent -- it keeps it alive.

The heartbeat system continuously monitors the Akash deployment. If the container goes down, Hydraa automatically:

1. Detects the failure via health check
2. Attempts to restart with the same provider
3. If the provider is unresponsive, redeploys to a different Akash provider
4. Reloads memory from Nostr relays (nothing is lost)
5. Notifies you via Nostr DM that it self-healed

Your agent is a Hydra. Cut off one head, another grows back.

---

## Heartbeat

Two-tier proactive monitoring, designed to minimize costs:

**Cheap tier (no inference, every 1-5 minutes):**
- Akash container health ping
- New Nostr mentions or DMs
- AKT wallet balance check
- Scheduled reminder triggers

**Expensive tier (uses inference, triggered on-demand):**
- Daily activity summary via Nostr DM
- Analyze batched notifications for importance
- Self-healing decisions (should I redeploy? switch providers?)

The cheap tier runs constantly and costs nothing beyond compute. The expensive tier runs only when needed, keeping your inference costs minimal.

---

## Memory

Memory is stored as encrypted [NIP-78](https://github.com/nostr-protocol/nips/blob/master/78.md) events on Nostr relays. Each entry is:

- **Encrypted** with the agent's Nostr keypair (only the agent can read it)
- **Replicated** across 3-5 relays for redundancy
- **Namespaced** as `hydraa:{type}:{key}` to avoid collisions
- **Cached locally** in SQLite for fast access (ephemeral, rebuilt from relays on restart)

Memory types:
- `hydraa:conversation:{user_pubkey}` -- conversation history per user
- `hydraa:knowledge:{topic}` -- long-term facts the agent has learned
- `hydraa:preferences:{user_pubkey}` -- user preferences
- `hydraa:state:{key}` -- agent operational state

If the container dies, memory survives on the relays. On restart, the agent pulls its full state back and picks up where it left off.

---

## Talk to Your Agent from Anywhere

Because your agent has a Nostr identity (npub), you can message it from any Nostr client:

- **Damus** (iOS)
- **Amethyst** (Android)
- **Primal** (web/mobile)
- Any NIP-04/NIP-44 compatible client

No app to install, no API to call. Just send an encrypted DM to your agent's npub from whatever Nostr client you prefer.

Your existing WhatsApp/Telegram/Discord channels continue to work as well.

---

## Roadmap

| Version | Milestone |
|---------|-----------|
| v0.1    | Akash deployment + Nostr identity + basic heartbeat |
| v0.2    | Encrypted memory on Nostr relays + self-healing |
| v0.3    | Nostr DM channel + chat CLI |
| v0.4    | Everclaw integration (Morpheus inference) |
| v0.5    | Multi-provider failover + cost optimization |
| v0.6    | Relay-hosted agent bundles (zero-config restore) |

---

## FAQ

**Is this a new agent?**
No. Hydraa is a skill for your existing OpenClaw agent. It doesn't replace your agent -- it moves it to decentralized infrastructure. Same personality, same tools, same knowledge.

**What if Akash drops me?**
Akash is a decentralized marketplace with many independent providers. If one provider goes offline, Hydraa automatically redeploys to another. No single provider can permanently remove your agent.

**What if Akash itself won't serve me?**
Akash is a permissionless blockchain marketplace. There's no central authority to deny you service. If you can pay with AKT tokens, you can deploy. If Akash the network somehow becomes unavailable, Hydraa supports self-hosted fallback.

**What if a relay goes down?**
Memory is replicated across multiple relays. If one goes down, the others still have your data. When the relay comes back (or you add a new one), data re-syncs automatically.

**Can I still use WhatsApp?**
Yes. Hydraa adds Nostr as a new channel, it doesn't replace your existing ones. WhatsApp, Telegram, Discord -- they all continue to work.

**How much does it cost?**
About $3-5/month in AKT tokens for a lightweight container (0.5 CPU, 512Mi RAM, 1Gi storage). That's the Akash compute cost. Nostr relays are free to use. Inference costs depend on your model provider.

**What about Everclaw?**
Everclaw is a separate OpenClaw skill that provides decentralized inference through the Morpheus network. Hydraa handles everything else (compute, messaging, memory, identity). Together they make a fully decentralized agent stack. Everclaw is optional -- without it, Hydraa works with whatever model provider you're already using.

---

## Built On

- [OpenClaw](https://openclaw.org) -- the agent framework
- [Akash Network](https://akash.network) -- decentralized cloud compute
- [Nostr](https://nostr.com) -- censorship-resistant communication protocol
- [Morpheus](https://mor.org) -- decentralized AI inference (via Everclaw)

---

## License

MIT -- see [LICENSE](./LICENSE)
