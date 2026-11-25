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
import { ExerLayer } from "./exer/ExerLayer";
import { ExerButton, ExerStatus } from "./exer/ExerHud";
import { ride, ridingNow, ringBell, setVehicle } from "./exer/ride";
import { VEHICLE_LABELS, VEHICLE_SPECS, VEHICLES } from "./exer/vehicles";
import { PetLayer } from "./pet/PetLayer";
import { PetButton } from "./pet/PetHud";
import { PET_LABELS, PETS, pet, setPet } from "./pet/pets";

export { ridingNow };

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

// One thing in your hands at a time: a weapon, an instrument, or a ride's
// handlebars. Taking up one puts the others away, so nobody fights with a
// guitar on, strums with a sword drawn, or rides with either.
{
  let weapon = fantasy.get().weapon;
  let instrument = band.get().instrument;
  let vehicle = ride.get().vehicle;
  fantasy.subscribe(() => {
    const next = fantasy.get().weapon;
    if (next && next !== weapon) {
      if (band.get().instrument) setInstrument(null);
      if (ride.get().vehicle) setVehicle(null);
    }
    weapon = next;
  });
  band.subscribe(() => {
    const next = band.get().instrument;
    if (next && next !== instrument) {
      if (fantasy.get().weapon) setWeapon(null);
      if (ride.get().vehicle) setVehicle(null);
    }
    instrument = next;
  });
  ride.subscribe(() => {
    const next = ride.get().vehicle;
    if (next && next !== vehicle) {
      if (fantasy.get().weapon) setWeapon(null);
      if (band.get().instrument) setInstrument(null);
    }
    vehicle = next;
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
      {on(worldState, "exer") && <ExerLayer selfId={props.selfId} players={props.players} getSelfPosition={props.getSelfPosition} selfSeated={props.selfSeated} />}
      {on(worldState, "pet") && <PetLayer selfId={props.selfId} players={props.players} selfSeated={props.selfSeated} />}
    </>
  );
}

/** In the control bar: one coloured button per mode that's on. */
export function AddonBarButtons({ worldState, selfId = null }: { worldState: WorldState; selfId?: string | null }) {
  const fantasyOn = on(worldState, "fantasy");
  const bandOn = on(worldState, "band");
  const exerOn = on(worldState, "exer");
  const petOn = on(worldState, "pet");
  if (!fantasyOn && !bandOn && !exerOn && !petOn) return null;
  return (
    <>
      <div className="seiza-bar-divider" aria-hidden />
      {fantasyOn && <FantasyButton />}
      {bandOn && <BandButton />}
      {exerOn && <ExerButton />}
      {petOn && <PetButton selfId={selfId} />}
    </>
  );
}

/** Over the world: health and meter, the attack button, the instrument. */
export function AddonOverlay({ worldState, touch }: { worldState: WorldState; touch: boolean }) {
  return (
    <>
      {on(worldState, "fantasy") && <FantasyStatus touch={touch} />}
      {on(worldState, "band") && <BandStage />}
      {on(worldState, "exer") && <ExerStatus touch={touch} />}
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
      <ModeSwitch
        label={L("ExerSeiza", "ExerSeiza")}
        description={L("Everyone gets a Ride button: a bike with a basket and a bell, a skateboard, or a moped, on a screen or in VR. Slopes slow you down.", "全員に「乗る」ボタンが出ます:かごとベルつきの自転車、スケボー、原付。画面でもVRでも。坂では遅くなります。")}
        on={on(worldState, "exer")}
        accent={MODE_ACCENTS.exer}
        disabled={disabled}
        onChange={(value) => setWorldState(addonModeKey("exer"), value)}
      />
      <ModeSwitch
        label={L("Pets", "ペット")}
        description={L("Everyone gets a Pet button: a dog, a cat, or a capybara that follows them, sits, swims, and can be patted.", "全員にペットボタンが出ます:ついてきて、座り、泳ぎ、なでられる犬・猫・カピバラ。")}
        on={on(worldState, "pet")}
        accent={MODE_ACCENTS.pet}
        disabled={disabled}
        onChange={(value) => setWorldState(addonModeKey("pet"), value)}
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

/** On a ride: how many times walking pace the thumbstick goes (PlayerRig). */
export function useAddonRideScale(worldState: WorldState) {
  const { vehicle } = useStore(ride);
  return on(worldState, "exer") && vehicle ? VEHICLE_SPECS[vehicle].speed : 1;
}

/** A weapon drawn or an instrument out: the hands are full (edit/Grab.tsx). */
export const addonHandsBusy = () => fantasy.get().weapon !== null || band.get().instrument !== null || ride.get().vehicle !== null;

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
  const exerOn = on(worldState, "exer");
  const petOn = on(worldState, "pet");
  const rider = useStore(ride);
  const owner = useStore(pet);
  if (switches?.allowed) {
    const toggle = (mode: AddonMode, now: boolean) => () => switches.setWorldState(addonModeKey(mode), !now);
    sections.push({
      id: "modes",
      tab: "play",
      title: L("Room modes", "ルームモード"),
      note: L("For everyone in the room.", "部屋の全員に。"),
      columns: 2,
      choices: [
        { id: "fantasy", label: L("Fantasy", "ファンタジー"), active: fantasyOn, onPress: toggle("fantasy", fantasyOn) },
        { id: "band", label: L("Band", "バンド"), active: bandOn, onPress: toggle("band", bandOn) },
        { id: "exer", label: "ExerSeiza", active: exerOn, onPress: toggle("exer", exerOn) },
        { id: "pet", label: L("Pets", "ペット"), active: petOn, onPress: toggle("pet", petOn) },
      ],
    });
  } else if (!fantasyOn && !bandOn && !exerOn && !petOn) {
    sections.push({
      id: "modes",
      tab: "play",
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
  if (exerOn) {
    const bell = rider.vehicle ? VEHICLE_SPECS[rider.vehicle].bell : null;
    sections.push({
      id: "exer",
      title: L("ExerSeiza: ride", "ExerSeiza:乗る"),
      note: rider.vehicle
        ? L(`Right trigger: ride. Left trigger: brake. A: ${bell === "horn" ? "horn" : "bell"}. B: get off. ${(rider.speed * 3.6).toFixed(0)} km/h, ${Math.round(rider.distance)} m.`, `右トリガー:進む。左トリガー:ブレーキ。A:${bell === "horn" ? "クラクション" : "ベル"}。B:降りる。${(rider.speed * 3.6).toFixed(0)} km/h、${Math.round(rider.distance)} m。`)
        : L("Get on a ride.", "乗りものを選んでください。"),
      columns: 4,
      choices: [
        { id: "none", label: L("On foot", "徒歩"), active: rider.vehicle === null, onPress: () => setVehicle(null) },
        ...VEHICLES.map((v) => ({ id: v, label: L(...VEHICLE_LABELS[v]), active: rider.vehicle === v, onPress: () => setVehicle(v) })),
        ...(bell ? [{ id: "bell", label: bell === "horn" ? L("Horn", "クラクション") : L("Bell", "ベル"), active: false, onPress: ringBell }] : []),
      ],
    });
  }
  if (petOn)
    sections.push({
      id: "pet",
      title: L("Pets", "ペット"),
      note: L("Put a hand on a pet's head to pat it.", "手をペットの頭に置くとなでられます。"),
      columns: 4,
      choices: [
        { id: "none", label: L("None", "なし"), active: owner.kind === null, onPress: () => setPet(null) },
        ...PETS.map((p) => ({ id: p, label: L(...PET_LABELS[p]), active: owner.kind === p, onPress: () => setPet(p) })),
      ],
    });
  // All on the Play page of the headset menu.
  return sections.map((s) => ({ tab: "play", ...s }));
}
