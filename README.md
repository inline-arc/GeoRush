# GeoRush

A location-based focus game on Starknet. Stake funds, physically navigate to a
target zone on the map, and earn rewards when your session settles.

Built with Expo / React Native, a terminal-style map console, a Cairo escrow
contract for staking sessions, and STRK20 privacy for shielded payouts.

## Stack

- Expo (React Native) mobile app — terminal-themed map UI
- Privy — Starknet wallet provisioning and signing
- Cairo — `BlitzEscrow` staking/settlement contract in `contract/`
- Node/Express relay in `server/`

## Getting started

```bash
npm install
cp .env.example .env   # add your keys
npm start
```

See `server/README.md` for the relay server.