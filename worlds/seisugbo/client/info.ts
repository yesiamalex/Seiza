// The words on Seisugbo's boards, and on the cards they open. Edit freely:
// the boards redraw from this file.

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
