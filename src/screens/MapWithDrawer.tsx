import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import TargetReticle from "../components/terminal/TargetReticle";
import MapCommandBar from "../components/terminal/MapCommandBar";
import CoinMarker from "../components/terminal/CoinMarker";
import {
  fetchRoute,
  formatDuration,
  haversineMeters,
  nearestIndexOnRoute,
  nextManeuver,
  remainingAlongRoute,
  type Point,
  type Route,
} from "../features/nav/routing";
import type { WalletApi } from "../features/wallet/api";

type Props = {
  walletApi: WalletApi;
};

const ZONE_RADIUS = 50;
const NAV_PITCH = 55;
const NAV_ZOOM = 17.5;
const REROUTE_DISTANCE = 80;
const REROUTE_INTERVAL = 12000;

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

type MapViewDef = {
  key: string;
  label: string;
  mapType: string;
  pitch: number;
  buildings: boolean;
  dark: boolean;
};

const MAP_VIEWS: MapViewDef[] = [
  { key: "standard", label: "STD", mapType: "standard", pitch: 0, buildings: false, dark: true },
  ...(Platform.OS === "ios"
    ? [{ key: "mutedStandard", label: "MUT", mapType: "mutedStandard", pitch: 0, buildings: false, dark: false }]
    : []),
  { key: "satellite", label: "SAT", mapType: "satellite", pitch: 0, buildings: false, dark: false },
  { key: "hybrid", label: "HYB", mapType: "hybrid", pitch: 0, buildings: false, dark: false },
  { key: "terrain", label: "TER", mapType: "terrain", pitch: 0, buildings: false, dark: false },
  { key: "orbit", label: "3D", mapType: "standard", pitch: 45, buildings: true, dark: true },
];

type CoinPoint = Point & { key: string; phase: number };

function scatterCoins(center: Point, latitudeDelta: number): CoinPoint[] {
  const step = latitudeDelta / 2;
  const qLat = Math.round(center.latitude / step) * step;
  const qLon = Math.round(center.longitude / step) * step;
  const count = 9;
  const coins: CoinPoint[] = [];
  for (let i = 0; i < count; i++) {
    const seed =
      Math.sin((qLat * 1000 + qLon * 1000) * (i + 3) * 12.9898) * 43758.5453;
    const frac = seed - Math.floor(seed);
    const angle = (i / count) * Math.PI * 2 + frac * 0.9;
    const r = latitudeDelta * (0.1 + frac * 0.24);
    coins.push({
      key: `${i}:${qLat.toFixed(5)}:${qLon.toFixed(5)}`,
      latitude: qLat + Math.cos(angle) * r,
      longitude: qLon + Math.sin(angle) * r * 1.25,
      phase: frac,
    });
  }
  return coins;
}

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
  const [viewIndex, setViewIndex] = useState(0);
  const [navActive, setNavActive] = useState(false);
  const [route, setRoute] = useState<Route | null>(null);
  const [routeError, setRouteError] = useState(false);
  const [navFollow, setNavFollow] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [navInfo, setNavInfo] = useState<{
    remaining: number;
    eta: number;
    maneuverLabel: string;
    maneuverDist: number;
  } | null>(null);
  const [zoomedOut, setZoomedOut] = useState(false);
  const [coins, setCoins] = useState<CoinPoint[]>([]);
  const [aiming, setAiming] = useState(false);
  const aimingRef = useRef(false);
  const regionRef = useRef<Region | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const followRef = useRef(false);
  const navSession = useRef(0);
  const routeFetchRef = useRef<{ origin: Point; time: number } | null>(null);
  const navTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shockAnim = useRef(new Animated.Value(0)).current;
  const pingAnim = useRef(new Animated.Value(0)).current;
  const [shock, setShock] = useState<{ r: number; a: number } | null>(null);
  const [ping, setPing] = useState<{ r: number; a: number } | null>(null);

  const { wallet, connected, busy, error, connect, disconnect } = walletApi;

  const view = MAP_VIEWS[viewIndex];

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

  const didInitialFix = useRef(false);
  useEffect(() => {
    if (!liveLocation || !mapRef.current || didInitialFix.current) return;
    didInitialFix.current = true;
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

  const pulseShock = () => {
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

  const clearNav = () => {
    navSession.current += 1;
    if (navTimer.current) {
      clearTimeout(navTimer.current);
      navTimer.current = null;
    }
    setNavActive(false);
    setRoute(null);
    setNavInfo(null);
    setRouteError(false);
    followRef.current = false;
    setNavFollow(false);
  };

  const dropPin = (pt: Point) => {
    setSelectedPoint(pt);
    setArrived(false);
    clearNav();
    pulseShock();
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

  const onCycleView = () => {
    const nextIndex = (viewIndex + 1) % MAP_VIEWS.length;
    setViewIndex(nextIndex);
    const next = MAP_VIEWS[nextIndex];
    if (!navActive && mapRef.current) {
      mapRef.current.animateCamera(
        { pitch: next.pitch },
        { duration: 500 }
      );
    }
  };

  const onRecenter = () => {
    if (navActive && liveLocation && mapRef.current) {
      followRef.current = true;
      setNavFollow(true);
      const heading = selectedPoint
        ? bearingDeg(liveLocation, selectedPoint)
        : 0;
      mapRef.current.animateCamera(
        { center: liveLocation, heading, pitch: NAV_PITCH, zoom: NAV_ZOOM },
        { duration: 700 }
      );
      return;
    }
    const target = liveLocation ?? selectedPoint;
    if (!target || !mapRef.current) return;
    mapRef.current.animateCamera(
      { center: target, pitch: view.pitch, zoom: 15.5 },
      { duration: 500 }
    );
  };

  const startNav = async () => {
    if (!selectedPoint || !liveLocation) return;
    const session = ++navSession.current;
    setNavActive(true);
    setArrived(false);
    setRouteError(false);
    setNavInfo(null);

    mapRef.current?.fitToCoordinates([liveLocation, selectedPoint], {
      edgePadding: {
        top: 160,
        bottom: Math.round(screenH * 0.34),
        left: 70,
        right: 70,
      },
      animated: true,
    });

    try {
      const r = await fetchRoute(liveLocation, selectedPoint);
      if (navSession.current !== session) return;
      routeFetchRef.current = { origin: liveLocation, time: Date.now() };
      setRoute(r);
      const nm = nextManeuver(r.maneuvers, liveLocation);
      setNavInfo({
        remaining: r.distance,
        eta: r.duration,
        maneuverLabel: nm?.label ?? "FOLLOW ROUTE",
        maneuverDist: nm?.distance ?? r.distance,
      });
    } catch {
      if (navSession.current !== session) return;
      setRoute(null);
      setRouteError(true);
    }

    navTimer.current = setTimeout(() => {
      if (navSession.current !== session) return;
      followRef.current = true;
      setNavFollow(true);
      mapRef.current?.animateCamera(
        {
          center: liveLocation,
          heading: bearingDeg(liveLocation, selectedPoint),
          pitch: NAV_PITCH,
          zoom: NAV_ZOOM,
        },
        { duration: 900 }
      );
    }, 1100);
  };

  const stopNav = () => {
    clearNav();
    mapRef.current?.animateCamera({ pitch: view.pitch }, { duration: 600 });
  };

  const arrive = () => {
    clearNav();
    setArrived(true);
    pulseShock();
    mapRef.current?.animateCamera({ pitch: 0, zoom: 16.5 }, { duration: 700 });
  };

  const onToggleNav = () => {
    if (!selectedPoint) return;
    if (navActive) {
      stopNav();
    } else {
      startNav();
    }
  };

  const onClearTarget = () => {
    setSelectedPoint(null);
    setArrived(false);
    clearNav();
  };

  const onConnectPress = async () => {
    if (connected) {
      await disconnect();
      return;
    }
    await connect();
  };

  useEffect(() => {
    if (!navActive || !liveLocation || !selectedPoint) return;

    const distToTarget = haversineMeters(liveLocation, selectedPoint);
    if (distToTarget <= ZONE_RADIUS) {
      arrive();
      return;
    }

    if (route && route.geometry.length > 1) {
      const idx = nearestIndexOnRoute(route.geometry, liveLocation);
      const remaining =
        haversineMeters(liveLocation, route.geometry[idx]) +
        remainingAlongRoute(route.geometry, idx);
      const eta =
        route.duration * Math.min(1, remaining / Math.max(route.distance, 1));
      const nm = nextManeuver(route.maneuvers, liveLocation);
      setNavInfo({
        remaining,
        eta,
        maneuverLabel: nm?.label ?? "FOLLOW ROUTE",
        maneuverDist: nm?.distance ?? distToTarget,
      });

      const last = routeFetchRef.current;
      if (
        last &&
        Date.now() - last.time > REROUTE_INTERVAL &&
        haversineMeters(liveLocation, last.origin) > REROUTE_DISTANCE
      ) {
        routeFetchRef.current = { origin: liveLocation, time: Date.now() };
        fetchRoute(liveLocation, selectedPoint)
          .then((r) => setRoute(r))
          .catch(() => {});
      }
    } else {
      setNavInfo({
        remaining: distToTarget,
        eta: distToTarget / 1.4,
        maneuverLabel: "DIRECT LINE",
        maneuverDist: distToTarget,
      });
    }

    if (followRef.current && mapRef.current) {
      mapRef.current.animateCamera(
        {
          center: liveLocation,
          heading: bearingDeg(liveLocation, selectedPoint),
          pitch: NAV_PITCH,
          zoom: NAV_ZOOM,
        },
        { duration: 900 }
      );
    }
  }, [liveLocation]);

  useEffect(() => {
    return () => {
      if (navTimer.current) clearTimeout(navTimer.current);
    };
  }, []);

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
          onPanDrag={() => {
            if (followRef.current) {
              followRef.current = false;
              setNavFollow(false);
            }
          }}
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
            setZoomedOut((prev) =>
              r.latitudeDelta > 0.025 ? true : r.latitudeDelta < 0.016 ? false : prev
            );
            if (r.latitudeDelta > 0.025) {
              setCoins(
                scatterCoins(
                  { latitude: r.latitude, longitude: r.longitude },
                  r.latitudeDelta
                )
              );
            }
          }}
          showsUserLocation={hasLocationPermission}
          showsMyLocationButton
          showsCompass={Platform.OS === "ios"}
          showsPointsOfInterest={false}
          showsBuildings={view.buildings}
          pitchEnabled
          rotateEnabled
          toolbarEnabled={false}
          moveOnMarkerPress={false}
          loadingEnabled
          mapType={view.mapType as any}
          customMapStyle={view.dark ? darkMapStyle : undefined}
          userInterfaceStyle="dark"
        >
          {selectedPoint ? (
            <>
              <Circle
                center={selectedPoint}
                radius={ZONE_RADIUS}
                strokeColor={arrived ? colors.warn : colors.accentBorder}
                fillColor={
                  arrived
                    ? "rgba(255, 178, 36, 0.08)"
                    : "rgba(61, 255, 136, 0.05)"
                }
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

          {navActive && liveLocation && selectedPoint && route ? (
            <>
              <Polyline
                coordinates={route.geometry}
                strokeColor={colors.black}
                strokeWidth={8}
                lineJoin="round"
                lineCap="round"
              />
              <Polyline
                coordinates={route.geometry}
                strokeColor={colors.accent}
                strokeWidth={4}
                lineJoin="round"
                lineCap="round"
              />
            </>
          ) : null}
          {navActive && liveLocation && selectedPoint && !route ? (
            <Polyline
              coordinates={[liveLocation, selectedPoint]}
              strokeColor={colors.accent}
              strokeWidth={2}
              lineDashPattern={[10, 8]}
            />
          ) : null}

          {zoomedOut && !navActive
            ? coins.map((c) => (
                <Marker
                  key={c.key}
                  coordinate={{
                    latitude: c.latitude,
                    longitude: c.longitude,
                  }}
                  anchor={{ x: 0.5, y: 1 }}
                  tracksViewChanges
                  onPress={() => {
                    dropPin({ latitude: c.latitude, longitude: c.longitude });
                    mapRef.current?.animateToRegion(
                      {
                        latitude: c.latitude,
                        longitude: c.longitude,
                        latitudeDelta: 0.01,
                        longitudeDelta: 0.01,
                      },
                      600
                    );
                  }}
                >
                  <CoinMarker phase={c.phase} />
                </Marker>
              ))
            : null}
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
                style={[
                  styles.dot,
                  navActive && { backgroundColor: colors.warn },
                  arrived && { backgroundColor: colors.warn },
                ]}
              />
              <Text style={styles.hudText}>
                {arrived
                  ? "ZONE ENTERED"
                  : navActive
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

        <MapCommandBar
          horizontal
          style={styles.commandBar}
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
              label: view.label,
              onPress: onCycleView,
              active: viewIndex !== 0,
            },
            {
              key: "center",
              icon: LocateFixed,
              label: navActive ? (navFollow ? "LOCK" : "FOLLOW") : "CENTER",
              onPress: onRecenter,
              active: navActive && navFollow,
            },
          ]}
        />

        {navActive && navInfo ? (
          <View style={styles.navBanner}>
            <View style={styles.navManeuver}>
              <View style={styles.navArrow}>
                <Navigation size={16} color={colors.black} />
              </View>
              <View style={styles.navTextWrap}>
                <Text style={styles.navInstruction} numberOfLines={1}>
                  {navInfo.maneuverLabel}
                </Text>
                <Text style={styles.navSub}>
                  {formatDistance(navInfo.maneuverDist)}
                </Text>
              </View>
            </View>
            <View style={styles.navMeta}>
              <Text style={styles.navEta}>{formatDuration(navInfo.eta)}</Text>
              <Text style={styles.navSub}>
                {formatDistance(navInfo.remaining)} LEFT
              </Text>
            </View>
            <Pressable
              onPress={stopNav}
              style={({ pressed }) => [
                styles.navClose,
                pressed && styles.chipPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="END NAVIGATION"
            >
              <X size={14} color={colors.danger} />
            </Pressable>
          </View>
        ) : null}

        {routeError && navActive ? (
          <View style={styles.routeWarn} pointerEvents="none">
            <Text style={styles.routeWarnText}>
              OFF-GRID — DIRECT LINE ROUTING
            </Text>
          </View>
        ) : null}
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

        {!sheetOpen && selectedPoint ? (
          <View style={[styles.targetChip, { bottom: overlayBottom }]}>
            <View style={styles.targetHeader}>
              <Crosshair
                size={11}
                color={arrived ? colors.warn : colors.accent}
              />
              <Text
                style={[styles.targetTitle, arrived && { color: colors.warn }]}
              >
                {arrived ? "ZONE ENTERED" : "TARGET LOCKED"}
              </Text>
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
              {!arrived ? (
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
              ) : null}
              <Pressable
                onPress={onClearTarget}
                style={({ pressed }) => [
                  styles.clearBtn,
                  arrived && { flex: 1 },
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
            <View style={styles.balanceRow}>
              <View style={styles.balanceBlock}>
                <Text style={styles.micro}>AVAILABLE BALANCE</Text>
                <Text style={styles.balanceValue}>$2.78</Text>
                <Text style={styles.balanceSub}>Add funds to arm the grid</Text>
              </View>
              <Pressable
                onPress={onConnectPress}
                disabled={busy}
                style={({ pressed }) => [
                  styles.connectBtn,
                  connected && styles.connectBtnLinked,
                  pressed && !busy && styles.chipPressed,
                  busy && styles.chipDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel={connected ? "DISCONNECT WALLET" : "CONNECT WALLET"}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <>
                    {connected ? (
                      <Power size={12} color={colors.danger} />
                    ) : (
                      <Wallet size={12} color={colors.accent} />
                    )}
                    <Text
                      style={[
                        styles.connectBtnText,
                        connected && styles.connectBtnTextLinked,
                      ]}
                    >
                      {connected ? "UNLINK" : "CONNECT"}
                    </Text>
                  </>
                )}
              </Pressable>
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
  commandBar: {
    position: "absolute",
    top: 52,
    left: 12,
  },
  navBanner: {
    position: "absolute",
    top: 112,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(4, 7, 10, 0.92)",
    borderWidth: 1,
    borderColor: colors.accentBorder,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  navManeuver: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  navArrow: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  navTextWrap: {
    flex: 1,
    gap: 2,
  },
  navInstruction: {
    ...type.label,
    fontSize: 13,
    color: colors.text,
  },
  navSub: {
    ...type.micro,
    fontSize: 9,
  },
  navMeta: {
    alignItems: "flex-end",
    gap: 2,
  },
  navEta: {
    ...type.data,
    fontSize: 14,
    color: colors.accent,
  },
  navClose: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  routeWarn: {
    position: "absolute",
    top: 162,
    alignSelf: "center",
    backgroundColor: "rgba(4, 7, 10, 0.9)",
    borderWidth: 1,
    borderColor: colors.warn,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  routeWarnText: {
    ...type.micro,
    fontSize: 9,
    color: colors.warn,
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
  balanceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  balanceBlock: {
    flex: 1,
    gap: 4,
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
  connectBtn: {
    height: 40,
    minWidth: 118,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentDim,
    marginTop: 4,
  },
  connectBtnLinked: {
    backgroundColor: "transparent",
    borderColor: colors.borderStrong,
  },
  connectBtnText: {
    ...type.label,
    fontSize: 11,
    fontWeight: "700",
    color: colors.accent,
  },
  connectBtnTextLinked: {
    color: colors.danger,
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
});
