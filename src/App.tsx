import React from "react";
import { PrivyProvider } from "@privy-io/expo";
import MapWithDrawer from "./screens/MapWithDrawer";
import { assertEnv, ENV } from "./config/env";

export default function App() {
  assertEnv();

  return (
    <PrivyProvider appId={ENV.privyAppId}>
      <MapWithDrawer />
    </PrivyProvider>
  );
}

