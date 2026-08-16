import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { colors, type } from "../../theme/terminal";

type Props = {
  label?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: ViewStyle;
  tone?: "default" | "raised";
};

function Corner({ position }: { position: "tl" | "tr" | "bl" | "br" }) {
  return <View style={[styles.corner, styles[`corner_${position}`]]} />;
}

export default function Panel({
  label,
  right,
  children,
  style,
  tone = "default",
}: Props) {
  return (
    <View
      style={[
        styles.panel,
        tone === "raised" && styles.panelRaised,
        style,
      ]}
    >
      <Corner position="tl" />
      <Corner position="tr" />
      <Corner position="bl" />
      <Corner position="br" />
      {label ? (
        <View style={styles.header}>
          <Text style={styles.headerText}>[ {label} ]</Text>
          {right}
        </View>
      ) : null}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const TICK = 7;

const styles = StyleSheet.create({
  panel: {
    position: "relative",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  panelRaised: {
    backgroundColor: colors.panelRaised,
  },
  corner: {
    position: "absolute",
    width: TICK,
    height: TICK,
    borderColor: colors.accent,
    zIndex: 2,
  },
  corner_tl: {
    top: -1,
    left: -1,
    borderTopWidth: 1,
    borderLeftWidth: 1,
  },
  corner_tr: {
    top: -1,
    right: -1,
    borderTopWidth: 1,
    borderRightWidth: 1,
  },
  corner_bl: {
    bottom: -1,
    left: -1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
  },
  corner_br: {
    bottom: -1,
    right: -1,
    borderBottomWidth: 1,
    borderRightWidth: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerText: {
    ...type.micro,
    color: colors.accent,
  },
  body: {
    padding: 14,
  },
});
