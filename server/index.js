import express from "express";
import cors from "cors";
import { PrivyClient } from "@privy-io/node";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

const privy = new PrivyClient({
  appId: process.env.PRIVY_APP_ID,
  appSecret: process.env.PRIVY_APP_SECRET,
});

if (!process.env.PRIVY_APP_ID || !process.env.PRIVY_APP_SECRET) {
  console.error(
    "Missing PRIVY_APP_ID / PRIVY_APP_SECRET. Set them before starting the server."
  );
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

// NOTE: This is a minimal scaffold following StarkZap's Privy integration guide:
// https://docs.starknet.io/build/starkzap/integrations/privy
//
// For production you should verify the JWT in the Authorization header.
// Keeping it lightweight here so the mobile app can be wired end-to-end first.

app.post("/api/wallet/starknet", async (req, res) => {
  try {
    // Server-managed wallet (no user_id) to avoid requiring user JWT for signing.
    const wallet = await privy.wallets().create({
      chain_type: "starknet",
    });

    res.json({
      wallet: {
        id: wallet.id,
        address: wallet.address,
        publicKey: wallet.public_key,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e?.message ?? "Failed to create wallet" });
  }
});

app.post("/api/wallet/sign", async (req, res) => {
  const { walletId, hash } = req.body ?? {};
  if (!walletId || !hash) {
    return res.status(400).json({ error: "walletId and hash required" });
  }

  try {
    const result = await privy.wallets().rawSign(walletId, {
      params: { hash },
    });
    res.json({ signature: result.signature });
  } catch (e) {
    res.status(500).json({ error: e?.message ?? "Signing failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Privy server listening on http://localhost:${PORT}`);
});

