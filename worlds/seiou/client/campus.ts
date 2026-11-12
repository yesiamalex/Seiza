// What SeiOU's guides know, where the buildings are, and who the guides
// are. Every answer is written here, so the guides can never say something
// nobody wrote. Seiza's shared guides (src/guides/) do the rest: matching a
// question to an answer, guardrails, walking, gestures, and the chat.
//
// Facts come from UPOU's own pages and Wikipedia (sources in the README).
// Check anything that may have changed before a public deployment, and
// keep answers about people and offices general: those change.
//
// Places are where a guide walks you, or takes you at once: feet positions
// on the campus model (worlds/seiou/world/models/campus.glb, in metres).
// `walk: false` marks floors whose stairs the model doesn't include.
import type { Knowledge, Persona, Place, Topic } from "../../../src/guides/brain";
import type { Stop } from "../../../src/guides/route";

const place = (id: string, label: string, labelJa: string, at: [number, number, number], walk = true): Place => ({ id, label, labelJa, at, walk });

export const PLACES = {
  oblation: place("oblation", "the Oblation, in the middle of the roundabout", "ロータリーの中央にあるオブレーション像", [18, 0.2, 2]),
  main: place("main", "the UPOU Main Building", "UPOU本館", [110, 0.2, 0]),
  tlh: place("tlh", "the Teaching and Learning Hub", "ティーチング・アンド・ラーニング・ハブ", [132, 0.2, 63]),
  ccdl: place("ccdl", "the CCDL Auditorium", "CCDL講堂", [277, 1.3, -95]),
  ccdlStage: place("ccdlStage", "the stage of the CCDL Auditorium", "CCDL講堂のステージ", [281, 5.7, -103], false),
  wcmpb: place("wcmpb", "the ground floor of the World-Class Multi-Purpose Building", "ワールドクラス多目的ビルの1階", [226, 1.6, 154]),
  wcmpb2F: place("wcmpb2F", "the second floor of the World-Class Multi-Purpose Building", "ワールドクラス多目的ビルの2階", [226, 8.2, 150], false),
  wcmpbRoof: place("wcmpbRoof", "the roof deck of the World-Class Multi-Purpose Building", "ワールドクラス多目的ビルの屋上デッキ", [226, 14.8, 150], false),
  ar: place("ar", "the Academic Residences", "アカデミック・レジデンス", [336, 1.1, -98]),
};

const TOPICS: Topic[] = [
  {
    id: "world",
    title: "About SeiOU",
    answer:
      "SeiOU is a digital twin of the University of the Philippines Open University's headquarters in Los Baños, Laguna, built on Seiza. Walk the campus with others, step inside its buildings, and ask Chancy Joan or Dean Rob anything about UPOU or the way somewhere.",
    asks: ["what is this place", "what is seiou", "where am i", "what can i do here", "is this the real campus", "digital twin", "ano ito"],
    place: PLACES.main,
    ja: {
      title: "SeiOUについて",
      answer:
        "SeiOUは、ラグナ州ロスバニョスにあるフィリピン大学オープン大学(UPOU)本部のデジタルツインで、Seizaの上に作られています。ほかの人といっしょにキャンパスを歩いたり、建物の中に入ったりできます。UPOUのことや道順は、チャンシー・ジョアンかディーン・ロブに何でも聞いてください。",
      asks: ["ここはどこ", "SeiOUって何", "ここで何ができる", "本物のキャンパス", "デジタルツイン"],
    },
  },
  {
    id: "upou",
    title: "UP Open University",
    answer:
      "UPOU is the University of the Philippines' open university, founded on 23 February 1995 as the fifth constituent university of the UP System. It grew out of the UP Distance Education Program, and teaches mostly online, through open and distance e-learning, so students can study from wherever they are.",
    asks: ["what is upou", "what is the open university", "when was upou founded", "history of upou", "tell me about upou", "up open university", "is upou part of up"],
    gesture: "raisehand",
    mood: "happy",
    ja: {
      title: "フィリピン大学オープン大学",
      answer:
        "UPOUはフィリピン大学(UP)のオープン大学で、1995年2月23日にUPシステムの5番目の構成大学として設立されました。UPの遠隔教育プログラムから生まれ、オープン・遠隔eラーニングで主にオンラインで教えているので、学生はどこからでも学べます。",
      asks: ["UPOUって何", "オープン大学とは", "UPOUはいつできた", "UPOUの歴史", "UPOUについて", "UPOUはUPの一部"],
    },
  },
  {
    id: "odl",
    title: "Open and distance e-learning",
    answer:
      "Open and distance e-learning means studying without having to be on campus: courses, materials, and discussions online, at times that fit around work and family. UPOU has led it in the Philippines, and the Open Distance Learning Act of 2014 (Republic Act 10650) gave it the job of helping CHED and TESDA with open and distance learning.",
    asks: ["how do i study at upou", "online learning", "distance education", "do i need to go to campus", "how are classes done", "odel", "ra 10650", "open distance learning act"],
    ja: {
      title: "オープン・遠隔eラーニング",
      answer:
        "オープン・遠隔eラーニングとは、キャンパスに通わずに学ぶことです。授業も教材も議論もオンラインで、仕事や家庭に合わせた時間に学べます。UPOUはフィリピンでこれを先導してきました。2014年のオープン遠隔学習法(共和国法10650号)により、CHEDとTESDAのオープン・遠隔学習を支援する役割も担っています。",
      asks: ["UPOUでどうやって勉強する", "オンライン学習", "遠隔教育", "キャンパスに行く必要は", "授業のやり方", "オープン遠隔学習法"],
    },
  },
  {
    id: "faculties",
    title: "The faculties",
    answer:
      "UPOU's teaching is in three faculties. The Faculty of Education covers areas such as distance education, language and literacy, and science and mathematics teaching. The Faculty of Information and Communication Studies covers communication, information systems, computer science, and multimedia. The Faculty of Management and Development Studies, formed in 2004, covers areas such as environment and natural resources management, public management, social work, and nursing. Their offices are in the Teaching and Learning Hub.",
    asks: ["what faculties are there", "what can i study", "programs", "courses offered", "faculty of education", "fics", "fmds", "fed", "degrees"],
    place: PLACES.tlh,
    ja: {
      title: "学部",
      answer:
        "UPOUの教育は3つの学部で行われています。教育学部は遠隔教育、言語とリテラシー、理数教育などの分野。情報コミュニケーション学部はコミュニケーション、情報システム、コンピューターサイエンス、マルチメディア。2004年にできた経営・開発学部は環境・天然資源管理、公共経営、ソーシャルワーク、看護などの分野です。学部の事務室はティーチング・アンド・ラーニング・ハブにあります。",
      asks: ["どんな学部がある", "何を勉強できる", "プログラム", "開講科目", "教育学部", "学位"],
    },
  },
  {
    id: "programs",
    title: "Programs and admission",
    answer:
      "UPOU offers undergraduate and graduate degrees, diplomas, and a professional teaching certificate, all studied mostly online, and free massive open online courses (MOOCs) anyone can take. Programs, deadlines, and fees change, so check upou.edu.ph for what's open now and how to apply.",
    asks: ["how do i apply", "admission", "enroll", "requirements", "tuition", "fees", "mooc", "free courses", "scholarship", "how to enrol", "paano mag enroll"],
    ja: {
      title: "プログラムと入学",
      answer:
        "UPOUでは学部と大学院の学位、ディプロマ、教員の専門資格を、主にオンラインで学べます。誰でも受けられる無料のMOOC(大規模公開オンライン講座)もあります。プログラムや締め切り、学費は変わるので、今募集しているものと出願方法は upou.edu.ph で確かめてください。",
      asks: ["どうやって出願する", "入学", "入学手続き", "必要書類", "学費", "無料の講座", "奨学金"],
    },
  },
  {
    id: "motto",
    title: "Honor, Excellence, Service",
    answer: "Honor, Excellence, Service is the University of the Philippines' motto, which UPOU shares.",
    asks: ["what is the motto", "upou motto", "honor excellence service"],
    ja: {
      title: "名誉・卓越・奉仕",
      answer:
        "「名誉・卓越・奉仕」(Honor, Excellence, Service)はフィリピン大学のモットーで、UPOUも同じです。",
      asks: ["モットーは", "UPOUのモットー", "校訓"],
    },
  },
  {
    id: "location",
    title: "Where UPOU is",
    answer:
      "UPOU's headquarters is on the National Highway in Barangay Maahas, Los Baños, Laguna, beside the International Rice Research Institute and near UP Los Baños. This campus is a model of it.",
    asks: ["where is upou", "address", "how do i get to upou", "location", "los banos", "irri", "nasaan ang upou", "directions to the real campus"],
    ja: {
      title: "UPOUの場所",
      answer:
        "UPOUの本部は、ラグナ州ロスバニョスのマーハス地区、ナショナル・ハイウェイ沿いにあります。国際稲研究所(IRRI)の隣で、UPロスバニョス校の近くです。このキャンパスはそれを再現したモデルです。",
      asks: ["UPOUはどこ", "住所", "UPOUへの行き方", "場所", "ロスバニョス", "国際稲研究所", "本物のキャンパスへの道"],
    },
  },
  {
    id: "oblation",
    title: "The Oblation",
    answer:
      "The Oblation is the University of the Philippines' symbol: a figure with open arms, offering himself in service to the country. The original, by the sculptor Guillermo Tolentino, stands in UP Diliman; UPOU's stands in the middle of the roundabout at the campus entrance.",
    asks: ["what is the oblation", "the statue", "oble", "who made the oblation", "the statue in the roundabout", "symbol of up"],
    place: PLACES.oblation,
    gesture: "point",
    mood: "happy",
    ja: {
      title: "オブレーション像",
      answer:
        "オブレーション像はフィリピン大学のシンボルで、両腕を広げ、国への奉仕に身をささげる姿です。彫刻家ギリェルモ・トレンティーノによるオリジナルはUPディリマン校にあり、UPOUの像はキャンパス入口のロータリーの中央に立っています。",
      asks: ["オブレーションって何", "あの像", "誰が作った", "ロータリーの像", "UPのシンボル"],
    },
  },
  {
    id: "main",
    title: "The Main Building",
    answer:
      "The Main Building is UPOU's address and home to its offices. Its name runs across the arch over the drive: University of the Philippines Open University. Walk through the passage under it to the courtyard beyond.",
    asks: ["main building", "administration", "offices", "where are the offices", "registrar", "admin building", "the big building with the sign"],
    place: PLACES.main,
    ja: {
      title: "本館",
      answer:
        "本館はUPOUの顔で、事務室が入っています。車道の上のアーチに「University of the Philippines Open University」の名前があります。その下の通路を抜けると中庭に出ます。",
      asks: ["本館", "事務局", "事務室", "事務室はどこ", "教務課", "看板のある大きな建物"],
    },
  },
  {
    id: "tlh",
    title: "The Teaching and Learning Hub",
    answer:
      "The Teaching and Learning Hub is the cluster of four octagonal pods south of the Main Building. It holds the offices of UPOU's three faculties: 30 faculty rooms, three deans' offices, and a meeting area for 12, with a loft that lets in air and light and looks out toward Mount Makiling. Its groundbreaking was part of UPOU's 22nd anniversary.",
    asks: ["teaching and learning hub", "tlh", "the pods", "the octagon buildings", "faculty offices", "where are the teachers", "deans office", "the red roofs"],
    place: PLACES.tlh,
    ja: {
      title: "ティーチング・アンド・ラーニング・ハブ",
      answer:
        "ティーチング・アンド・ラーニング・ハブは、本館の南にある4つの八角形の棟の集まりです。UPOUの3学部の事務室があり、教員室が30室、学部長室が3室、12人用の会議スペースがあります。ロフトから風と光が入り、マキリン山が見えます。起工式はUPOUの創立22周年行事のひとつでした。",
      asks: ["ティーチング・アンド・ラーニング・ハブ", "八角形の建物", "教員室", "学部の事務室はどこ", "先生はどこ", "学部長室", "赤い屋根"],
    },
  },
  {
    id: "ccdl",
    title: "The CCDL Auditorium",
    answer:
      "The Centennial Center for Digital Learning (CCDL) has UPOU's auditorium: a large air-conditioned hall with a stage, for conferences, seminars, and events of about 120 to 200 people. It's in the northeast of the campus, next to the Academic Residences.",
    asks: ["ccdl", "centennial center for digital learning", "auditorium", "where are events held", "the stage", "the hall for events", "seminar venue"],
    place: PLACES.ccdl,
    ja: {
      title: "CCDL講堂",
      answer:
        "センテニアル・センター・フォー・デジタル・ラーニング(CCDL)には、UPOUの講堂があります。ステージのある大きな冷房つきのホールで、120〜200人ほどの会議、セミナー、イベントに使われます。キャンパスの北東、アカデミック・レジデンスの隣です。",
      asks: ["CCDL", "講堂", "イベントはどこでやる", "ステージ", "イベントホール", "セミナー会場"],
    },
  },
  {
    id: "ccdlStage",
    title: "The CCDL stage",
    answer: "The stage is at the front of the CCDL Auditorium. I can take you up onto it.",
    asks: ["go on the stage", "take me to the stage", "ccdl stage", "podium"],
    place: PLACES.ccdlStage,
    ja: {
      title: "CCDLのステージ",
      answer:
        "ステージはCCDL講堂の前方にあります。ステージの上までお連れできますよ。",
      asks: ["ステージに上がりたい", "ステージに連れて行って", "CCDLのステージ", "演壇"],
    },
  },
  {
    id: "wcmpb",
    title: "The World-Class Multi-Purpose Building",
    answer:
      "The World-Class Multi-Purpose Building (WCMPB) is the large two-storey building in the south of the campus, with wide main stairs and a ramp at the front, a balcony and glass panels on the second floor, and a roof deck. I can take you up to the second floor or the roof deck too.",
    asks: ["wcmpb", "wpcmb", "world class multi purpose building", "world-class multipurpose building", "the big building in the south", "the building with the roof deck", "two storey building", "the ramp", "pwd ramp"],
    place: PLACES.wcmpb,
    ja: {
      title: "ワールドクラス多目的ビル",
      answer:
        "ワールドクラス多目的ビル(WCMPB)は、キャンパスの南にある大きな2階建ての建物です。正面に広い階段とスロープ、2階にバルコニーとガラスのパネル、そして屋上デッキがあります。2階や屋上デッキにもお連れできます。",
      asks: ["WCMPB", "多目的ビル", "南の大きな建物", "屋上デッキのある建物", "2階建ての建物", "スロープ"],
    },
  },
  {
    id: "upstairs",
    title: "Going upstairs",
    answer:
      "Every building has a lift kiosk on each floor: click a floor on it and you're there. Some floors you can also reach by the stairs, but the model doesn't include every staircase. I can take you up too: try the World-Class Multi-Purpose Building's roof deck, which looks out over the whole campus.",
    asks: ["how do i go upstairs", "second floor", "2nd floor", "third floor", "upper floors", "take me upstairs", "elevator", "lift", "stairs"],
    place: PLACES.wcmpb2F,
    gesture: "raisehand",
    mood: "happy",
    ja: {
      title: "上の階へ",
      answer:
        "どの建物も各階にエレベーターの案内板があり、階をクリックするとすぐその階に行けます。階段で行ける階もありますが、モデルにはすべての階段が入っているわけではありません。わたしがお連れすることもできます。キャンパス全体が見渡せる、ワールドクラス多目的ビルの屋上デッキがおすすめです。",
      asks: ["上の階に行くには", "2階", "3階", "上の階", "上に連れて行って", "エレベーター", "階段"],
    },
  },
  {
    id: "roof",
    title: "The roof deck",
    answer: "The roof deck of the World-Class Multi-Purpose Building looks out over the whole campus. I'll take you up.",
    asks: ["take me to the roof", "roof deck", "best view", "view of the campus", "rooftop"],
    place: PLACES.wcmpbRoof,
    gesture: "cheer",
    mood: "happy",
    ja: {
      title: "屋上デッキ",
      answer:
        "ワールドクラス多目的ビルの屋上デッキからは、キャンパス全体が見渡せます。お連れしますね。",
      asks: ["屋上に連れて行って", "屋上デッキ", "いちばんの眺め", "キャンパスの眺め", "屋上"],
    },
  },
  {
    id: "ar",
    title: "The Academic Residences",
    answer:
      "The Academic Residences (AR) is the long building in the northeast corner, with solar panels on its roof, beside the CCDL. It's guest lodging for people visiting on official UP System business or for academic reasons, and some UPOU staff rent rooms there long-term. Its cafeteria seats up to 60, for catered meals and meetings.",
    asks: ["ar building", "academic residences", "where do guests stay", "where can i stay", "lodging", "accommodation", "the building with solar panels", "cafeteria", "where can i eat", "canteen", "dormitory", "dorm"],
    place: PLACES.ar,
    ja: {
      title: "アカデミック・レジデンス",
      answer:
        "アカデミック・レジデンス(AR)は、キャンパス北東の角にある細長い建物で、屋根にソーラーパネルがあり、CCDLの隣です。UPシステムの公務や学術目的で訪れる人のための宿泊施設で、長期で部屋を借りているUPOUの職員もいます。カフェテリアは60人まで入れ、ケータリングの食事や会議に使われます。",
      asks: ["AR棟", "アカデミック・レジデンス", "ゲストはどこに泊まる", "泊まれる場所", "宿泊", "ソーラーパネルの建物", "カフェテリア", "どこで食べられる", "食堂", "寮"],
    },
  },
  {
    id: "rooms",
    title: "Rooms for events",
    answer:
      "UPOU lends out its rooms for events: the CCDL Auditorium for about 120 to 200 people; the Oblation Hall for round-table meetings and conferences of up to 100; the Audio-Visual Room for 100 to 150; the Sandbox, a small room for meetings, live streams, and podcasts; the Academic Residences' cafeteria for up to 60; and the Multi-Purpose Hall for sports and big gatherings. Bookings go through UPOU's office in the CCDL building.",
    asks: ["can i rent a room", "venue", "event venue", "book a room", "facilities for rent", "oblation hall", "sandbox", "audio visual room", "avr", "where can we hold an event"],
    ja: {
      title: "イベント用の部屋",
      answer:
        "UPOUはイベント用に部屋を貸し出しています。CCDL講堂は120〜200人ほど、オブレーション・ホールは100人までの円卓会議や会議、視聴覚室は100〜150人、サンドボックスは会議・ライブ配信・ポッドキャスト用の小部屋、アカデミック・レジデンスのカフェテリアは60人まで、多目的ホールはスポーツや大きな集まりに使えます。予約はCCDL棟にあるUPOUの事務室で受け付けています。",
      asks: ["部屋を借りられる", "会場", "イベント会場", "部屋の予約", "貸し出し施設", "オブレーション・ホール", "サンドボックス", "視聴覚室", "イベントを開ける場所"],
    },
  },
  {
    id: "mph",
    title: "The Multi-Purpose Hall",
    answer:
      "UPOU's Multi-Purpose Hall is a spacious venue for recreation and community activities: the university's anniversaries, staff and student sports matches, and big gatherings. It was inaugurated during UPOU's 22nd anniversary.",
    asks: ["multi purpose hall", "multipurpose hall", "mph", "sports", "where do they play basketball", "gym", "anniversary venue"],
    ja: {
      title: "多目的ホール",
      answer:
        "UPOUの多目的ホールは、レクリエーションや地域の活動のための広い会場です。大学の記念行事、職員や学生のスポーツの試合、大きな集まりに使われます。UPOUの創立22周年のときに開館しました。",
      asks: ["多目的ホール", "スポーツ", "バスケットボールはどこでする", "体育館", "記念行事の会場"],
    },
  },
  {
    id: "icc",
    title: "The International Convention Center",
    answer:
      "UPOU's International Convention Center is its venue for conferences on open and distance e-learning. It hosted its first commencement, UPOU's 29th, on 6 December 2025.",
    asks: ["international convention center", "icc", "convention center", "graduation", "commencement", "where is graduation held"],
    ja: {
      title: "国際コンベンションセンター",
      answer:
        "UPOUの国際コンベンションセンターは、オープン・遠隔eラーニングの会議の会場です。2025年12月6日に、ここで初めての卒業式(UPOU第29回卒業式)が開かれました。",
      asks: ["国際コンベンションセンター", "コンベンションセンター", "卒業式", "卒業式はどこ"],
    },
  },
  {
    id: "tour",
    title: "A tour",
    answer:
      "Start at the Oblation in the roundabout, then the Main Building under the arch. South of it are the four pods of the Teaching and Learning Hub. Northeast are the CCDL Auditorium and the AR building, and south is the World-Class Multi-Purpose Building, whose roof deck has the best view. Ask me to walk you to any of them.",
    asks: ["give me a tour", "show me around", "where should i go", "what should i see", "what buildings are there", "campus map", "list of buildings", "pasyal"],
    place: PLACES.oblation,
    gesture: "raisehand",
    mood: "happy",
    ja: {
      title: "キャンパスめぐり",
      answer:
        "まずロータリーのオブレーション像から。次にアーチの下の本館へ。その南にティーチング・アンド・ラーニング・ハブの4つの棟があります。北東にCCDL講堂とAR棟、南にワールドクラス多目的ビルがあり、その屋上デッキからの眺めがいちばんです。どこへでも歩いてご案内しますよ。",
      asks: ["案内して", "キャンパスを見せて", "どこに行けばいい", "何を見ればいい", "どんな建物がある", "キャンパスマップ", "建物の一覧"],
    },
  },
  {
    id: "controls",
    title: "Getting around",
    answer:
      "Walk with W A S D or the arrow keys, run with Shift, and drag to look around. Double-click anywhere on the ground and you'll walk there along the paths, into buildings too. On a phone, use the pad at the bottom. Or ask Chancy Joan or Dean Rob to walk you somewhere.",
    asks: ["how do i move", "how to walk", "controls", "how do i run", "keyboard", "paano maglakad", "how do i get inside"],
    ja: {
      title: "移動のしかた",
      answer:
        "W・A・S・Dか矢印キーで歩き、Shiftで走り、ドラッグで見回します。地面のどこかをダブルクリックすると、道に沿ってそこまで歩きます。建物の中へも行けます。スマホでは下のパッドを使ってください。チャンシー・ジョアンやディーン・ロブに案内を頼むこともできます。",
      asks: ["どうやって動く", "歩き方", "操作方法", "走り方", "キーボード", "建物に入るには"],
    },
  },
  {
    id: "voice",
    title: "Talking to people",
    answer: "Press Voice at the bottom to talk; people nearby hear you louder than people far away. Chat is next to it if you'd rather type. Gestures has waves, bows, and dances.",
    asks: ["how do i talk", "voice chat", "microphone", "how to chat", "gestures", "how do i wave"],
    ja: {
      title: "ほかの人と話す",
      answer:
        "下の「ボイス」を押すと話せます。近くの人ほど大きく聞こえます。文字で話したいときは、その隣の「チャット」へ。「ジェスチャー」には手を振る、お辞儀、ダンスなどがあります。",
      asks: ["どうやって話す", "ボイスチャット", "マイク", "チャットのしかた", "ジェスチャー", "手を振るには"],
    },
  },
  {
    id: "joke",
    title: "A joke",
    answer: "Why did the student bring a ladder to an online class? They heard it was a higher education. (I'll stick to directions.)",
    asks: ["tell me a joke", "say something funny", "make me laugh", "joke", "biro"],
    gesture: "cheer",
    mood: "happy",
    ja: {
      title: "ジョーク",
      answer:
        "オンライン授業にはしごを持ってきた学生がいました。「高等教育」だと聞いたからだそうです。(道案内に専念しますね。)",
      asks: ["ジョークを言って", "何かおもしろいこと", "笑わせて", "冗談"],
    },
  },
];

const KNOWLEDGE: Knowledge = {
  topics: TOPICS,
  starters: ["Give me a tour", "What is UPOU?", "Where are the faculty offices?", "Take me to the roof deck", "How do I apply?", "What is the Oblation?"],
  subject: "UPOU, this campus, and finding your way",
  startersJa: ["キャンパスを案内して", "UPOUって何?", "学部の事務室はどこ?", "屋上デッキに連れて行って", "どうやって出願する?", "オブレーション像って何?"],
  subjectJa: "UPOUとこのキャンパス、そして道案内",
  synonyms: {
    oble: "oblation", estatwa: "statue", bulwagan: "auditorium", entablado: "stage", itaas: "upstairs", taas: "upstairs", bubungan: "roof",
    tlh: "tlh", pods: "pod", octagon: "octagonal", octagonal: "octagonal", enroll: "apply", enrol: "apply", enrolment: "apply", admissions: "admission",
    dorm: "dormitory", dormitories: "dormitory", graduation: "commencement",
  },
};

export function seiouKnowledge(): Knowledge {
  return KNOWLEDGE;
}

// --- the guides --------------------------------------------------------------------------------

export const CHANCY: Persona = {
  name: "Chancy Joan",
  self: "I'm Chancy Joan, one of SeiOU's guides. You'll usually find me here where visitors arrive, and I can walk you anywhere on campus. Everything I say was written for this world, so if I don't know something, I'll tell you.",
  invite: "Ask me about UPOU, or where anything is on campus. I can walk you there.",
  nameJa: "チャンシー・ジョアン",
  selfJa:
    "チャンシー・ジョアンです。SeiOUのガイドのひとりです。たいてい、みなさんが到着するこの場所にいて、キャンパスのどこへでも歩いてご案内できます。話すことはすべてこのワールドのために書かれたものなので、知らないことは知らないとお伝えしますね。",
  inviteJa: "UPOUのことや、キャンパスのどこに何があるか聞いてください。そこまで歩いてご案内します。",
};

export const DEAN_ROB: Persona = {
  name: "Dean Rob",
  self: "I'm Dean Rob, one of SeiOU's guides. You'll usually find me here where visitors arrive. Ask me about UPOU or the way anywhere, and I'll walk you there. If I don't know something, I'll say so.",
  invite: "Ask me about UPOU, its buildings, or the way anywhere on campus.",
  nameJa: "ディーン・ロブ",
  selfJa:
    "ディーン・ロブです。SeiOUのガイドのひとりで、たいてい、みなさんが到着するこの場所にいます。UPOUのことやどこかへの道を聞いてくれれば、歩いてご案内します。知らないことは、知らないと言いますね。",
  inviteJa: "UPOUや建物のこと、キャンパスのどこへの道でも聞いてください。",
};

/** For now the CC0 VRoid Studio samples (pixiv Inc.) the world offers as
 *  avatars; their own Avaturn avatars can replace these later (upload
 *  them as .vrm and change the URLs). */
export const CHANCY_AVATAR = "/avatars/vroid/sample-female.vrm";
export const DEAN_ROB_AVATAR = "/avatars/vroid/sample-male.vrm";

const stop = (at: [number, number, number], wait: number): Stop => ({ at, wait });

/** Where visitors arrive (world.json), which the guides face. */
export const SPAWN: [number, number] = [66, 0];

/** Each guide's day: mostly at home, in front of where visitors arrive,
 *  with a short stroll now and then. Home is the first stop. */
export const CHANCY_ROUTE: Stop[] = [stop([71.5, 0.2, -1.8], 300), stop([95, 0.2, -3], 20), stop([71.5, 0.2, -1.8], 300), stop([30, 0.2, -6], 20)];
export const DEAN_ROB_ROUTE: Stop[] = [stop([71.5, 0.2, 1.8], 360), stop([124, 0.2, 52], 25), stop([71.5, 0.2, 1.8], 360), stop([58, 0.2, 16], 15)];
