import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Location from "expo-location";
import MapView, { Marker } from "react-native-maps";
import {
  Crosshair,
  Navigation,
  Power,
  Radar,
  Wallet,
} from "lucide-react-native";
import { colors, darkMapStyle, type } from "../theme/terminal";
import Panel from "../components/terminal/Panel";
import TerminalButton from "../components/terminal/TerminalButton";
import type { WalletApi } from "../features/wallet/usePrivyWallet";

type Point = { latitude: number; longitude: number };

type Props = {
  walletApi: WalletApi;
};

export default function MapWithDrawer({ walletApi }: Props) {
  const screenH = Dimensions.get("window").height;
  const SHEET_TOP = 96;
  const SHEET_COLLAPSED = Math.round(screenH * 0.72);

  const translateY = useRef(new Animated.Value(SHEET_COLLAPSED)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const startY = useRef(SHEET_COLLAPSED);

  const [amount, setAmount] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [amountFocused, setAmountFocused] = useState(false);

  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const [liveLocation, setLiveLocation] = useState<Point | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<Point | null>(null);
  const mapRef = useRef<MapView | null>(null);

  const { wallet, connected, busy, error, connect, disconnect } = walletApi;

  const setSheet = (open: boolean) => {
    const toValue = open ? SHEET_TOP : SHEET_COLLAPSED;
    setSheetOpen(open);
    Animated.parallel([
      Animated.spring(translateY, {
        toValue,
        useNativeDriver: true,
        tension: 110,
        friction: 18,
      }),
      Animated.timing(backdrop, {
        toValue: open ? 1 : 0,
        duration: open ? 220 : 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      startY.current = toValue;
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dy) > 6 && Math.abs(gesture.dx) < 18,
        onPanResponderGrant: () => {
          translateY.stopAnimation((v: number) => {
            startY.current = v;
          });
        },
        onPanResponderMove: (_, gesture) => {
          const next = startY.current + gesture.dy;
          const clamped = Math.min(SHEET_COLLAPSED, Math.max(SHEET_TOP, next));
          translateY.setValue(clamped);
          const t = (SHEET_COLLAPSED - clamped) / (SHEET_COLLAPSED - SHEET_TOP);
          backdrop.setValue(Math.max(0, Math.min(1, t)));
        },
        onPanResponderRelease: (_, gesture) => {
          const next = startY.current + gesture.dy;
          const midpoint = (SHEET_TOP + SHEET_COLLAPSED) / 2;
          const shouldOpen =
            gesture.vy < -0.35 || (gesture.vy <= 0.35 && next < midpoint);
          setSheet(shouldOpen);
        },
      }),
    [SHEET_COLLAPSED, SHEET_TOP, translateY, backdrop]
  );

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const ok = status === "granted";
      setHasLocationPermission(ok);
      if (!ok) return;

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 2000,
          distanceInterval: 3,
        },
        (pos) => {
          setLiveLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        }
      );
    })();

    return () => {
      if (subscription) subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!liveLocation || !mapRef.current) return;
    mapRef.current.animateToRegion(
      {
        ...liveLocation,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      },
      600
    );
  }, [liveLocation]);

  const onMapPress = (e: any) => {
    const { latitude, longitude } = e?.nativeEvent?.coordinate ?? {};
    if (typeof latitude !== "number" || typeof longitude !== "number") return;
    setSelectedPoint({ latitude, longitude });
  };

  const onConnectPress = async () => {
    if (connected) {
      await disconnect();
      return;
    }
    const w = await connect();
    if (w) setSheet(true);
  };

  const hudPoint = selectedPoint ?? liveLocation;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          onPress={onMapPress}
          showsUserLocation={hasLocationPermission}
          showsMyLocationButton
          customMapStyle={darkMapStyle}
          userInterfaceStyle="dark"
        >
          {liveLocation ? (
            <Marker coordinate={liveLocation} title="You" pinColor={colors.accent} />
          ) : null}
          {selectedPoint ? (
            <Marker
              coordinate={selectedPoint}
              title="Target"
              description="Marked point"
              pinColor={colors.warn}
            />
          ) : null}
        </MapView>

        <View style={styles.hud} pointerEvents="none">
          <View style={styles.hudRow}>
            <View style={styles.hudChip}>
              <Radar size={12} color={colors.accent} />
              <Text style={styles.hudText}>
                {hudPoint
                  ? `LAT ${hudPoint.latitude.toFixed(5)}  LON ${hudPoint.longitude.toFixed(5)}`
                  : "ACQUIRING SIGNAL"}
              </Text>
            </View>
            <View style={styles.hudChip}>
              <View style={styles.dot} />
              <Text style={styles.hudText}>
                {selectedPoint ? "TARGET LOCKED" : "TRACKING"}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={StyleSheet.absoluteFill}
        pointerEvents="box-none"
      >
        <Animated.View
          pointerEvents={sheetOpen ? "auto" : "none"}
          style={[
            styles.backdrop,
            {
              opacity: backdrop.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.55],
              }),
            },
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSheet(false)}
          />
        </Animated.View>

        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View {...panResponder.panHandlers} style={styles.handleArea}>
            <View style={styles.handle} />
            <View style={styles.handleRow}>
              <Crosshair size={11} color={colors.textMuted} />
              <Text style={styles.handleText}>OPERATIONS CONSOLE</Text>
              <Crosshair size={11} color={colors.textMuted} />
            </View>
          </View>

          <View style={styles.sheetContent}>
            <View style={styles.balanceBlock}>
              <Text style={styles.micro}>AVAILABLE BALANCE</Text>
              <Text style={styles.balanceValue}>$2.78</Text>
              <Text style={styles.balanceSub}>Add funds to arm the grid</Text>
            </View>

            <Panel
              label="WALLET"
              right={
                <View style={styles.walletChip}>
                  <Wallet size={11} color={colors.accent} />
                  <Text style={styles.walletChipText}>
                    {connected ? "LINKED" : "OFFLINE"}
                  </Text>
                </View>
              }
            >
              <View style={styles.walletRow}>
                <Text style={styles.micro}>ADDRESS</Text>
                <Text style={styles.dataText}>
                  {wallet?.address
                    ? `${wallet.address.slice(0, 10)}…${wallet.address.slice(-8)}`
                    : "0x0000…00000000"}
                </Text>
              </View>
              {error ? (
                <Text style={styles.error}>[ERROR] {error.toUpperCase()}</Text>
              ) : null}
            </Panel>

            <Panel label="FUNDING">
              <Text style={styles.micro}>AMOUNT_USD</Text>
              <View
                style={[
                  styles.amountWrap,
                  amountFocused && styles.amountWrapFocused,
                ]}
              >
                <Text style={styles.amountPrefix}>$</Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={() => setAmountFocused(true)}
                  onBlur={() => setAmountFocused(false)}
                  style={styles.amountInput}
                />
                <Navigation size={14} color={colors.textFaint} />
              </View>
              <Text style={styles.hint}>
                {selectedPoint
                  ? `TARGET: ${selectedPoint.latitude.toFixed(5)}, ${selectedPoint.longitude.toFixed(5)}`
                  : "TAP THE MAP TO MARK A TARGET POINT"}
              </Text>
            </Panel>
          </View>
        </Animated.View>

        <View style={styles.connectBar} pointerEvents="box-none">
          <TerminalButton
            title={connected ? "TERMINATE LINK" : "CONNECT WALLET"}
            onPress={onConnectPress}
            loading={busy}
            variant={connected ? "danger" : "primary"}
            icon={
              connected ? (
                <Power size={15} color={colors.danger} />
              ) : (
                <Wallet size={15} color={colors.black} />
              )
            }
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  mapWrap: { flex: 1, backgroundColor: colors.bg },
  hud: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
  },
  hudRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  hudChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(4, 7, 10, 0.85)",
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  hudText: {
    ...type.micro,
    fontSize: 9,
  },
  dot: {
    width: 6,
    height: 6,
    backgroundColor: colors.accent,
  },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: "100%",
    backgroundColor: colors.panel,
    borderTopWidth: 1,
    borderTopColor: colors.accentBorder,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: -6 },
    elevation: 20,
  },
  handleArea: {
    paddingTop: 10,
    paddingBottom: 10,
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  handle: {
    width: 48,
    height: 3,
    backgroundColor: colors.accent,
  },
  handleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  handleText: {
    ...type.micro,
    color: colors.textMuted,
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 14,
  },
  balanceBlock: {
    gap: 4,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  micro: {
    ...type.micro,
  },
  balanceValue: {
    ...type.title,
    fontSize: 34,
    letterSpacing: 1,
    color: colors.text,
  },
  balanceSub: {
    ...type.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  walletChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  walletChipText: {
    ...type.micro,
    color: colors.accent,
  },
  walletRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  dataText: {
    ...type.data,
    fontSize: 13,
  },
  error: {
    ...type.micro,
    color: colors.danger,
    marginTop: 10,
  },
  amountWrap: {
    marginTop: 8,
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bg,
  },
  amountWrapFocused: {
    borderColor: colors.accent,
  },
  amountPrefix: {
    ...type.data,
    color: colors.accent,
  },
  amountInput: {
    flex: 1,
    height: "100%",
    color: colors.text,
    ...type.data,
    fontSize: 18,
  },
  hint: {
    ...type.micro,
    color: colors.textFaint,
    marginTop: 10,
  },
  connectBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === "ios" ? 24 : 16,
    paddingTop: 10,
    backgroundColor: "rgba(4, 7, 10, 0.92)",
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
