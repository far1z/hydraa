# Hydraa Architecture

Technical deep dive into how Hydraa decentralizes an OpenClaw agent.

---

## System Architecture

```
+-------------------------------------------------------------------+
|                        OpenClaw Agent                              |
|                                                                   |
|  +---------------------+  +--------------------+                  |
|  |    Hydraa Skill      |  |   Everclaw Skill   |  (optional)     |
|  |                      |  |                    |                  |
|  |  +----------------+  |  |  Morpheus proxy    |                  |
|  |  | Nostr Module   |  |  |  inference router  |                  |
|  |  |  - Identity    |  |  +--------------------+                  |
|  |  |  - Encryption  |  |                                         |
|  |  |  - Memory      |  |  +--------------------+                  |
|  |  |  - Channel     |  |  |   Other Skills     |                  |
|  |  |  - Client      |  |  |   (unchanged)      |                  |
|  |  +----------------+  |  +--------------------+                  |
|  |                      |                                         |
|  |  +----------------+  |                                         |
|  |  | Compute Module |  |                                         |
|  |  |  - Akash       |  |                                         |
|  |  |  - Self-hosted |  |                                         |
|  |  |  - Provider Mgr|  |                                         |
|  |  +----------------+  |                                         |
|  |                      |                                         |
|  |  +----------------+  |                                         |
|  |  | Storage Module |  |                                         |
|  |  |  - SQLite cache|  |                                         |
|  |  |  - Relay store |  |                                         |
|  |  +----------------+  |                                         |
|  |                      |                                         |
|  |  +----------------+  |                                         |
|  |  | Heartbeat      |  |                                         |
|  |  |  - Scheduler   |  |                                         |
|  |  |  - Monitors    |  |                                         |
|  |  |  - Actions     |  |                                         |
|  |  +----------------+  |                                         |
|  |                      |                                         |
|  |  +----------------+  |                                         |
|  |  | Tools (7)      |  |                                         |
|  |  |  - deploy      |  |                                         |
|  |  |  - status      |  |                                         |
|  |  |  - fund        |  |                                         |
|  |  |  - migrate_mem |  |                                         |
|  |  |  - nostr_post  |  |                                         |
|  |  |  - nostr_dm    |  |                                         |
|  |  |  - destroy     |  |                                         |
|  |  +----------------+  |                                         |
|  +---------------------+                                         |
+-------------------------------------------------------------------+
              |                    |                    |
              v                    v                    v
     +--------+-------+  +--------+-------+  +--------+-------+
     |  Akash Network  |  |  Nostr Relays  |  |  Morpheus Net  |
     |  (compute)      |  |  (msg+memory)  |  |  (inference)   |
     +----------------+  +----------------+  +----------------+
```

---

## Data Flow: Incoming Message

```
1. User sends encrypted DM to agent's npub
        |
2. Nostr relay forwards event to agent's subscription
        |
3. NostrClient receives NIP-04/NIP-44 encrypted event
        |
4. NostrEncryption decrypts message using agent's secret key
        |
5. NostrChannel routes decrypted message into OpenClaw pipeline
        |
6. OpenClaw processes message (inference, tools, etc.)
        |
7. Response text returned to NostrChannel
        |
8. NostrEncryption encrypts response with user's pubkey
        |
9. NostrClient publishes encrypted DM event to relays
        |
10. User's Nostr client receives and decrypts the response
```

## Data Flow: Outgoing Message (Proactive)

```
1. Heartbeat scheduler triggers a check
        |
2. Monitor detects condition (low balance, mention, etc.)
        |
3. Action decides to notify user
        |
4. NostrEncryption encrypts notification with user's pubkey
        |
5. NostrClient publishes DM event to relays
        |
6. User receives notification in their Nostr client
```

---

## Memory Sync Lifecycle

```
Write Path:
  Agent produces new memory entry
      |
  NostrMemory.set(namespace, key, value)
      |
  Encrypt value with agent's keypair
      |
  Publish NIP-78 event to all configured relays
      |
  Update local SQLite cache

Read Path (cache hit):
  NostrMemory.get(namespace, key)
      |
  Check SQLite cache → found → return decrypted value

Read Path (cache miss / cold start):
  NostrMemory.get(namespace, key)
      |
  Check SQLite cache → miss
      |
  Query NIP-78 events from relays with tag filter
      |
  Decrypt event content
      |
  Populate SQLite cache
      |
  Return value

Sync (on restart):
  Agent starts up
      |
  Query all NIP-78 events with hydraa:* namespace from relays
      |
  Decrypt and populate SQLite cache
      |
  Agent resumes with full memory state
```

---

## Self-Healing Decision Tree

```
Heartbeat check runs
    |
    +-- Is container responding?
    |       |
    |       +-- YES → record healthy, continue
    |       |
    |       +-- NO → increment failure counter
    |               |
    |               +-- Failures < 3?
    |               |       |
    |               |       +-- YES → wait, retry next cycle
    |               |       |
    |               |       +-- NO → begin recovery
    |               |               |
    |               |               +-- Try restart with same provider
    |               |               |       |
    |               |               |       +-- Success → notify user, reset counter
    |               |               |       |
    |               |               |       +-- Fail → try different provider
    |               |               |               |
    |               |               |               +-- Success → notify user, update config
    |               |               |               |
    |               |               |               +-- Fail → alert user, enter degraded mode
    |               |               |
    |               |               +-- Reload memory from relays
    |               |               |
    |               |               +-- Re-subscribe to Nostr events
    |
    +-- Is AKT balance low?
    |       |
    |       +-- > 1 month runway → ok
    |       +-- < 1 month → warn user via Nostr DM
    |       +-- < 1 week → urgent alert, consider cost reduction
    |
    +-- Any pending Nostr mentions/DMs?
            |
            +-- YES → queue for processing
            +-- NO → continue
```

---

## Compute Provider Failover Sequence

```
1. Primary provider becomes unresponsive
        |
2. Close existing lease (if possible)
        |
3. Create new deployment order on Akash
        |
4. Wait for bids from alternative providers
        |
5. Score bids by:
   - Price (lower is better)
   - Historical uptime (if known)
   - Geographic diversity (prefer different region)
        |
6. Accept best bid, create lease
        |
7. Send manifest to new provider
        |
8. Wait for container to become healthy
        |
9. Restore memory from Nostr relays
        |
10. Resume normal operation
        |
11. Notify user of provider change via Nostr DM
```

---

## Security Model

### Key Management

- **Nostr keypair**: Generated during `hydraa init`. Secret key stored in the Hydraa config file. Used for identity, encryption, and signing.
- **AKT wallet**: Mnemonic stored as environment variable (`HYDRAA_AKT_MNEMONIC`). Used for Akash deployment transactions.
- **No keys leave the agent**: Encryption and decryption happen locally inside the container.

### Encryption

- **Messages**: NIP-04 (legacy) or NIP-44 (preferred) encryption between agent and user keypairs. Only the intended recipient can decrypt.
- **Memory**: Encrypted with the agent's own keypair before storage on relays. Only the agent can read its own memory. Third parties see opaque ciphertext.
- **Transport**: WebSocket connections to relays use TLS (wss://).

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Relay operator reads memory | Memory is encrypted; relay sees only ciphertext |
| Relay goes offline | Memory replicated across 3-5 relays |
| Akash provider inspects container | Secrets loaded via env vars, memory encrypted at rest |
| Akash provider kills container | Self-healing redeploys to a different provider |
| Network observer monitors traffic | TLS on all relay connections |
| Someone impersonates the agent | Messages are signed with agent's Nostr key; verify npub |

### What Hydraa Does NOT Protect Against

- Compromise of the agent's secret key (if leaked, attacker can impersonate the agent)
- Side-channel attacks on the Akash container (TEE support is a future roadmap item)
- Attacks on the model provider (use Everclaw for decentralized inference)
- Key recovery (if you lose the secret key and config, the agent's identity is lost)
