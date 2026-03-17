import { useCallback, useMemo, useState } from "react";
import { useCreateGuestAccount, usePrivy } from "@privy-io/expo";
import { createOrGetStarknetWallet, StarknetWallet } from "./api";

export function usePrivyWallet() {
  const privy = usePrivy();
  const guest = useCreateGuestAccount();

  const [wallet, setWallet] = useState<StarknetWallet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connected = !!wallet;

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      // Minimal “Connect” without needing OAuth/email UI yet.
      // This creates an authenticated guest user so we can obtain an access token.
      if (!privy.user) {
        await guest.create();
      }
      const accessToken = await privy.getAccessToken();
      if (!accessToken) throw new Error("No Privy access token returned.");

      const res = await createOrGetStarknetWallet(accessToken);
      setWallet(res.wallet);
      return res.wallet;
    } catch (e) {
      setWallet(null);
      setError(e instanceof Error ? e.message : "Failed to connect wallet.");
      return null;
    } finally {
      setBusy(false);
    }
  }, [privy, guest]);

  const disconnect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await privy.logout();
    } finally {
      setWallet(null);
      setBusy(false);
    }
  }, [privy]);

  const label = useMemo(() => {
    if (busy) return "Connecting…";
    if (connected) return "Connected";
    return "Connect Wallet";
  }, [busy, connected]);

  return { wallet, connected, busy, error, connect, disconnect, label };
}

