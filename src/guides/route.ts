/**
 * A guide's patrol: a loop of stops, walked along paths at a stroll, with
 * a pause at each. Where the guide is depends only on the wall clock, so
 * every visitor sees them in the same place without anything sent over the
 * network. Plain numbers, so it's tested on its own (route.test.ts).
 */

export type Point = [number, number, number];

export interface Stop {
  /** Where the guide stands: feet position. */
  at: Point;
  /** Seconds to stay there. */
  wait: number;
}

/** A walking route between two points, or null to go straight. */
export type PathFinder = (from: Point, to: Point) => Point[] | null;

interface Leg {
  points: Point[];
  /** Distance from the leg's start to each point. */
  along: number[];
  length: number;
  start: number;
  wait: number;
  walk: number;
}

export interface RoutePosition {
  x: number;
  y: number;
  z: number;
  /** Which way the guide is walking (atan2 of x and z), or null standing. */
  heading: number | null;
}

/** Walks `points` and returns where `distance` along it lands. */
export function pointAlong(points: Point[], along: number[], distance: number, out: RoutePosition) {
  let i = 1;
  while (i < points.length - 1 && along[i] < distance) i++;
  const a = points[i - 1];
  const b = points[i];
  const span = along[i] - along[i - 1];
  const t = span > 1e-6 ? Math.min(1, Math.max(0, (distance - along[i - 1]) / span)) : 1;
  out.x = a[0] + (b[0] - a[0]) * t;
  out.y = a[1] + (b[1] - a[1]) * t;
  out.z = a[2] + (b[2] - a[2]) * t;
  out.heading = span > 1e-6 ? Math.atan2(b[0] - a[0], b[2] - a[2]) : null;
  return out;
}

export function measure(points: Point[]): number[] {
  const along = [0];
  for (let i = 1; i < points.length; i++) along.push(along[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][2] - points[i - 1][2]));
  return along;
}

export class Route {
  private readonly legs: Leg[] = [];
  readonly loop: number;

  constructor(stops: Stop[], speed: number, findPath?: PathFinder) {
    let t = 0;
    for (let i = 0; i < stops.length; i++) {
      const from = stops[i].at;
      const to = stops[(i + 1) % stops.length].at;
      let points = (findPath?.(from, to) ?? null) || [from, to];
      if (points.length < 2) points = [from, to];
      const along = measure(points);
      const length = along[along.length - 1];
      const walk = length / speed;
      this.legs.push({ points, along, length, start: t, wait: stops[i].wait, walk });
      t += stops[i].wait + walk;
    }
    this.loop = Math.max(t, 1);
  }

  /** Where the guide is at `seconds` (wall clock), written into `out`. */
  at(seconds: number, out: RoutePosition): RoutePosition {
    const t = ((seconds % this.loop) + this.loop) % this.loop;
    let leg = this.legs[0];
    for (const l of this.legs) if (l.start <= t) leg = l;
    const into = t - leg.start;
    if (into < leg.wait || leg.walk <= 0) {
      pointAlong(leg.points, leg.along, 0, out);
      out.heading = null;
      return out;
    }
    // Ease into and out of each stop, as a person does.
    const k = Math.min(1, (into - leg.wait) / leg.walk);
    return pointAlong(leg.points, leg.along, leg.length * k * k * (3 - 2 * k), out);
  }
}
