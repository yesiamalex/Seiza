// Seinag's cards, opened from the dashboard or a guide's answer: how the
// campus solar works, and what the campus uses. They share the world's one
// overlay slot with the guides' chat (Hud.tsx), so they go through this
// small store.
import { useSyncExternalStore } from "react";
import { L, useLang } from "../../../src/i18n/lang";
import { panelStyle, pillButtonStyle } from "../../../src/ui/styles";
import solar from "../world/solar.json";
import { CAMPUS, ROOFTOP_MWP } from "./plant";

export type CardKey = "solar" | "load" | "battery";

let open: CardKey | null = null;
const listeners = new Set<() => void>();

export function openCard(key: CardKey | null) {
  open = key;
  for (const l of listeners) l();
}

function useOpenCard() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open
  );
}

const modules = Object.values(solar.arrays).reduce((n, a) => n + a.modules.length, 0);

function body(key: CardKey): { title: string; paragraphs: string[] } {
  const kwp = Math.round(ROOFTOP_MWP * 1000);
  if (key === "battery")
    return {
      title: L("The station's battery", "ステーションの蓄電池"),
      paragraphs: [
        L(
          `A ${Math.round(CAMPUS.batteryMwh * 1000)} kWh lithium-ion battery that can charge or discharge at up to ${Math.round(CAMPUS.batteryMw * 1000)} kW. On Auto it stores what the roofs make beyond the campus's use, and gives it back when the sun goes, covering the part of the evening's demand above the day's usual level.`,
          `容量${Math.round(CAMPUS.batteryMwh * 1000)} kWh、最大${Math.round(CAMPUS.batteryMw * 1000)} kWで充放電できるリチウムイオン電池です。「自動」では、キャンパスの使用量を超えて屋根が発電した分をため、日が沈むと、夕方の需要のうちふだんを上回る分をまかないます。`
        ),
        L(
          "About 15% is lost on the round trip, and it's kept between 10% and 95% full to protect it, as Seizora's is. The strip on the cabinet shows its charge; the console in the station switches it, its mode, and the grid tie, for everyone here.",
          "ためて取り出すまでに約15%が失われ、Seizoraと同じく電池を守るため充電率は10〜95%に保たれます。キャビネットの帯が充電率を示します。ステーションの操作盤で、蓄電池、そのモード、系統連系を、ここにいる全員に共有して切り替えられます。"
        ),
      ],
    };
  if (key === "load")
    return {
      title: L("What the campus uses", "キャンパスの使用量"),
      paragraphs: [
        L(
          "The campus's demand is an assumed weekday, not metered data: lights, servers, and security through the night; offices and classrooms from 7 to 6; and aircon that rises with the heat.",
          "キャンパスの需要は仮定した平日のもので、計測値ではありません。夜は照明、サーバー、警備。7時から18時は事務室と教室。暑くなるほどエアコンが増えます。"
        ),
        L(
          `It peaks at about ${Math.round(CAMPUS.peakLoadMw * 1000)} kW on a hot, clear afternoon. Because a campus uses most of its power by day, most of what the roofs make is used at once.`,
          `暑く晴れた午後に約${Math.round(CAMPUS.peakLoadMw * 1000)} kWでピークになります。キャンパスは電気の大部分を日中に使うので、屋根で作った電気のほとんどがすぐに使われます。`
        ),
      ],
    };
  return {
    title: L("Campus solar, hypothetically", "キャンパスの太陽光(仮想)"),
    paragraphs: [
      L(
        `${modules} panels of about 400 W each sit on the flat roofs of the Main Building, the Teaching and Learning Hub, the CCDL, and the top of the World-Class Multimedia Production Building: about ${kwp} kW at their peak, tilted 15° to the south. A script placed them wherever a whole panel fits on open roof in the campus model.`,
        `約400 Wのパネル${modules}枚が、本館、ティーチング・アンド・ラーニング・ハブ、CCDL、ワールドクラス・マルチメディア制作棟最上部の平らな屋根にあり、合計で最大約${kwp} kW、南へ15°傾いています。キャンパスのモデルで、パネルが1枚まるごと開けた屋根に収まる場所に、スクリプトで配置しました。`
      ),
      L(
        "They run on the sky you see, with Seizora's plant model: the sun's position over Los Baños, clouds from the shared weather, panels losing about 0.35% per degree above 25 °C, and about 17% lost to wiring, dust, and the inverter.",
        "パネルは、見えている空に合わせて、Seizoraの発電所モデルで動いています。ロスバニョス上空の太陽の位置、共通の天気による雲、25 °Cを超えると1度ごとに約0.35%下がる出力、配線・ほこり・インバーターによる約17%の損失です。"
      ),
      L(
        `A ${Math.round(CAMPUS.batteryMwh * 1000)} kWh battery stores the midday surplus for the evening. Whatever the sun and battery can't cover comes from the grid; every kWh the roofs make avoids about 0.71 kg of CO₂, the Luzon–Visayas grid's emission factor.`,
        `${Math.round(CAMPUS.batteryMwh * 1000)} kWhの蓄電池が、昼の余りを夕方のためにためます。太陽と蓄電池でまかなえない分は系統から来ます。屋根で1 kWh発電するごとに、ルソン・ビサヤ系統の排出係数で約0.71 kgのCO₂が減ります。`
      ),
      L(
        "None of this is UPOU's plan or its real figures. It shows what the roofs could do; a real project would start with a site study of the roofs, their shade, and their structure.",
        "これはUPOUの計画でも実際の数字でもありません。屋根に何ができるかを示すものです。実際の計画は、屋根、日陰、構造の現地調査から始まります。"
      ),
    ],
  };
}

/** The open card, if any (mounted by Hud.tsx). */
export function CardHost() {
  useLang();
  const key = useOpenCard();
  if (!key) return null;
  const { title, paragraphs } = body(key);
  const close = () => openCard(null);
  return (
    <div role="dialog" aria-label={title} onClick={close} style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", padding: 16, pointerEvents: "auto", zIndex: 40 }}>
      <div onClick={(event) => event.stopPropagation()} style={{ ...panelStyle, width: "min(460px, 100%)", maxHeight: "min(640px, 90vh)", overflowY: "auto", padding: 16, fontSize: 14, lineHeight: 1.5 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
          <strong style={{ fontSize: 16 }}>{title}</strong>
          <button style={pillButtonStyle} onClick={close} aria-label={L("Close", "閉じる")}>
            {L("Close", "閉じる")}
          </button>
        </div>
        {paragraphs.map((p) => (
          <p key={p.slice(0, 24)} style={{ margin: "0 0 8px" }}>
            {p}
          </p>
        ))}
        {key === "solar" && (
          <button style={pillButtonStyle} onClick={() => openCard("load")}>
            {L("What the campus uses →", "キャンパスの使用量 →")}
          </button>
        )}
      </div>
    </div>
  );
}
