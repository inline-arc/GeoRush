# GeoRush

A location-based focus game on Starknet. Stake funds, physically navigate to a
target zone on the map, and earn rewards when your session settles.

Built with Expo / React Native, a terminal-style map console, a Cairo escrow
contract for staking sessions, and STRK20 privacy for shielded payouts.

## Stack

- Expo (React Native) mobile app — terminal-themed map UI
- Cairo — `BlitzEscrow` STRK20 anonymizer escrow contract in `contract/`
- Starknet Wallet Standard — privacy-enabled wallet connection (Xverse / Ready)
- Node/Express relay in `server/` (Privy fallback for server-managed signing)

## Quick start

```bash
npm install
cp .env.example .env   # add your keys
npm start
```

See `server/README.md` for the relay server.

## The BlitzEscrow contract

`contract/escrow.cairo` contains `BlitzEscrow`, a **stateful STRK20 anonymizer
(helper) contract**. Unlike stateless helpers (swap, Vesu lending), it keeps its
own commitment map so funds can be escrowed behind a secret and claimed later —
even by a recipient who is not yet registered with the privacy pool.

### How it fits the STRK20 lifecycle

The STRK20 pool moves value through four phases:

1. **Deposit (shield)** — public ERC-20 tokens enter the pool as encrypted notes.
2. **Private transfers** — notes are spent and new ones created, all hidden inside the pool.
3. **DeFi via `privacy_invoke`** — the pool withdraws tokens to a helper contract,
   calls its `privacy_invoke` entry point, and credits the returned `OpenNoteDeposit`
   back into private notes.
4. **Withdraw (unshield)** — tokens leave the pool to a public address.

BlitzEscrow is the helper at phase 3. The pool calls it atomically:

```
pool withdraws tokens → BlitzEscrow stores/claims → pool credits open note
```

### The `privacy_invoke` interface

The pool calls `privacy_invoke` via the protocol's `INVOKE_SELECTOR`. It takes an
`EscrowOperation` discriminator and dispatches:

| Operation | Calldata (in order) | What happens |
|---|---|---|
| **Deposit** | `commitment_hash, token, amount, secret, note_id` | Stores a `CommitmentEntry { token, amount, claimed: false }` keyed by `commitment_hash` = `poseidon(ESCROW_COMMITMENT_TAG, secret)`. Returns an empty `Span<OpenNoteDeposit>` — tokens stay parked. |
| **Claim** | `commitment_hash, token, amount, secret, note_id` | Recomputes the hash from `secret`, looks up the entry, marks it `claimed: true`, approves the pool to pull the tokens, and returns `OpenNoteDeposit { note_id, token, amount }`. |

**Access control**: `privacy_invoke` asserts `get_caller_address() == privacy_contract`.
Only the privacy pool can drive the escrow — no one calls it directly.

**Double-claim protection**: the `claimed` flag reverts with `ALREADY_CLAIMED` on a
second claim for the same commitment hash.

### Events

The contract emits events for indexers and `classifyTransaction`:

- `EscrowDeposit { commitment_hash, token, amount }` — emitted on deposit.
- `EscrowClaim { commitment_hash, token, amount, note_id }` — emitted on claim.

### Read-only view

`get_commitment(commitment_hash)` returns the stored `CommitmentEntry` (all-zero if
the hash does not exist). This is a view function — no gas, no proof needed.

### Building and deploying

**Prerequisites:** [Scarb](https://docs.swm.cc/scarb) and [Starkli](https://github.com/0xStark/starkli).

```bash
cd contract

# 1. Build
scarb build

# 2. Declare on the target network
starkli declare --network sepolia \
  target/dev/blitz_escrow_BlitzEscrow.contract_class.json

# 3. Deploy with the STRK20 pool address as constructor argument
starkli deploy --network sepolia \
  --constructor-arg 0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91 \
  <class_hash>
```

Or use the deploy helper:

```bash
cd contract
./scripts/deploy.sh sepolia 0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91
```

### Network addresses

| Network | STRK20 Pool Address |
|---|---|
| Sepolia | `0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91` |
| Mainnet | (check the [STRK20 registry](https://strk20.starknet.io)) |

Store the deployed contract address in `.env`:

```
EXPO_PUBLIC_BLITZESCROW_ADDRESS=0x...
```

### STRK20 submission rules

When calling BlitzEscrow through the pool (via `strk20InvokeTransaction`),
follow these Starknet submission rules:

- **`provingBlockId` = `currentBlock - 10`** — ensures note maturity (10 blocks)
  and a reorg buffer. Always pass it to `execute()`.
- **`proofDetails` conditional spread** — only include `proofFacts` and `proof`
  if `proofFacts.length > 0`. Passing empty arrays serializes an invalid v3 transaction.
- **`tip: 0n` mandatory** for v3 transactions — omitting it fails with
  `Cannot mix BigInt and other types`.
- **Calldata order** must match `privacy_invoke`'s signature:
  `[operation, commitment_hash, token, amount, secret, note_id]`.
- **Open note placeholder** — the pool credits the returned `OpenNoteDeposit`
  into an open note opened by a companion `transfer` action in the same batch.
  Reference it as `${openNoteIds[0]}` in the invoke calldata.
- **`invalidateProofNonceCache()`** after any failed submission before retrying —
  a stale cached pool nonce causes `INVALID_NONCE` retry loops.
- **One `invoke` per transaction** — the pool allows at most one external call
  per `apply_actions`.

## Connecting a STRK20 wallet

GeoRush connects to a **privacy-enabled Starknet wallet** via the
[Starknet Wallet Standard](https://github.com/starknet-io/wallet-distribution)
(`@starknet-io/get-starknet-wallet-standard`). The connected wallet must support
STRK20 (Wallet API >= 0.10.3) — it handles viewing keys, note discovery, ZK proof
generation, and submission. The app never sees private state.

**Supported wallets:** [Xverse](https://xverse.me) or [Ready](https://readywallet.xyz)
extensions. Privy's server-managed wallets do **not** support STRK20 — use the
Starknet Wallet Standard route for private operations.

### Dependencies

```bash
npm install starknet@10.4.0 \
  @starknet-io/get-starknet-wallet-standard@6.0.3 \
  @starknet-io/types-js@0.10.3
```

**Pin the versions.** A bare `npm install starknet` resolves to `latest` (10.0.x),
which lacks `WalletAccountV6`, `strk20InvokeTransaction`, and `STRK20_ACTION`.

### Capability detection

```ts
// Detect STRK20 support without triggering a consent prompt.
const versions = await wallet.supportedWalletApi();
const supported = versions.some((v) => compareVersions(v, "0.10.3") >= 0);
```

Do **not** probe `strk20Balances` to feature-detect — wallets gate it behind a
user consent prompt.

### STRK20 actions

```ts
// Shield (deposit public tokens into the privacy pool)
const actions: STRK20_ACTION[] = [{ type: "deposit", token: tokenAddress, amount }];

// Private transfer (no contract call, no event, no public leg)
const actions: STRK20_ACTION[] = [
  { type: "transfer", token: strkAddress, amount, recipient },
];

const { transaction_hash } = await account.strk20InvokeTransaction(actions);
```

### Key submission rules

- **Shield is two transactions**: the ERC-20 `approve` must land on-chain before
  the private deposit. The wallet prompts twice — label both steps in the UI.
- **New notes mature ~10 blocks** before they are spendable. Build the wait into
  the UX.
- **A flat pool fee** applies per private operation (4 STRK on mainnet when the
  STRK20 docs were written). Read it from the pool's `get_fee_amount` — don't
  hardcode. Subtract it when pre-filling a MAX amount.
- **Normalize felt addresses** with `BigInt(left) === BigInt(right)` before
  comparison — padded and unpadded hex strings can name the same address.
- **Bound `waitForTransaction`** with an application timeout — paymaster-relayed
  hashes can take time to appear at the RPC node.

## Development

```bash
npm install          # install dependencies
cp .env.example .env # configure env vars
npm start            # start Expo dev server
npm run android      # or --ios / --web
```

## License

Apache-2.0
