# Privy + Starknet signing server

This folder is a minimal backend scaffold for the Privy flow described in the StarkZap docs:
`https://docs.starknet.io/build/starkzap/integrations/privy`

It exposes:
- `POST /api/wallet/starknet` → creates a server-managed Starknet wallet in Privy
- `POST /api/wallet/sign` → raw-signs a Starknet transaction hash using Privy

## Run

From `rush/server`:

```bash
npm install
set PRIVY_APP_ID=your_app_id
set PRIVY_APP_SECRET=your_app_secret
npm run dev
```

It listens on `http://localhost:3001` by default.

## Connect from the Expo app

Set these before starting Expo:

- `EXPO_PUBLIC_PRIVY_APP_ID` → your Privy App ID (frontend)
- `EXPO_PUBLIC_BACKEND_BASE_URL` → your machine LAN URL + port, e.g. `http://192.168.0.10:3001`

