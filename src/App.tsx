import React from "react";
import LoginScreen from "./screens/LoginScreen";
import MapWithDrawer from "./screens/MapWithDrawer";
import { usePrivyWallet } from "./features/wallet/usePrivyWallet";

export default function App() {
  const walletApi = usePrivyWallet();

  if (!walletApi.connected) {
    return <LoginScreen walletApi={walletApi} />;
  }

  return <MapWithDrawer walletApi={walletApi} />;
}
