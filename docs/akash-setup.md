# Akash Network Setup

How to get AKT tokens, set up your wallet, and manage Akash deployments for Hydraa.

---

## What is Akash?

Akash Network is a decentralized cloud marketplace. Instead of renting from AWS or GCP, you bid on compute from independent providers around the world. No single entity can deny you service or shut down your container.

Hydraa uses Akash to run your OpenClaw agent in a container that persists even when your local machine is off.

---

## Getting AKT Tokens

AKT is the native token of Akash Network. You need AKT to pay for compute.

### How much do I need?

| Resource | Monthly Cost (approx.) |
|----------|----------------------|
| 0.5 CPU, 512Mi RAM, 1Gi storage | ~$3-5 in AKT |
| 1 CPU, 1Gi RAM, 5Gi storage | ~$8-12 in AKT |

Start with $10-20 worth of AKT to cover several months of a lightweight deployment.

### Where to buy AKT

**Decentralized exchanges:**
- [Osmosis](https://app.osmosis.zone) -- swap ATOM, USDC, or other Cosmos tokens for AKT

**Centralized exchanges:**
- AKT is listed on major exchanges. Check [CoinGecko](https://www.coingecko.com/en/coins/akash-network) for current listings.

**From ATOM:**
If you already have ATOM (Cosmos Hub), you can IBC-transfer to Osmosis and swap for AKT.

---

## Wallet Setup

Hydraa needs a wallet mnemonic to sign Akash transactions.

### Generate a New Wallet

During `hydraa init`, a config file is created. You need to provide a wallet mnemonic:

```bash
# Set via environment variable (recommended)
export HYDRAA_AKT_MNEMONIC="your twelve or twenty-four word mnemonic phrase here"
```

### Using an Existing Wallet

If you already have a Cosmos/Akash wallet (from Keplr, Leap, or `akash` CLI), you can use its mnemonic.

### Using Akash Console

[Akash Console](https://console.akash.network) provides a web UI for managing deployments. You can use it to:
- Create a wallet
- Fund it with AKT
- Monitor deployments
- View provider marketplace

Hydraa's CLI handles deployment programmatically, but Akash Console is useful for manual inspection and management.

---

## Cost Breakdown

### Deployment Costs

Costs are determined by the Akash marketplace -- providers compete on price. Typical costs for Hydraa's default container:

```
CPU:      0.5 vCPU    ~$2.00-3.00/month
Memory:   512Mi       ~$0.50-1.00/month
Storage:  1Gi         ~$0.30-0.50/month
Network:  variable    ~$0.10-0.30/month
────────────────────────────────────────
Total:                ~$3.00-5.00/month
```

### Escrow

Akash uses an escrow system. When you create a deployment, AKT is locked in escrow and paid to the provider over time. If you close the deployment early, unused escrow is returned.

### Checking Your Balance

```bash
hydraa fund
```

This shows your current AKT balance, monthly cost estimate, and remaining runway.

---

## Lease Management

### Viewing Your Deployment

```bash
hydraa status
```

Shows deployment ID, provider, uptime, and resource usage.

### Closing a Deployment

```bash
hydraa destroy
```

Closes the Akash lease and stops the container. Escrow is returned. Memory on Nostr relays is preserved unless you use `--wipe-memory`.

### Redeploying

```bash
hydraa deploy
```

Creates a new deployment. The agent reloads its memory from Nostr relays automatically.

---

## Troubleshooting

### "No bids received"

After submitting a deployment, Akash providers bid to host your container. If no bids arrive:

1. Check that you have sufficient AKT balance for escrow
2. Your pricing might be too low -- increase the `amount` in the SDL
3. Try deploying during off-peak hours
4. The Akash marketplace may be congested; wait and retry

### "Deployment created but container not starting"

1. Check the manifest was sent successfully
2. Verify the container image is publicly accessible
3. Check provider logs via Akash Console
4. The provider may have insufficient resources; try redeploying (a different provider may accept)

### "Lease expired"

Leases expire when escrow runs out. To prevent this:
1. Monitor your balance with `hydraa fund`
2. Set up the heartbeat system to alert you when funds are low
3. Top up AKT before the runway hits zero

### "Transaction failed"

1. Check AKT balance (need enough for gas + escrow)
2. Verify the RPC endpoint is responsive
3. Check chain ID matches (should be `akashnet-2`)
4. Network congestion can cause timeouts; retry after a few minutes

### Useful Resources

- [Akash Documentation](https://docs.akash.network)
- [Akash Console](https://console.akash.network)
- [Akash Discord](https://discord.gg/akash)
- [SDL Reference](https://docs.akash.network/readme/stack-definition-language)
