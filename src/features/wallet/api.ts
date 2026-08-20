import { ENV } from "../../config/env";

export type StarknetWallet = {
  id: string;
  address: string;
  publicKey: string;
  /** true if the wallet supports Wallet API >= 0.10.3 (STRK20 actions) */
  supportsStrk20: boolean;
};

/** A STRK20 action the wallet can execute. Matches STRK20_ACTION from types-js. */
export type Strk20Action =
  | { type: "deposit"; token: string; amount: string }
  | { type: "transfer"; token: string; amount: string; recipient: string }
  | { type: "invoke"; contract: string; calldata: string[] }
  | { type: "withdraw"; token: string; amount: string; recipient: string };

/** Result of a STRK20 invoke transaction. */
export type Strk20TxResult = {
  transaction_hash: string;
};

/**
 * Wallet API returned by the `useStarknetWallet` hook.
 * Mirrors the old `WalletApi` shape so the rest of the UI stays unchanged,
 * but adds STRK20 capability.
 */
export type WalletApi = {
  wallet: StarknetWallet | null;
  connected: boolean;
  busy: boolean;
  error: string | null;
  /** true if the connected wallet supports STRK20 actions */
  supportsStrk20: boolean;
  connect: () => Promise<StarknetWallet | null>;
  disconnect: () => Promise<void>;
  label: string;
  /** Issue a STRK20 private action (shield, transfer, unshield, invoke) through the wallet. */
  invokeStrk20: (actions: Strk20Action[]) => Promise<Strk20TxResult>;
  /** Read the user's shielded balance for the given tokens (triggers a wallet consent prompt). */
  getShieldedBalances: (tokens: string[]) => Promise<{ token: string; balance: string }[]>;
};

/**
 * Fetch helper for the Privy backend relay (server-managed signing).
 * Kept for non-private fallback operations.
 */
async function jsonFetch<T>(
  path: string,
  opts: { method?: string; accessToken?: string; body?: unknown } = {}
): Promise<T> {
  const url = `${ENV.backendBaseUrl}${path}`;
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.accessToken ? { Authorization: `Bearer ${opts.accessToken}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }

  return (await res.json()) as T;
}

export async function createOrGetStarknetWallet(accessToken: string) {
  return await jsonFetch<{ wallet: StarknetWallet }>(`/api/wallet/starknet`, {
    method: "POST",
    accessToken,
    body: {},
  });
}
