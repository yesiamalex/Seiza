// The words on Seisugbo's boards, and on the cards they open. Edit freely:
// the boards redraw from this file. The Japanese is at the end.
import { getLang, L } from "../../../src/i18n/lang";

export interface BoardText {
  title: string;
  /** A second line under the title. */
  subtitle?: string;
  paragraphs: string[];
  /** Numbered or bulleted lines, after the paragraphs. */
  list?: { heading?: string; items: string[]; numbered?: boolean }[];
}

export type BoardKey = "welcome" | "lane" | "court" | "process" | "talk" | "posters";

export const TITLE = "Seisugbo";
export const SUBTITLE = "Meiji × UP Arts-Based Research 2026";

export const BOARDS: Record<BoardKey, BoardText> = {
  welcome: {
    title: "Maayong pag-abot! ようこそ! Welcome!",
    subtitle: SUBTITLE,
    paragraphs: [
      "Students from Meiji University and the University of the Philippines met in Cebu. They walked the city together, through its markets, its streets, and the neighbourhoods where families live close together, and then made art about what stayed with them, naming each piece in Japanese, English, and Filipino or Cebuano.",
      "Seisugbo carries that work further. Sugbo is Cebu's old name.",
    ],
    list: [
      {
        items: [
          "Walk the lane: the walking tour's photos hang along it.",
          "The covered court: the art, hung on the sampayan.",
          "The classroom, through the hall: questions to talk about together.",
        ],
      },
    ],
  },
  lane: {
    title: "The lane",
    subtitle: "Ang eskinita",
    paragraphs: [
      "This lane is a model, not one real place. Houses built close together, wires overhead, bunting from the last fiesta, washing out to dry, a sari-sari store on the corner, bulad drying in the sun.",
      "It's built from what the students photographed and drew, Group D's Energy (活気, sigla) most of all: a lane of stalls and homes, and the children who waved.",
      "The photos along the lane are from the walking tour. Click one to see it up close.",
    ],
  },
  court: {
    title: "The covered court",
    subtitle: "Every barangay has one",
    paragraphs: [
      "A covered court is for basketball, fiestas, meetings, and today, an exhibition.",
      "The art hangs on sampayan, clotheslines, the way washing hangs in the lane. Under each piece are the words its makers chose for it, in their three languages.",
      "Click a piece to see it up close, with Previous and Next to walk along the line.",
    ],
  },
  process: {
    title: "Arts-based research",
    subtitle: "How this work was made",
    paragraphs: ["Arts-based research uses making art as a way of finding out, and of saying what is hard to put into a report."],
    list: [
      {
        numbered: true,
        items: [
          "Walk. A guided walking tour of Cebu City, together.",
          "Notice. What stays with you: a smell, a face, a colour, a word.",
          "Make. Crayon, clay, torn paper, origami, collage, and dance.",
          "Name. A word for it in Japanese, English, and Filipino or Cebuano.",
          "Share. An exhibition, a talkback, and now this world.",
        ],
      },
    ],
  },
  talk: {
    title: "Let's talk",
    subtitle: "Tayo'y mag-usap · 話そう",
    paragraphs: ["Find a partner from another country. Take turns asking."],
    list: [
      {
        heading: "Round 1: Getting to know you (5 minutes)",
        numbered: true,
        items: [
          "What is your name, and what should we call you? · Ano ang pangalan mo, at ano ang gusto mong itawag namin sa iyo?",
          "Where are you joining us from today? · Saan ka nakabase ngayon?",
          "What is one fun fact about yourself? · Ano ang isang nakakatuwang bagay tungkol sa iyo?",
          "What do you usually do for fun? · Ano ang madalas mong gawin para maglibang?",
          "If you could describe yourself in three words, what would they be? · Kung ilalarawan mo ang sarili mo sa tatlong salita, ano ang mga ito?",
        ],
      },
      {
        heading: "Round 2: Cultural exchange (5 to 7 minutes)",
        numbered: true,
        items: [
          "What food from your culture should we try? · Anong pagkain mula sa kultura mo ang dapat naming tikman?",
          "What is one word in your language that you want to teach us? · Anong isang salita sa wika mo ang gusto mong ituro sa amin?",
          "What is something special about your hometown? · Ano ang espesyal sa inyong bayan o lugar?",
          "What is one tradition or celebration you enjoy? · Anong tradisyon o pagdiriwang ang gusto mo?",
          "What is one thing you want to learn about Japan or the Philippines? · Ano ang isang bagay na gusto mong malaman tungkol sa Hapon o Pilipinas?",
        ],
      },
      {
        heading: "Round 3: Metaverse fun (5 minutes)",
        numbered: true,
        items: [
          "Is this your first time exploring a metaverse? · Unang beses mo bang mag-explore ng metaverse?",
          "If you could teleport anywhere right now, where would you go? · Kung puwede kang mag-teleport kahit saan ngayon, saan ka pupunta?",
          "If you could build anything in this virtual world, what would it be? · Kung puwede kang gumawa ng kahit ano sa virtual world na ito, ano iyon?",
          "If you could bring one thing from your culture into the metaverse, what would it be? · Kung may isang bagay mula sa kultura mo na dadalhin mo sa metaverse, ano iyon?",
          "What would you like to create with a student from another country? · Ano ang gusto mong likhain kasama ang isang estudyante mula sa ibang bansa?",
        ],
      },
    ],
  },
  posters: {
    title: "The collage wall",
    subtitle: "Group A",
    paragraphs: ["Photos from home and from Cebu, drawn over and taped up side by side: the cafés, the night breeze, the season each of us misses, and an encyclopedia of each other."],
  },
};

export const GROUP_BLURB: Record<string, string> = {
  A: "Crayon, clay, origami, and a poem in Cebuano.",
  B: "One board for everything, and faces drawn side by side.",
  C: "Collage, paper chains, and bulad cut out to hang.",
  D: "Torn paper, pastel, and a dance.",
};

// --- 日本語 ------------------------------------------------------------------------------------

const BOARDS_JA: Record<BoardKey, BoardText> = {
  welcome: {
    title: "Maayong pag-abot! ようこそ! Welcome!",
    subtitle: "明治 × UP アートベース・リサーチ 2026",
    paragraphs: [
      "明治大学とフィリピン大学の学生がセブで出会いました。市場や通り、家々が身を寄せ合う下町をいっしょに歩き、心に残ったものを作品にしました。どの作品にも、日本語、英語、そしてフィリピン語かセブアノ語で名前がついています。",
      "Seisugboは、その作品をさらに先へ届けます。「スグボ」はセブの古い名前です。",
    ],
    list: [
      {
        items: [
          "路地を歩こう:まち歩きの写真が並んでいます。",
          "屋根つきコート:作品がサンパヤン(物干しロープ)に掛かっています。",
          "ホールの奥の教室:いっしょに話すための問いがあります。",
        ],
      },
    ],
  },
  lane: {
    title: "路地",
    subtitle: "Ang eskinita",
    paragraphs: [
      "この路地はモデルで、実在のどこか一か所ではありません。身を寄せ合う家々、頭上の電線、この前のフィエスタの旗飾り、干された洗濯物、角のサリサリストア(よろず屋)、日に干されるブラッド(干し魚)。",
      "学生たちが撮った写真や描いた絵、とくにDグループの「活気(Energy、sigla)」をもとに作りました。屋台と家が並ぶ路地と、手を振ってくれた子どもたち。",
      "路地の写真はまち歩きのときのものです。クリックすると大きく見られます。",
    ],
  },
  court: {
    title: "屋根つきコート",
    subtitle: "どのバランガイにもひとつある",
    paragraphs: [
      "屋根つきコートは、バスケットボール、フィエスタ、集会、そして今日は展覧会の場所です。",
      "作品は、路地の洗濯物のようにサンパヤン(物干しロープ)に掛かっています。それぞれの下には、作り手が3つの言葉で選んだ言葉があります。",
      "作品をクリックすると大きく見られます。「前へ」「次へ」で列に沿って進めます。",
    ],
  },
  process: {
    title: "アートベース・リサーチ",
    subtitle: "この作品ができるまで",
    paragraphs: ["アートベース・リサーチは、作品を作ることを、知る方法として、そして報告書では言いにくいことを伝える方法として使う研究です。"],
    list: [
      {
        numbered: true,
        items: [
          "歩く。セブ市をガイドといっしょにまち歩き。",
          "気づく。心に残ったもの:におい、顔、色、言葉。",
          "作る。クレヨン、粘土、ちぎり絵、折り紙、コラージュ、そしてダンス。",
          "名づける。日本語、英語、フィリピン語かセブアノ語で、ひとつの言葉を。",
          "分かち合う。展覧会、話し合い、そしてこのワールド。",
        ],
      },
    ],
  },
  talk: {
    title: "話そう",
    subtitle: "Tayo'y mag-usap · Let's talk",
    paragraphs: ["ほかの国の人とペアになって、交代で聞いてみましょう。"],
    list: [
      {
        heading: "ラウンド1:おたがいを知ろう(5分)",
        numbered: true,
        items: [
          "名前は?何と呼べばいい? · Ano ang pangalan mo, at ano ang gusto mong itawag namin sa iyo?",
          "今日はどこから参加している? · Saan ka nakabase ngayon?",
          "あなたについてのおもしろい話をひとつ。 · Ano ang isang nakakatuwang bagay tungkol sa iyo?",
          "ふだん楽しみに何をしている? · Ano ang madalas mong gawin para maglibang?",
          "自分を3つの言葉で表すと? · Kung ilalarawan mo ang sarili mo sa tatlong salita, ano ang mga ito?",
        ],
      },
      {
        heading: "ラウンド2:文化の交流(5〜7分)",
        numbered: true,
        items: [
          "あなたの文化の食べもので、ぜひ食べてほしいものは? · Anong pagkain mula sa kultura mo ang dapat naming tikman?",
          "あなたの言葉で、教えたい言葉をひとつ。 · Anong isang salita sa wika mo ang gusto mong ituro sa amin?",
          "あなたのふるさとの特別なところは? · Ano ang espesyal sa inyong bayan o lugar?",
          "好きな伝統行事やお祭りは? · Anong tradisyon o pagdiriwang ang gusto mo?",
          "日本かフィリピンについて知りたいことをひとつ。 · Ano ang isang bagay na gusto mong malaman tungkol sa Hapon o Pilipinas?",
        ],
      },
      {
        heading: "ラウンド3:メタバースで遊ぼう(5分)",
        numbered: true,
        items: [
          "メタバースを歩くのは初めて? · Unang beses mo bang mag-explore ng metaverse?",
          "今どこへでもテレポートできるなら、どこへ行く? · Kung puwede kang mag-teleport kahit saan ngayon, saan ka pupunta?",
          "この仮想世界に何でも作れるなら、何を作る? · Kung puwede kang gumawa ng kahit ano sa virtual world na ito, ano iyon?",
          "あなたの文化からメタバースにひとつ持ちこむなら、何? · Kung may isang bagay mula sa kultura mo na dadalhin mo sa metaverse, ano iyon?",
          "ほかの国の学生といっしょに何を作りたい? · Ano ang gusto mong likhain kasama ang isang estudyante mula sa ibang bansa?",
        ],
      },
    ],
  },
  posters: {
    title: "コラージュの壁",
    subtitle: "Aグループ",
    paragraphs: ["ふるさとの写真とセブの写真に絵を描き重ね、並べて貼りました。カフェ、夜風、それぞれが恋しい季節、そしておたがいの百科事典。"],
  },
};

const GROUP_BLURB_JA: Record<string, string> = {
  A: "クレヨン、粘土、折り紙、そしてセブアノ語の詩。",
  B: "すべてを1枚のボードに、そして並べて描いた顔。",
  C: "コラージュ、紙の鎖、そして吊るすために切り抜いたブラッド。",
  D: "ちぎり絵、パステル、そしてダンス。",
};

/** A board's words in the visitor's language. */
export function boardText(key: BoardKey): BoardText {
  return getLang() === "ja" ? BOARDS_JA[key] : BOARDS[key];
}

export function groupBlurb(group: string): string {
  return L(GROUP_BLURB[group] ?? "", GROUP_BLURB_JA[group] ?? GROUP_BLURB[group] ?? "");
}

export function subtitle(): string {
  return L(SUBTITLE, "明治 × UP アートベース・リサーチ 2026");
}
