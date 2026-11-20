import { addonModeKey, type AddonMode, type PlayerState, type WorldStateValue } from "../multiplayer/types";
import { L, useLang } from "../i18n/lang";
import { BandLayer } from "./band/BandLayer";
import { BandButton, BandStage } from "./band/BandHud";
import { FantasyLayer } from "./fantasy/FantasyLayer";
import { FantasyButton, FantasyStatus } from "./fantasy/FantasyHud";
import { fantasy } from "./fantasy/combat";
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
}) {
  return (
    <>
      {on(worldState, "fantasy") && <FantasyLayer {...props} />}
      {on(worldState, "band") && <BandLayer selfId={props.selfId} players={props.players} />}
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
        description={L("Everyone gets a Band button: drum pad, keys, guitar, and light sticks, heard by the whole room.", "全員にバンドボタンが出ます:ドラムパッド、キーボード、ギター、ペンライト。部屋の全員に聞こえます。")}
        on={on(worldState, "band")}
        accent={MODE_ACCENTS.band}
        disabled={disabled}
        onChange={(value) => setWorldState(addonModeKey("band"), value)}
      />
    </div>
  );
}

/** Whether a click on the floor is an attack rather than a walk. */
export const fantasyArmed = () => fantasy.get().weapon !== null;
