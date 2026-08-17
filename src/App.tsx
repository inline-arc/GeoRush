import React from "react";
import MapWithDrawer from "./screens/MapWithDrawer";
import { usePrivyWallet } from "./features/wallet/usePrivyWallet";

export default function App() {
  const walletApi = usePrivyWallet();
  return <MapWithDrawer walletApi={walletApi} />;
}
