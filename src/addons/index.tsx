import { addonModeKey, type AddonMode, type PlayerState, type WorldStateValue } from "../multiplayer/types";
import { L, useLang } from "../i18n/lang";
import { BandLayer } from "./band/BandLayer";
import { BandButton, BandStage } from "./band/BandHud";
import { FantasyLayer } from "./fantasy/FantasyLayer";
import { FantasyButton, FantasyStatus } from "./fantasy/FantasyHud";
import { fantasy, setElement, setWeapon } from "./fantasy/combat";
import { record } from "./fantasy/record";
import { ELEMENT_LABELS, ELEMENTS, WEAPON_SPECS, WEAPONS } from "./fantasy/weapons";
import { INSTRUMENT_LABELS, INSTRUMENTS, isStand, LIGHT_COLORS } from "./band/instruments";
import { useStore } from "./store";
import type { XrHudSection } from "../xr/hud/hudPanel";
import { band, setInstrument, setLightColor, setPair, tapped } from "./band/band";
import { MODE_ACCENTS, ModeSwitch } from "./ui";

/**
 * Room modes: add-ons an editor or admin switches on for the whole room
 * (see README.md here). App mounts four things from this file and nothing
 * else of theirs: the scene part, the bar buttons, the on-screen part, and
 * the switches.
 */
export { connectAddonBus } from "./bus";
export { LOCAL_AVATAR, setAddonAvatar } from "./avatars";

type WorldState = Record<string, WorldStateValue>;
const on = (worldState: WorldState, mode: AddonMode) => worldState[addonModeKey(mode)] === true;

// One mode at a time in your hands: picking a weapon puts any instrument
// away, and picking an instrument puts the weapon away, so nobody fights
// with a guitar on or strums with a sword drawn.
{
  let weapon = fantasy.get().weapon;
  let instrument = band.get().instrument;
  fantasy.subscribe(() => {
    const next = fantasy.get().weapon;
    if (next && next !== weapon && band.get().instrument) setInstrument(null);
    weapon = next;
  });
  band.subscribe(() => {
    const next = band.get().instrument;
    if (next && next !== instrument && fantasy.get().weapon) setWeapon(null);
    instrument = next;
  });
}

/** Inside the Canvas. */
export function AddonScene({
  worldState,
  ...props
}: {
  worldState: WorldState;
  selfId: string | null;
  players: Record<string, PlayerState>;
  getSelfPosition: () => [number, number, number];
  editMode: boolean;
  /** Seated or in a posture here (see FantasyLayer's selfSeated). */
  selfSeated: boolean;
}) {
  return (
    <>
      {on(worldState, "fantasy") && <FantasyLayer {...props} />}
      {on(worldState, "band") && <BandLayer selfId={props.selfId} players={props.players} editMode={props.editMode} selfSeated={props.selfSeated} />}
    </>
  );
}

/** In the control bar: one coloured button per mode that's on. */
export function AddonBarButtons({ worldState }: { worldState: WorldState }) {
  const fantasyOn = on(worldState, "fantasy");
  const bandOn = on(worldState, "band");
  if (!fantasyOn && !bandOn) return null;
  return (
    <>
      <div className="seiza-bar-divider" aria-hidden />
      {fantasyOn && <FantasyButton />}
      {bandOn && <BandButton />}
    </>
  );
}

/** Over the world: health and meter, the attack button, the instrument. */
export function AddonOverlay({ worldState, touch }: { worldState: WorldState; touch: boolean }) {
  return (
    <>
      {on(worldState, "fantasy") && <FantasyStatus touch={touch} />}
      {on(worldState, "band") && <BandStage />}
    </>
  );
}

/** The switches, for the edit and admin panels. */
export function RoomModes({ worldState, setWorldState, disabled }: { worldState: WorldState; setWorldState: (key: string, value: WorldStateValue) => void; disabled?: boolean }) {
  useLang();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 10 }}>
      <strong style={{ fontSize: 12 }}>{L("Room modes", "ルームモード")}</strong>
      <ModeSwitch
        label={L("Fantasy mode", "ファンタジーモード")}
        description={L("Everyone gets a Fantasy button: swords, a bow, health bars, and specials. Only people who pick a weapon can be hit.", "全員にファンタジーボタンが出ます:剣、弓、体力ゲージ、必殺技。武器を選んだ人だけが攻撃を受けます。")}
        on={on(worldState, "fantasy")}
        accent={MODE_ACCENTS.fantasy}
        disabled={disabled}
        onChange={(value) => setWorldState(addonModeKey("fantasy"), value)}
      />
      <ModeSwitch
        label={L("Band mode", "バンドモード")}
        description={L("Everyone gets a Band button: drums, taiko, keys, kulintang, guitars, a shaker, and light sticks, heard by the whole room.", "全員にバンドボタンが出ます:ドラム、和太鼓、キーボード、クリンタン、ギター、シェイカー、ペンライト。部屋の全員に聞こえます。")}
        on={on(worldState, "band")}
        accent={MODE_ACCENTS.band}
        disabled={disabled}
        onChange={(value) => setWorldState(addonModeKey("band"), value)}
      />
    </div>
  );
}

/** Whether this visitor has a stand out (a drum pad, keys, a kit): it
 *  stands where they set it up, so they stay at it (PlayerRig's rooted). */
export function useAddonRooted(worldState: WorldState) {
  const { instrument } = useStore(band);
  return on(worldState, "band") && isStand(instrument);
}

/** Whether a click belongs to a room mode (an attack, or a note on an
 *  instrument) rather than being a walk across the floor. */
export const addonHoldsClicks = () => fantasy.get().weapon !== null || performance.now() - tapped.at < 600;

const LIGHT_NAMES: [string, string][] = [
  ["Pink", "ピンク"],
  ["Blue", "青"],
  ["Green", "緑"],
  ["Yellow", "黄"],
  ["Purple", "紫"],
  ["Orange", "オレンジ"],
  ["White", "白"],
];

/** Who may switch the room modes from a headset, and how: the same people
 *  as the edit and admin panels' switches (RoomModes). */
export interface XrModeSwitches {
  allowed: boolean;
  setWorldState: (key: string, value: WorldStateValue) => void;
}

/**
 * The room modes in a headset's menu (src/xr/hud): what the flat screen's
 * Fantasy and Band buttons offer, as the menu's own sections, and for an
 * editor or admin the switches that turn the modes on, so nobody has to
 * take the headset off to start a fight or a band. Re-renders with either
 * mode's state, so the chosen one stays lit.
 */
export function useAddonXrSections(worldState: WorldState, switches?: XrModeSwitches): XrHudSection[] {
  useLang();
  const fighter = useStore(fantasy);
  const musician = useStore(band);
  const rows = useStore(record);
  const sections: XrHudSection[] = [];
  const fantasyOn = on(worldState, "fantasy");
  const bandOn = on(worldState, "band");
  if (switches?.allowed) {
    const toggle = (mode: AddonMode, now: boolean) => () => switches.setWorldState(addonModeKey(mode), !now);
    sections.push({
      id: "modes",
      title: L("Room modes", "ルームモード"),
      note: L("For everyone in the room.", "部屋の全員に。"),
      columns: 2,
      choices: [
        { id: "fantasy", label: L("Fantasy", "ファンタジー"), active: fantasyOn, onPress: toggle("fantasy", fantasyOn) },
        { id: "band", label: L("Band", "バンド"), active: bandOn, onPress: toggle("band", bandOn) },
      ],
    });
  } else if (!fantasyOn && !bandOn) {
    sections.push({
      id: "modes",
      title: L("Room modes", "ルームモード"),
      note: L("An editor can turn on Fantasy or Band for the room.", "編集者がファンタジーかバンドをオンにできます。"),
      choices: [],
    });
  }
  if (on(worldState, "fantasy")) {
    const r = fighter.weapon ? rows[fighter.weapon] : undefined;
    sections.push({
      id: "fantasy",
      title: L("Fantasy: weapon", "ファンタジー:武器"),
      note: fighter.weapon
        ? r
          ? `${L(...WEAPON_SPECS[fighter.weapon].label)} · K ${r.k} · D ${r.d} · A ${r.a} · ${L(`best ×${r.combo}`, `最高 ×${r.combo}`)}`
          : L(...WEAPON_SPECS[fighter.weapon].note)
        : L("Swing for real: your blade cuts and parries where you hold it.", "実際に振って戦います。刃の当たった所で攻撃・受け流し。"),
            choices: [null, ...WEAPONS].map((w) => ({
        id: w ?? "none",
        label: w ? L(...WEAPON_SPECS[w].label) : L("None", "なし"),
        active: fighter.weapon === w,
        onPress: () => setWeapon(w),
      })),
    });
    sections.push({
      id: "element",
      title: L("Special attack", "必殺技"),
      choices: ELEMENTS.map((e) => ({ id: e, label: L(...ELEMENT_LABELS[e]).replace(/\(.*\)$/, ""), active: fighter.element === e, onPress: () => setElement(e) })),
    });
  }
  if (on(worldState, "band")) {
    sections.push({
      id: "band",
      title: L("Band: play", "バンド:演奏"),
      note: musician.instrument ? L("Play it with your hands.", "手で演奏してください。") : undefined,
            choices: [null, ...INSTRUMENTS].map((i) => ({
        id: i ?? "none",
        label: i ? L(...INSTRUMENT_LABELS[i]) : L("Nothing", "なし"),
        active: musician.instrument === i,
        onPress: () => setInstrument(i),
      })),
    });
    if (musician.instrument === "lightstick") {
      sections.push({
        id: "stick",
        title: L("Light stick", "ペンライト"),
        columns: 4,
        choices: [
          { id: "one", label: L("One", "1本"), active: !musician.pair, onPress: () => setPair(false) },
          { id: "two", label: L("Two", "2本"), active: musician.pair, onPress: () => setPair(true) },
          ...LIGHT_COLORS.map((_, i) => ({ id: `color${i}`, label: L(...LIGHT_NAMES[i]), active: musician.color === i, onPress: () => setLightColor(i) })),
        ],
      });
    }
    if (musician.instrument === "keys") {
      const shift = (by: number) => band.set((s) => ({ ...s, octave: Math.max(-2, Math.min(2, s.octave + by)) }));
      sections.push({
        id: "keys",
        title: L("Keys", "キーボード"),
        choices: [
          { id: "down", label: L("Octave −", "オクターブ −"), active: false, onPress: () => shift(-1) },
          { id: "at", label: `C${4 + musician.octave}`, active: true, onPress: () => {} },
          { id: "up", label: L("Octave +", "オクターブ +"), active: false, onPress: () => shift(1) },
        ],
      });
    }
  }
  return sections;
}
