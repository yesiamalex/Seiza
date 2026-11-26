// What Seishore's people know, in English and Japanese: the town, its
// konbini, its food, the sea, the shrine, how things are done, and a few
// words to get by with. Every answer shows both languages (bilingual), so
// a visitor learning either sees the other under it.
import type { Knowledge, Place, Topic } from "../../../src/guides/brain";
import { at, type Node } from "./plan";

const place = (id: string, label: string, labelJa: string, node: Node): Place => ({ id, label, labelJa, at: at(node) });

export const PLACES = {
  konbini: place("konbini", "Umi Mart, the konbini on the corner", "角のコンビニ、うみマート", "konbiniDoor"),
  cafe: place("cafe", "Shiosai, the café", "カフェ「潮騒」", "cafeDoor"),
  station: place("station", "Seishore-Kaigan station", "星ショア海岸駅", "platformMid"),
  crossing: place("crossing", "the crossing by the sea", "海の見える踏切", "rail"),
  famiresu: place("famiresu", "Hama Kitchen, the family restaurant", "ファミレス「はまキッチン」", "dinerDoor"),
  temple: { id: "temple", label: "Seikai-ji, the temple by Yamanomae station", labelJa: "山の前駅のそばの星海寺", at: at("templeGate"), walk: false },
  shrine: place("shrine", "the shrine by the meadow", "原っぱのそばの神社", "torii"),
  beach: place("beach", "the beach", "浜辺", "beach"),
  boats: place("boats", "the fishing boats on the sand", "浜の漁船", "boats"),
  fish: place("fish", "Uoya, the fish shop", "魚屋「うおや」", "fish"),
  surf: place("surf", "Kaze Surf", "風サーフ", "surf"),
  bus: place("bus", "the bus stop on the coast road", "海岸通りのバス停", "busStop"),
  wall: place("wall", "the sea wall", "堤防", "wallGap"),
};

const topics: Topic[] = [
  {
    id: "town",
    title: "Seishore",
    answer:
      "Seishore is a small seaside town on Seiza's coast, after Yuigahama in Kamakura, on the Shonan coast south of Tokyo: one street of shops running down to the sea, a coast road, a long beach, and a little shrine. A good place to slow down for an afternoon.",
    asks: ["what is this place", "where am i", "tell me about the town", "what is seishore", "kamakura", "shonan", "yuigahama"],
    gesture: "wave",
    mood: "happy",
    ja: {
      title: "Seishore",
      answer: "Seishoreは、Seizaの海辺の小さな町。東京の南、湘南の鎌倉・由比ヶ浜がモデルです。海まで続く商店街がひとつ、海岸通り、長い浜辺、小さな神社。午後をのんびり過ごすのにいい所ですよ。",
      asks: ["ここはどこ", "この町について", "Seishoreって何", "鎌倉", "湘南"],
    },
  },
  {
    id: "konbini",
    title: "The konbini",
    answer:
      "A konbini is a convenience store, open all day and all night. You can get onigiri (rice balls), bento they'll heat for you, oden in winter, hot and cold drinks, and pay bills or pick up parcels too. Put your money on the little tray at the counter rather than in the clerk's hand.",
    asks: ["what is a konbini", "convenience store", "what can i buy", "umi mart", "where can i buy food", "onigiri", "oden"],
    place: PLACES.konbini,
    ja: {
      title: "コンビニ",
      answer: "コンビニは24時間開いているお店。おにぎり、温めてもらえるお弁当、冬はおでん、温かい飲み物も冷たい飲み物もあるし、支払いや荷物の受け取りもできます。お金はレジのトレーに置いてね。",
      asks: ["コンビニって何", "何が買える", "うみマート", "おにぎり", "おでん"],
    },
  },
  {
    id: "shirasu",
    title: "Shirasu",
    answer:
      "Shirasu are tiny whitebait, the Shonan coast's own catch: boiled and salted (kama-age), or raw (nama-shirasu) on the days the boats go out, best on a bowl of rice as shirasu-don. Mio's café serves it, and Uoya sells it fresh.",
    asks: ["shirasu", "what should i eat", "local food", "whitebait", "food here", "what is good to eat", "shirasu don"],
    place: PLACES.cafe,
    mood: "happy",
    ja: {
      title: "しらす",
      answer: "しらすは湘南名物の小さな魚。釜揚げにしたり、船が出た日は生しらすで。いちばんはご飯にのせた「しらす丼」。美緒さんのカフェで食べられるし、うおやで新鮮なのが買えます。",
      asks: ["しらす", "何を食べればいい", "名物", "しらす丼"],
    },
  },
  {
    id: "shrine",
    title: "Visiting the shrine",
    answer:
      "At a shrine: bow once at the torii gate, and walk to the side of the path (the middle is for the god). Rinse your hands if there's a water basin. At the shrine, a coin in the box, then bow twice, clap twice, make your wish, and bow once more.",
    asks: ["how do i pray", "shrine", "torii", "how to visit a shrine", "what do i do at the shrine", "jinja", "clap"],
    place: PLACES.shrine,
    gesture: "gassho",
    mood: "relaxed",
    ja: {
      title: "神社のお参り",
      answer: "鳥居の前で一礼して、参道は端を歩きます(真ん中は神様の道)。手水舎があれば手を清めて。お賽銭を入れたら、二礼、二拍手、お願いごとをして、最後に一礼。",
      asks: ["お参りの仕方", "神社", "鳥居", "二礼二拍手一礼"],
    },
  },
  {
    id: "sea",
    title: "The sea and the beach",
    answer:
      "The beach is open all year. Swimming season is July and August, when there are lifeguards and beach huts; the rest of the year it belongs to surfers, walkers, and dogs. Out past the shallows you're swimming, so mind the waves.",
    asks: ["can i swim", "the beach", "the sea", "swimming", "when can i swim", "is it safe to swim"],
    place: PLACES.beach,
    ja: {
      title: "海と浜辺",
      answer: "浜辺は一年中入れます。海水浴は7月と8月、ライフセーバーや海の家があるころ。それ以外はサーファー、散歩の人、犬の季節です。浅瀬の先は泳ぐことになるから、波に気をつけてね。",
      asks: ["泳げる", "浜辺", "海", "海水浴", "いつ泳げる"],
    },
  },
  {
    id: "surf",
    title: "Surfing",
    answer:
      "Shonan is where a lot of Japan learned to surf. Winter brings the best swell and the emptiest water, in a five-millimetre wetsuit. Kaze Surf rents boards and suits, and Kaito will tell you where it's breaking.",
    asks: ["surfing", "can i surf", "surf shop", "rent a board", "waves", "kaze surf"],
    place: PLACES.surf,
    ja: {
      title: "サーフィン",
      answer: "湘南は日本のサーフィン発祥の地のひとつ。冬は波がよくて海もすいてる。ウェットは5ミリね。風サーフでボードとウェットが借りられるし、どこで波が立ってるかは海斗くんに聞いて。",
      asks: ["サーフィン", "サーフィンできる", "サーフショップ", "ボードを借りたい", "波"],
    },
  },
  {
    id: "tonbi",
    title: "Black kites",
    answer:
      "The birds calling pī-hyororo overhead are black kites, tonbi. They're bold: they'll swoop down and take food right out of your hand, so eat under a roof or keep your snack close on the beach.",
    asks: ["what is that bird", "birds", "kite", "tonbi", "what is that sound", "hawk", "eagle"],
    mood: "surprised",
    ja: {
      title: "とんび",
      answer: "上で「ピーヒョロロ」と鳴いているのはとんび。大胆で、手に持った食べ物をさっと持っていくの。浜で食べるときは屋根の下か、しっかり持っていてね。",
      asks: ["あの鳥は何", "とんび", "鳥", "あの音は何"],
    },
  },
  {
    id: "vending",
    title: "Vending machines",
    answer:
      "Vending machines are everywhere in Japan, even here: the blue labels are cold drinks (tsumetai), the red ones hot (attakai), in winter. The two at the end of the street take coins and cards. Click one for a drink.",
    asks: ["vending machine", "where can i get a drink", "drinks", "jidohanbaiki", "i'm thirsty", "water"],
    ja: {
      title: "自動販売機",
      answer: "自動販売機は日本中どこにでもあります。青いラベルは「つめた〜い」、冬は赤いラベルの「あったか〜い」も。通りの端の二台は小銭もカードも使えます。クリックして一本どうぞ。",
      asks: ["自動販売機", "自販機", "飲み物", "のどが渇いた"],
    },
  },
  {
    id: "phrases",
    title: "A few words of Japanese",
    answer:
      "Konnichiwa: hello. Arigatō gozaimasu: thank you. Sumimasen: excuse me, or sorry. Kore wa ikura desu ka: how much is this? Oishii: delicious! And before a meal, itadakimasu; after it, gochisōsama deshita.",
    asks: ["how do i say", "japanese words", "teach me japanese", "how do you say thank you", "hello in japanese", "phrases", "useful words"],
    gesture: "nod",
    mood: "happy",
    ja: {
      title: "日本語のことば",
      answer: "「こんにちは」はHello、「ありがとうございます」はThank you、「すみません」はExcuse me や Sorry、「これはいくらですか」はHow much is this?、「おいしい」はDelicious!。食べる前は「いただきます」、食べたあとは「ごちそうさまでした」。",
      asks: ["日本語を教えて", "英語でなんて言う", "ありがとうって英語で", "英語を教えて"],
    },
  },
  {
    id: "manners",
    title: "How things are done",
    answer:
      "A few things that help: take your shoes off at the door of a home (and some restaurants), carry your rubbish home (there are few public bins), keep your voice down on trains, and don't tip: good service is just how it's done.",
    asks: ["manners", "etiquette", "what should i know", "rules", "tipping", "shoes", "trash", "rubbish"],
    ja: {
      title: "マナー",
      answer: "知っておくと便利なこと。家(や一部のお店)では玄関で靴を脱ぐ、ゴミは持ち帰る(ゴミ箱は少ないから)、電車では静かに、チップはいりません。",
      asks: ["マナー", "気をつけること", "ルール", "チップ", "靴", "ゴミ"],
    },
  },
  {
    id: "getting-around",
    title: "Getting around",
    answer:
      "Most people walk or ride a mamachari, the everyday bicycle with a basket. A little coastal train runs along the shore, and buses stop on the coast road. Cars and bikes keep to the left.",
    asks: ["how do i get around", "train", "bus", "bicycle", "where is the station", "transport", "left side"],
    place: PLACES.bus,
    ja: {
      title: "移動のしかた",
      answer: "みんなだいたい歩きか、かご付きの自転車「ママチャリ」。海沿いを小さな電車が走っていて、海岸通りにはバスが止まります。車も自転車も左側通行です。",
      asks: ["移動", "電車", "バス", "自転車", "駅はどこ"],
    },
  },
  {
    id: "furin",
    title: "Wind chimes",
    answer:
      "The chimes ringing under the eaves are furin: a glass bell and a paper strip that catches the wind. People hang them in summer because the sound feels cool, and some keep them up all year.",
    asks: ["wind chime", "furin", "what is that ringing", "bell", "chime"],
    mood: "relaxed",
    ja: {
      title: "風鈴",
      answer: "軒下で鳴っているのは風鈴。ガラスの鈴と、風を受ける短冊でできています。音が涼しいから夏に吊るすけれど、一年中出しておく家もあるのよ。",
      asks: ["風鈴", "あの音は", "鈴"],
    },
  },
  {
    id: "cafe",
    title: "Shiosai, the café",
    answer: "Shiosai is Mio's café, halfway down the street: hand-drip coffee, cakes, and a shirasu bowl at lunch. Sit on the bench out front and watch the street go by.",
    asks: ["cafe", "coffee", "where can i sit", "shiosai", "lunch", "where can i eat"],
    place: PLACES.cafe,
    ja: {
      title: "カフェ「潮騒」",
      answer: "潮騒は通りの真ん中あたりにある美緒さんのカフェ。ハンドドリップのコーヒーとケーキ、お昼はしらす丼。前のベンチに座って、通りを眺めるのもいいですよ。",
      asks: ["カフェ", "コーヒー", "座れる所", "潮騒", "お昼"],
    },
  },
  {
    id: "fish-shop",
    title: "Uoya, the fish shop",
    answer: "Uoya, the fish shop, has whatever came in that morning on ice out front: horse mackerel, sea bream, squid, and shirasu when the boats get it. They'll clean and cut it for you.",
    asks: ["fish shop", "fresh fish", "uoya", "where can i buy fish", "seafood"],
    place: PLACES.fish,
    ja: {
      title: "魚屋「うおや」",
      answer: "うおやは、その朝揚がった魚を氷にのせて店先に並べています。アジ、タイ、イカ、船が獲った日はしらすも。さばいて切ってもくれますよ。",
      asks: ["魚屋", "新鮮な魚", "うおや", "魚を買いたい"],
    },
  },
  {
    id: "train",
    title: "The Shiokaze Line",
    answer:
      "The little train is the Shiokaze Line, two cars running along the coast between Seishore-Kaigan, right by the street, and Yamanomae, at the mountain's foot by the temple. It comes every few minutes each way. Wait on the platform, then click a seat inside to ride; stand up when it stops to get off.",
    asks: ["train", "how do i ride the train", "station", "railway", "where does the train go", "shiokaze", "enoden", "tram"],
    place: PLACES.station,
    ja: {
      title: "しおかぜ線",
      answer: "小さな電車は「しおかぜ線」。二両編成で、通りのすぐそばの星ショア海岸駅と、山のふもと、お寺のそばの山の前駅を結んでいます。数分おきに来ますよ。ホームで待って、乗ったら席をクリック。止まったら立ち上がって降りてね。",
      asks: ["電車", "電車の乗り方", "駅", "しおかぜ線", "江ノ電"],
    },
  },
  {
    id: "crossing",
    title: "The crossing by the sea",
    answer:
      "The level crossing at the top of the street is the town's favourite spot: the train goes by with the sea right behind it, and the bus stop across the road. It's after a famous one in Kamakura, by Kamakura-Kōkōmae station. Sit on the bench by the corner and wait for the bell.",
    asks: ["crossing", "level crossing", "railroad crossing", "famous crossing", "kamakura koukoumae", "fumikiri", "photo spot"],
    place: PLACES.crossing,
    mood: "happy",
    ja: {
      title: "海の見える踏切",
      answer: "通りの上の踏切は、町いちばんの人気スポット。電車のすぐ後ろに海が広がって、道の向こうにはバス停。鎌倉高校前駅の有名な踏切がモデルです。角のベンチに座って、カンカンが鳴るのを待ってみて。",
      asks: ["踏切", "有名な踏切", "鎌倉高校前", "撮影スポット"],
    },
  },
  {
    id: "bus",
    title: "The bus",
    answer:
      "The bus runs up and down the coast road and stops by the sea, across from the crossing. When it pulls in and the doors open, click a seat inside. In Japan you usually get on at the back or middle and pay as you get off at the front, but today the ride's on the town.",
    asks: ["bus", "how do i take the bus", "bus stop", "when is the bus", "ride the bus"],
    place: PLACES.bus,
    ja: {
      title: "バス",
      answer: "バスは海岸通りを行き来していて、踏切の向かいの海辺のバス停に止まります。止まってドアが開いたら、中の席をクリック。日本ではふつう後ろか真ん中から乗って、降りるときに前で払うけど、今日は町のおごりです。",
      asks: ["バス", "バスの乗り方", "バス停", "バスはいつ"],
    },
  },
  {
    id: "temple",
    title: "The temple",
    answer:
      "Seikai-ji, the temple of the sea and stars, is at the mountain's foot, by Yamanomae station. A temple is Buddhist, a shrine is Shinto: at a temple you put your hands together and bow, and you don't clap. Waft a little incense smoke over yourself first; it's said to be good for you.",
    asks: ["temple", "how do i pray at a temple", "shrine or temple", "difference between shrine and temple", "seikaiji", "otera", "incense", "buddhist"],
    place: PLACES.temple,
    gesture: "gassho",
    mood: "relaxed",
    ja: {
      title: "お寺",
      answer: "星海寺は山のふもと、山の前駅のそば。お寺は仏教、神社は神道。お寺では手を合わせて礼をするだけで、拍手はしません。先にお線香の煙を体にかけるのもいいですよ、体にいいと言われているの。",
      asks: ["お寺", "お寺のお参り", "神社とお寺の違い", "星海寺", "お線香"],
    },
  },
  {
    id: "omikuji",
    title: "Fortunes",
    answer:
      "The little box by the shrine is omikuji: shake it and a stick comes out with your fortune, from great blessing (daikichi) to bad luck (kyō). If it's bad, tie it to the rope there and leave the bad luck with the shrine.",
    asks: ["fortune", "omikuji", "my luck", "daikichi", "fortune telling"],
    place: PLACES.shrine,
    mood: "happy",
    ja: {
      title: "おみくじ",
      answer: "神社のそばの小さな箱はおみくじ。振ると棒が出てきて、運勢がわかります。大吉から凶まで。凶だったら、そこの縄に結んで、悪い運は神社に預けていきましょう。",
      asks: ["おみくじ", "運勢", "大吉"],
    },
  },
  {
    id: "famiresu",
    title: "Hama Kitchen, the family restaurant",
    answer:
      "Hama Kitchen is the family restaurant (famiresu) on the street: booths by the window, set meals and hamburg steak, and the drink bar, where one order means as many refills as you like. Students do their homework there for hours.",
    asks: ["family restaurant", "famiresu", "hama kitchen", "restaurant", "drink bar", "dinner"],
    place: PLACES.famiresu,
    ja: {
      title: "ファミレス「はまキッチン」",
      answer: "はまキッチンは通りのファミレス。窓ぎわのボックス席、定食やハンバーグ、それにドリンクバーは頼めばおかわり自由。学生がよく何時間も宿題をしてますよ。",
      asks: ["ファミレス", "はまキッチン", "レストラン", "ドリンクバー", "晩ごはん"],
    },
  },
  {
    id: "gulls",
    title: "Gulls",
    answer: "The birds mewing over the beach are black-tailed gulls, umineko: sea cats, for the way they sound. The higher, whistling call is the black kites.",
    asks: ["gull", "seagull", "umineko", "what birds are those"],
    ja: {
      title: "うみねこ",
      answer: "浜の上でミャーミャー鳴いているのはうみねこ。声が猫みたいだから「海の猫」。高い笛みたいな声はとんびです。",
      asks: ["かもめ", "うみねこ", "あの鳥"],
    },
  },
];

export const seishoreKnowledge = (): Knowledge => ({
  topics,
  bilingual: true,
  subject: "the town, the konbini, food, the sea, the shrine, and a few words of Japanese",
  subjectJa: "町、コンビニ、食べ物、海、神社、日本語のことば",
  starters: ["What is this place?", "What is a konbini?", "What should I eat here?", "How do I visit the shrine?", "How do I say thank you?"],
  startersJa: ["ここはどこ?", "コンビニって何?", "何を食べればいい?", "神社のお参りの仕方は?", "英語を教えて"],
  synonyms: { convenience: "konbini", shop: "store", eat: "food", hungry: "food", pray: "shrine", temple: "shrine", swim: "swimming", bird: "birds" },
});
