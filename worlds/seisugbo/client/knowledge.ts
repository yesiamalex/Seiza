// What Tala knows: the 2nd Meiji × UP Arts-Based Research Forum (Cebu,
// 3–5 November 2026) and its Urbanity Walk, the places it passed, the art
// and this world, and how Seisugbo reads as design science research.
// Every answer is written here, from the forum's own posts and the
// world's boards (info.ts); the landmarks' history is the well-known
// outline only. Edit freely. The Japanese sits beside each answer.
import type { Knowledge, Topic } from "../../../src/guides/brain";
import { PIECE_BY_ID } from "./collection";
import { boardText, type BoardKey } from "./info";
import { PLACES } from "./guide";
import { TOUR } from "./plan";

/** The walking tour's photos, in walking order, for the "tour" card. */
export const TOUR_IDS = TOUR.map((t) => t.id);

const TOPICS: Topic[] = [
  // --- this world --------------------------------------------------------------------------------
  {
    id: "world",
    title: "About Seisugbo",
    answer:
      "Seisugbo keeps the 2nd Meiji × UP Arts-Based Research Forum, held in Cebu in November 2026, open to everyone. Students from Meiji University and the University of the Philippines walked downtown Cebu together, then made art about what stayed with them, naming each piece in Japanese, English, and Filipino or Cebuano. Here you can walk a lane built from their photos, see their art hung on sampayan in a covered court, and step through portals to their FrameVR spaces. Sugbo is Cebu's old name.",
    asks: ["what is seisugbo", "seisugbo", "tell me about seisugbo", "what is this place", "where am i", "what is this world about", "what is this", "sugbo", "why is it called seisugbo"],
    card: "board:welcome",
    place: PLACES.welcome,
    gesture: "wave",
    mood: "happy",
    ja: {
      title: "Seisugboについて",
      answer:
        "Seisugboは、2026年11月にセブで開かれた第2回明治×UPアートベース・リサーチ・フォーラムを、だれでも訪れられるように残す場所です。明治大学とフィリピン大学の学生がセブの下町をいっしょに歩き、心に残ったものを作品にして、日本語、英語、フィリピン語かセブアノ語で名前をつけました。ここでは、学生たちの写真から作った路地を歩き、屋根つきコートのサンパヤンに掛かった作品を見て、ポータルからFrameVRの空間へ行けます。「スグボ」はセブの古い名前です。",
      asks: ["Seisugboって何", "ここはどこ", "このワールドは何", "スグボって何", "名前の由来"],
    },
  },
  {
    id: "tour",
    title: "A tour",
    answer:
      "Start at the welcome board by the tent. Then walk through the arch and down the lane: the walking tour's photos stand along it, in the order they were taken. At the end, turn into the covered court, where each group's art hangs on its own line, and the collage wall at the far end. On the way back, the four portals by the path go to each group's FrameVR space. Up the garden steps are the hall, with how the work was made, and the classroom, with questions to talk about. Ask me to walk you to any of them.",
    asks: ["give me a tour", "where should i go", "what should i see first", "show me around", "where to start", "pasyal", "annai shite"],
    place: PLACES.welcome,
    gesture: "raisehand",
    mood: "happy",
    ja: {
      title: "ワールドめぐり",
      answer:
        "まずテントのそばの案内板から。アーチをくぐって路地へ進むと、まち歩きの写真が撮った順に並んでいます。突き当たりで屋根つきコートに入ると、グループごとの作品がそれぞれのロープに掛かり、奥にはコラージュの壁があります。帰りに、小道のそばの4つのポータルから各グループのFrameVR空間へ行けます。庭の階段を上がると、作品の作り方を紹介するホールと、話し合いの問いがある教室があります。どこへでも歩いてご案内しますよ。",
      asks: ["案内して", "どこに行けばいい", "最初に何を見ればいい", "見せて回って", "どこから始める"],
    },
  },
  {
    id: "lane",
    title: "The lane",
    answer:
      "The lane is a model, not one real street: houses built close together, wires overhead, fiesta bunting, washing out to dry, a sari-sari store on the corner, and bulad, dried fish, on a rack. It's built from what the students photographed and drew, Group D's Energy most of all. The eleven photos along it are from the walk: the first is the whole group at the Heritage of Cebu Monument in Parián, setting out. Click one to see it up close.",
    asks: ["the lane", "the street", "eskinita", "walking tour photos", "where are the photos", "is the lane real", "sari sari store", "bulad", "dried fish"],
    card: "tour",
    place: PLACES.lane,
    ja: {
      title: "路地",
      answer:
        "この路地はモデルで、実在の一本の通りではありません。身を寄せ合う家々、頭上の電線、フィエスタの旗飾り、干された洗濯物、角のサリサリストア、そして棚に並ぶブラッド(干し魚)。学生たちが撮った写真や描いた絵、とくにDグループの「活気」をもとに作りました。路地に並ぶ11枚の写真はまち歩きのときのもので、最初の1枚はパリアンのヘリテージ・オブ・セブ・モニュメントに集まった出発前の全員です。クリックすると大きく見られます。",
      asks: ["路地", "通り", "まち歩きの写真", "写真はどこ", "路地は本物", "サリサリストア", "干し魚"],
    },
  },
  {
    id: "court",
    title: "The covered court",
    answer:
      "Every barangay has a covered court, for basketball, fiestas, and meetings. Here it's given over to the exhibition. Each group's art hangs on its own sampayan, a clothesline, the way washing hangs in the lane, with the words its makers chose under each piece in their three languages. Group A's line is nearest the lane, then B, C, and D. Click a piece to see it up close.",
    asks: ["the court", "covered court", "where is the art", "show me the art", "see the art", "artworks", "the art", "exhibition", "sampayan", "clothesline", "basketball court"],
    card: "board:court",
    place: PLACES.court,
    ja: {
      title: "屋根つきコート",
      answer:
        "どのバランガイにも屋根つきコートがあり、バスケットボールやフィエスタ、集会に使われます。ここでは展覧会の会場です。グループごとの作品が、路地の洗濯物のようにそれぞれのサンパヤン(物干しロープ)に掛かり、下には作り手が3つの言葉で選んだ言葉があります。路地にいちばん近いのがAグループ、次にB、C、Dです。作品をクリックすると大きく見られます。",
      asks: ["コート", "屋根つきコート", "作品はどこ", "作品を見せて", "展覧会", "サンパヤン", "物干しロープ"],
    },
  },
  {
    id: "groups",
    title: "The four groups",
    answer:
      "The students worked in four groups. Group A used crayon, clay, origami, and wrote a poem in Cebuano: 'Sun within our blood, roots anchored deep in the past, my Cebu, myself.' Group B put everything on one board and drew each other's faces side by side. Group C made collages, paper chains, and bulad cut out to hang. Group D tore paper, used pastel, and answered with a dance.",
    asks: ["the groups", "group a", "group b", "group c", "group d", "who made the art", "what did they make", "the poem", "the dance"],
    place: PLACES.court,
    ja: {
      title: "4つのグループ",
      answer:
        "学生たちは、4つのグループで制作しました。Aグループはクレヨン、粘土、折り紙を使い、セブアノ語の詩を書きました。「血の中の太陽、過去に深く張った根、わたしのセブ、わたし自身」。Bグループはすべてを1枚のボードにまとめ、おたがいの顔を並べて描きました。Cグループはコラージュ、紙の鎖、吊るすために切り抜いたブラッドを作りました。Dグループはちぎり絵とパステル、そしてダンスで応えました。",
      asks: ["グループ", "Aグループ", "Bグループ", "Cグループ", "Dグループ", "だれが作った", "何を作った", "詩", "ダンス"],
    },
  },
  {
    id: "collage",
    title: "The collage wall",
    answer:
      "At the far end of the court, Group A's collage wall: photos from home and from Cebu, drawn over and taped up side by side. The cafés Cebu's students love, the night breeze, the season each of us misses, and an encyclopedia of each other.",
    asks: ["collage wall", "show me the collage", "collage", "posters", "cork board", "my encyclopedia", "i miss winter"],
    card: "board:posters",
    place: PLACES.collage,
    ja: {
      title: "コラージュの壁",
      answer: "コートの奥にある、Aグループのコラージュの壁です。ふるさとの写真とセブの写真に絵を描き重ね、並べて貼りました。セブの学生が大好きなカフェ、夜風、それぞれが恋しい季節、そしておたがいの百科事典。",
      asks: ["コラージュの壁", "ポスター", "コルクボード", "百科事典"],
    },
  },
  {
    id: "languages",
    title: "Three languages",
    answer:
      "Every piece is named in three languages: Japanese, English, and Filipino or Cebuano, chosen together by its makers. Naming it was part of the research: finding a word that holds in every language means talking about what the piece really is. Connection comes up again and again: つながり, koneksyon, pakiglabot, sumpay-sumpay.",
    asks: ["why three languages", "what languages", "the words under the art", "word cards", "cebuano", "bisaya", "japanese words"],
    ja: {
      title: "3つの言葉",
      answer:
        "どの作品にも、日本語、英語、フィリピン語かセブアノ語の3つの名前があり、作り手がいっしょに選びました。名づけることも研究の一部です。どの言葉でも通じる一語を探すには、その作品が本当は何なのかを話し合うことになるからです。何度も出てくるのは「つながり」:koneksyon、pakiglabot、sumpay-sumpay。",
      asks: ["なぜ3つの言葉", "何語", "作品の下の言葉", "セブアノ語", "日本語の言葉"],
    },
  },
  {
    id: "portals",
    title: "The FrameVR portals",
    answer:
      "Four portals stand by the path, one for each group in its colour. On the forum's last day, the groups began virtual exhibitions in FrameVR, a browser-based 3D space, of their visions for downtown Cebu. Click a portal and its group's space opens in a new tab, so this world stays open behind it. In a headset, exit VR first.",
    asks: ["portals", "framevr", "frame vr", "the swirls", "group spaces", "virtual exhibition", "where are the portals"],
    card: "portal:A",
    place: PLACES.portals,
    ja: {
      title: "FrameVRへのポータル",
      answer:
        "小道のそばに、グループごとの色のポータルが4つあります。フォーラムの最終日、各グループはブラウザで動く3D空間FrameVRで、下町セブの未来像を見せるバーチャル展覧会を作りはじめました。ポータルをクリックすると、そのグループの空間が新しいタブで開き、このワールドは後ろに残ります。ヘッドセットでは、先にVRを終了してください。",
      asks: ["ポータル", "FrameVR", "グループの空間", "バーチャル展覧会", "ポータルはどこ"],
    },
  },
  {
    id: "talk",
    title: "Let's talk",
    answer:
      "In the classroom, up the garden steps, the Let's talk board has three rounds of questions in English and Filipino: getting to know each other, a cultural exchange, and the metaverse. Find a partner from another country and ask each other in turn. The forum began the same way, over Japanese and Cebuano snacks.",
    asks: ["lets talk", "talk prompts", "conversation questions", "classroom", "icebreaker", "what can we talk about"],
    card: "board:talk",
    place: PLACES.classroom,
    ja: {
      title: "話そう",
      answer:
        "庭の階段を上がった教室の「話そう」ボードに、英語とフィリピン語の問いが3ラウンドあります。おたがいを知る、文化の交流、そしてメタバース。ほかの国の人とペアになって、交代で聞いてみましょう。フォーラムも、日本とセブのお菓子を囲んで同じように始まりました。",
      asks: ["話そう", "話し合いの問い", "会話の質問", "教室", "アイスブレイク", "何を話せばいい"],
    },
  },

  // --- the forum --------------------------------------------------------------------------------
  {
    id: "forum",
    title: "The Meiji × UP forum",
    answer:
      "The 2nd Meiji × University of the Philippines Arts-Based Research Forum ran from 3 to 5 November 2026 at UP Cebu, on the theme 'Reimagining Downtown Cebu: Arts-Based Research and Intercultural Dialogue for a More Livable City.' Over three days, students and faculty from the Philippines, Japan, and Hawai'i used arts-based research, immersive technologies, and science communication to imagine a livable, climate-resilient downtown Cebu: first talks, then the Urbanity Walk, then the metaverse.",
    asks: ["the forum", "meiji x up", "when was it", "the event", "what was the theme", "reimagining downtown cebu", "second forum"],
    gesture: "raisehand",
    ja: {
      title: "ABRフォーラム",
      answer:
        "第2回明治×フィリピン大学アートベース・リサーチ・フォーラムは、2026年11月3日から5日まで、UPセブで開かれました。テーマは「下町セブを描き直す:より住みよい都市のためのアートベース・リサーチと異文化対話」。3日間、フィリピン、日本、ハワイの学生と教員が、アートベース・リサーチ、没入型技術、サイエンス・コミュニケーションを使って、住みよく気候にしなやかな下町セブを思い描きました。1日目は講演、2日目はアーバニティ・ウォーク、3日目はメタバースです。",
      asks: ["フォーラム", "ABRフォーラム", "明治×UP", "何があった", "いつ", "イベント", "テーマは"],
    },
  },
  {
    id: "organizers",
    title: "Who organized it",
    answer:
      "Meiji University's Institute for Global Diversity, Education, & Research organized it, with UP Open University's Faculty of Information and Communication Studies (FICS) and UP Cebu's College of Communication, Art, and Design (CCAD). UP Cebu hosted, through CCAD, and designed the Urbanity Walk. The metaverse workshop was led by ISCOLab, from UPOU.",
    asks: ["who organized it", "organizers", "who hosted", "meiji university", "upou", "up cebu", "ccad", "fics", "partners"],
    ja: {
      title: "主催",
      answer:
        "主催は明治大学の国際多様性・教育・研究インスティテュートで、UPオープン大学の情報コミュニケーション学部(FICS)と、UPセブのコミュニケーション・アート・デザイン学部(CCAD)が協力しました。会場はUPセブで、CCADがアーバニティ・ウォークを設計しました。メタバースのワークショップは、UPOUのISCOLabが担当しました。",
      asks: ["主催は", "だれが開いた", "明治大学", "UPOU", "UPセブ", "CCAD", "FICS"],
    },
  },
  {
    id: "participants",
    title: "Who took part",
    answer:
      "27 participants from Meiji University, 12 students from UP Cebu, and 3 students from UP Open University, with faculty from each: people from the Philippines, Japan, and Hawai'i.",
    asks: ["who took part", "participants", "how many students", "who joined", "who was there", "how many people"],
    ja: {
      title: "参加者",
      answer: "明治大学から27人、UPセブの学生12人、UPオープン大学の学生3人、そして教員たち。フィリピン、日本、ハワイから集まりました。",
      asks: ["参加者", "何人", "だれが参加した", "学生は何人"],
    },
  },
  {
    id: "day1",
    title: "Day one",
    answer:
      "The forum opened on 3 November with an afternoon of talks and hands-on practice in arts-based research: mini practices, and sharing experiences. In her opening message, CCAD Dean Crina Tañongon said the forum 'reflects that interdisciplinary spirit and invites us to consider how creative practices can open new pathways for learning, research, and collaboration.' Everyone got to know each other over Japanese and Cebuano snacks.",
    asks: ["day one", "day 1", "first day", "what happened on day one", "opening", "how did it start", "opening message", "dean tanongon", "snacks"],
    ja: {
      title: "1日目",
      answer:
        "フォーラムは11月3日、アートベース・リサーチの講演と実習の午後で始まりました。小さな実践と、経験の分かち合いです。CCADのクリナ・タニョンゴン学部長は開会のあいさつで、このフォーラムは「学際の精神を映し、創造的な実践が学び、研究、協働に新しい道を開くことを考えさせてくれる」と述べました。日本とセブのお菓子を囲んで、おたがいを知る時間もありました。",
      asks: ["1日目", "初日", "開会", "どう始まった", "あいさつ", "お菓子"],
    },
  },
  {
    id: "walk",
    title: "The Urbanity Walk",
    answer:
      "On day two, UP Cebu's CCAD led everyone on the Urbanity Walk: an ethnographic walk through 22 stops across downtown Cebu, to see how the city's history and culture shape the way people live there now. It set out from the Heritage of Cebu Monument in Parián and passed Magellan's Cross and the Basilica Minore del Santo Niño, with lunch at Puso Village. The photos along the lane are from that walk.",
    asks: ["urbanity walk", "the walk", "walking tour", "what was the walk", "where did they walk", "how many stops", "ethnographic walk", "downtown cebu", "day two", "day 2"],
    card: "tour",
    place: PLACES.lane,
    gesture: "point",
    mood: "happy",
    ja: {
      title: "アーバニティ・ウォーク",
      answer:
        "2日目、UPセブのCCADの案内で、全員がアーバニティ・ウォークに出ました。下町セブの22か所をめぐるエスノグラフィー(民族誌)的なまち歩きで、街の歴史と文化が今の暮らしをどう形づくっているかを見るものです。パリアンのヘリテージ・オブ・セブ・モニュメントから出発し、マゼランの十字架とサント・ニーニョ教会を訪れ、昼食はプソ・ビレッジでした。路地の写真は、そのときのものです。",
      asks: ["アーバニティ・ウォーク", "まち歩き", "どこを歩いた", "何か所", "下町セブ", "2日目"],
    },
  },
  {
    id: "parian",
    title: "Parián and the Heritage of Cebu Monument",
    answer:
      "The walk set out from the Heritage of Cebu Monument in Parián, once the city's old Chinese quarter. The monument, by the sculptor Eduardo Castrillo, tells Cebu's history in one sculpted scene, from before the Spanish to the present. The first photo along the lane is the whole group there.",
    asks: ["parian", "heritage of cebu monument", "where did the walk start", "first stop", "the monument"],
    card: "a1",
    place: PLACES.lane,
    ja: {
      title: "パリアンとヘリテージ・オブ・セブ・モニュメント",
      answer:
        "まち歩きは、かつて中国系の人びとの街だったパリアンにある、ヘリテージ・オブ・セブ・モニュメントから始まりました。彫刻家エドゥアルド・カストリージョによる記念碑で、スペイン人が来る前から現在までのセブの歴史を、ひとつの彫刻の場面で語っています。路地の最初の写真は、そこに集まった全員です。",
      asks: ["パリアン", "モニュメント", "どこから出発した", "最初の場所"],
    },
  },
  {
    id: "cross",
    title: "Magellan's Cross",
    answer:
      "Magellan's Cross stands in a small chapel in downtown Cebu. It was planted by the explorers of Ferdinand Magellan's expedition when they reached Cebu in 1521, marking the first Christian baptisms in the Philippines. The cross shown today is said to encase the original, and a painted ceiling above tells the story. It's one of the stops the walk passed.",
    asks: ["magellans cross", "magellan", "the cross", "1521", "krus"],
    ja: {
      title: "マゼランの十字架",
      answer:
        "マゼランの十字架は、下町セブの小さな礼拝堂の中にあります。1521年、フェルディナンド・マゼランの遠征隊がセブに着いたときに立てたもので、フィリピンで最初のキリスト教の洗礼を記念しています。今見られる十字架は元の十字架を中に包んでいるといわれ、天井の絵がその物語を伝えています。まち歩きで訪れた場所のひとつです。",
      asks: ["マゼランの十字架", "マゼラン", "十字架"],
    },
  },
  {
    id: "basilica",
    title: "The Basilica Minore del Santo Niño",
    answer:
      "Next to Magellan's Cross, the Basilica Minore del Santo Niño is often called the oldest Roman Catholic church in the Philippines, founded in 1565. It keeps the Santo Niño de Cebu, an image of the Child Jesus first given as a baptismal gift in 1521. Every January, Cebu's Sinulog festival dances in its honour.",
    asks: ["basilica", "santo nino", "the church", "oldest church", "sinulog", "simbahan"],
    ja: {
      title: "サント・ニーニョ教会(バシリカ・ミノレ)",
      answer:
        "マゼランの十字架のとなりにあるバシリカ・ミノレ・デル・サント・ニーニョは、1565年創建で、フィリピン最古のカトリック教会といわれています。1521年に洗礼の贈りものとして渡された幼子イエスの像、サント・ニーニョ・デ・セブを守っています。毎年1月には、セブのシヌログ祭りがこの像をたたえて踊ります。",
      asks: ["教会", "サント・ニーニョ", "いちばん古い教会", "シヌログ"],
    },
  },
  {
    id: "puso",
    title: "Puso Village and tuslob buwa",
    answer:
      "Lunch on the walk was at Puso Village, where the Meiji students tried tuslob buwa, one of Cebu's iconic street foods. Its name means 'dip in the bubbles': you dip puso, rice cooked in a little pouch woven from coconut leaves, into a rich sauce bubbling in a shared pan. It started in Pasil, in Cebu City, and it's eaten together, round the pan.",
    asks: ["puso village", "tuslob buwa", "lunch", "what did they eat", "food", "puso", "hanging rice", "street food", "pagkaon"],
    mood: "happy",
    gesture: "clap",
    ja: {
      title: "プソ・ビレッジとトゥスロブ・ブワ",
      answer:
        "まち歩きの昼食はプソ・ビレッジで、明治の学生たちはセブ名物の屋台料理トゥスロブ・ブワを味わいました。名前は「泡にひたす」という意味です。ヤシの葉で編んだ小さな袋で炊いたごはん「プソ」を、みんなで囲む鍋でぐつぐつ煮立つ濃いソースにひたして食べます。セブ市のパシルで生まれた料理で、鍋を囲んでいっしょに食べるものです。",
      asks: ["プソ・ビレッジ", "トゥスロブ・ブワ", "昼ごはん", "何を食べた", "食べもの", "プソ"],
    },
  },
  {
    id: "capitol",
    title: "The Cebu Provincial Capitol",
    answer:
      "The Cebu Provincial Capitol, headed by Governor Pamela Baricuatro, opened its doors to the forum. The Provincial Tourism Office welcomed everyone and gave them a tour. The Capitol, the seat of Cebu's provincial government, is a 1930s landmark designed by the architect Juan Arellano. Daghang salamat, arigatō gozaimasu!",
    asks: ["capitol", "provincial capitol", "governor", "baricuatro", "tourism office", "kapitolyo"],
    ja: {
      title: "セブ州庁舎",
      answer:
        "パメラ・バリクアトロ知事のセブ州庁舎が、フォーラムの参加者に扉を開いてくれました。州の観光局が出迎え、庁舎を案内しました。州庁舎はセブ州政府の本拠で、建築家フアン・アレリャーノが設計した1930年代の名建築です。ダガン・サラマット、ありがとうございました!",
      asks: ["州庁舎", "キャピトル", "知事", "観光局"],
    },
  },
  {
    id: "metaverse",
    title: "The metaverse workshop",
    answer:
      "On the third and last day, FICS Dean Roberto B. Figueroa Jr. led a metaverse workshop at UP Cebu. Participants explored existing FrameVR environments for inspiration, then began building a virtual exhibition of their visions for the future of downtown Cebu. It was run by ISCOLab, from UP Open University. The four portals here lead to those spaces.",
    asks: ["metaverse workshop", "day three", "day 3", "last day", "who led the workshop", "dean figueroa", "dean rob", "metaverse"],
    card: "portal:A",
    place: PLACES.portals,
    ja: {
      title: "メタバースのワークショップ",
      answer:
        "3日目、最終日には、FICSのロベルト・B・フィゲロア・ジュニア学部長がUPセブでメタバースのワークショップを行いました。参加者はFrameVRの既存の空間を見て回って着想を得てから、下町セブの未来像を見せるバーチャル展覧会を作りはじめました。運営はUPオープン大学のISCOLabです。ここの4つのポータルは、その空間へつながっています。",
      asks: ["メタバースのワークショップ", "3日目", "最終日", "だれが指導した", "フィゲロア学部長", "メタバース"],
    },
  },
  {
    id: "iscolab",
    title: "ISCOLab",
    answer:
      "ISCOLab, the Immersive Science Communication Open Laboratory, is a flagship project of UP Open University's Immersive Open Pedagogies (IOP) Collective Mentorship Program. It led the forum's metaverse workshop.",
    asks: ["iscolab", "immersive science communication", "iop", "immersive open pedagogies", "mentorship program"],
    ja: {
      title: "ISCOLab",
      answer:
        "ISCOLab(イマーシブ・サイエンス・コミュニケーション・オープン・ラボ)は、UPオープン大学のイマーシブ・オープン・ペダゴジー(IOP)共同メンターシップ・プログラムの中心となるプロジェクトです。フォーラムのメタバースのワークショップを担当しました。",
      asks: ["ISCOLab", "IOP", "メンターシップ"],
    },
  },
  {
    id: "closing",
    title: "How it ended",
    answer:
      "The forum closed on Thursday afternoon, 5 November. The groups presented their reimagined downtown Cebu through FrameVR and other creative techniques, then shared a light moment at UP Cebu's Oblation Square. It wasn't goodbye, the hosts said, but the start of a new journey and more collaboration. Mata ne!",
    asks: ["how did it end", "closing", "last day", "oblation", "goodbye", "mata ne", "presentations"],
    gesture: "wave",
    mood: "happy",
    ja: {
      title: "フォーラムの終わり",
      answer:
        "フォーラムは11月5日、木曜日の午後に閉会しました。各グループがFrameVRやほかの創造的な手法で描き直した下町セブを発表し、UPセブのオブレーション広場でなごやかなひとときを過ごしました。主催者は「さよならではなく、新しい旅とさらなる協働の始まり」と語りました。またね!",
      asks: ["どう終わった", "閉会", "オブレーション", "さよなら", "またね", "発表"],
    },
  },
  {
    id: "climate",
    title: "A climate-resilient, livable Cebu",
    answer:
      "Underneath the art were hard questions: climate change, flooding, and what makes a city livable. The forum asked what creative people can add to designing a city's future, and its hashtags named the goal: livable cities, and SDG 11, the UN's goal to make cities and human settlements inclusive, safe, resilient, and sustainable. Downtown Cebu is old, dense, and close to the sea, so those questions are real there.",
    asks: ["climate change", "flooding", "climate resilient", "livable city", "sdg 11", "sustainable cities", "why downtown cebu", "baha", "urban livability"],
    ja: {
      title: "気候にしなやかで住みよいセブ",
      answer:
        "作品の下には、むずかしい問いがありました。気候変動、洪水、そして都市を住みよくするものは何か。フォーラムは、創造的な人たちが都市の未来づくりに何を加えられるかを問い、目標を掲げました。住みよい都市、そしてSDG 11:都市と人の住む場所を、包摂的で安全、強靱で持続可能にする国連の目標です。下町セブは古く、密集し、海に近いので、これらの問いは現実のものです。",
      asks: ["気候変動", "洪水", "住みよい都市", "SDG 11", "持続可能な都市", "なぜ下町セブ"],
    },
  },

  // --- the research --------------------------------------------------------------------------------
  {
    id: "abr",
    title: "Arts-based research",
    answer:
      "Arts-based research uses making art as a way of finding out, and of saying what's hard to put in a report. Here it went: walk the city together; notice what stays with you, a smell, a face, a colour, a word; make something of it in crayon, clay, torn paper, origami, collage, or dance; name it in three languages; and share it, in an exhibition, a talkback, and now this world. The board in the hall has it step by step.",
    asks: ["arts based research", "abr", "what is abr", "how was the art made", "the method", "research through making", "how was this made"],
    card: "board:process",
    place: PLACES.hall,
    ja: {
      title: "アートベース・リサーチ",
      answer:
        "アートベース・リサーチは、作品を作ることを、知る方法として、そして報告書では言いにくいことを伝える方法として使う研究です。ここでは、街をいっしょに歩き、心に残ったもの(におい、顔、色、言葉)に気づき、それをクレヨン、粘土、ちぎり絵、折り紙、コラージュ、ダンスで形にし、3つの言葉で名づけ、展覧会と話し合い、そしてこのワールドで分かち合いました。ホールの案内板に順を追って書いてあります。",
      asks: ["アートベース・リサーチ", "ABRって何", "作品はどう作られた", "方法", "アートで研究"],
    },
  },
  {
    id: "dsr",
    title: "Design science research",
    answer:
      "Design science research, DSR, is an iterative, problem-solving way of doing research: you build a purposeful artifact to solve a practical problem, evaluate it, and learn prescriptive knowledge from it, knowledge of how to build such things well. Behavioural and natural sciences mostly explain or predict how things are; DSR designs how things ought to be, to improve what people and organizations can do. A common outline runs in six steps: identify the problem, define objectives, design and develop, demonstrate, evaluate, and communicate, round and round.",
    asks: ["design science research", "dsr", "what is dsr", "design science", "the research method", "methodology", "prescriptive knowledge", "what is an artifact"],
    gesture: "raisehand",
    ja: {
      title: "デザイン・サイエンス・リサーチ",
      answer:
        "デザイン・サイエンス・リサーチ(DSR)は、くり返しながら問題を解く研究のやり方です。実際の問題を解くための目的をもった人工物(アーティファクト)を作り、評価し、そこから「どう作ればよいか」という処方的な知識を得ます。行動科学や自然科学が主に「ものごとがどうあるか」を説明・予測するのに対し、DSRは人や組織の力を高めるために「どうあるべきか」をデザインします。よく使われる流れは6段階:問題の特定、目標の設定、設計と開発、実演、評価、伝達。これをくり返します。",
      asks: ["デザイン・サイエンス・リサーチ", "DSRって何", "デザインサイエンス", "研究方法", "方法論", "アーティファクトって何"],
    },
  },
  {
    id: "artifact",
    title: "Seisugbo as a design artifact",
    answer:
      "Read as design science research, Seisugbo is the artifact. The problem: the walk and the art happened once, in one city, for the people there, and the forum's FrameVR spaces lagged, so the experience could fade, and couldn't reach anyone else. The objectives: keep every piece with its makers' own words in three languages, rebuild the feeling of the place it came from, run light on a phone or a headset, open to anyone with a link, and keep the conversation going. The design: the lane, the court, the boards, the portals, and me. Visitors walking it is the demonstration; how well it meets those objectives is the evaluation, and the paper is the communication.",
    asks: ["as a design artifact", "why was seisugbo made", "why build this", "what problem does it solve", "the artifact", "how is this design science", "immortalize", "the paper", "objectives"],
    ja: {
      title: "デザインの人工物としてのSeisugbo",
      answer:
        "デザイン・サイエンス・リサーチとして見ると、Seisugboが人工物です。問題は、まち歩きと作品が一度きり、ひとつの街で、そこにいた人のためだけにあり、フォーラムのFrameVR空間は動きが重かったこと。経験は薄れ、ほかの人には届きません。目標は、どの作品も作り手の3つの言葉といっしょに残すこと、生まれた場所の空気を再現すること、スマホやヘッドセットで軽く動くこと、リンクひとつでだれでも入れること、そして対話を続けること。設計は、路地、コート、案内板、ポータル、そしてわたし。訪れる人が歩くことが実演で、目標をどれだけ満たすかが評価、論文が伝達です。",
      asks: ["人工物としてのSeisugbo", "なぜSeisugboを作った", "何の問題を解く", "論文", "目標"],
    },
  },
  {
    id: "evaluation",
    title: "How Seisugbo is evaluated",
    answer:
      "In design science, an artifact is judged against the objectives it was built for. For Seisugbo that means asking whether people who weren't in Cebu can find the work, read its words, and feel something of the walk; whether it runs smoothly on a phone or a headset; and whether people talk about it together. I don't have the study's results: the paper reports those. What I can tell you is how it was built to meet them.",
    asks: ["how is it evaluated", "evaluation", "does it work", "results", "findings", "how do you know it works", "user study"],
    ja: {
      title: "Seisugboの評価",
      answer:
        "デザイン・サイエンスでは、人工物は、それを作った目標に照らして評価されます。Seisugboなら、セブにいなかった人が作品を見つけ、その言葉を読み、まち歩きの何かを感じられるか。スマホやヘッドセットでなめらかに動くか。人がいっしょにそれについて話すか。研究の結果はわたしにはわかりません。それは論文で報告されます。お話しできるのは、目標を満たすためにどう作られたかです。",
      asks: ["どう評価する", "評価", "うまくいく", "結果", "わかったこと"],
    },
  },
  {
    id: "light",
    title: "Why it runs light",
    answer:
      "The forum's FrameVR spaces lagged, so Seisugbo is built to stay light on a phone and a standalone headset. 51 photos, 43 MB as taken, become 1.3 MB of small pictures, with a sharper copy that downloads only when you open a piece. Nothing loads until you're near it, far areas aren't drawn, every house and roof is merged into a few meshes, and the lamps share a pool of four lights.",
    asks: ["why is it fast", "performance", "does it lag", "phone", "headset", "vr", "why not framevr", "how big is it"],
    ja: {
      title: "軽く動く理由",
      answer:
        "フォーラムのFrameVR空間は動きが重かったので、Seisugboはスマホや単体のヘッドセットでも軽く動くように作られています。撮影時43 MBの写真51枚は1.3 MBの小さな画像になり、くっきりした版は作品を開いたときだけ読み込みます。近づくまで何も読み込まず、遠くは描かず、家や屋根はいくつかのメッシュにまとめ、街灯は4つの光を共有しています。",
      asks: ["なぜ軽い", "性能", "重い", "スマホ", "ヘッドセット", "VR"],
    },
  },
  {
    id: "guide",
    title: "Why there's a guide",
    answer:
      "An archive you can talk to is easier to enter than one you have to read. So Seisugbo has me: a guide with a body, who greets you, answers, points, and walks you to things. I'm part of the artifact too. I'm not a chatbot that makes things up: I compare your question with the questions I was taught and give the answer someone wrote, all in your browser. That matters here, because the walk is about real people and real places, and I shouldn't invent anything about them.",
    asks: ["why is there a guide", "why an avatar", "why are you here", "what are you for", "embodied agent", "conversational agent", "are you chatgpt", "do you make things up"],
    gesture: "bow",
    mood: "happy",
    ja: {
      title: "ガイドがいる理由",
      answer:
        "読むアーカイブより、話しかけられるアーカイブのほうが入りやすいものです。だからSeisugboにはわたしがいます。体があって、あいさつし、答え、指さし、歩いて案内するガイドです。わたしも人工物の一部です。作り話をするチャットボットではありません。あなたの質問を教わった質問と比べて、人が書いた答えを返します。すべてブラウザの中でです。まち歩きは実在の人と場所の話なので、わたしが何かをでっち上げてはいけないからです。",
      asks: ["なぜガイドがいる", "なぜアバター", "あなたは何のため", "ChatGPTなの", "作り話をする"],
    },
  },
  {
    id: "controls",
    title: "Getting around",
    answer:
      "Walk with W A S D or the arrow keys, run with Shift, and jump with Space. Drag to look around, and double-click the ground to walk there. On a phone, use the pad at the bottom. Click any photo, piece, board, or portal for a closer look.",
    asks: ["how do i move", "how to walk", "controls", "how do i run", "keyboard", "how do i jump", "paano maglakad"],
    ja: {
      title: "歩き方",
      answer: "W A S Dか矢印キーで歩き、Shiftで走り、スペースでジャンプします。ドラッグで見回し、地面をダブルクリックするとそこまで歩きます。スマホでは下のパッドを使います。写真、作品、案内板、ポータルをクリックすると大きく見られます。",
      asks: ["どうやって動く", "歩き方", "操作", "走り方", "ジャンプ"],
    },
  },
];

/** What a card is called, for the guide's "open the card" offer. */
export function cardTitle(card: string): string {
  if (card === "tour") return boardText("lane").title;
  if (card.startsWith("board:")) return boardText(card.slice(6) as BoardKey).title;
  if (card.startsWith("portal:")) return `FrameVR · ${card.slice(7)}`;
  return PIECE_BY_ID[card]?.title ?? card;
}

export function seisugboKnowledge(): Knowledge {
  return {
    topics: TOPICS,
    starters: ["What is Seisugbo?", "What was the Urbanity Walk?", "What did they eat?", "What is design science research?", "Why is there a guide?", "Give me a tour"],
    startersJa: ["Seisugboって何?", "アーバニティ・ウォークって何?", "何を食べたの?", "デザイン・サイエンス・リサーチって何?", "なぜガイドがいるの?", "案内して"],
    subject: "Seisugbo, the Meiji × UP forum and its Urbanity Walk, the art, and how this world was made",
    subjectJa: "Seisugbo、明治×UPフォーラムとアーバニティ・ウォーク、作品、そしてこのワールドの作り方",
    cardTitle: (card) => cardTitle(card),
    synonyms: {
      lakaw: "walk",
      paglakaw: "walk",
      krus: "cross",
      simbahan: "church",
      kapitolyo: "capitol",
      pagkaon: "food",
      kaon: "eat",
      baha: "flooding",
      sampayan: "clothesline",
      eskinita: "lane",
      arte: "art",
      dibuho: "art",
    },
  };
}
