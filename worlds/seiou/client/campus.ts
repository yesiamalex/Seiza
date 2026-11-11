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

const place = (id: string, label: string, at: [number, number, number], walk = true): Place => ({ id, label, at, walk });

export const PLACES = {
  oblation: place("oblation", "the Oblation, in the middle of the roundabout", [18, 0.2, 2]),
  main: place("main", "the UPOU Main Building", [110, 0.2, 0]),
  tlh: place("tlh", "the Teaching and Learning Hub", [132, 0.2, 63]),
  ccdl: place("ccdl", "the CCDL Auditorium", [277, 1.3, -95]),
  ccdlStage: place("ccdlStage", "the stage of the CCDL Auditorium", [281, 5.7, -103], false),
  wcmpb: place("wcmpb", "the ground floor of the World-Class Multi-Purpose Building", [226, 1.6, 154]),
  wcmpb2F: place("wcmpb2F", "the second floor of the World-Class Multi-Purpose Building", [226, 8.2, 150], false),
  wcmpbRoof: place("wcmpbRoof", "the roof deck of the World-Class Multi-Purpose Building", [226, 14.8, 150], false),
  ar: place("ar", "the AR building", [336, 1.1, -98]),
};

const TOPICS: Topic[] = [
  {
    id: "world",
    title: "About SeiOU",
    answer:
      "SeiOU is a digital twin of the University of the Philippines Open University's headquarters in Los Baños, Laguna, built on Seiza. Walk the campus with others, step inside its buildings, and ask Chancy Joan or Dean Rob anything about UPOU or the way somewhere.",
    asks: ["what is this place", "what is seiou", "where am i", "what can i do here", "is this the real campus", "digital twin", "ano ito"],
    place: PLACES.main,
  },
  {
    id: "upou",
    title: "UP Open University",
    answer:
      "UPOU is the University of the Philippines' open university, founded on 23 February 1995 as the fifth constituent university of the UP System. It grew out of the UP Distance Education Program, and teaches mostly online, through open and distance e-learning, so students can study from wherever they are.",
    asks: ["what is upou", "what is the open university", "when was upou founded", "history of upou", "tell me about upou", "up open university", "is upou part of up"],
    gesture: "raisehand",
    mood: "happy",
  },
  {
    id: "odl",
    title: "Open and distance e-learning",
    answer:
      "Open and distance e-learning means studying without having to be on campus: courses, materials, and discussions online, at times that fit around work and family. UPOU has led it in the Philippines, and the Open Distance Learning Act of 2014 (Republic Act 10650) gave it the job of helping CHED and TESDA with open and distance learning.",
    asks: ["how do i study at upou", "online learning", "distance education", "do i need to go to campus", "how are classes done", "odel", "ra 10650", "open distance learning act"],
  },
  {
    id: "faculties",
    title: "The faculties",
    answer:
      "UPOU's teaching is in three faculties: the Faculty of Education, the Faculty of Information and Communication Studies, and the Faculty of Management and Development Studies. Their offices are in the Teaching and Learning Hub.",
    asks: ["what faculties are there", "what can i study", "programs", "courses offered", "faculty of education", "fics", "fmds", "fed", "degrees"],
    place: PLACES.tlh,
  },
  {
    id: "programs",
    title: "Programs and admission",
    answer:
      "UPOU offers undergraduate and graduate degrees, diplomas, and a professional teaching certificate, all studied mostly online, and free massive open online courses (MOOCs) anyone can take. Programs, deadlines, and fees change, so check upou.edu.ph for what's open now and how to apply.",
    asks: ["how do i apply", "admission", "enroll", "requirements", "tuition", "fees", "mooc", "free courses", "scholarship", "how to enrol", "paano mag enroll"],
  },
  {
    id: "motto",
    title: "Honor, Excellence, Service",
    answer: "Honor, Excellence, Service is the University of the Philippines' motto, which UPOU shares.",
    asks: ["what is the motto", "upou motto", "honor excellence service"],
  },
  {
    id: "location",
    title: "Where UPOU is",
    answer:
      "UPOU's headquarters is on the National Highway in Barangay Maahas, Los Baños, Laguna, beside the International Rice Research Institute and near UP Los Baños. This campus is a model of it.",
    asks: ["where is upou", "address", "how do i get to upou", "location", "los banos", "irri", "nasaan ang upou", "directions to the real campus"],
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
  },
  {
    id: "main",
    title: "The Main Building",
    answer:
      "The Main Building is UPOU's address and home to its offices. Its name runs across the arch over the drive: University of the Philippines Open University. Walk through the passage under it to the courtyard beyond.",
    asks: ["main building", "administration", "offices", "where are the offices", "registrar", "admin building", "the big building with the sign"],
    place: PLACES.main,
  },
  {
    id: "tlh",
    title: "The Teaching and Learning Hub",
    answer:
      "The Teaching and Learning Hub is the cluster of four octagonal pods south of the Main Building. It holds the offices of UPOU's three faculties: 30 faculty rooms, three deans' offices, and a meeting area for 12, with a loft that lets in air and light and looks out toward Mount Makiling. Its groundbreaking was part of UPOU's 22nd anniversary.",
    asks: ["teaching and learning hub", "tlh", "the pods", "the octagon buildings", "faculty offices", "where are the teachers", "deans office", "the red roofs"],
    place: PLACES.tlh,
  },
  {
    id: "ccdl",
    title: "The CCDL Auditorium",
    answer:
      "The Centennial Center for Digital Learning's auditorium seats up to 150, with a stage for talks, launches, and ceremonies. UPOU also lends it out for events. It's in the northeast of the campus, next to the AR building.",
    asks: ["ccdl", "centennial center for digital learning", "auditorium", "where are events held", "the stage", "the hall for events", "seminar venue"],
    place: PLACES.ccdl,
  },
  {
    id: "ccdlStage",
    title: "The CCDL stage",
    answer: "The stage is at the front of the CCDL Auditorium. I can take you up onto it.",
    asks: ["go on the stage", "take me to the stage", "ccdl stage", "podium"],
    place: PLACES.ccdlStage,
  },
  {
    id: "wcmpb",
    title: "The World-Class Multi-Purpose Building",
    answer:
      "The World-Class Multi-Purpose Building (WCMPB) is the large two-storey building in the south of the campus, with wide main stairs and a ramp at the front, a balcony and glass panels on the second floor, and a roof deck. I can take you up to the second floor or the roof deck too.",
    asks: ["wcmpb", "wpcmb", "world class multi purpose building", "world-class multipurpose building", "multipurpose building", "multi-purpose hall", "the big building in the south", "the building with the roof deck", "two storey building", "the ramp", "pwd ramp"],
    place: PLACES.wcmpb,
  },
  {
    id: "upstairs",
    title: "Going upstairs",
    answer:
      "The model of the World-Class Multi-Purpose Building doesn't include its inside stairs yet, so I can take you up instead: to its second floor, or to its roof deck, where you can see the whole campus.",
    asks: ["how do i go upstairs", "second floor", "2nd floor", "take me upstairs", "roof deck", "rooftop", "the view", "elevator", "stairs"],
    place: PLACES.wcmpb2F,
    gesture: "raisehand",
    mood: "happy",
  },
  {
    id: "roof",
    title: "The roof deck",
    answer: "The roof deck of the World-Class Multi-Purpose Building looks out over the whole campus. I'll take you up.",
    asks: ["take me to the roof", "roof deck", "best view", "view of the campus", "rooftop"],
    place: PLACES.wcmpbRoof,
    gesture: "cheer",
    mood: "happy",
  },
  {
    id: "ar",
    title: "The AR building",
    answer:
      "The AR building is the long building in the northeast corner, with solar panels on its roof, beside the CCDL Auditorium. UPOU has been building its Academic Residences; this may be them.",
    asks: ["ar building", "academic residences", "dormitory", "dorm", "where do people stay", "the building with solar panels", "housing"],
    place: PLACES.ar,
  },
  {
    id: "icc",
    title: "The International Convention Center",
    answer:
      "UPOU's International Convention Center is its venue for conferences on open and distance e-learning. It hosted its first commencement, UPOU's 29th, on 6 December 2025.",
    asks: ["international convention center", "icc", "convention center", "graduation", "commencement", "where is graduation held"],
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
  },
  {
    id: "controls",
    title: "Getting around",
    answer:
      "Walk with W A S D or the arrow keys, run with Shift, and drag to look around. Double-click anywhere on the ground and you'll walk there along the paths, into buildings too. On a phone, use the pad at the bottom. Or ask Chancy Joan or Dean Rob to walk you somewhere.",
    asks: ["how do i move", "how to walk", "controls", "how do i run", "keyboard", "paano maglakad", "how do i get inside"],
  },
  {
    id: "voice",
    title: "Talking to people",
    answer: "Press Voice at the bottom to talk; people nearby hear you louder than people far away. Chat is next to it if you'd rather type. Gestures has waves, bows, and dances.",
    asks: ["how do i talk", "voice chat", "microphone", "how to chat", "gestures", "how do i wave"],
  },
  {
    id: "joke",
    title: "A joke",
    answer: "Why did the student bring a ladder to an online class? They heard it was a higher education. (I'll stick to directions.)",
    asks: ["tell me a joke", "say something funny", "make me laugh", "joke", "biro"],
    gesture: "cheer",
    mood: "happy",
  },
];

const KNOWLEDGE: Knowledge = {
  topics: TOPICS,
  starters: ["Give me a tour", "What is UPOU?", "Where are the faculty offices?", "Take me to the roof deck", "How do I apply?", "What is the Oblation?"],
  subject: "UPOU, this campus, and finding your way",
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
  self: "I'm Chancy Joan, one of SeiOU's guides. I walk between the Oblation, the Main Building, and the Teaching and Learning Hub, and I can walk you anywhere on campus. Everything I say was written for this world, so if I don't know something, I'll tell you.",
  invite: "Ask me about UPOU, or where anything is on campus. I can walk you there.",
};

export const DEAN_ROB: Persona = {
  name: "Dean Rob",
  self: "I'm Dean Rob, one of SeiOU's guides. I make the long round: the Main Building, the CCDL Auditorium, the AR building, and the World-Class Multi-Purpose Building. Ask me about UPOU or the way anywhere, and I'll walk you there. If I don't know something, I'll say so.",
  invite: "Ask me about UPOU, its buildings, or the way anywhere on campus.",
};

/** For now the CC0 VRoid Studio samples (pixiv Inc.) the world offers as
 *  avatars; their own Avaturn avatars can replace these later (upload
 *  them as .vrm and change the URLs). */
export const CHANCY_AVATAR = "/avatars/vroid/sample-female.vrm";
export const DEAN_ROB_AVATAR = "/avatars/vroid/sample-male.vrm";

const stop = (at: [number, number, number], wait: number): Stop => ({ at, wait });

/** Chancy Joan's round, near where visitors arrive. */
export const CHANCY_ROUTE: Stop[] = [stop([92, 0.2, 2], 35), stop([128, 0.2, 56], 30), stop([22, 0.2, -4], 30)];

/** Dean Rob's long round of the far buildings. */
export const DEAN_ROB_ROUTE: Stop[] = [stop([104, 0.2, -6], 30), stop([272, 1.3, -90], 40), stop([326, 1.1, -96], 25), stop([210, 1.6, 132], 40)];
