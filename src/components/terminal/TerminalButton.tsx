import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, type } from "../../theme/terminal";

type Props = {
  title: string;
  onPress: () => void;
  variant?: "primary" | "ghost" | "danger";
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
};

export default function TerminalButton({
  title,
  onPress,
  variant = "primary",
  icon,
  loading = false,
  disabled = false,
}: Props) {
  const blocked = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={blocked}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" && styles.primary,
        variant === "ghost" && styles.ghost,
        variant === "danger" && styles.danger,
        pressed && !blocked && styles.pressed,
        blocked && styles.blocked,
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "primary" ? colors.black : colors.accent}
        />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text
            style={[
              styles.text,
              variant === "primary" && styles.textPrimary,
              variant === "ghost" && styles.textGhost,
              variant === "danger" && styles.textDanger,
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  primary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  ghost: {
    backgroundColor: "transparent",
    borderColor: colors.borderStrong,
  },
  danger: {
    backgroundColor: "transparent",
    borderColor: colors.danger,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ translateY: 1 }],
  },
  blocked: {
    opacity: 0.45,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  text: {
    ...type.label,
    fontSize: 13,
    fontWeight: "700",
  },
  textPrimary: {
    color: colors.black,
  },
  textGhost: {
    color: colors.text,
  },
  textDanger: {
    color: colors.danger,
  },
});
