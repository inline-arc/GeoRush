export type Point = { latitude: number; longitude: number };

export type Maneuver = {
  location: Point;
  label: string;
  distanceBefore: number;
};

export type Route = {
  geometry: Point[];
  distance: number;
  duration: number;
  maneuvers: Maneuver[];
};

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

export function decodePolyline(encoded: string, precision = 6): Point[] {
  const factor = 10 ** precision;
  const points: Point[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lon += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: lat / factor, longitude: lon / factor });
  }
  return points;
}

const DIRECTION_WORDS: Record<string, string> = {
  north: "N",
  northeast: "NE",
  east: "E",
  southeast: "SE",
  south: "S",
  southwest: "SW",
  west: "W",
  northwest: "NW",
};

function maneuverLabel(m: any): string {
  const type: string = m?.type ?? "";
  const modifier: string = m?.modifier ?? "";
  const dir = DIRECTION_WORDS[m?.direction as string];

  switch (type) {
    case "depart":
      return dir ? `HEAD ${dir}` : "START ROUTE";
    case "arrive":
      return "ENTER ZONE";
    case "turn":
    case "end of road":
      return `TURN ${modifier.replace(/\b\w/g, (c) => c.toUpperCase()).toUpperCase()}`;
    case "new name":
    case "continue":
      return modifier ? `KEEP ${modifier.toUpperCase()}` : "CONTINUE";
    case "merge":
      return "MERGE";
    case "on ramp":
    case "off ramp":
      return "TAKE RAMP";
    case "fork":
      return modifier ? `FORK ${modifier.toUpperCase()}` : "KEEP FORK";
    case "roundabout":
    case "rotary":
      return "ROUNDABOUT";
    case "roundabout turn":
      return `ROUNDABOUT ${modifier.toUpperCase()}`;
    case "exit roundabout":
      return "EXIT ROUNDABOUT";
    case "uturn":
      return "U-TURN";
    case "notification":
      return "CONTINUE";
    default:
      return modifier ? `GO ${modifier.toUpperCase()}` : "CONTINUE";
  }
}

export async function fetchRoute(from: Point, to: Point): Promise<Route> {
  const url =
    `${OSRM_BASE}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}` +
    `?overview=full&geometries=polyline6&steps=true&continue_straight=true`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`routing ${res.status}`);
    const json = await res.json();
    const r = json?.routes?.[0];
    if (!r) throw new Error("no route");

    const geometry = decodePolyline(r.geometry, 6);
    const maneuvers: Maneuver[] = [];
    for (const leg of r.legs ?? []) {
      for (const step of leg.steps ?? []) {
        const loc = step?.maneuver?.location;
        if (!Array.isArray(loc)) continue;
        maneuvers.push({
          location: { latitude: loc[1], longitude: loc[0] },
          label: maneuverLabel(step.maneuver),
          distanceBefore: step.distance ?? 0,
        });
      }
    }

    return {
      geometry,
      distance: r.distance ?? 0,
      duration: r.duration ?? 0,
      maneuvers,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function haversineMeters(a: Point, b: Point): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const la1 = (a.latitude * Math.PI) / 180;
  const la2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearestIndexOnRoute(geometry: Point[], p: Point): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < geometry.length; i++) {
    const d = haversineMeters(geometry[i], p);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function remainingAlongRoute(
  geometry: Point[],
  fromIndex: number,
): number {
  let sum = 0;
  for (let i = fromIndex; i < geometry.length - 1; i++) {
    sum += haversineMeters(geometry[i], geometry[i + 1]);
  }
  return sum;
}

export function nextManeuver(
  maneuvers: Maneuver[],
  user: Point,
): { label: string; distance: number } | null {
  let next: Maneuver | null = null;
  let nextD = Infinity;
  for (const m of maneuvers) {
    const d = haversineMeters(user, m.location);
    if (d > 25 && d < nextD) {
      next = m;
      nextD = d;
    }
  }
  if (!next) return null;
  return { label: next.label, distance: nextD };
}

export function formatDuration(sec: number): string {
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 60) return `${min} MIN`;
  const h = Math.floor(min / 60);
  return `${h}H ${String(min % 60).padStart(2, "0")}M`;
}
