// Everything the world shows from the project: the art each group made, the
// walking tour's photos, the posters, and the dance. One entry per picture
// in world/media/ (made from media-src/ by scripts/optimize-media.mjs).
//
// To change a caption, a credit, or the words under a piece, edit it here;
// nothing else needs to change. `words` are the students' own word cards,
// copied from the photo: English · Japanese · Filipino or Cebuano. Add a
// `by` to credit a person by name, with their permission.

export type Group = "A" | "B" | "C" | "D";

/** art: made in the workshop. tour: a photo from the walking tour.
 *  poster: a poster from the collage wall. dance: a performance. */
export type Kind = "art" | "tour" | "poster" | "dance";

export interface Piece {
  id: string;
  group: Group;
  kind: Kind;
  /** Pixel size of the in-world picture (tex/<id>.webp), for its shape. */
  px: [number, number];
  title: string;
  /** The word cards that came with it, one card per line. */
  words?: string[];
  caption?: string;
  by?: string;
  /** Has transparency: drawn as a cut-out (the hanging fish). */
  cutout?: boolean;
}

export const GROUP_COLORS: Record<Group, string> = {
  A: "#d9573b",
  B: "#2f8fb0",
  C: "#c8407e",
  D: "#e0a020",
};

export const PIECES: Piece[] = [
  // --- Group A ---------------------------------------------------------------------------
  { id: "a5", group: "A", kind: "art", px: [512, 384], title: "Connection", words: ["Connection · つながり · Koneksyon", "Culture · 文化 · Kultura"] },
  {
    id: "a6",
    group: "A",
    kind: "art",
    px: [384, 512],
    title: "Exploration",
    words: ["Exploration · 探索 · Paglaag (Bisaya) · Paggalugad (Tagalog)", "Fusion of urban and rural · 都市と地方の融合 · Pagsasanib ng lungsod at kanayunan"],
  },
  { id: "a7", group: "A", kind: "art", px: [384, 512], title: "Laugh", words: ["Connection · つながり · Pakiglabot (Bisaya) · Ugnayan (Tagalog)", "Laugh · 笑う · Katawa (Cebuano) · Tumawa (Tagalog)"] },
  { id: "a8", group: "A", kind: "art", px: [384, 512], title: "Full", words: ["Full · おなかいっぱい · Busog", "Conservation · 保存 · Pangangalaga"] },
  { id: "a9", group: "A", kind: "art", px: [384, 512], title: "Dialogue", words: ["Dialogue · 対話 · Pakikipag-usap · Panag-istorya"] },
  { id: "a10", group: "A", kind: "art", px: [384, 512], title: "Waves", caption: "Held up in front of a work in a gallery, where the group took its pieces." },
  { id: "a11", group: "A", kind: "art", px: [288, 512], title: "Values", words: ["Values · 価値観 · Mga pagpapahalaga · Mga halaga", "Hospitality · Pag-abiabi"], caption: "Laid out on the leaves of a garden hedge." },
  {
    id: "a12",
    group: "A",
    kind: "art",
    px: [364, 512],
    title: "Kahayag sa Kahapon",
    words: ["Adlaw sa dugo, / Gamut sa kagahapon, / Sugbo ko, ako.", "Sun within our blood, / roots anchored deep in the past, / my Cebu, myself."],
    caption: "A poem in Cebuano, with its translation, written on the drawing.",
  },
  { id: "a13", group: "A", kind: "art", px: [512, 317], title: "Island", caption: "Clay and crayon: an island, a fish, a heart, and people." },
  { id: "a14", group: "A", kind: "art", px: [512, 241], title: "Reality", words: ["Reality · Tinuod nga kahimtang", "Learning · 学ぶ · Pagkat-on"] },
  {
    id: "a15",
    group: "A",
    kind: "art",
    px: [512, 288],
    title: "Welcome",
    words: ["Energetic · 精力的 · Abtik", "Laban! · がんばれ! · Fight!", "Welcome · Yutai · Abi-abi"],
    caption: "Bunting and power lines over a street.",
  },
  // The collage wall: photos and drawings, posted side by side.
  { id: "a16", group: "A", kind: "poster", px: [512, 288], title: "Spring at home" },
  { id: "a17", group: "A", kind: "poster", px: [512, 341], title: "My Encyclopedia" },
  { id: "a18", group: "A", kind: "poster", px: [512, 341], title: "Night breeze, must try!" },
  { id: "a19", group: "A", kind: "poster", px: [512, 341], title: "My Encyclopedia" },
  { id: "a20", group: "A", kind: "poster", px: [512, 341], title: "I miss winter" },
  { id: "a21", group: "A", kind: "poster", px: [512, 341], title: "Places I love" },
  { id: "a22", group: "A", kind: "poster", px: [512, 341], title: "Cebu students like cafés!!" },
  { id: "a24", group: "A", kind: "poster", px: [512, 341], title: "Little joys" },
  // The walking tour.
  { id: "a1", group: "A", kind: "tour", px: [512, 341], title: "Setting out", caption: "The whole group gathers at the Heritage of Cebu Monument in Parián before the walk." },
  { id: "a2", group: "A", kind: "tour", px: [512, 341], title: "A lola's welcome", caption: "In a market lane of mats and brooms, a lola stops to greet the group." },
  { id: "a3", group: "A", kind: "tour", px: [512, 341], title: "Looking out", caption: "A pause to look out over the water and the sky." },
  { id: "a4", group: "A", kind: "tour", px: [512, 341], title: "The guide", caption: "The guide points out what the group is about to see." },

  // --- Group B ---------------------------------------------------------------------------
  { id: "b1", group: "B", kind: "art", px: [512, 288], title: "Our board", caption: "Everything the group made, together on one board: collage, origami, clay, and word cards." },
  { id: "b2", group: "B", kind: "art", px: [512, 288], title: "Faces", caption: "Portraits of each other, drawn side by side." },
  { id: "b3", group: "B", kind: "tour", px: [512, 341], title: "Sari-sari store", caption: "Snacks, sachets, and vegetables at a neighbourhood store's window." },
  { id: "b4", group: "B", kind: "tour", px: [512, 341], title: "Under the trees", caption: "A shaded walkway with old lampposts, between the city's heritage buildings." },
  { id: "b5", group: "B", kind: "tour", px: [512, 341], title: "Flowers by the market", caption: "Flower sellers beside a public market's mural." },
  { id: "b6", group: "B", kind: "tour", px: [512, 341], title: "A meal together", caption: "Long tables in a wooden hall: a stop to eat." },

  // --- Group C ---------------------------------------------------------------------------
  { id: "c6", group: "C", kind: "art", px: [512, 338], title: "Group C is here!!" },
  { id: "c7", group: "C", kind: "art", px: [342, 512], title: "Complement", words: ["Complement · 補い合う · Kumumpleto", "Connection · 繋がり · Ugnayan · Koneksyon"], caption: "A collage of the walk: a dome, the sea, a bridge, wires, alleys." },
  { id: "c8", group: "C", kind: "art", px: [512, 288], title: "Us", caption: "Self-portraits, one figure each." },
  { id: "c9", group: "C", kind: "art", px: [384, 512], title: "Colours", caption: "Paper squares and crayon faces." },
  { id: "c10", group: "C", kind: "art", px: [384, 512], title: "Mix", words: ["Mix · ミックス · Halo", "Connection · きずな · Sumpay-sumpay"], caption: "A paper chain, each link a different colour." },
  { id: "c11", group: "C", kind: "art", px: [362, 512], title: "The city in a circle", caption: "Clay colours over a circle of photos from the walk." },
  { id: "c12", group: "C", kind: "art", px: [512, 288], title: "Amoy", words: ["Amoy (smell)", "Abundance · Kasaganaan"], caption: "Two rivers of clay, and the smells of the market." },
  { id: "c13", group: "C", kind: "art", px: [512, 288], title: "Figures", caption: "Figures in crayon, each one coloured differently." },
  { id: "c14", group: "C", kind: "art", px: [512, 384], title: "My Encyclopedia", caption: "From the group's encyclopedia of each other." },
  { id: "c2", group: "C", kind: "art", px: [384, 512], title: "Bulad", caption: "A dried fish, drawn and cut out to hang, as they hang in the market.", cutout: true },
  { id: "c4", group: "C", kind: "art", px: [384, 512], title: "Bulad", caption: "A dried fish, drawn and cut out to hang, as they hang in the market.", cutout: true },
  { id: "c1", group: "C", kind: "tour", px: [512, 288], title: "The city we walked", caption: "Group C's collage of the walk: monuments, heritage buildings, and the bridge." },
  { id: "c3", group: "C", kind: "tour", px: [512, 384], title: "Bulad", caption: "Dried fish, bulad, in rows for sale." },
  { id: "c5", group: "C", kind: "tour", px: [512, 384], title: "Bulad, up close", caption: "Dried fish piled high at a market stall." },

  // --- Group D ---------------------------------------------------------------------------
  { id: "d1", group: "D", kind: "art", px: [384, 512], title: "Create", words: ["Create · 作る · Likhain (Tagalog) · Maghimo (Cebuano)", "History · 歴史 · Kasaysayan"], caption: "Paper on canvas, with its edges left frayed." },
  {
    id: "d2",
    group: "D",
    kind: "art",
    px: [512, 384],
    title: "Diversity",
    words: ["Enlightening · 啓発的な · Naliwanagan", "Diversity · 多様性 · Pagkakaiba-iba", "Inspiring · 刺激的 · Nakakapukaw"],
    caption: "A face, lanterns, bunting, a dome, and a stall under an umbrella.",
  },
  { id: "d3", group: "D", kind: "art", px: [512, 384], title: "Crossing", words: ["Crossing · 重なり · Pagkapatong / Pagkaguhit", "Liberty · 自由 · Kalayaan"] },
  { id: "d5", group: "D", kind: "art", px: [512, 418], title: "Energy", words: ["Energy · 活気 · Sigla · Kadasig", "Colorful · カラフル · Makulay"], caption: "A lane of stalls and homes, and the children who waved." },
  { id: "d7", group: "D", kind: "art", px: [512, 386], title: "Memory", words: ["Experience · 経験 · Karanasan", "Memory · 記憶 · Panumduman · Alaala"], caption: "Cebu island in torn paper, among flowers and vines." },
  { id: "d4", group: "D", kind: "dance", px: [512, 283], title: "Movement in the corridor", caption: "The group's response, danced down a corridor." },
  { id: "d6", group: "D", kind: "dance", px: [512, 313], title: "Movement in the gallery", caption: "Dancing among the paintings in a gallery." },
];

export const PIECE_BY_ID: Record<string, Piece> = Object.fromEntries(PIECES.map((p) => [p.id, p]));

export const texUrl = (id: string) => `/worlds/seisugbo/media/tex/${id}.webp`;
export const viewUrl = (id: string) => `/worlds/seisugbo/media/view/${id}.webp`;

/** Width over height. */
export const aspectOf = (p: Piece) => p.px[0] / p.px[1];
