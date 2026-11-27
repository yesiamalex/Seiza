import type { PlayerMedia, PlayerState } from "../src/multiplayer/types";

/**
 * A room's research counts, for the admin page (admin/): how many came and
 * when, what they used (their mic, a camera, the screens, chat, gestures,
 * seats, the boards, each room mode, a world's own exhibits), where in the
 * world they spent their time, and what they were doing there (talking,
 * sitting, near someone, passing through), which is as near as counts can
 * honestly get to why a place is used.
 *
 * Counts only. No names, accounts, addresses, or anyone's path through the
 * world: a day being counted keeps short per-visit tokens (the page's own
 * random session id, cut short) only so each person counts once, and a
 * finished day keeps the counts alone. Three years are kept, then dropped
 * (a day is a few kilobytes to a hundred or so; the admin page asks for
 * only the days it shows). Visitors are counted by the country their
 * connection comes from (Cloudflare's two letters: where they connect from,
 * not who they are), and so is what each country's visitors did.
 * Off unless the deployment sets SEIZA_STATS_TOKEN (the room tells its
 * visitors when it's on). Lean: sampled on movement the room already
 * receives, at most every 10 s, saved every 10 minutes and when the room
 * empties; no timers, no alarms, nothing that wakes the room.
 */
const SAMPLE_MS = 10_000;
/** The longest a quiet room's last sample stands for (no one moving). */
const MAX_GAP_S = 60;
const SAVE_MS = 10 * 60_000;
const KEEP_DAYS = 3 * 365;
const MAX_COUNTRIES = 250;
const MAX_COUNTRY_KINDS = 4000;
/** A zone: a 2 m square of the floor (and a storey, in a model world). */
const CELL = 2;
/** Near enough to be together: within 3 m (personal to social distance). */
const NEAR = 3;
const MAX_CELLS = 3000;
const MAX_KINDS = 200;
const MAX_PEOPLE = 3000;
const TODAY_KEY = "stats:today";
const DAY_PREFIX = "stats:2";

/** A zone's seconds of presence, and of them: talking (mic on), sitting,
 *  near someone, and moving. */
export type Zone = [present: number, talking: number, seated: number, together: number, moving: number];

export interface DayStats {
  day: string;
  /** Joins (page visits), distinct visitors, the most at once. */
  joins: number;
  people: number;
  peak: number;
  /** Person-seconds in the room, and of them, near someone. */
  seconds: number;
  together: number;
  /** Person-seconds by hour of the day, Manila time. */
  hours: number[];
  /** Each thing done: [distinct people, times]. */
  did: Record<string, [number, number]>;
  zones: Record<string, Zone>;
  /** By the country connected from: [distinct visitors, visits, person-seconds]. */
  countries?: Record<string, [people: number, joins: number, seconds: number]>;
  /** What each country's visitors did: [distinct people, times], by country, by kind. */
  byCountry?: Record<string, Record<string, [number, number]>>;
}

interface Saved {
  stats: DayStats;
  seen: string[];
  who: Record<string, string[]>;
  /** A country's visit tokens, and a country's for each kind ("PH|chat"), while the day lasts. */
  cwho?: Record<string, string[]>;
}

const manila = (now = Date.now()) => new Date(now + 8 * 3600_000);
const dayOf = (now = Date.now()) => manila(now).toISOString().slice(0, 10);
const fresh = (day: string): DayStats => ({ day, joins: 0, people: 0, peak: 0, seconds: 0, together: 0, hours: new Array(24).fill(0), did: {}, zones: {}, countries: {}, byCountry: {} });
const round = (n: number) => Math.round(n * 10) / 10;

export class RoomStats {
  private today: DayStats = fresh(dayOf());
  private seen = new Set<string>();
  private who = new Map<string, Set<string>>();
  private cwho = new Map<string, Set<string>>();
  private visitOf = new Map<string, string>();
  private countryOf = new Map<string, string>();
  private media = new Map<string, PlayerMedia>();
  private lastAt = new Map<string, [number, number]>();
  private sampledAt = 0;
  private savedAt = Date.now();

  constructor(private readonly storage: DurableObjectStorage) {}

  async load() {
    const saved = await this.storage.get<Saved>(TODAY_KEY);
    if (!saved) return;
    if (saved.stats.day === dayOf()) {
      this.today = saved.stats;
      this.seen = new Set(saved.seen);
      this.who = new Map(Object.entries(saved.who).map(([k, v]) => [k, new Set(v)]));
      this.cwho = new Map(Object.entries(saved.cwho ?? {}).map(([k, v]) => [k, new Set(v)]));
      this.today.countries ??= {};
      this.today.byCountry ??= {};
    } else await this.finish(saved.stats);
  }

  join(connId: string, session: string | undefined, here: number, country?: string) {
    this.roll();
    const visit = (session ?? connId).slice(0, 12);
    this.visitOf.set(connId, visit);
    this.today.joins++;
    if (this.seen.size < MAX_PEOPLE) this.seen.add(visit);
    this.today.people = this.seen.size;
    this.today.peak = Math.max(this.today.peak, here);
    const countries = (this.today.countries ??= {});
    if (country && (countries[country] || Object.keys(countries).length < MAX_COUNTRIES)) {
      this.countryOf.set(connId, country);
      const people = this.cwhoOf(country);
      if (people) people.add(visit);
      const c = (countries[country] ??= [0, 0, 0]);
      c[0] = people?.size ?? c[0];
      c[1]++;
    }
  }

  /** The visit tokens kept for a country, or a country's kind, while the day lasts. */
  private cwhoOf(key: string) {
    let set = this.cwho.get(key);
    if (!set) {
      if (this.cwho.size >= MAX_COUNTRY_KINDS) return null;
      this.cwho.set(key, (set = new Set()));
    }
    return set.size < MAX_PEOPLE ? set : null;
  }

  leave(connId: string) {
    this.visitOf.delete(connId);
    this.media.delete(connId);
    this.lastAt.delete(connId);
    this.chose.delete(connId);
    this.countryOf.delete(connId);
  }

  /** What each person has chosen in each slot (their instrument, their
   *  ride, what they're holding), so a choice counts once when it's made,
   *  not on every message that repeats it. */
  private chose = new Map<string, Map<string, string>>();
  /** Whether someone's choice in `slot` is new (and remembers it). */
  changed(connId: string, slot: string, value: string): boolean {
    let mine = this.chose.get(connId);
    if (!mine) this.chose.set(connId, (mine = new Map()));
    if (mine.get(slot) === value) return false;
    mine.set(slot, value);
    return true;
  }

  /** Someone did something worth counting (see the kinds on the admin page). */
  did(connId: string, kind: string) {
    this.roll();
    const visit = this.visitOf.get(connId);
    if (!visit) return;
    let people = this.who.get(kind);
    if (!people) {
      if (this.who.size >= MAX_KINDS) return;
      this.who.set(kind, (people = new Set()));
    }
    if (people.size < MAX_PEOPLE) people.add(visit);
    const d = this.today.did[kind] ?? [0, 0];
    d[0] = people.size;
    d[1]++;
    this.today.did[kind] = d;
    // And by the country they came from.
    const country = this.countryOf.get(connId);
    if (country) {
      const byCountry = ((this.today.byCountry ??= {})[country] ??= {});
      const set = this.cwhoOf(`${country}|${kind}`);
      if (set) set.add(visit);
      const c = (byCountry[kind] ??= [0, 0]);
      c[0] = set?.size ?? c[0];
      c[1]++;
    }
  }

  /** A mic, a camera, or a screen turned on counts once per turning on. */
  setMedia(connId: string, media: PlayerMedia) {
    const before = this.media.get(connId) ?? {};
    if (media.mic && !before.mic) this.did(connId, "mic");
    if (media.camera && !before.camera) this.did(connId, "camera");
    if (media.screen && !before.screen) this.did(connId, "screen");
    this.media.set(connId, media);
  }

  /** Where everyone is, and what they're doing, every 10 s at most. */
  sample(players: PlayerState[], now = Date.now()) {
    if (now - this.sampledAt < SAMPLE_MS) return;
    const dt = this.sampledAt ? Math.min(MAX_GAP_S, (now - this.sampledAt) / 1000) : SAMPLE_MS / 1000;
    this.sampledAt = now;
    this.roll();
    const t = this.today;
    t.peak = Math.max(t.peak, players.length);
    const hour = manila(now).getUTCHours();
    for (const p of players) {
      const [x, y, z] = p.position;
      const media = this.media.get(p.id);
      const talking = !!media?.mic && !media.micMuted;
      const seated = p.posture !== null && p.posture !== undefined;
      const together = players.some((o) => o !== p && Math.hypot(o.position[0] - x, o.position[2] - z) < NEAR);
      const last = this.lastAt.get(p.id);
      const moving = !!last && Math.hypot(last[0] - x, last[1] - z) > 0.5;
      this.lastAt.set(p.id, [x, z]);
      t.seconds += dt;
      t.hours[hour] += dt;
      const country = this.countryOf.get(p.id);
      const c = country ? t.countries?.[country] : undefined;
      if (c) c[2] += dt;
      if (together) t.together += dt;
      const level = Math.round(y / 3);
      const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}${level ? `,${level}` : ""}`;
      let zone = t.zones[key];
      if (!zone) {
        if (Object.keys(t.zones).length >= MAX_CELLS) continue;
        zone = t.zones[key] = [0, 0, 0, 0, 0];
      }
      zone[0] += dt;
      if (talking) zone[1] += dt;
      if (seated) zone[2] += dt;
      if (together) zone[3] += dt;
      if (moving) zone[4] += dt;
    }
    if (now - this.savedAt > SAVE_MS) void this.save();
  }

  async save() {
    this.savedAt = Date.now();
    const t = this.today;
    t.seconds = round(t.seconds);
    t.together = round(t.together);
    t.hours = t.hours.map(round);
    for (const zone of Object.values(t.zones)) for (let i = 0; i < 5; i++) zone[i] = round(zone[i]);
    for (const c of Object.values(t.countries ?? {})) c[2] = round(c[2]);
    const who: Record<string, string[]> = {};
    for (const [k, v] of this.who) who[k] = [...v];
    const cwho: Record<string, string[]> = {};
    for (const [k, v] of this.cwho) cwho[k] = [...v];
    await this.storage.put(TODAY_KEY, { stats: t, seen: [...this.seen], who, cwho } satisfies Saved);
  }

  /** The last `days` kept days (every one, if not said), and today so far: what the admin page reads. */
  async read(days?: number): Promise<DayStats[]> {
    const want = days && days > 0 ? Math.min(KEEP_DAYS, Math.floor(days)) : KEEP_DAYS;
    const since = `stats:${dayOf(Date.now() - (want - 1) * 86400_000)}`;
    const kept = await this.storage.list<DayStats>({ prefix: DAY_PREFIX, start: since });
    return [...kept.values(), this.today];
  }

  /** A new day in Manila: yesterday's counts kept (without the tokens), old ones dropped. */
  private roll() {
    const day = dayOf();
    if (day === this.today.day) return;
    void this.finish(this.today);
    this.today = fresh(day);
    this.seen.clear();
    this.who.clear();
    this.cwho.clear();
  }

  private async finish(stats: DayStats) {
    await this.storage.put(`stats:${stats.day}`, stats);
    const cutoff = dayOf(Date.now() - KEEP_DAYS * 86400_000);
    const old = await this.storage.list({ prefix: DAY_PREFIX, end: `stats:${cutoff}` });
    if (old.size) await this.storage.delete([...old.keys()]);
  }
}
