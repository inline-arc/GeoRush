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
import MapView, { Circle, Marker, Polyline, Region } from "react-native-maps";
import {
  Crosshair,
  Layers,
  LocateFixed,
  Navigation,
  Power,
  Radar,
  Wallet,
  X,
} from "lucide-react-native";
import { colors, darkMapStyle, type } from "../theme/terminal";
import Panel from "../components/terminal/Panel";
import TerminalButton from "../components/terminal/TerminalButton";
import TargetReticle from "../components/terminal/TargetReticle";
import MapCommandBar from "../components/terminal/MapCommandBar";
import type { WalletApi } from "../features/wallet/usePrivyWallet";

type Point = { latitude: number; longitude: number };

type Props = {
  walletApi: WalletApi;
};

const ZONE_RADIUS = 50;

function haversineMeters(a: Point, b: Point): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const la1 = (a.latitude * Math.PI) / 180;
  const la2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function bearingDeg(a: Point, b: Point): number {
  const la1 = (a.latitude * Math.PI) / 180;
  const la2 = (b.latitude * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(la2);
  const x =
    Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)}KM` : `${Math.round(m)}M`;
}

const MAP_TYPES = (
  Platform.OS === "ios"
    ? ["standard", "mutedStandard", "satellite", "hybrid", "terrain"]
    : ["standard", "satellite", "hybrid", "terrain"]
) as const;
type MapType = (typeof MAP_TYPES)[number];
const MAP_TYPE_LABELS: Record<MapType, string> = {
  standard: "STD",
  mutedStandard: "MUT",
  satellite: "SAT",
  hybrid: "HYB",
  terrain: "TER",
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
  const [mapType, setMapType] = useState<MapType>("standard");
  const [navActive, setNavActive] = useState(false);
  const [aiming, setAiming] = useState(false);
  const aimingRef = useRef(false);
  const regionRef = useRef<Region | null>(null);
  const mapRef = useRef<MapView | null>(null);

  const shockAnim = useRef(new Animated.Value(0)).current;
  const pingAnim = useRef(new Animated.Value(0)).current;
  const [shock, setShock] = useState<{ r: number; a: number } | null>(null);
  const [ping, setPing] = useState<{ r: number; a: number } | null>(null);

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

  useEffect(() => {
    const id = shockAnim.addListener(({ value }) => {
      setShock({ r: value * ZONE_RADIUS, a: 0.7 * (1 - value) });
    });
    return () => shockAnim.removeListener(id);
  }, [shockAnim]);

  useEffect(() => {
    if (!selectedPoint) {
      setPing(null);
      return;
    }
    const id = pingAnim.addListener(({ value }) => {
      setPing({ r: ZONE_RADIUS + value * 56, a: 0.3 * (1 - value) });
    });
    const loop = Animated.loop(
      Animated.timing(pingAnim, {
        toValue: 1,
        duration: 2400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      })
    );
    loop.start();
    return () => {
      loop.stop();
      pingAnim.removeListener(id);
      pingAnim.setValue(0);
    };
  }, [selectedPoint, pingAnim]);

  const dropPin = (pt: Point) => {
    setSelectedPoint(pt);
    setNavActive(false);
    shockAnim.setValue(0);
    setShock({ r: 0, a: 0.7 });
    Animated.timing(shockAnim, {
      toValue: 1,
      duration: 750,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) setShock(null);
    });
  };

  const onMapPress = (e: any) => {
    const { latitude, longitude } = e?.nativeEvent?.coordinate ?? {};
    if (typeof latitude !== "number" || typeof longitude !== "number") return;
    dropPin({ latitude, longitude });
  };

  const onMarkAtCenter = () => {
    const r = regionRef.current;
    if (r) {
      dropPin({ latitude: r.latitude, longitude: r.longitude });
    } else if (liveLocation) {
      dropPin(liveLocation);
    }
  };

  const onCycleMapType = () => {
    const idx = MAP_TYPES.indexOf(mapType);
    setMapType(MAP_TYPES[(idx + 1) % MAP_TYPES.length]);
  };

  const onRecenter = () => {
    const target = liveLocation ?? selectedPoint;
    if (!target || !mapRef.current) return;
    mapRef.current.animateToRegion(
      { ...target, latitudeDelta: 0.012, longitudeDelta: 0.012 },
      500
    );
  };

  const onToggleNav = () => {
    if (!selectedPoint) return;
    const next = !navActive;
    setNavActive(next);
    if (next && liveLocation && mapRef.current) {
      mapRef.current.fitToCoordinates([liveLocation, selectedPoint], {
        edgePadding: {
          top: 140,
          bottom: Math.round(screenH * 0.32),
          left: 70,
          right: 70,
        },
        animated: true,
      });
    }
  };

  const onClearTarget = () => {
    setSelectedPoint(null);
    setNavActive(false);
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
  const distance =
    liveLocation && selectedPoint
      ? haversineMeters(liveLocation, selectedPoint)
      : null;
  const bearing =
    liveLocation && selectedPoint
      ? bearingDeg(liveLocation, selectedPoint)
      : null;

  const overlayBottom = screenH - SHEET_COLLAPSED + 12;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          onPress={onMapPress}
          onRegionChange={(r) => {
            regionRef.current = r;
            if (!aimingRef.current) {
              aimingRef.current = true;
              setAiming(true);
            }
          }}
          onRegionChangeComplete={(r) => {
            regionRef.current = r;
            aimingRef.current = false;
            setAiming(false);
          }}
          showsUserLocation={hasLocationPermission}
          showsMyLocationButton
          mapType={mapType}
          customMapStyle={mapType === "standard" ? darkMapStyle : undefined}
          userInterfaceStyle="dark"
        >
          {selectedPoint ? (
            <>
              <Circle
                center={selectedPoint}
                radius={ZONE_RADIUS}
                strokeColor={colors.accentBorder}
                fillColor="rgba(61, 255, 136, 0.05)"
                strokeWidth={1}
              />
              {ping ? (
                <Circle
                  center={selectedPoint}
                  radius={ping.r}
                  strokeColor={`rgba(61, 255, 136, ${ping.a.toFixed(3)})`}
                  fillColor="transparent"
                  strokeWidth={1}
                />
              ) : null}
              {shock ? (
                <Circle
                  center={selectedPoint}
                  radius={Math.max(shock.r, 1)}
                  strokeColor={`rgba(61, 255, 136, ${shock.a.toFixed(3)})`}
                  fillColor="transparent"
                  strokeWidth={2}
                />
              ) : null}
              <Marker
                coordinate={selectedPoint}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={styles.targetMarker}>
                  <View style={[styles.mkTick, styles.mkTl]} />
                  <View style={[styles.mkTick, styles.mkTr]} />
                  <View style={[styles.mkTick, styles.mkBl]} />
                  <View style={[styles.mkTick, styles.mkBr]} />
                  <View style={styles.mkDot} />
                </View>
              </Marker>
            </>
          ) : null}
          {navActive && liveLocation && selectedPoint ? (
            <Polyline
              coordinates={[liveLocation, selectedPoint]}
              strokeColor={colors.accent}
              strokeWidth={2}
              lineDashPattern={[10, 8]}
            />
          ) : null}
        </MapView>

        <TargetReticle aiming={aiming} locked={!!selectedPoint} />

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
              <View
                style={[styles.dot, navActive && { backgroundColor: colors.warn }]}
              />
              <Text style={styles.hudText}>
                {navActive
                  ? "NAV ACTIVE"
                  : selectedPoint
                    ? "TARGET LOCKED"
                    : aiming
                      ? "AIMING"
                      : "TRACKING"}
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

        {!sheetOpen ? (
          <MapCommandBar
            style={{ position: "absolute", right: 12, bottom: overlayBottom }}
            items={[
              {
                key: "mark",
                icon: Crosshair,
                label: "MARK",
                onPress: onMarkAtCenter,
              },
              {
                key: "view",
                icon: Layers,
                label: MAP_TYPE_LABELS[mapType],
                onPress: onCycleMapType,
                active: mapType !== "standard",
              },
              {
                key: "center",
                icon: LocateFixed,
                label: "CENTER",
                onPress: onRecenter,
              },
            ]}
          />
        ) : null}

        {!sheetOpen && selectedPoint ? (
          <View style={[styles.targetChip, { bottom: overlayBottom }]}>
            <View style={styles.targetHeader}>
              <Crosshair size={11} color={colors.accent} />
              <Text style={styles.targetTitle}>TARGET LOCKED</Text>
              <Text style={styles.targetZone}>R {ZONE_RADIUS}M</Text>
            </View>
            <Text style={styles.targetCoords}>
              {selectedPoint.latitude.toFixed(5)},{" "}
              {selectedPoint.longitude.toFixed(5)}
            </Text>
            <Text style={styles.targetStats}>
              {distance != null && bearing != null
                ? `DIST ${formatDistance(distance)}  ·  BRG ${String(Math.round(bearing)).padStart(3, "0")}°`
                : "NO SIGNAL — DIST UNAVAILABLE"}
            </Text>
            <View style={styles.targetActions}>
              <Pressable
                onPress={onToggleNav}
                disabled={!liveLocation}
                style={({ pressed }) => [
                  styles.navBtn,
                  navActive && styles.navBtnActive,
                  !liveLocation && styles.chipDisabled,
                  pressed && styles.chipPressed,
                ]}
              >
                <Navigation
                  size={12}
                  color={navActive ? colors.black : colors.accent}
                />
                <Text
                  style={[styles.navBtnText, navActive && styles.navBtnTextActive]}
                >
                  {navActive ? "END NAV" : "NAV START"}
                </Text>
              </Pressable>
              <Pressable
                onPress={onClearTarget}
                style={({ pressed }) => [
                  styles.clearBtn,
                  pressed && styles.chipPressed,
                ]}
              >
                <X size={12} color={colors.danger} />
                <Text style={styles.clearBtnText}>CLEAR</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

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
                  ? `TARGET: ${selectedPoint.latitude.toFixed(5)}, ${selectedPoint.longitude.toFixed(5)} · ZONE R${ZONE_RADIUS}M`
                  : "TAP THE MAP OR PRESS MARK TO LOCK A TARGET"}
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

const MK = 26;

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
  targetMarker: {
    width: MK,
    height: MK,
    alignItems: "center",
    justifyContent: "center",
  },
  mkTick: {
    position: "absolute",
    width: 8,
    height: 8,
    borderColor: colors.accent,
  },
  mkTl: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 },
  mkTr: { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2 },
  mkBl: { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2 },
  mkBr: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 },
  mkDot: {
    width: 6,
    height: 6,
    backgroundColor: colors.accent,
  },
  targetChip: {
    position: "absolute",
    left: 12,
    width: 218,
    backgroundColor: "rgba(4, 7, 10, 0.9)",
    borderWidth: 1,
    borderColor: colors.accentBorder,
    padding: 12,
    gap: 6,
  },
  targetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  targetTitle: {
    ...type.micro,
    color: colors.accent,
    flex: 1,
  },
  targetZone: {
    ...type.micro,
    color: colors.textMuted,
  },
  targetCoords: {
    ...type.data,
    fontSize: 12,
  },
  targetStats: {
    ...type.micro,
    color: colors.textMuted,
  },
  targetActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  navBtn: {
    flex: 1,
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentDim,
  },
  navBtnActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  navBtnText: {
    ...type.micro,
    color: colors.accent,
  },
  navBtnTextActive: {
    color: colors.black,
  },
  clearBtn: {
    height: 36,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  clearBtnText: {
    ...type.micro,
    color: colors.danger,
  },
  chipDisabled: {
    opacity: 0.35,
  },
  chipPressed: {
    opacity: 0.7,
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
