import { useCallback, useMemo, useState } from "react";
import { StarknetWallet } from "./api";

export function usePrivyWallet() {
  const [wallet, setWallet] = useState<StarknetWallet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connected = !!wallet;

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const mockWallet = {
        address: `0x${Math.random().toString(16).slice(2).padEnd(64, "0").slice(0, 64)}`,
      } as StarknetWallet;
      setWallet(mockWallet);
      return mockWallet;
    } catch (e) {
      setWallet(null);
      setError(e instanceof Error ? e.message : "Failed to connect wallet.");
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setBusy(true);
    setError(null);
    setWallet(null);
    setBusy(false);
  }, []);

  const label = useMemo(() => {
    if (busy) return "Connecting…";
    if (connected) return "Connected";
    return "Connect Wallet";
  }, [busy, connected]);

  return { wallet, connected, busy, error, connect, disconnect, label };
}

