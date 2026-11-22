// What Chancy Joan and Dean Rob know about Seinag's imagined campus
// (futures.ts): the shaded walkway, the solar lampposts, the trees, and the
// Perma G.A.R.D.E.N., with a permaculture tour of the garden, stop by stop.
//
// About the garden, what's real comes from the Faculty of Management and
// Development Studies' own pages (fmds.upou.edu.ph, Adopt-A-Plot, 2024) and
// FLIP Science's feature on its permaculture course; what's imagined is
// said to be. Keep it that way: the guides must never pass an idea off as
// UPOU's. Programmes, fees, and contacts change, so the guides point to
// FMDS for those rather than quoting them.
import type { LiveIntent, Place, Topic } from "../../../src/guides/brain";
import { skyState } from "../../../src/sky/skyState";
import { GARDEN, gardenToWorld, shadeOffset, WALKWAY, WALKWAY_HEIGHT, WALKWAY_LENGTH } from "./futures";

const spot = (id: string, label: string, labelJa: string, [x, z]: readonly [number, number]): Place => ({ id, label, labelJa, at: [x, 0.2, z], walk: true });
const inGarden = (id: string, label: string, labelJa: string, local: readonly [number, number]) => spot(id, label, labelJa, gardenToWorld(local));

export const FUTURE_PLACES = {
  walkway: spot("walkway", "the covered walkway, at the Academic Residences' end", "屋根つき通路(アカデミック・レジデンス側)", [WALKWAY[0][0] - 2, WALKWAY[0][1] + 4]),
  backLawn: spot("backLawn", "the shade trees on the Main Building's back lawn", "本館の裏の芝生の木陰", [140, 0]),
  gate: inGarden("gardenGate", "the gate of the Perma G.A.R.D.E.N.", "パーマ G.A.R.D.E.N.の入口", [-GARDEN.w / 2 - 1.5, 0]),
  beds: inGarden("gardenBeds", "the Adopt-A-Plot beds", "アダプト・ア・プロットの区画", [-2.2, 0]),
  spiral: inGarden("gardenSpiral", "the herb spiral", "ハーブスパイラル", [-9.5, 4.6]),
  hut: inGarden("gardenHut", "the learning hut and its rain tanks", "学びの小屋と雨水タンク", [-7.5, -9.6]),
  compost: inGarden("gardenCompost", "the compost bays", "堆肥枠", [10.5, 10]),
  forest: inGarden("gardenForest", "the food forest", "食べられる森", [6.5, -4]),
  nursery: inGarden("gardenNursery", "the seedling nursery", "苗床", [2, 9.2]),
};

const IMAGINED = "It's one of Seinag's imagined additions, not UPOU's plan.";
const IMAGINED_JA = "Seinagの想像の追加で、UPOUの計画ではありません。";

export const FUTURE_TOPICS: Topic[] = [
  {
    id: "futures",
    title: "The imagined campus",
    answer:
      "Seinag shows UPOU as it is, plus a few what-ifs you can walk through: a covered walkway from the Academic Residences to the WCMPB, solar lampposts that light it after dark, more shade trees, and the FMDS Perma G.A.R.D.E.N. built out behind the Teaching and Learning Hub. None of them is UPOU's plan. The “Imagined campus” board by the solar station switches each on or off for everyone here, so you can compare.",
    asks: ["what if", "imagined campus", "what is imagined here", "futures", "what is new here", "what changed", "scenario", "what is hypothetical", "switch off the walkway", "compare with the real campus", "is this the real campus", "future campus", "sustainable campus"],
    place: { id: "futuresBoard", label: "the Imagined campus board by the solar station", labelJa: "ソーラーステーション横の「想像のキャンパス」ボード", at: [70.5, 0.2, -7.4], walk: true },
    gesture: "raisehand",
    mood: "happy",
    ja: {
      title: "想像のキャンパス",
      answer:
        "Seinagは、今のUPOUに、歩いて確かめられる「もしも」をいくつか加えています。アカデミック・レジデンスからWCMPBへの屋根つき通路、暗くなるとそこを照らすソーラー街灯、日陰の木、そしてティーチング・アンド・ラーニング・ハブの裏で広げたFMDSのパーマ G.A.R.D.E.N.。どれもUPOUの計画ではありません。ソーラーステーション横の「想像のキャンパス」ボードで、ここにいる全員に共有してオン・オフでき、見比べられます。",
      asks: ["もしも", "想像のキャンパス", "何が想像", "未来のキャンパス", "本物のキャンパスと比べる", "通路を消して"],
    },
  },
  {
    id: "walkway",
    title: "The covered walkway",
    answer: `Between the Academic Residences and the WCMPB there's no covered path today: you cross about ${Math.round(WALKWAY_LENGTH)} m of open lawn, which is hot at noon and wet in the rain. The walkway here follows that line under a steel roof, and its shade falls where the real sun casts it: right under it at noon, east of it in the afternoon. ${IMAGINED}`,
    asks: ["covered walkway", "catwalk", "covered path", "walkway", "shade from ar to wcmpb", "is there shade to the wcmpb", "how do i get from the ar to the wcmpb", "walk to wcmpb in the shade", "shelter from the rain", "path between ar and wcmpb", "roofed walk"],
    card: "walkway",
    place: FUTURE_PLACES.walkway,
    ja: {
      title: "屋根つき通路",
      answer: `アカデミック・レジデンスとWCMPBのあいだには、今は屋根のある道がなく、約${Math.round(WALKWAY_LENGTH)} mの芝生を渡ります。正午は暑く、雨の日はぬれます。ここの通路はその線に沿った鉄骨の屋根で、日陰は実際の太陽が落とす場所にできます。正午は真下、午後は東側です。${IMAGINED_JA}`,
      asks: ["屋根つき通路", "渡り廊下", "通路", "ARからWCMPBまで日陰", "WCMPBへの行き方", "雨よけ"],
    },
  },
  {
    id: "heat",
    title: "Walking in the noon heat",
    answer:
      "At midday the sun over Los Baños is nearly straight overhead, and on open lawn or pavement there's nowhere to get out of it: the sun on your body and the heat coming back off the ground both add up. Shade is what helps most, from a roof over the walk or a tree's crown. Try the walk from the Academic Residences to the WCMPB with the walkway switched on, then off, at the Imagined campus board.",
    asks: ["it is hot", "too hot", "hot at noon", "the sun is hot", "heat", "why is it so hot", "mainit", "where can i get out of the sun", "heat on campus", "urban heat"],
    place: FUTURE_PLACES.walkway,
    mood: "neutral",
    ja: {
      title: "正午の暑さの中を歩く",
      answer:
        "正午のロスバニョスでは太陽がほぼ真上にあり、開けた芝生や舗装の上では逃げ場がありません。体に当たる日差しと、地面から返ってくる熱が重なります。いちばん効くのは日陰、通路の屋根か木の樹冠です。「想像のキャンパス」ボードで通路をオンにして、またオフにして、アカデミック・レジデンスからWCMPBまで歩き比べてみてください。",
      asks: ["暑い", "正午が暑い", "日差しが強い", "暑さ", "日陰はどこ"],
    },
  },
  {
    id: "lamps",
    title: "The solar lampposts",
    answer:
      "Each lamppost along the walkway and at the garden gate is its own small solar system: the panel on top charges a battery in the post by day, and a light sensor switches the LED on at dusk and off at dawn. No cables to bury and no grid, so they stay lit in a power cut. Here they come on with the shared sky, for everyone at once. " + IMAGINED,
    asks: ["solar lamppost", "solar lampposts", "street lights", "solar street light", "lamp posts", "lights on the walkway", "are the paths lit at night", "night lighting", "ilaw"],
    card: "lamps",
    place: FUTURE_PLACES.walkway,
    ja: {
      title: "ソーラー街灯",
      answer: `通路ぞいと菜園の入口の街灯は、一本一本が小さな太陽光システムです。上のパネルが昼に柱の中の電池を充電し、光センサーが夕方にLEDを点け、明け方に消します。埋めるケーブルも系統もいらず、停電しても点いたままです。ここでは共通の空に合わせて、全員のところで同時に点きます。${IMAGINED_JA}`,
      asks: ["ソーラー街灯", "街灯", "夜の明かり", "通路の照明"],
    },
  },
  {
    id: "trees",
    title: "More shade trees",
    answer:
      "The extra trees are narra, the Philippines' national tree, and acacia or rain tree, whose umbrella-shaped crown can shade a whole path. They line the drive from the Oblation, the Main Building's back lawn, and the walkway's lawn. Trees cool a place two ways: their shade keeps the sun off you and the ground, and the water their leaves give off cools the air. Their shade here moves with the sun. " + IMAGINED,
    asks: ["more trees", "shade trees", "trees", "narra", "acacia", "rain tree", "plant trees", "greenery", "why plant trees", "puno", "lilim"],
    card: "trees",
    place: FUTURE_PLACES.backLawn,
    ja: {
      title: "日陰をつくる木を増やす",
      answer: `増やした木は、フィリピンの国の木ナラと、傘のような樹冠で道ごと日陰にするアカシア(レインツリー)です。オブレーションからの車道、本館の裏の芝生、通路わきの芝生に並びます。木陰が人と地面を日差しから守り、葉から出る水分が空気を冷やします。ここでも木陰は太陽とともに動きます。${IMAGINED_JA}`,
      asks: ["木を増やす", "日陰の木", "木", "ナラ", "アカシア", "レインツリー", "緑化"],
    },
  },
  {
    id: "garden",
    title: "The Perma G.A.R.D.E.N.",
    answer:
      "The FMDS Perma G.A.R.D.E.N. is the Faculty of Management and Development Studies' permaculture garden behind the Teaching and Learning Hub: Growing Appreciation toward Resilience, Development, Entrepreneurship, and Nutrition. In real life it grows food for staff and serves as a working model of permaculture that visitors can study, with Adopt-A-Plot beds for the UPOU community. The campus model doesn't have it yet, so Seinag builds it out: the beds are as they are, and the compost, rain tanks, herb spiral, food forest, and nursery are imagined. Ask me for a permaculture tour.",
    asks: ["perma garden", "permaculture garden", "where is the permaculture garden", "garden", "fmds garden", "where is the garden", "vegetable garden", "community garden", "food garden", "hardin", "gulayan", "show me the garden", "take me to the garden"],
    card: "garden",
    place: FUTURE_PLACES.gate,
    gesture: "point",
    ja: {
      title: "パーマ G.A.R.D.E.N.",
      answer:
        "FMDSパーマ G.A.R.D.E.N.は、経営・開発学部のパーマカルチャー菜園で、ティーチング・アンド・ラーニング・ハブの裏にあります。実際には職員のための食べ物を育て、訪れる人が学べるパーマカルチャーの実例でもあり、UPOUの人が借りられる区画があります。キャンパスのモデルにはまだないので、Seinagではそれを広げて作りました。区画は実際のとおり、堆肥、雨水タンク、ハーブスパイラル、食べられる森、苗床は想像です。パーマカルチャーの案内を頼んでみてください。",
      asks: ["パーマガーデン", "パーマカルチャー菜園", "菜園", "畑", "菜園はどこ", "菜園に連れて行って"],
    },
  },
  {
    id: "permatour",
    title: "A permaculture tour",
    answer:
      "Gladly: it's seven stops. 1, the Adopt-A-Plot beds; 2, the herb spiral; 3, the learning hut and its rain tanks; 4, the compost bays; 5, the food forest; 6, the seedling nursery; and 7, how to learn permaculture at UPOU. I'll take you to the gate. Then ask me about the first stop, the beds, and I'll walk you on from each one to the next.",
    asks: ["permaculture tour", "garden tour", "tour of the garden", "guide me through it", "start the tour", "take the permaculture tour"],
    place: FUTURE_PLACES.gate,
    gesture: "raisehand",
    mood: "happy",
    ja: {
      title: "パーマカルチャーの案内",
      answer:
        "よろこんで。七か所です。1 区画、2 ハーブスパイラル、3 学びの小屋と雨水タンク、4 堆肥枠、5 食べられる森、6 苗床、7 UPOUでパーマカルチャーを学ぶには。入口までお連れします。そのあと最初の「区画」について聞いてください。一か所ずつ次へご案内します。",
      asks: ["パーマカルチャーの案内", "菜園の案内", "菜園を案内して"],
    },
  },
  {
    id: "adopt",
    title: "Stop 1: the Adopt-A-Plot beds",
    answer:
      "These raised beds are real. FMDS's Adopt-A-Plot lends 2 m × 2 m plots to UPOU staff, students, alumni, and partners. It's organic only (no synthetic pesticides, herbicides, or GMOs), and each gardener keeps their own plot weeded and labelled with their name. The university supplies the water. Harvests can go home or be sold through a partner store. For how to join now, ask FMDS: the terms change. Next stop: the herb spiral.",
    asks: ["adopt a plot", "rent a plot", "can i have a plot", "how do i get a plot", "raised beds", "the beds", "first stop", "stop 1", "who can garden here", "plots"],
    place: FUTURE_PLACES.beds,
    ja: {
      title: "1 アダプト・ア・プロットの区画",
      answer:
        "この高床の区画は実在します。FMDSのアダプト・ア・プロットは、2 m × 2 mの区画をUPOUの職員、学生、卒業生、協力者に貸し出しています。有機栽培のみ(化学合成の農薬・除草剤、遺伝子組み換えは禁止)で、各自が自分の区画の草取りをし、名前の札を立てます。水は大学が用意します。収穫は持ち帰るか、協力店で売れます。今の参加方法はFMDSに確かめてください。条件は変わります。次は、ハーブスパイラルです。",
      asks: ["アダプト・ア・プロット", "区画", "区画を借りる", "最初の場所"],
    },
  },
  {
    id: "spiral",
    title: "Stop 2: the herb spiral",
    answer:
      "An herb spiral is a coil of stones that climbs as it turns, so one small mound has many spots: dry and sunny at the top for herbs like oregano and rosemary, damper and shadier at the bottom for basil, mint, or tanglad. It packs a lot into little space and sits near the gate, where you'd pick herbs most often. That's permaculture's zone idea: what you use most goes closest. " + IMAGINED + " Next stop: the learning hut and its rain tanks.",
    asks: ["herb spiral", "spiral", "herbs", "stop 2", "second stop", "what are the stones"],
    place: FUTURE_PLACES.spiral,
    ja: {
      title: "2 ハーブスパイラル",
      answer: `ハーブスパイラルは、回りながら高くなる石のらせんです。小さな山ひとつに、いろいろな場所ができます。上は乾いて日当たりがよく、オレガノやローズマリーに。下はしっとりして日陰になり、バジルやミント、タングラッドに。狭い場所にたくさん育てられ、いちばん摘みに行く入口の近くに置きます。よく使うものほど近くに、というパーマカルチャーの「ゾーン」の考え方です。${IMAGINED_JA}次は、学びの小屋と雨水タンクです。`,
      asks: ["ハーブスパイラル", "らせん", "ハーブ", "2番目"],
    },
  },
  {
    id: "rainwater",
    title: "Stop 3: the learning hut and the rain tanks",
    answer:
      "The kubo is a shaded place to meet, for orientations and workshops. Its roof does a second job: the gutter catches rain and runs it into a tank and two drums, so the garden can water from its own rain in the dry months. Catching water where it falls, before it runs off, is a permaculture habit. Today, the real garden's water comes from the university. " + IMAGINED + " Next stop: the compost bays.",
    asks: ["learning hut", "kubo", "hut", "rain tanks", "rainwater", "rainwater harvesting", "water tank", "where does the water come from", "stop 3", "third stop", "tubig"],
    place: FUTURE_PLACES.hut,
    ja: {
      title: "3 学びの小屋と雨水タンク",
      answer: `クボ(小屋)は、オリエンテーションやワークショップのための日陰の集まり場です。屋根にはもうひとつ役目があり、雨どいが雨を集めてタンクと二つのドラム缶に送るので、乾季も自分の雨で水やりができます。落ちた場所で、流れ去る前に水をとらえるのは、パーマカルチャーの習慣です。今の実際の菜園の水は大学が用意しています。${IMAGINED_JA}次は、堆肥枠です。`,
      asks: ["学びの小屋", "クボ", "雨水", "雨水タンク", "水はどこから", "3番目"],
    },
  },
  {
    id: "compost",
    title: "Stop 4: the compost bays",
    answer:
      "Three bays, in turn: one filling with kitchen scraps, weeds, and dry leaves, one turning and heating up, one ready to go back on the beds. Compost closes a loop. What the garden and the campus throw away feeds the soil, and the soil feeds the next crop. In real life the gardeners take their own waste home, so this is one of the imagined parts. Next stop: the food forest.",
    asks: ["compost", "compost bays", "composting", "what happens to the waste", "zero waste", "soil", "stop 4", "fourth stop"],
    place: FUTURE_PLACES.compost,
    ja: {
      title: "4 堆肥枠",
      answer:
        "三つの枠を順番に使います。台所くず、草、枯れ葉をためる枠、切り返して熱をもつ枠、区画に戻せるようになった枠。堆肥は輪を閉じます。菜園やキャンパスが捨てるものが土を育て、土が次の作物を育てます。実際の菜園では各自がごみを持ち帰るので、ここは想像の部分です。次は、食べられる森です。",
      asks: ["堆肥", "堆肥枠", "コンポスト", "ごみはどうなる", "4番目"],
    },
  },
  {
    id: "foodforest",
    title: "Stop 5: the food forest",
    answer:
      "A food forest stacks plants the way a forest does: a mango tree over bananas and papayas, then malunggay, then calamansi bushes, with sweet potato covering the ground. Each layer uses light the one above lets through, the ground cover keeps the soil from drying out, and something is always ready to pick. Planted together like this to help each other, plants make a guild. " + IMAGINED + " Next stop: the seedling nursery.",
    asks: ["food forest", "forest garden", "guild", "layers", "bananas", "papaya", "malunggay", "moringa", "calamansi", "mango", "stop 5", "fifth stop"],
    place: FUTURE_PLACES.forest,
    ja: {
      title: "5 食べられる森",
      answer: `食べられる森は、森のように植物を重ねます。マンゴーの下にバナナとパパイヤ、その下にマルンガイ、カラマンシーの低木、地面をサツマイモがおおいます。どの層も上から漏れる光を使い、地面のおおいが土の乾燥を防ぎ、いつも何かが収穫できます。助け合うように一緒に植えた組み合わせを「ギルド」と呼びます。${IMAGINED_JA}次は、苗床です。`,
      asks: ["食べられる森", "フォレストガーデン", "ギルド", "バナナ", "パパイヤ", "マルンガイ", "5番目"],
    },
  },
  {
    id: "nursery",
    title: "Stop 6: the seedling nursery",
    answer:
      "Seedlings start here under shade net, out of the hottest sun and the hardest rain, until they're strong enough for the beds. A nursery lets the garden grow its own plants from saved seed instead of buying them. Gardeners in the real Adopt-A-Plot bring their own seeds or seedlings. " + IMAGINED + " Last stop: how to learn permaculture at UPOU.",
    asks: ["nursery", "seedlings", "shade net", "seeds", "where do the plants come from", "stop 6", "sixth stop"],
    place: FUTURE_PLACES.nursery,
    ja: {
      title: "6 苗床",
      answer: `苗はここで、遮光ネットの下、強い日差しや激しい雨をさけて育ち、区画に移せるほど丈夫になるまで待ちます。苗床があれば、苗を買わずに、とっておいた種から菜園自身で育てられます。実際のアダプト・ア・プロットでは、種や苗は各自が用意します。${IMAGINED_JA}最後は、UPOUでパーマカルチャーを学ぶには、です。`,
      asks: ["苗床", "苗", "遮光ネット", "種", "6番目"],
    },
  },
  {
    id: "permaculture",
    title: "What permaculture is",
    answer:
      "Permaculture is a way of designing gardens, farms, and places to live so they work like ecosystems: plants, water, soil, and people placed so each meets the others' needs, with little waste and little outside input. It grew from Bill Mollison and David Holmgren's work in Australia in the 1970s, and rests on three ethics: care for the earth, care for people, and fair share. The garden here shows it in practice.",
    asks: ["what is permaculture", "permaculture", "permaculture principles", "permaculture ethics", "what does permaculture mean", "sustainable gardening"],
    place: FUTURE_PLACES.gate,
    ja: {
      title: "パーマカルチャーとは",
      answer:
        "パーマカルチャーは、菜園や農場や暮らしの場を、生態系のように働くよう設計する方法です。植物、水、土、人を、それぞれが互いの必要を満たすように配置し、むだと外からの持ち込みを少なくします。1970年代のオーストラリアで、ビル・モリソンとデビッド・ホルムグレンの仕事から生まれ、「地球への配慮」「人への配慮」「公正な分配」の三つの倫理に立っています。ここの菜園は、その実践例です。",
      asks: ["パーマカルチャーとは", "パーマカルチャー", "パーマカルチャーの原則"],
    },
  },
  {
    id: "permacourse",
    title: "Stop 7: learning permaculture at UPOU",
    answer:
      "FMDS offers Permaculture Systems Design Thinking, a 16-week online course in its Continuing Education Program; all it asks is a device, an internet connection, and a high school diploma. FLIP Science reported it as the first standalone permaculture course offered by a university. In the real garden, QR codes on the plants tell you about them. For the next run of the course, see FMDS's site. That's the end of the tour: thanks for walking it with me!",
    asks: ["permaculture course", "learn permaculture", "study permaculture", "psdt", "permaculture systems design thinking", "permaculture class", "stop 7", "last stop", "seventh stop", "how can i learn this"],
    place: FUTURE_PLACES.gate,
    mood: "happy",
    ja: {
      title: "7 UPOUでパーマカルチャーを学ぶ",
      answer:
        "FMDSは、継続教育プログラムで16週のオンライン講座「パーマカルチャー・システム・デザイン思考」を開いています。必要なのは端末とインターネットと高校卒業だけです。FLIP Scienceは、大学が開く初めての単独のパーマカルチャー講座だと伝えています。実際の菜園では、植物のQRコードから説明が読めます。次の開講はFMDSのサイトで。案内はここまでです。一緒に歩いてくださってありがとう!",
      asks: ["パーマカルチャー講座", "パーマカルチャーを学ぶ", "最後の場所", "7番目"],
    },
  },
];

export const FUTURE_CARD_TITLES: Record<string, [string, string]> = {
  walkway: ["The covered walkway", "屋根つき通路"],
  lamps: ["Solar lampposts", "ソーラー街灯"],
  trees: ["More shade trees", "日陰の木"],
  garden: ["The Perma G.A.R.D.E.N.", "パーマ G.A.R.D.E.N."],
};

/** Where the walkway's shade is now, in words. */
function shadeSentence(ja: boolean): string {
  const sun = skyState.sunDirection;
  if (sun.y <= 0 || skyState.night > 0.5) return ja ? "今は夜なので日陰はありません。かわりに、ソーラー街灯が通路を照らしています。" : "It's night, so there's no shade to find: the solar lampposts are lighting the walkway instead.";
  const s = shadeOffset(sun, WALKWAY_HEIGHT, skyState.cloud);
  const elevation = Math.round((Math.asin(Math.min(1, sun.y)) * 180) / Math.PI);
  if (s.strength < 0.05) return ja ? `太陽は${elevation}°と低く、日陰はほとんどできていません。` : `The sun is only ${elevation}° up, so there's barely any shade right now.`;
  const off = Math.hypot(s.x, s.z);
  if (off < 0.6) return ja ? `太陽は${elevation}°の高さで、通路の日陰は屋根の真下です。いちばん暑い時間で、屋根がいちばん役に立つ時間です。` : `The sun is ${elevation}° up, so the walkway's shade is right under its roof: the hottest part of the day, and when the roof helps most.`;
  const east = s.x > 0;
  return ja
    ? `太陽は${elevation}°の高さで、通路の日陰は屋根から${off.toFixed(1)} m${east ? "東" : "西"}寄りにずれています。${east ? "午後" : "午前"}は、通路の${east ? "東" : "西"}側を歩くと涼しいです。`
    : `The sun is ${elevation}° up, so the walkway's shade falls about ${off.toFixed(1)} m ${east ? "east" : "west"} of its roof. Walk on the ${east ? "east" : "west"} side of it to stay in the shade this ${east ? "afternoon" : "morning"}.`;
}

const lampsOn = () => skyState.night > 0.2;

export function futureLiveIntents(): LiveIntent[] {
  return [
    {
      test: /\b(shade|shadow|shaded)\b.*\bnow\b|\bnow\b.*\b(shade|shadow|shaded)\b|\bwhere('?s| is) the shade\b/,
      testJa: /(日陰|影).*(今|いま)|(今|いま).*(日陰|影)|日陰はどこ/,
      card: "walkway",
      answer: () => shadeSentence(false),
      answerJa: () => shadeSentence(true),
    },
    {
      test: /\b(lamps?|lampposts?|street ?lights?)\b.*\b(on|lit|now)\b|\bare the lights on\b/,
      testJa: /(街灯|ライト).*(点|今|いま)/,
      card: "lamps",
      answer: () => (lampsOn() ? "Yes: it's dark, so the solar lampposts have switched themselves on along the walkway and at the garden gate." : "Not now: it's daylight, so the lampposts are off, charging from their panels. They'll come on by themselves at dusk."),
      answerJa: () => (lampsOn() ? "はい。暗くなったので、通路と菜園の入口のソーラー街灯が自動で点いています。" : "今は点いていません。昼なので消えていて、パネルで充電中です。夕方になると自動で点きます。"),
    },
  ];
}

export const FUTURE_SYNONYMS: Record<string, string> = {
  catwalk: "walkway",
  mainit: "hot",
  init: "heat",
  lilim: "shade",
  silong: "shade",
  puno: "trees",
  halaman: "plants",
  hardin: "garden",
  gulayan: "garden",
  ilaw: "lamps",
  poste: "lamppost",
  tubig: "water",
  ulan: "rain",
  binhi: "seeds",
  punla: "seedlings",
};
