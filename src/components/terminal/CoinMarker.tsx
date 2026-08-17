import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/terminal";

type Props = {
  phase?: number;
  size?: number;
};

export default function CoinMarker({ phase = 0, size = 22 }: Props) {
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 1300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    const timer = setTimeout(() => loop.start(), phase * 1300);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [float, phase]);

  const translateY = float.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });
  const shadowScale = float.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.65],
  });
  const shadowOpacity = float.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 0.25],
  });

  return (
    <View style={styles.wrap} collapsable={false}>
      <Animated.View
        style={[
          styles.coin,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={styles.coinInner}>
          <Text style={[styles.glyph, { fontSize: size * 0.45 }]}>$</Text>
        </View>
      </Animated.View>
      <Animated.View
        style={[
          styles.shadow,
          {
            width: size * 0.8,
            opacity: shadowOpacity,
            transform: [{ scaleX: shadowScale }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 48,
    height: 44,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  coin: {
    backgroundColor: colors.black,
    borderWidth: 1.5,
    borderColor: colors.warn,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 3,
    shadowColor: colors.warn,
    shadowOpacity: 0.6,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  coinInner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: {
    color: colors.warn,
    fontWeight: "700",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  shadow: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.warn,
  },
});
