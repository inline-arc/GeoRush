#!/usr/bin/env bash
# Deploy BlitzEscrow on Starknet.
#
# Usage:
#   ./scripts/deploy.sh <network> <pool_address>
#
# Example (Sepolia):
#   ./scripts/deploy.sh sepolia 0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91
#
# Requires:
#   - scarb (https://docs.swm.cc/scarb)
#   - starkli (https://github.com/0xStark/starkli)
#   - STARKNET_PRIVATE_KEY and STARKNET_ACCOUNT_ADDRESS env vars
set -euo pipefail

NETWORK="${1:-}"
POOL_ADDRESS="${2:-}"

if [ -z "$NETWORK" ] || [ -z "$POOL_ADDRESS" ]; then
  echo "Usage: $0 <network> <pool_address>"
  echo ""
  echo "  network:      e.g. sepolia, mainnet"
  echo "  pool_address: STRK20 pool contract address for the network"
  echo ""
  echo "Known pool addresses:"
  echo "  Sepolia: 0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91"
  echo "  Mainnet: check https://strk20.starknet.io"
  exit 1
fi

echo "==> Building BlitzEscrow"
scarb build

echo "==> Declaring on $NETWORK"
CLASS_HASH=$(starkli declare --network "$NETWORK" \
  target/dev/blitz_escrow_BlitzEscrow.contract_class.json \
  | tail -1)
echo "==> Class hash: $CLASS_HASH"

echo "==> Deploying with pool address: $POOL_ADDRESS"
starkli deploy --network "$NETWORK" \
  --constructor-arg "$POOL_ADDRESS" \
  "$CLASS_HASH"

echo "==> Done. Add the returned address to .env as EXPO_PUBLIC_BLITZESCROW_ADDRESS"
