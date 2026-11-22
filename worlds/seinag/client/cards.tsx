// Seinag's cards, opened from the dashboard or a guide's answer: how the
// campus solar works, and what the campus uses. They share the world's one
// overlay slot with the guides' chat (Hud.tsx), so they go through this
// small store.
import { useSyncExternalStore } from "react";
import { L, useLang } from "../../../src/i18n/lang";
import { panelStyle, pillButtonStyle } from "../../../src/ui/styles";
import solar from "../world/solar.json";
import { CAMPUS, ROOFTOP_MWP } from "./plant";
import { WALKWAY_HEIGHT, WALKWAY_LENGTH, WALKWAY_WIDTH } from "./futures";

export type CardKey = "solar" | "load" | "battery" | "walkway" | "lamps" | "trees" | "garden";

const FUTURE_NOTE = () =>
  L(
    "This is one of Seinag's imagined additions, not UPOU's plan. The “Imagined campus” board by the solar station switches it on or off for everyone here, to compare with the campus as it is.",
    "これはSeinagの想像の追加で、UPOUの計画ではありません。ソーラーステーション横の「想像のキャンパス」ボードで、ここにいる全員に共有してオン・オフでき、今のキャンパスと見比べられます。"
  );

/** A card's title, for the guides' "Tell me about…" suggestions. */
export function cardTitle(key: string): string {
  return body(key as CardKey).title;
}

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
  if (key === "walkway")
    return {
      title: L("A covered walkway, AR to WCMPB", "屋根つき通路(AR〜WCMPB)"),
      paragraphs: [
        L(
          `Between the Academic Residences and the World-Class Multimedia Production Building there is no covered path today: people cross about ${Math.round(WALKWAY_LENGTH)} m of open lawn, and at noon the sun is nearly overhead. This walkway follows that line, ${WALKWAY_WIDTH} m wide under a steel roof ${WALKWAY_HEIGHT} m up.`,
          `アカデミック・レジデンスとワールドクラス・マルチメディア制作棟のあいだには、今は屋根のある道がありません。約${Math.round(WALKWAY_LENGTH)} mの芝生を日なたで渡り、正午には太陽がほぼ真上にあります。この通路はその線に沿い、幅${WALKWAY_WIDTH} m、高さ${WALKWAY_HEIGHT} mの鉄骨の屋根の下を通ります。`
        ),
        L(
          "Its shade on the ground is where the real sun casts it at this hour: under the roof at noon, slipping east of the walk in the afternoon and west in the morning, and thin under cloud. That is the point of a covered walk in the tropics: shade and shelter from rain on the routes people take every day.",
          "地面の日陰は、今の時刻に実際の太陽が落とす場所にあります。正午は屋根の真下、午後は通路の東へ、朝は西へずれ、曇ると薄くなります。熱帯の屋根つき通路の意味はそこにあります。毎日通る道に、日陰と雨よけを。"
        ),
        FUTURE_NOTE(),
      ],
    };
  if (key === "lamps")
    return {
      title: L("Solar lampposts", "ソーラー街灯"),
      paragraphs: [
        L(
          "Each lamppost is its own small solar system: the panel on top charges a battery in the post by day, and a light sensor switches the LED on at dusk and off at dawn. No trenches for cables, no grid connection, and the lights stay on in a power cut.",
          "街灯の一本一本が小さな太陽光システムです。上のパネルが昼に柱の中の電池を充電し、光センサーが夕方にLEDを点け、明け方に消します。ケーブルを埋める溝も系統への接続もいらず、停電しても点いたままです。"
        ),
        L(
          "Here they follow the shared sky: they come on as the sky darkens, for everyone at once, and light the walkway and the garden's gate with real light in the scene.",
          "ここでは共通の空に合わせて動きます。空が暗くなると全員のところで同時に点き、通路と菜園の入口を、シーンの本物の光で照らします。"
        ),
        FUTURE_NOTE(),
      ],
    };
  if (key === "trees")
    return {
      title: L("More shade trees", "日陰をつくる木を増やす"),
      paragraphs: [
        L(
          "Narra (Pterocarpus indicus), the Philippines' national tree, and acacia or rain tree (Samanea saman), common on UP campuses, whose umbrella-shaped crown can shade a whole path. They line the drive from the Oblation, the Main Building's back lawn, and the walkway's lawn.",
          "フィリピンの国の木ナラ(Pterocarpus indicus)と、UPのキャンパスでよく見るアカシア、別名レインツリー(Samanea saman)。傘のような樹冠で道ごと日陰にします。オブレーションからの車道、本館の裏の芝生、通路わきの芝生に植えています。"
        ),
        L(
          "Trees cool a campus two ways: their shade keeps the sun off the ground and off people, and the water their leaves give off cools the air around them. Their shade here moves with the sun, as it would.",
          "木は二つの方法でキャンパスを涼しくします。木陰が地面と人を日差しから守り、葉から出る水分がまわりの空気を冷やします。ここでも木陰は太陽とともに動きます。"
        ),
        FUTURE_NOTE(),
      ],
    };
  if (key === "garden")
    return {
      title: L("FMDS Perma G.A.R.D.E.N.", "FMDS パーマ G.A.R.D.E.N."),
      paragraphs: [
        L(
          "The Faculty of Management and Development Studies' permaculture garden, behind the Teaching and Learning Hub: Growing Appreciation toward Resilience, Development, Entrepreneurship, and Nutrition. It is a working model of permaculture design that visitors can study, and its Adopt-A-Plot programme followed the approval of UPOU's Sustainability in Action, a Living Laboratory Campus (SiALLC).",
          "経営・開発学部(FMDS)のパーマカルチャー菜園で、ティーチング・アンド・ラーニング・ハブの裏にあります。名前は「レジリエンス・開発・起業・栄養への理解を育てる」の頭文字。訪れる人が学べるパーマカルチャー設計の実例で、区画貸し出し(アダプト・ア・プロット)は、UPOUの「サステナビリティ・イン・アクション:生きた実験室キャンパス(SiALLC)」の承認を受けて始まりました。"
        ),
        L(
          "What's real: its Adopt-A-Plot programme lends 2 m × 2 m raised beds to UPOU staff, students, alumni, and partners, organic only (no synthetic pesticides, herbicides, or GMOs), with water from the university and a caretaker. Produce can go home, or to a partner store.",
          "実在するもの:アダプト・ア・プロットで、2 m × 2 mの高床の区画をUPOUの職員、学生、卒業生、協力者に貸し出しています。有機栽培のみ(化学合成の農薬・除草剤、遺伝子組み換えは禁止)で、水は大学が用意し、管理人がいます。収穫は持ち帰るか、協力店に出せます。"
        ),
        L(
          "What's imagined: the garden built out the way a permaculture design might grow it. Three compost bays, rainwater tanks fed by the learning hut's gutter, an herb spiral, a food forest of mango, banana, papaya, malunggay, and calamansi, a seedling nursery under shade net, and flowers for pollinators. The campus model doesn't include the real garden yet; this one stands in for it.",
          "想像のもの:パーマカルチャーの設計で広げていった姿。三つの堆肥枠、学びの小屋の雨どいから集める雨水タンク、ハーブスパイラル、マンゴー・バナナ・パパイヤ・マルンガイ・カラマンシーの「食べられる森」、遮光ネットの下の苗床、受粉を助ける花。キャンパスのモデルにはまだ実際の菜園がなく、これがその代わりです。"
        ),
        FUTURE_NOTE(),
      ],
    };
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
