import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Crosshair,
  MapPin,
  Satellite,
  Terminal as TerminalIcon,
  Wallet,
  Zap,
} from "lucide-react-native";
import { colors, type } from "../theme/terminal";
import BootLog from "../components/terminal/BootLog";
import Panel from "../components/terminal/Panel";
import ScanGrid from "../components/terminal/ScanGrid";
import TerminalButton from "../components/terminal/TerminalButton";
import type { WalletApi } from "../features/wallet/usePrivyWallet";

const BOOT_LINES = [
  { text: "INITIALIZING GEORUSH TERMINAL v1.0.4", status: "ok" as const },
  { text: "ESTABLISHING SATELLITE UPLINK", status: "ok" as const },
  { text: "SYNCING GRID COORDINATES", status: "ok" as const },
  { text: "LOADING WALLET AUTH MODULE", status: "ok" as const },
  { text: "AWAITING OPERATOR AUTHENTICATION", status: "wait" as const },
];

const STEPS = [
  {
    icon: Wallet,
    code: "01",
    title: "Connect wallet",
    body: "Link your Starknet wallet to arm the terminal.",
  },
  {
    icon: MapPin,
    code: "02",
    title: "Mark the grid",
    body: "Tap the live map to drop a point anywhere.",
  },
  {
    icon: Zap,
    code: "03",
    title: "Fund the point",
    body: "Stake an amount and activate the zone.",
  },
];

type Props = {
  walletApi: WalletApi;
};

export default function LoginScreen({ walletApi }: Props) {
  const { busy, error, connect } = walletApi;
  const [booted, setBooted] = useState(false);

  const reveal = useRef(new Animated.Value(0)).current;
  const stepsReveal = useRef(new Animated.Value(0)).current;

  const onBootDone = useCallback(() => setBooted(true), []);

  useEffect(() => {
    if (!booted) return;
    Animated.stagger(180, [
      Animated.timing(reveal, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(stepsReveal, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [booted, reveal, stepsReveal]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <ScanGrid />

      <View style={styles.statusStrip}>
        <View style={styles.stripLeft}>
          <TerminalIcon size={12} color={colors.accent} />
          <Text style={styles.stripText}>GEORUSH // OPS TERMINAL</Text>
        </View>
        <View style={styles.stripRight}>
          <View style={styles.dot} />
          <Text style={styles.stripText}>ONLINE</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.bootBlock}>
          <BootLog lines={BOOT_LINES} onDone={onBootDone} />
        </View>

        <Animated.View
          style={[
            styles.authBlock,
            {
              opacity: reveal,
              transform: [
                {
                  translateY: reveal.interpolate({
                    inputRange: [0, 1],
                    outputRange: [16, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.titleRow}>
            <Satellite size={20} color={colors.accent} />
            <Text style={styles.title}>GET STARTED{"\n"}WITH GEORUSH</Text>
          </View>
          <Text style={styles.subtitle}>
            Mark coordinates on the live grid and fund the points that matter.
          </Text>

          <TerminalButton
            title={busy ? "ESTABLISHING LINK" : "CONNECT WALLET"}
            onPress={connect}
            loading={busy}
            icon={<Wallet size={16} color={colors.black} />}
          />

          {error ? (
            <Text style={styles.error}>[ERROR] {error.toUpperCase()}</Text>
          ) : null}

          <Text style={styles.hint}>
            Secure link via Starknet. No keys stored on device.
          </Text>
        </Animated.View>

        <Animated.View
          style={{
            opacity: stepsReveal,
            transform: [
              {
                translateY: stepsReveal.interpolate({
                  inputRange: [0, 1],
                  outputRange: [16, 0],
                }),
              },
            ],
          }}
        >
          <Panel label="HOW_IT_WORKS" style={styles.stepsPanel}>
            <View style={styles.steps}>
              {STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <View
                    key={step.code}
                    style={[
                      styles.stepRow,
                      i < STEPS.length - 1 && styles.stepDivider,
                    ]}
                  >
                    <View style={styles.stepIcon}>
                      <Icon size={16} color={colors.accent} />
                    </View>
                    <View style={styles.stepText}>
                      <View style={styles.stepTitleRow}>
                        <Text style={styles.stepCode}>{step.code}</Text>
                        <Text style={styles.stepTitle}>
                          {step.title.toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.stepBody}>{step.body}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </Panel>
        </Animated.View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.stripLeft}>
          <Crosshair size={12} color={colors.textFaint} />
          <Text style={styles.footerText}>GRID.READY</Text>
        </View>
        <Text style={styles.footerText}>SIG.LOCK // STARKNET</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  statusStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stripLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stripRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stripText: {
    ...type.micro,
  },
  dot: {
    width: 6,
    height: 6,
    backgroundColor: colors.accent,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 24,
    gap: 24,
  },
  bootBlock: {
    minHeight: 118,
    padding: 14,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  authBlock: {
    gap: 16,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  title: {
    ...type.title,
    fontSize: 26,
    lineHeight: 32,
    flex: 1,
  },
  subtitle: {
    ...type.body,
    color: colors.textMuted,
    lineHeight: 20,
  },
  error: {
    ...type.micro,
    color: colors.danger,
  },
  hint: {
    ...type.micro,
    color: colors.textFaint,
  },
  stepsPanel: {},
  steps: {},
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
  },
  stepDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stepIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentDim,
  },
  stepText: {
    flex: 1,
    gap: 4,
  },
  stepTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepCode: {
    ...type.micro,
    color: colors.accent,
  },
  stepTitle: {
    ...type.label,
    color: colors.text,
    fontWeight: "700",
  },
  stepBody: {
    ...type.body,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerText: {
    ...type.micro,
    color: colors.textFaint,
  },
});
