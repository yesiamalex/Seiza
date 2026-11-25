/**
 * SportSeiza: real exercise equipment and sports services, plugged into
 * ExerSeiza's rides (../exer). Nothing here talks to a device yet; this is
 * the contract a device integration fills in. See README.md beside it.
 *
 * A RideSource is anything that can say how fast someone is going (a smart
 * bike or trainer over Bluetooth FTMS or ANT+, a treadmill, an IoT bridge
 * over WebSocket or MQTT) and, if it can, take the slope back so the
 * resistance follows the virtual ground. ExerSeiza does the rest: while a
 * connected source sends a speed, the rider moves at that speed (on a
 * screen and in a headset), and every second the source is told the slope
 * under the rider.
 */

/** One moment from the equipment. Every field is optional: send what the
 *  device measures. Speed is what moves the rider. */
export interface TrainerReading {
  /** Metres a second along the ground. */
  speed?: number;
  /** Pedal (or stride) revolutions a minute. */
  cadence?: number;
  /** Watts. */
  power?: number;
  /** Beats a minute. */
  heartRate?: number;
  /** performance.now() when it was read. */
  at: number;
}

export interface RideSource {
  /** Stable and unique: "ftms", "iot-bridge". */
  id: string;
  /** What the rider sees, in English and Japanese. */
  label: [string, string];
  /** Asks for the device (a browser chooser for Bluetooth, a socket for a
   *  bridge). Call from a click: browsers only allow device access then. */
  connect(): Promise<void>;
  disconnect(): void;
  /** Readings as they come. Returns the unsubscribe. */
  onReading(listener: (reading: TrainerReading) => void): () => void;
  /** The slope under the rider, in percent (rise over run × 100, uphill
   *  positive), about once a second. For a trainer that sets resistance
   *  from grade; leave it out if the device can't. */
  setGradient?(percent: number): void;
}

const sources = new Map<string, RideSource>();
let active: { source: RideSource; last: TrainerReading | null; stop: () => void } | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

/** A device integration announces itself here, once, when its module loads. */
export function registerRideSource(source: RideSource) {
  sources.set(source.id, source);
  changed();
}

export const rideSources = () => [...sources.values()];
export const activeRideSource = () => active?.source ?? null;
export const onRideSourcesChange = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export async function connectRideSource(id: string) {
  disconnectRideSource();
  const source = sources.get(id);
  if (!source) return;
  await source.connect();
  const entry = { source, last: null as TrainerReading | null, stop: () => {} };
  entry.stop = source.onReading((reading) => (entry.last = reading));
  active = entry;
  changed();
}

export function disconnectRideSource() {
  if (!active) return;
  active.stop();
  active.source.disconnect();
  active = null;
  changed();
}

/** The latest reading, if it's fresh (a device that stopped sending stops moving the rider). */
export function latestReading(maxAgeMs = 2000): TrainerReading | null {
  const last = active?.last;
  return last && performance.now() - last.at <= maxAgeMs ? last : null;
}

/** ExerSeiza tells the active source the slope (percent). */
export function sendGradient(percent: number) {
  active?.source.setGradient?.(percent);
}
