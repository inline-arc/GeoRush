import { ENV } from "../../config/env";

export type StarknetWallet = {
  id: string;
  address: string;
  publicKey: string;
};

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

