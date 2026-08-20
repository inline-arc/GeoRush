import { useCallback, useMemo, useRef, useState } from "react";
import { WalletAccountV6 } from "starknet";
import type { STRK20_ACTION } from "@starknet-io/types-js";
import { StarknetInjectedWallet } from "@starknet-io/get-starknet-wallet-standard";
import type { WalletWithStarknetFeatures } from "@starknet-io/get-starknet-wallet-standard/features";
import type { StarknetWindowObject } from "@starknet-io/types-js";
import type { StarknetWallet, Strk20Action, Strk20TxResult, WalletApi } from "./api";
import { ENV } from "../../config/env";

/**
 * Compare two semver-ish version strings.
 * Returns negative if a < b, zero if equal, positive if a > b.
 */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}

/**
 * Discover an injected Starknet wallet (Xverse, Ready, Argent, Braavos, …).
 * Wallets inject their `StarknetWindowObject` onto the global scope, most
 * commonly under `window.starknet` (get-starknet convention).
 */
function detectInjectedWallet(): StarknetWindowObject | null {
  const g = globalThis as Record<string, unknown>;
  const candidate = g.starknet ?? g.argentX ?? g.myBraavosWallet ?? g.xverse;
  if (candidate && typeof candidate === "object") {
    return candidate as unknown as StarknetWindowObject;
  }
  return null;
}

/**
 * useStarknetWallet — connects a privacy-enabled Starknet wallet via the
 * Starknet Wallet Standard and exposes STRK20 operations through WalletAccountV6.
 *
 * This replaces the previous Privy mock-wallet hook. The connected wallet
 * (e.g. Xverse, Ready) must support Wallet API >= 0.10.3 for STRK20 actions.
 *
 * The wallet handles viewing keys, note discovery, ZK proof generation, and
 * submission. The app never sees private state.
 */
export function useStarknetWallet() {
  const [wallet, setWallet] = useState<StarknetWallet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The underlying WalletAccountV6 (lazy-initialized on connect).
  const [accountV6, setAccountV6] = useState<WalletAccountV6 | null>(null);
  const [supportsStrk20, setSupportsStrk20] = useState(false);
  const walletProviderRef = useRef<WalletWithStarknetFeatures | null>(null);

  const connected = !!wallet;

  const connect = useCallback(async (): Promise<StarknetWallet | null> => {
    setBusy(true);
    setError(null);
    try {
      const injected = detectInjectedWallet();

      if (!injected) {
        throw new Error(
          "No Starknet wallet detected. Install the Xverse or Ready wallet extension.",
        );
      }

      // Wrap the injected window object in the Starknet Wallet Standard.
      const walletProvider = new StarknetInjectedWallet(injected);
      walletProviderRef.current = walletProvider;

      // Connect and wrap in WalletAccountV6 to get strk20InvokeTransaction,
      // strk20Balances, etc.
      const v6 = await WalletAccountV6.connect(
        { nodeUrl: ENV.rpcUrl },
        walletProvider,
      );

      // Capability detection: query supported Wallet API versions through the
      // WalletAccountV6. Do NOT probe strk20Balances for detection — it triggers
      // a wallet consent prompt the user has no reason to see here.
      const versions = await v6.supportedWalletApi(walletProvider);
      const strk20Ok = versions.some((v: string) => compareVersions(v, "0.10.3") >= 0);

      if (!strk20Ok) {
        throw new Error(
          `Wallet does not support STRK20 (Wallet API >= 0.10.3). ` +
            `Detected versions: ${versions.join(", ")}.`,
        );
      }

      const starkWallet: StarknetWallet = {
        id: walletProvider.id ?? "",
        address: v6.address,
        publicKey: v6.publicKey ?? "",
        supportsStrk20: true,
      };

      setWallet(starkWallet);
      setAccountV6(v6);
      setSupportsStrk20(true);
      return starkWallet;
    } catch (e) {
      setWallet(null);
      setAccountV6(null);
      setSupportsStrk20(false);
      setError(e instanceof Error ? e.message : "Failed to connect wallet.");
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const disconnect = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await walletProviderRef.current?.features["standard:disconnect"]?.disconnect();
    } catch {
      // ignore disconnect errors
    } finally {
      walletProviderRef.current = null;
      setWallet(null);
      setAccountV6(null);
      setSupportsStrk20(false);
      setBusy(false);
    }
  }, []);

  /**
   * Issue a STRK20 private action through the connected wallet.
   *
   * The wallet handles viewing keys, note discovery, ZK proof generation,
   * and submission. The app never sees private state.
   */
  const invokeStrk20 = useCallback(
    async (actions: Strk20Action[]): Promise<Strk20TxResult> => {
      if (!accountV6 || !supportsStrk20) {
        throw new Error("Wallet not connected or does not support STRK20.");
      }

      // Map our action types to STRK20_ACTION.
      const skActions: STRK20_ACTION[] = actions.map((a) => {
        if (a.type === "invoke") {
          return {
            type: "invoke" as const,
            contract: a.contract,
            calldata: a.calldata,
          };
        }
        return a as unknown as STRK20_ACTION;
      });

      const result = await accountV6.strk20InvokeTransaction(skActions);
      return { transaction_hash: result.transaction_hash };
    },
    [accountV6, supportsStrk20],
  );

  /**
   * Read the user's shielded balance for the given token addresses.
   * Triggers a wallet consent prompt — only call this for deliberate balance display.
   */
  const getShieldedBalances = useCallback(
    async (tokens: string[]): Promise<{ token: string; balance: string }[]> => {
      if (!accountV6 || !supportsStrk20) {
        throw new Error("Wallet not connected or does not support STRK20.");
      }

      // Normalize addresses to BigInt for comparison (padded vs unpadded hex differ).
      const bigIntTokens = tokens.map((t) => BigInt(t));
      const balances = await accountV6.strk20Balances(bigIntTokens);
      return balances.map((b: { token: bigint; balance: bigint }) => ({
        token: b.token.toString(),
        balance: b.balance.toString(),
      }));
    },
    [accountV6, supportsStrk20],
  );

  const label = useMemo(() => {
    if (busy) return "Connecting…";
    if (connected) return "Connected";
    return "Connect Wallet";
  }, [busy, connected]);

  return {
    wallet,
    connected,
    busy,
    error,
    supportsStrk20,
    connect,
    disconnect,
    label,
    invokeStrk20,
    getShieldedBalances,
  } as WalletApi;
}