# Nostr Relay Configuration

How to configure and troubleshoot Nostr relays for Hydraa.

---

## Default Relays

Hydraa ships with these default relays:

| Relay | Notes |
|-------|-------|
| `wss://relay.damus.io` | Large, well-maintained, good global coverage |
| `wss://nos.lol` | Fast, reliable, supports NIP-78 |
| `wss://relay.nostr.band` | Good for discoverability, search-indexed |

These are configured during `hydraa init` and can be changed in your config file at:

```
~/.openclaw/skills/hydraa/config.yaml
```

---

## Adding Custom Relays

Edit the `relays` list in your config:

```yaml
nostr:
  relays:
    - "wss://relay.damus.io"
    - "wss://nos.lol"
    - "wss://relay.nostr.band"
    - "wss://your-custom-relay.example.com"
```

### Running Your Own Relay

For maximum sovereignty, you can run your own Nostr relay. Popular implementations:

- [strfry](https://github.com/hoytech/strfry) -- high performance C++ relay
- [nostr-rs-relay](https://github.com/scsibug/nostr-rs-relay) -- Rust relay, easy to deploy
- [nostream](https://github.com/Cameri/nostream) -- TypeScript relay with PostgreSQL

Add your relay to the config alongside public relays for redundancy.

---

## Relay Selection Criteria

When choosing relays, consider:

**Uptime and reliability**: Your agent's memory and messaging depend on relay availability. Use relays with a track record of consistent uptime.

**NIP support**: Hydraa requires:
- NIP-01 (basic protocol)
- NIP-04 or NIP-44 (encrypted DMs)
- NIP-78 (application-specific data, used for memory storage)

Not all relays support NIP-78. Check relay documentation before adding.

**Geographic distribution**: Use relays in different regions to reduce latency and increase redundancy. If one region has an outage, relays in other regions still work.

**Paid vs free**: Some relays require payment (lightning invoice). Paid relays tend to have better uptime and lower spam, but free relays work fine for most use cases.

**Privacy**: Consider the relay operator's privacy policy. While Hydraa encrypts all memory events, the relay operator can see metadata (timestamps, event kinds, public keys). For maximum privacy, run your own relay.

---

## How Many Relays?

**Minimum**: 2 relays. One can go down without losing data.

**Recommended**: 3-5 relays. Good balance of redundancy and write amplification.

**Maximum**: No hard limit, but each additional relay increases write latency (Hydraa publishes to all configured relays). More than 7 relays is rarely beneficial.

---

## Troubleshooting

### "Failed to connect to relay"

1. Check that the relay URL is correct and uses `wss://` (not `ws://`)
2. Verify the relay is online: visit the URL in a browser or use a Nostr client
3. Some relays require authentication -- check if you need to register or pay
4. Check your network: firewalls or proxies may block WebSocket connections

### "NIP-78 events not persisting"

Some relays don't support NIP-78 or have aggressive event pruning:

1. Check relay documentation for NIP support
2. Try a different relay that explicitly supports NIP-78
3. Run `hydraa status` to see which relays are connected and responding

### "Messages not arriving"

1. Verify both you and the agent are connected to at least one common relay
2. Check that you're using the correct npub for the agent
3. Ensure your Nostr client supports NIP-04 or NIP-44 encrypted DMs
4. Try sending from a different Nostr client to rule out client-side issues

### "High latency on relay operations"

1. Use geographically closer relays
2. Reduce the number of configured relays (fewer writes per operation)
3. Check relay status pages for known performance issues
4. Consider a paid relay with guaranteed performance

### Checking Relay Health

Use `hydraa status` to see the current state of all configured relays:

```bash
hydraa status
```

This shows each relay's connection status and round-trip latency.
