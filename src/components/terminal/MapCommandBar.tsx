import React from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors, type } from "../../theme/terminal";

export type CommandItem = {
  key: string;
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
};

type Props = {
  items: CommandItem[];
  style?: ViewStyle;
  horizontal?: boolean;
};

export default function MapCommandBar({ items, style, horizontal }: Props) {
  return (
    <View style={[styles.bar, horizontal && styles.barHorizontal, style]}>
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <Pressable
            key={item.key}
            onPress={item.onPress}
            disabled={item.disabled}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            style={({ pressed }) => [
              styles.chip,
              horizontal && styles.chipHorizontal,
              i > 0 && (horizontal ? styles.chipGapH : styles.chipGap),
              item.active && styles.chipActive,
              item.disabled && styles.chipDisabled,
              pressed && !item.disabled && styles.chipPressed,
            ]}
          >
            <Icon
              size={16}
              color={
                item.danger
                  ? colors.danger
                  : item.active
                    ? colors.accent
                    : colors.textMuted
              }
            />
            <Text
              style={[
                styles.label,
                item.active && styles.labelActive,
                item.danger && styles.labelDanger,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: "rgba(4, 7, 10, 0.88)",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
  },
  barHorizontal: {
    flexDirection: "row",
  },
  chip: {
    width: 56,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 6,
  },
  chipHorizontal: {
    width: 60,
    minHeight: 44,
  },
  chipGap: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  chipGapH: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.accentDim,
  },
  chipDisabled: {
    opacity: 0.35,
  },
  chipPressed: {
    backgroundColor: colors.panelRaised,
  },
  label: {
    ...type.micro,
    fontSize: 8,
    letterSpacing: 1,
  },
  labelActive: {
    color: colors.accent,
  },
  labelDanger: {
    color: colors.danger,
  },
});
