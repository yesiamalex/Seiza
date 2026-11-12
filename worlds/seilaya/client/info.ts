// Seilaya's cards: what each station and safety tool says, written for
// learners rather than lawyers. Every claim rests on the sources listed
// with it (references.ts). The law summaries aren't legal advice; a
// school's own Committee on Decorum and Investigation decides real cases.
import type { CardKey } from "./safety";
import { getLang } from "../../../src/i18n/lang";
import type { RefKey } from "./references";

export interface Card {
  title: string;
  /** Paragraphs, or [term, explanation] pairs shown as a list. */
  body: (string | [string, string])[];
  sources: RefKey[];
}

/** Who to contact, shown on the help card. A deployment fills these in
 *  for its own school: the officer or committee that receives complaints
 *  (RA 11313, Sections 21 and 22) and its gender and development office. */
export const HELP_CONTACTS: { label: string; detail: string }[] = [
  { label: "Your session's facilitator", detail: "The person running this session can remove someone from the room." },
  { label: "Committee on Decorum and Investigation (CODI)", detail: "Every school must have one to receive harassment complaints. Replace this line with your school's CODI contact." },
  { label: "Gender and development office", detail: "Replace this line with your school's GAD office contact." },
  { label: "Emergency", detail: "If someone is in danger, call 911." },
];

export const CARDS: Record<Exclude<CardKey, "quiz" | "bystander">, Card> = {
  welcome: {
    title: "Welcome to Seilaya",
    body: [
      "Seilaya, from the Filipino laya (freedom), is a space for learning about gender, safety, and respect, built so that it feels safe to everyone in it.",
      "Your safety tools are under the Safety button at the top left: personal space, who may ask you for a handshake or a hug, blocking, and a quiet place to step out to. None of it is recorded, and nobody is told what you choose.",
      "Around the hall, classroom, and garden are stations on the Safe Spaces Act, gender and development, SOGIESC, women in Philippine science, gender data, bystander action, and safety by design. Click any of them.",
    ],
    sources: ["ra11313"],
  },
  conduct: {
    title: "How we treat each other here",
    body: [
      ["Ask first", "Handshakes, high fives, and hugs only happen when the other person says yes. No means no, and no answer means no."],
      ["Give space", "Don't follow, crowd, or block someone's way, especially after they've moved away."],
      ["Respect people as they are", "Use the names and pronouns people share. No slurs or jokes about anyone's gender, sexual orientation, body, or appearance."],
      ["Keep it clean", "No sexual comments, images, or gestures toward anyone."],
      ["Respect privacy", "Don't record, screenshot, or share others without their consent."],
      ["Look out for each other", "If something feels wrong, use your safety tools, and tell the facilitator."],
      "These rules follow the Philippines' Safe Spaces Act, which covers harassment online as well as in person, and requires schools to have a code of conduct against it.",
    ],
    sources: ["ra11313"],
  },
  safety: {
    title: "Your safety tools",
    body: [
      ["Personal space", "Anyone who comes closer than the distance you choose fades from your view. Their voice still comes through."],
      ["Together gestures", "Ask someone nearby for a handshake, high five, fist bump, dap, hug, or slow dance. It only plays if they accept. You can turn off requests completely."],
      ["Block", "Hides someone from you for this visit: their avatar, voice, and chat. They aren't told, and they can't ask you for anything."],
      ["Step out", "Takes you to Kanlungan in the garden, where you don't see or hear anyone until you choose to return."],
      ["Pronouns", "Optional. Shown under your name to the people here."],
      "These follow what research on harassment in social virtual reality recommends: personal boundaries, muting and blocking, and consent before contact.",
    ],
    sources: ["blackwell2019", "freeman2022", "maloney2021"],
  },
  help: {
    title: "If something happened",
    body: [
      "You did nothing wrong by being here. These steps can help, in any order:",
      ["Get space", "Block the person, or step out to Kanlungan. Both take effect at once."],
      ["Write it down", "Note the time, the person's name, and what happened, while you remember. Screenshots of what was done to you can help."],
      ["Tell someone", "The facilitator can remove someone from the room. Your school's Committee on Decorum and Investigation handles complaints, confidentially."],
      "Contacts for this space are listed below.",
    ],
    sources: ["ra11313"],
  },
  safespaces: {
    title: "The Safe Spaces Act (RA 11313)",
    body: [
      "Approved on April 17, 2019, the Safe Spaces Act covers gender-based sexual harassment in streets and public spaces, online, at work, and in schools.",
      "In public spaces it includes unwanted and uninvited sexual actions or remarks, and it names misogynistic, transphobic, homophobic, and sexist slurs (Section 4).",
      ["Online harassment (Section 12) includes", "threats; unwanted sexual, misogynistic, transphobic, homophobic, or sexist remarks; cyberstalking and persistent unwanted messages; sharing someone's photos, videos, or information without consent; impersonation; and false abuse reports meant to silence someone."],
      ["Schools must (Sections 21 and 22)", "name an officer to receive complaints, publish grievance procedures, act on harassment even without a complaint, form a Committee on Decorum and Investigation, and issue a code of conduct."],
      "This is a summary, not legal advice.",
    ],
    sources: ["ra11313"],
  },
  gad: {
    title: "Gender and development",
    body: [
      "The Magna Carta of Women (RA 9710, 2009) is the Philippines' comprehensive women's rights law. It commits the state to the substantive equality of women and men.",
      "Section 36 requires every government agency, state universities included, to plan gender and development (GAD) programs and to fund them with at least 5% of its total budget.",
      "The Philippine Commission on Women reviews these GAD plans and budgets each year, and doesn't endorse those below the 5% minimum.",
      "A space like this one, built to be safe for learners of every gender, is the kind of program a GAD budget can support.",
    ],
    sources: ["ra9710", "pcwGad"],
  },
  sogiesc: {
    title: "SOGIESC: words that help",
    body: [
      "Everyone has a sexual orientation, a gender identity, a gender expression, and sex characteristics. SOGIESC names all four.",
      ["Sexual orientation", "who a person is attracted to, emotionally, romantically, or sexually."],
      ["Gender identity", "a person's deeply felt sense of their own gender, which may or may not match the sex assigned at birth."],
      ["Gender expression", "how a person presents their gender: clothing, hair, voice, behaviour."],
      ["Sex characteristics", "physical features such as chromosomes, hormones, and anatomy, including intersex variations."],
      "The Safe Spaces Act defines gender identity and expression (Section 3) and treats transphobic and homophobic slurs as harassment.",
    ],
    sources: ["ohchrBornFree", "yogyakarta10", "ra11313"],
  },
  cpted: {
    title: "Safe by design",
    body: [
      "Crime prevention through environmental design (CPTED) is the idea that how a place is laid out changes how safe it is and feels. Its main principles:",
      ["Natural surveillance", "see and be seen: good lighting and open sightlines. That's why the garden's lampposts are on the garden switch, and the paths are clear."],
      ["Access control", "clear entrances and exits, so nobody feels trapped."],
      ["Territorial reinforcement", "spaces that show they're cared for and whose they are."],
      ["Maintenance", "a well-kept place signals that someone is watching out for it."],
      "Whether these hold in a virtual space is an open question. Seilaya's research asks whether light and sightlines raise how safe learners feel here.",
    ],
    sources: ["cozens2015"],
  },
  refuge: {
    title: "Kanlungan",
    body: [
      "Kanlungan means refuge. Step out here whenever you need a moment.",
      "While you're stepped out, you don't see or hear anyone, and nobody can ask you for anything. Others may still see your avatar here, so they know you've stepped away.",
      "Return whenever you're ready, to here or to where you were.",
    ],
    sources: [],
  },
  women: {
    title: "Women in Philippine science",
    body: [
      ["Honoria Acosta-Sison (1888–1970)", "The first Filipina physician: she earned her medical degree from the Woman's Medical College of Pennsylvania in 1909, and is remembered as the mother of Philippine obstetrics."],
      ["María Y. Orosa (1893–1945)", "A food technologist and chemist who turned local crops into foods that kept, among them banana ketchup and calamansi juice powder."],
      ["Fe del Mundo (1911–2011)", "A pediatrician, and in 1980 the first woman named National Scientist of the Philippines."],
      ["Lourdes J. Cruz", "A biochemist and National Scientist whose research on the venom of Philippine cone snails opened new ways to study the nervous system. In 2010 she became the first Filipina to receive the L'Oréal-UNESCO For Women in Science award."],
    ],
    sources: ["drexelAcostaSison", "upOrosa", "upDelMundo", "philstarCruz"],
  },
  data: {
    title: "Gender in numbers",
    body: [
      "The Global Gender Gap Report 2025 ranked the Philippines 20th of 148 countries, with a score of 78.1%: the highest in Southeast Asia.",
      ["Educational attainment", "98.8% of parity"],
      ["Health and survival", "96.7%"],
      ["Economic participation and opportunity", "about 79%"],
      ["Political empowerment", "37.7%: the widest gap"],
      "Work is still uneven: in the 2021 Labor Force Survey, 51.2% of women were in the labor force, against 75.4% of men.",
    ],
    sources: ["wef2025", "psaWomenMen"],
  },
};

// --- the two interactive stations --------------------------------------------------------

export interface QuizItem {
  situation: string;
  harassment: boolean;
  why: string;
}

/** "Is this harassment?" Each answer names the part of the law it rests on. */
export const QUIZ: QuizItem[] = [
  {
    situation: "After you said stop and walked away, someone keeps following your avatar around the room.",
    harassment: true,
    why: "Persistent, unwanted pursuit after a clear no is the kind of stalking the Safe Spaces Act covers online (Section 12).",
  },
  {
    situation: "Two classmates both say yes to a high five, and do it.",
    harassment: false,
    why: "Both agreed. Consent is what makes contact okay.",
  },
  {
    situation: "Someone keeps commenting on your avatar's body, even after you change the subject.",
    harassment: true,
    why: "Unwanted sexual remarks are harassment, online or in person (Sections 4 and 12).",
  },
  {
    situation: "A classmate posts a screenshot of you from the session with a sexual caption in the group chat.",
    harassment: true,
    why: "Sharing someone's image without consent, with sexual content, is online harassment (Section 12).",
  },
  {
    situation: "Someone asks once whether you'd like to join their group. You say no, and they leave it there.",
    harassment: false,
    why: "One respectful question, accepted no. That's how asking should go.",
  },
  {
    situation: "In voice chat, someone uses a slur about another student's gender identity.",
    harassment: true,
    why: "The Act names transphobic, homophobic, misogynistic, and sexist slurs as harassment (Section 4), online too (Section 12).",
  },
];

export interface BystanderChoice {
  label: string;
  /** Which of the 5Ds it is, or null for not intervening. */
  d: "Distract" | "Delegate" | "Document" | "Delay" | "Direct" | null;
  feedback: string;
}

/** "What would you do?" A non-graphic scenario and the 5Ds. */
export const BYSTANDER = {
  scenario:
    "During a group activity, you notice a student keeps standing very close to a classmate and making comments about how they look. The classmate keeps stepping away and has gone quiet.",
  choices: [
    { label: "Ask the classmate to help you with something at another station.", d: "Distract", feedback: "Distract: you interrupt without confronting anyone, and give your classmate a way out." },
    { label: "Tell the facilitator what you're seeing.", d: "Delegate", feedback: "Delegate: the facilitator can step in, and can remove someone from the room." },
    { label: "Note the time, names, and what was said.", d: "Document", feedback: "Document: a record helps if your classmate decides to report it. Give it to them, and don't share it without their consent." },
    { label: "Check in with your classmate afterwards: are you okay?", d: "Delay", feedback: "Delay: even after the fact, checking in tells someone they're not alone, and you can point them to their safety tools." },
    { label: "Calmly tell the student to give your classmate space.", d: "Direct", feedback: "Direct: speak up only if it feels safe. Keep it short and calm, and don't argue." },
    { label: "Say nothing; it's not your business.", d: null, feedback: "Most harassment happens in front of others. Any of the 5Ds, even a quiet one, helps more than nothing." },
  ] as BystanderChoice[],
};

// --- 日本語 ------------------------------------------------------------------------------------
// The same cards in Japanese. The law summaries are translations for
// learning; the Philippine texts are what count.

const HELP_CONTACTS_JA: { label: string; detail: string }[] = [
  { label: "このセッションのファシリテーター", detail: "このセッションを進めている人は、部屋から人を退出させることができます。" },
  { label: "礼節・調査委員会(CODI)", detail: "どの学校にも、ハラスメントの申し立てを受け付ける委員会が必要です。この行をあなたの学校のCODIの連絡先に置き換えてください。" },
  { label: "ジェンダーと開発(GAD)オフィス", detail: "この行をあなたの学校のGADオフィスの連絡先に置き換えてください。" },
  { label: "緊急のとき", detail: "誰かが危険なときは911へ電話してください。" },
];

const CARDS_JA: Record<Exclude<CardKey, "quiz" | "bystander">, Card> = {
  welcome: {
    title: "Seilayaへようこそ",
    body: [
      "Seilayaの名前はフィリピン語の laya(自由)から。ジェンダー、安全、尊重について学ぶための場所で、ここにいる誰もが安心できるように作られています。",
      "安全のための機能は左上の「安全」ボタンにあります。パーソナルスペース、握手やハグを誰が頼めるか、ブロック、そして一人になれる静かな場所。どれも記録されず、何を選んだかは誰にも知らされません。",
      "ホール、教室、庭のあちこちに、セーフスペース法、ジェンダーと開発、SOGIESC、フィリピンの科学の女性たち、ジェンダーのデータ、傍観者の行動、デザインによる安全についての展示があります。クリックしてみてください。",
    ],
    sources: ["ra11313"],
  },
  conduct: {
    title: "ここでのおたがいへの接し方",
    body: [
      ["まず聞く", "握手、ハイタッチ、ハグは、相手が「はい」と言ったときだけ。「いいえ」は「いいえ」、返事がないのも「いいえ」です。"],
      ["距離をとる", "人のあとをつけたり、詰め寄ったり、行く手をふさいだりしない。とくに相手が離れたあとは。"],
      ["ありのままを尊重する", "相手が伝えた名前と代名詞を使う。ジェンダー、性的指向、体、見た目についての侮辱や冗談は言わない。"],
      ["品位を守る", "誰に対しても、性的な発言、画像、しぐさはしない。"],
      ["プライバシーを守る", "同意なく、ほかの人を録画、スクリーンショット、共有しない。"],
      ["おたがいに気を配る", "おかしいと感じたら、安全の機能を使い、ファシリテーターに伝える。"],
      "これらのルールはフィリピンのセーフスペース法にもとづいています。この法律は対面だけでなくオンラインのハラスメントも対象とし、学校に行動規範を定めるよう求めています。",
    ],
    sources: ["ra11313"],
  },
  safety: {
    title: "あなたの安全の機能",
    body: [
      ["パーソナルスペース", "あなたが選んだ距離より近づいた人は、あなたの視界から消えます。声は聞こえます。"],
      ["いっしょにするジェスチャー", "近くの人に握手、ハイタッチ、グータッチ、ダップ、ハグ、スローダンスを頼めます。相手が受け入れたときだけ行われます。リクエストを完全にオフにもできます。"],
      ["ブロック", "この訪問のあいだ、その人のアバター、声、チャットを見えなくします。相手には知らされず、あなたに何かを頼むこともできなくなります。"],
      ["一時退避", "庭のカンルンガンへ移動します。自分で戻るまで、誰も見えず、誰の声も聞こえません。"],
      ["代名詞", "任意です。ここにいる人たちに、名前の下に表示されます。"],
      "これらは、ソーシャルVRでのハラスメントに関する研究がすすめるものにならっています。個人の境界、ミュートとブロック、そして接触の前の同意です。",
    ],
    sources: ["blackwell2019", "freeman2022", "maloney2021"],
  },
  help: {
    title: "何かあったときは",
    body: [
      "ここにいたことで、あなたは何も悪くありません。次のことが助けになります。順番はどれからでも。",
      ["距離をとる", "相手をブロックするか、カンルンガンへ一時退避しましょう。どちらもすぐに効きます。"],
      ["書きとめる", "覚えているうちに、時刻、相手の名前、起きたことをメモしましょう。あなたがされたことのスクリーンショットも役立ちます。"],
      ["誰かに話す", "ファシリテーターは部屋から人を退出させられます。学校の礼節・調査委員会が、秘密を守って申し立てを扱います。"],
      "この場所の連絡先は下にあります。",
    ],
    sources: ["ra11313"],
  },
  safespaces: {
    title: "セーフスペース法(共和国法11313号)",
    body: [
      "2019年4月17日に承認されたセーフスペース法は、路上や公共の場、オンライン、職場、学校でのジェンダーにもとづく性的ハラスメントを対象としています。",
      "公共の場では、望まれない一方的な性的な行為や発言を含み、女性蔑視、トランスフォビア、ホモフォビア、性差別の侮辱語を明記しています(第4条)。",
      ["オンラインのハラスメント(第12条)に含まれるもの", "脅迫。望まれない性的、女性蔑視的、トランスフォビア的、ホモフォビア的、性差別的な発言。サイバーストーキングとしつこい迷惑メッセージ。同意のない写真、動画、情報の共有。なりすまし。相手を黙らせるための虚偽の通報。"],
      ["学校がしなければならないこと(第21条・第22条)", "申し立ての担当者を任命し、苦情処理の手続きを公表し、申し立てがなくてもハラスメントに対処し、礼節・調査委員会を設け、行動規範を定めること。"],
      "これは要約で、法的な助言ではありません。",
    ],
    sources: ["ra11313"],
  },
  gad: {
    title: "ジェンダーと開発",
    body: [
      "女性のためのマグナカルタ(共和国法9710号、2009年)は、フィリピンの包括的な女性の権利の法律です。国は女性と男性の実質的な平等を約束しています。",
      "第36条は、州立大学を含むすべての政府機関に、ジェンダーと開発(GAD)の計画を立て、総予算の少なくとも5%をあてることを求めています。",
      "フィリピン女性委員会は毎年このGAD計画と予算を審査し、5%に満たないものは承認しません。",
      "あらゆるジェンダーの学習者が安心できるように作られたこのような場所は、GAD予算で支えられるプログラムの一例です。",
    ],
    sources: ["ra9710", "pcwGad"],
  },
  sogiesc: {
    title: "SOGIESC:助けになる言葉",
    body: [
      "誰にでも、性的指向、性自認、性表現、そして性的特徴があります。SOGIESCはこの4つすべてを表す言葉です。",
      ["性的指向", "人が感情的、恋愛的、性的にひかれる相手。"],
      ["性自認", "自分の性についての深い感覚。出生時に割り当てられた性と一致することも、しないこともあります。"],
      ["性表現", "服装、髪型、声、ふるまいなど、自分の性をどう表すか。"],
      ["性的特徴", "染色体、ホルモン、からだのつくりなどの身体的な特徴。インターセックスの多様性も含みます。"],
      "セーフスペース法は性自認と性表現を定義し(第3条)、トランスフォビアやホモフォビアの侮辱語をハラスメントとしています。",
    ],
    sources: ["ohchrBornFree", "yogyakarta10", "ra11313"],
  },
  cpted: {
    title: "デザインによる安全",
    body: [
      "環境設計による犯罪予防(CPTED)は、場所のつくりが、その場所の安全さと安心感を変えるという考え方です。おもな原則は次のとおり。",
      ["自然な見守り", "見えて、見られること。よい照明と見通しのよさ。だから庭の街灯は庭のスイッチにつながり、道は開けています。"],
      ["出入りの管理", "入口と出口をはっきりさせ、誰も閉じこめられたと感じないように。"],
      ["領域性の強化", "大切にされていて、誰の場所かがわかる空間。"],
      ["維持管理", "手入れの行き届いた場所は、誰かが見守っていることを伝えます。"],
      "これらが仮想空間でも成り立つかは、まだわかっていません。Seilayaの研究は、光と見通しが学習者の安心感を高めるかを問いかけています。",
    ],
    sources: ["cozens2015"],
  },
  refuge: {
    title: "カンルンガン",
    body: [
      "カンルンガンは「避難所」という意味です。ひと息つきたいときは、いつでもここへ。",
      "退避しているあいだは、誰も見えず、誰の声も聞こえず、誰もあなたに何かを頼めません。ほかの人からはここにいるあなたのアバターが見えるので、一時離れていることがわかります。",
      "準備ができたら、ここへでも元の場所へでも戻れます。",
    ],
    sources: [],
  },
  women: {
    title: "フィリピンの科学の女性たち",
    body: [
      ["オノリア・アコスタ=シソン(1888–1970)", "フィリピン初の女性医師。1909年にペンシルベニア女子医科大学で医学の学位を取り、フィリピン産科学の母として知られています。"],
      ["マリア・Y・オロサ(1893–1945)", "食品技術者・化学者。地元の作物を、バナナケチャップやカラマンシージュースの粉末など、日持ちする食品に変えました。"],
      ["フェ・デル・ムンド(1911–2011)", "小児科医。1980年、女性として初めてフィリピンのナショナル・サイエンティストに選ばれました。"],
      ["ルルド・J・クルス", "生化学者でナショナル・サイエンティスト。フィリピンのイモガイの毒の研究で、神経系を調べる新しい道を開きました。2010年、フィリピン人女性として初めてロレアル・ユネスコ女性科学賞を受賞しました。"],
    ],
    sources: ["drexelAcostaSison", "upOrosa", "upDelMundo", "philstarCruz"],
  },
  data: {
    title: "数字で見るジェンダー",
    body: [
      "「グローバル・ジェンダー・ギャップ報告書2025」で、フィリピンは148か国中20位、スコアは78.1%。東南アジアでいちばん高い順位です。",
      ["教育", "平等の98.8%"],
      ["健康と生存", "96.7%"],
      ["経済参画と機会", "約79%"],
      ["政治参画", "37.7%:いちばん大きな差"],
      "仕事ではまだ差があります。2021年の労働力調査では、労働力に参加している女性は51.2%、男性は75.4%でした。",
    ],
    sources: ["wef2025", "psaWomenMen"],
  },
};

const QUIZ_JA: QuizItem[] = [
  { situation: "「やめて」と言って離れたのに、誰かがあなたのアバターのあとを部屋じゅうついてくる。", harassment: true, why: "はっきり断ったあとのしつこい追跡は、セーフスペース法がオンラインで対象とするストーキングにあたります(第12条)。" },
  { situation: "クラスメート2人がどちらもハイタッチに「はい」と言い、ハイタッチをする。", harassment: false, why: "2人とも同意しています。同意があるから、触れ合いが大丈夫になるのです。" },
  { situation: "話題を変えても、誰かがあなたのアバターの体についてしつこくコメントする。", harassment: true, why: "望まれない性的な発言は、オンラインでも対面でもハラスメントです(第4条・第12条)。" },
  { situation: "クラスメートが、セッション中のあなたのスクリーンショットに性的なキャプションをつけてグループチャットに投稿する。", harassment: true, why: "性的な内容をつけて同意なく人の画像を共有するのは、オンラインのハラスメントです(第12条)。" },
  { situation: "誰かが一度だけ、グループに入らないかと聞く。あなたが断ると、それで終わりにする。", harassment: false, why: "敬意のある質問が一度、断りが受け入れられた。頼むときはこうあるべきです。" },
  { situation: "ボイスチャットで、誰かがほかの学生の性自認についての侮辱語を使う。", harassment: true, why: "この法律は、トランスフォビア、ホモフォビア、女性蔑視、性差別の侮辱語をハラスメントとしています(第4条)。オンラインでも同じです(第12条)。" },
];

const BYSTANDER_JA = {
  scenario: "グループ活動中、ある学生がクラスメートのすぐそばに立ち続け、見た目についてコメントしているのに気づきます。クラスメートは何度も離れようとしていて、黙りこんでしまいました。",
  choices: [
    { label: "クラスメートに、別の展示で手伝ってほしいと頼む。", d: "Distract", feedback: "気をそらす(Distract):誰とも対立せずに割って入り、クラスメートに抜け出す道をつくります。" },
    { label: "見ていることをファシリテーターに伝える。", d: "Delegate", feedback: "人に任せる(Delegate):ファシリテーターは介入でき、部屋から人を退出させることもできます。" },
    { label: "時刻、名前、言われたことを記録する。", d: "Document", feedback: "記録する(Document):クラスメートが報告すると決めたとき、記録が役立ちます。本人に渡し、同意なく共有しないでください。" },
    { label: "あとでクラスメートに「大丈夫?」と声をかける。", d: "Delay", feedback: "あとで声をかける(Delay):あとからでも、気にかけていると伝えることで一人じゃないと伝わります。安全の機能も教えてあげられます。" },
    { label: "落ち着いて、その学生にクラスメートから離れるよう言う。", d: "Direct", feedback: "直接言う(Direct):安全だと感じるときだけ。短く落ち着いて、言い争わないように。" },
    { label: "何も言わない。自分には関係ない。", d: null, feedback: "ハラスメントの多くは人前で起きます。5つのDのどれでも、たとえ静かなものでも、何もしないよりずっと助けになります。" },
  ] as BystanderChoice[],
};

/** The cards, the quiz, and the rest in the visitor's language. */
export const card = (key: keyof typeof CARDS): Card => (getLang() === "ja" ? CARDS_JA[key] : CARDS[key]);
export const helpContacts = () => (getLang() === "ja" ? HELP_CONTACTS_JA : HELP_CONTACTS);
export const quiz = () => (getLang() === "ja" ? QUIZ_JA : QUIZ);
export const bystander = () => (getLang() === "ja" ? BYSTANDER_JA : BYSTANDER);
