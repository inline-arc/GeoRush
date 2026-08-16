import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { colors } from "../../theme/terminal";

type Props = {
  aiming: boolean;
  locked: boolean;
};

const HALF = 34;
const TICK = 12;

export default function TargetReticle({ aiming, locked }: Props) {
  const aim = useRef(new Animated.Value(0)).current;
  const lockFlash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(aim, {
      toValue: aiming ? 1 : 0,
      duration: aiming ? 180 : 260,
      easing: aiming ? Easing.out(Easing.quad) : Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [aiming, aim]);

  useEffect(() => {
    if (!locked) return;
    lockFlash.setValue(1);
    Animated.timing(lockFlash, {
      toValue: 0,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [locked, lockFlash]);

  const spread = aim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 9],
  });
  const dim = aim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.45],
  });

  const flashScale = lockFlash.interpolate({
    inputRange: [0, 1],
    outputRange: [1.6, 1],
  });

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Animated.View style={[styles.frame, { opacity: dim }]}>
        <Animated.View
          style={[
            styles.tick,
            styles.tl,
            {
              transform: [
                { translateX: Animated.multiply(spread, -1) },
                { translateY: Animated.multiply(spread, -1) },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.tick,
            styles.tr,
            {
              transform: [{ translateX: spread }, { translateY: Animated.multiply(spread, -1) }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.tick,
            styles.bl,
            {
              transform: [
                { translateX: Animated.multiply(spread, -1) },
                { translateY: spread },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.tick,
            styles.br,
            {
              transform: [{ translateX: spread }, { translateY: spread }],
            },
          ]}
        />
        <View style={[styles.lineH, { left: -HALF - 14 }]} />
        <View style={[styles.lineH, { right: -HALF - 14 }]} />
        <View style={[styles.lineV, { top: -HALF - 14 }]} />
        <View style={[styles.lineV, { bottom: -HALF - 14 }]} />
        <View style={styles.dot} />
      </Animated.View>

      <Animated.View
        style={[
          styles.flashRing,
          {
            opacity: lockFlash,
            transform: [{ scale: flashScale }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    width: HALF * 2,
    height: HALF * 2,
    alignItems: "center",
    justifyContent: "center",
  },
  tick: {
    position: "absolute",
    width: TICK,
    height: TICK,
    borderColor: colors.accent,
  },
  tl: {
    top: 0,
    left: 0,
    borderTopWidth: 2,
    borderLeftWidth: 2,
  },
  tr: {
    top: 0,
    right: 0,
    borderTopWidth: 2,
    borderRightWidth: 2,
  },
  bl: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
  },
  br: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 2,
    borderRightWidth: 2,
  },
  lineH: {
    position: "absolute",
    top: HALF,
    width: 12,
    height: 1,
    backgroundColor: colors.accent,
  },
  lineV: {
    position: "absolute",
    left: HALF,
    width: 1,
    height: 12,
    backgroundColor: colors.accent,
  },
  dot: {
    width: 4,
    height: 4,
    backgroundColor: colors.accent,
  },
  flashRing: {
    position: "absolute",
    width: HALF * 2,
    height: HALF * 2,
    borderWidth: 1,
    borderColor: colors.accent,
  },
});
