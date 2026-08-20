import React from "react";
import MapWithDrawer from "./screens/MapWithDrawer";
import { useStarknetWallet } from "./features/wallet/useStarknetWallet";

export default function App() {
  const walletApi = useStarknetWallet();
  return <MapWithDrawer walletApi={walletApi} />;
}
