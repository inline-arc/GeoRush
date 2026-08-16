import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { colors, type } from "../../theme/terminal";

type Line = { text: string; status?: "ok" | "warn" | "wait" };

type Props = {
  lines: Line[];
  onDone?: () => void;
  speed?: number;
};

export default function BootLog({ lines, onDone, speed = 14 }: Props) {
  const [lineIndex, setLineIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const cursor = useRef(new Animated.Value(1)).current;
  const doneRef = useRef(false);

  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(cursor, {
          toValue: 0,
          duration: 420,
          useNativeDriver: true,
        }),
        Animated.timing(cursor, {
          toValue: 1,
          duration: 420,
          useNativeDriver: true,
        }),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, [cursor]);

  useEffect(() => {
    if (lineIndex >= lines.length) {
      if (!doneRef.current) {
        doneRef.current = true;
        setFinished(true);
        onDone?.();
      }
      return;
    }
    const current = lines[lineIndex];
    if (charIndex < current.text.length) {
      const t = setTimeout(() => setCharIndex((c) => c + 1), speed);
      return () => clearTimeout(t);
    }
    const t = setTimeout(
      () => {
        setLineIndex((i) => i + 1);
        setCharIndex(0);
      },
      current.status === "wait" ? 420 : 140
    );
    return () => clearTimeout(t);
  }, [lineIndex, charIndex, lines, speed, onDone]);

  return (
    <View style={styles.wrap}>
      {lines.slice(0, lineIndex + 1).map((line, i) => {
        const isActive = i === lineIndex && !finished;
        const shown =
          i < lineIndex || finished ? line.text : line.text.slice(0, charIndex);
        return (
          <View key={i} style={styles.line}>
            <Text style={styles.prefix}>
              {String(i).padStart(2, "0")}
            </Text>
            <Text style={styles.text}>{shown}</Text>
            {!isActive && line.status ? (
              <Text
                style={[
                  styles.status,
                  line.status === "ok" && { color: colors.accent },
                  line.status === "warn" && { color: colors.warn },
                  line.status === "wait" && { color: colors.textMuted },
                ]}
              >
                {line.status === "ok"
                  ? "[OK]"
                  : line.status === "warn"
                    ? "[!!]"
                    : "[..]"}
              </Text>
            ) : null}
            {isActive ? (
              <Animated.View style={[styles.cursor, { opacity: cursor }]} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 18,
  },
  prefix: {
    ...type.micro,
    color: colors.textFaint,
    width: 22,
  },
  text: {
    ...type.body,
    fontSize: 12,
    color: colors.textMuted,
    flexShrink: 1,
  },
  status: {
    ...type.micro,
  },
  cursor: {
    width: 8,
    height: 14,
    backgroundColor: colors.accent,
  },
});
