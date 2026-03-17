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
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Location from "expo-location";
import MapView, { Marker } from "react-native-maps";
import { usePrivyWallet } from "../features/wallet/usePrivyWallet";

type Point = { latitude: number; longitude: number };

function formatCoords(pt: Point | null) {
  return pt ? `${pt.latitude.toFixed(6)}, ${pt.longitude.toFixed(6)}` : "";
}

export default function MapWithDrawer() {
  const screenH = Dimensions.get("window").height;
  const SHEET_TOP = 90;
  const SHEET_COLLAPSED = Math.round(screenH * 0.66);

  const translateY = useRef(new Animated.Value(SHEET_COLLAPSED)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const startY = useRef(SHEET_COLLAPSED);

  const [coordinates, setCoordinates] = useState("");
  const [tokenAddress, setTokenAddress] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const [liveLocation, setLiveLocation] = useState<Point | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<Point | null>(null);
  const mapRef = useRef<MapView | null>(null);

  const { wallet, connected, busy, error, connect, disconnect, label } =
    usePrivyWallet();

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
          const t =
            (SHEET_COLLAPSED - clamped) / (SHEET_COLLAPSED - SHEET_TOP);
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

  const useSelectedPoint = () => {
    if (!selectedPoint) return;
    setCoordinates(formatCoords(selectedPoint));
    setSheet(true);
  };

  const useMyLocation = () => {
    if (!liveLocation) return;
    setSelectedPoint(liveLocation);
    setCoordinates(formatCoords(liveLocation));
    setSheet(true);
  };

  const onConnectPress = async () => {
    if (connected) {
      await disconnect();
      return;
    }
    const w = await connect();
    if (w) setSheet(true);
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          onPress={onMapPress}
          showsUserLocation={hasLocationPermission}
          showsMyLocationButton
        >
          {liveLocation ? (
            <Marker coordinate={liveLocation} title="You" pinColor="#2563EB" />
          ) : null}
          {selectedPoint ? (
            <Marker
              coordinate={selectedPoint}
              title="Selected"
              description="Tap “Use selected point”"
              pinColor="#111827"
            />
          ) : null}
        </MapView>
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
                outputRange: [0, 0.42],
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
          </View>

          <View style={styles.sheetContent}>
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Map Actions</Text>
                <Text style={styles.subtitle}>
                  Tap map to select a point, then use it below.
                </Text>
              </View>
              <Pressable onPress={() => setSheet(!sheetOpen)} style={styles.pill}>
                <Text style={styles.pillText}>{sheetOpen ? "Close" : "Open"}</Text>
              </Pressable>
            </View>

            <View style={styles.row}>
              <Pressable
                onPress={useSelectedPoint}
                style={[styles.secondaryBtn, !selectedPoint && styles.btnDisabled]}
                disabled={!selectedPoint}
              >
                <Text style={styles.secondaryBtnText}>Use selected</Text>
              </Pressable>
              <Pressable
                onPress={useMyLocation}
                style={[styles.secondaryBtn, !liveLocation && styles.btnDisabled]}
                disabled={!liveLocation}
              >
                <Text style={styles.secondaryBtnText}>Use my GPS</Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle}>Wallet</Text>
                {wallet?.address ? (
                  <Text style={styles.mono}>
                    {wallet.address.slice(0, 8)}…{wallet.address.slice(-6)}
                  </Text>
                ) : (
                  <Text style={styles.muted}>Not connected</Text>
                )}
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                onPress={onConnectPress}
                style={[styles.primaryBtn, busy && styles.btnDisabled]}
                disabled={busy}
              >
                <Text style={styles.primaryBtnText}>
                  {connected ? "Disconnect" : label}
                </Text>
              </Pressable>

              <Text style={styles.hint}>
                This uses Privy auth + your backend wallet endpoint from the
                StarkZap Privy integration guide.
              </Text>
            </View>

            <Text style={styles.label}>Coordinates</Text>
            <TextInput
              value={coordinates}
              onChangeText={setCoordinates}
              placeholder="e.g. 24.860700, 67.001100"
              placeholderTextColor="#6B7280"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />

            <Text style={styles.label}>Token Address</Text>
            <TextInput
              value={tokenAddress}
              onChangeText={setTokenAddress}
              placeholder="0x..."
              placeholderTextColor="#6B7280"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  mapWrap: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: "100%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: -6 },
    elevation: 20,
  },
  handleArea: { paddingTop: 10, paddingBottom: 8, alignItems: "center" },
  handle: {
    width: 56,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(17,24,39,0.18)",
  },
  sheetContent: { paddingHorizontal: 16, paddingTop: 6, gap: 10 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: "800", color: "#111827" },
  subtitle: { fontSize: 12, color: "rgba(17,24,39,0.55)", marginTop: 2 },
  pill: {
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 999,
    backgroundColor: "rgba(17,24,39,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  pillText: { color: "rgba(17,24,39,0.85)", fontWeight: "800", fontSize: 13 },
  row: { flexDirection: "row", gap: 10 },
  secondaryBtn: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(37,99,235,0.10)",
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.22)",
  },
  secondaryBtnText: { color: "#1D4ED8", fontSize: 13, fontWeight: "900" },
  card: {
    marginTop: 4,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.10)",
    backgroundColor: "rgba(17,24,39,0.03)",
    gap: 8,
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  cardTitle: { fontWeight: "900", color: "#111827" },
  mono: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }) },
  muted: { color: "rgba(17,24,39,0.55)" },
  error: { color: "#B91C1C", fontWeight: "700" },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "rgba(17,24,39,0.75)",
    marginTop: 6,
  },
  input: {
    height: 46,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.12)",
    backgroundColor: "rgba(17,24,39,0.03)",
    color: "#111827",
  },
  primaryBtn: {
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "900" },
  btnDisabled: { opacity: 0.5 },
  hint: { color: "rgba(17,24,39,0.55)", fontSize: 12, lineHeight: 16 },
});

