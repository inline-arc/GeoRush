import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { colors } from "../../theme/terminal";

const LINE_COLOR = "rgba(61, 255, 136, 0.05)";

export default function ScanGrid() {
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);

  const translateY = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-80, 900],
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: 14 }).map((_, i) => (
        <View key={`h-${i}`} style={[styles.hLine, { top: i * 64 }]} />
      ))}
      {Array.from({ length: 8 }).map((_, i) => (
        <View key={`v-${i}`} style={[styles.vLine, { left: `${i * 14.28}%` }]} />
      ))}
      <Animated.View style={[styles.sweep, { transform: [{ translateY }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  hLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: LINE_COLOR,
  },
  vLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: LINE_COLOR,
  },
  sweep: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: "rgba(61, 255, 136, 0.04)",
    borderTopWidth: 1,
    borderTopColor: "rgba(61, 255, 136, 0.10)",
  },
});
