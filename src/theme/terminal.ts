import { Platform } from "react-native";

export const colors = {
  bg: "#04070A",
  panel: "#080D11",
  panelRaised: "#0C1318",
  border: "#1A242C",
  borderStrong: "#2A3842",
  text: "#DCE8E1",
  textMuted: "#63726C",
  textFaint: "#3A4540",
  accent: "#3DFF88",
  accentDim: "rgba(61, 255, 136, 0.14)",
  accentBorder: "rgba(61, 255, 136, 0.35)",
  danger: "#FF5252",
  warn: "#FFB224",
  black: "#020406",
} as const;

export const mono = Platform.select({ ios: "Menlo", android: "monospace" });
export const monoBold = Platform.select({
  ios: "Menlo",
  android: "monospace",
});

export const type = {
  micro: {
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 1.8,
    textTransform: "uppercase" as const,
    color: colors.textMuted,
  },
  label: {
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase" as const,
    color: colors.textMuted,
  },
  body: {
    fontFamily: mono,
    fontSize: 13,
    letterSpacing: 0.2,
    color: colors.text,
  },
  data: {
    fontFamily: mono,
    fontSize: 15,
    letterSpacing: 0.4,
    color: colors.text,
  },
  title: {
    fontFamily: mono,
    fontSize: 22,
    fontWeight: "700" as const,
    letterSpacing: 2.5,
    textTransform: "uppercase" as const,
    color: colors.text,
  },
};

export const space = (n: number) => n * 4;

export const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#0A0F12" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#4A5A54" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#04070A" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#16212A" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#0A0F12" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#1D2B35" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#060B14" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#2A3842" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#0C1318" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#0B1512" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#0C1318" }],
  },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1A242C" }],
  },
];
