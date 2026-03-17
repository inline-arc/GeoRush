export const ENV = {
  privyAppId: process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? "",
  backendBaseUrl: process.env.EXPO_PUBLIC_BACKEND_BASE_URL ?? "",
};

export function assertEnv() {
  if (!ENV.privyAppId) {
    throw new Error(
      "Missing EXPO_PUBLIC_PRIVY_APP_ID. Add it to your environment before starting Expo."
    );
  }
  if (!ENV.backendBaseUrl) {
    throw new Error(
      "Missing EXPO_PUBLIC_BACKEND_BASE_URL. Example: http://192.168.0.10:3001"
    );
  }
}
