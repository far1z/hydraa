# Everclaw Integration

How Hydraa and Everclaw compose to create a fully decentralized OpenClaw agent.

---

## Division of Responsibilities

```
Everclaw                          Hydraa
─────────                         ──────
Decentralized inference           Everything else
  - Morpheus network proxy          - Compute (Akash)
  - Model routing                   - Messaging (Nostr)
  - MOR staking/session mgmt        - Memory (Nostr relays)
  - Provider discovery               - Identity (Nostr keypair)
                                     - Self-healing
                                     - Heartbeat monitoring
```

Everclaw handles the brain (inference). Hydraa handles the body (compute, communication, memory, identity). Together, no centralized component remains.

---

## How They Compose in the Same Container

Both Hydraa and Everclaw are OpenClaw skills that register independently. When both are installed:

```
+------------------------------------------+
|          Akash Container (Hydraa)         |
|                                          |
|  +------------------------------------+  |
|  |         OpenClaw Runtime            |  |
|  |                                    |  |
|  |  +--------------+  +------------+  |  |
|  |  | Hydraa Skill |  | Everclaw   |  |  |
|  |  |              |  | Skill      |  |  |
|  |  | compute      |  |            |  |  |
|  |  | nostr        |  | morpheus   |  |  |
|  |  | memory       |  | proxy      |  |  |
|  |  | heartbeat    |  |            |  |  |
|  |  | tools        |  | inference  |  |  |
|  |  +--------------+  +-----+------+  |  |
|  |         |                |          |  |
|  +---------|----------------|----------+  |
|            |                |             |
+------------|----------------|-------------+
             |                |
             v                v
     Nostr Relays      Morpheus Network
     (msg + memory)    (inference)
```

The OpenClaw runtime loads both skills. They don't need to know about each other directly -- they integrate through the standard OpenClaw skill interfaces:

1. **Everclaw** registers itself as an inference provider. OpenClaw routes model calls through it.
2. **Hydraa** manages the container, networking, memory, and identity. It doesn't care where inference comes from.

### Deployment

When Hydraa deploys to Akash, it packages the entire OpenClaw runtime including all installed skills. If Everclaw is installed, it's included in the container automatically.

The Akash SDL includes environment variables for both:

```yaml
env:
  # Hydraa
  - HYDRAA_NOSTR_SECRET_KEY=...
  - HYDRAA_NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol
  # Everclaw
  - EVERCLAW_MOR_WALLET=...
  - EVERCLAW_MORPHEUS_ROUTER=...
```

---

## Inference Endpoint for Heartbeat

Hydraa's heartbeat system has an "expensive tier" that uses inference for:
- Daily activity summaries
- Analyzing batched notifications
- Self-healing decisions

When Everclaw is available, these inference calls route through the Morpheus network instead of a centralized API. This means even the heartbeat's analysis is decentralized.

```
Heartbeat "expensive" trigger
    |
    v
OpenClaw inference call
    |
    +-- Everclaw installed?
    |       |
    |       +-- YES → Route through Morpheus network
    |       |           (decentralized, uses MOR stake)
    |       |
    |       +-- NO → Route through configured model provider
    |                   (centralized, e.g. OpenAI, Anthropic)
    |
    v
Result used for self-healing decision / summary
```

The heartbeat code doesn't need to check which provider is active. It makes a standard OpenClaw inference call, and the routing happens at the framework level.

---

## Without Everclaw

Hydraa works fine without Everclaw. The only difference is that inference calls go to your configured centralized model provider (OpenAI, Anthropic, etc.) instead of the Morpheus network.

This means your agent is decentralized in every layer except inference:
- Compute: decentralized (Akash)
- Messaging: decentralized (Nostr)
- Memory: decentralized (Nostr relays)
- Identity: decentralized (Nostr keypair)
- Inference: centralized (your API provider)

For many users this is an acceptable tradeoff -- inference providers are less likely to be a censorship chokepoint than compute or messaging infrastructure, and the agent can always switch providers.

---

## Installing Both Skills

```bash
openclaw skill install hydraa
openclaw skill install everclaw
```

Order doesn't matter. Both skills register independently and compose automatically through OpenClaw's skill system.
