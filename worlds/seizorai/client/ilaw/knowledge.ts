// What Ilaw-san knows. Every answer it gives is written here (or built from
// Seizorai's own info cards and the live plant), so it can never say
// something nobody wrote, and every number matches the displays.
//
// To teach it something, add a Topic: a title, the answer, and a few
// `asks` (ways people might put the question, in any language). They're
// what the matcher compares a question with, so more and more varied
// `asks` make it understand more. `place` lets it offer to take you there;
// `card` lets it open the matching info card.
import { INFO, type InfoKey } from "../../sim/info";

export interface Place {
  label: string;
  /** Where to stand: a spot near the exhibit, facing it. */
  at: [number, number, number];
}

export interface Topic {
  id: string;
  title: string;
  answer: string;
  asks: string[];
  card?: InfoKey;
  place?: Place;
}

export const PLACES = {
  welcome: { label: "the welcome board in the hall", at: [5.2, 0, 12.6] },
  solar: { label: "the solar array in the garden", at: [-4.2, 0, 27.6] },
  battery: { label: "the battery in the garden", at: [5.6, 0, 27.4] },
  turbines: { label: "the wind turbines on the meadow", at: [4.2, -0.6, 43.2] },
  control: { label: "the control room in the classroom", at: [1.2, 0, -18.6] },
  lab: { label: "the perovskite lab in the classroom", at: [-4.6, 0, -11.4] },
  cell: { label: "the perovskite cell in the classroom", at: [5.4, 0, -11.2] },
  camp: { label: "the campsite on the meadow", at: [-9.6, -0.6, 58.4] },
} satisfies Record<string, Place>;

/** The info cards, with where each exhibit stands and how people ask. */
const CARD_TOPICS: { card: InfoKey; place: Place; asks: string[] }[] = [
  { card: "sky", place: PLACES.solar, asks: ["how much sunlight", "irradiance", "why less power when cloudy", "does solar work when it rains", "sun angle", "weather and solar"] },
  { card: "silicon", place: PLACES.solar, asks: ["how do solar panels work", "silicon panels", "why do hot panels make less", "panel efficiency", "solar farm", "pv"] },
  { card: "perovskite", place: PLACES.solar, asks: ["what is perovskite", "brown panels", "new kind of solar cell", "perovskite pilot row", "why is the back row brown"] },
  { card: "wind", place: PLACES.turbines, asks: ["how do wind turbines work", "why do turbines stop", "turbine in a typhoon", "wind power", "cut in speed"] },
  { card: "battery", place: PLACES.battery, asks: ["what does the battery do", "energy storage", "why store electricity", "battery charge", "night power"] },
  { card: "grid", place: PLACES.control, asks: ["what is the grid", "island mode", "what happens if the grid goes down", "import export power", "brownout"] },
  { card: "load", place: PLACES.control, asks: ["who uses the power", "the town", "how much does a home use", "aircon electricity", "electric fan", "household consumption"] },
  { card: "elnino", place: PLACES.control, asks: ["what is el nino", "drought", "heatwave", "red alert grid", "rotating brownouts"] },
  { card: "layers", place: PLACES.cell, asks: ["layers of a solar cell", "inside a perovskite cell", "electron transport layer", "how is a cell made"] },
  { card: "degradation", place: PLACES.lab, asks: ["why does perovskite degrade", "moisture damage", "how long do panels last", "philippines humidity solar", "encapsulation seal"] },
];

const cardTopics: Topic[] = CARD_TOPICS.map(({ card, place, asks }) => ({
  id: `card:${card}`,
  title: INFO[card].title,
  answer: [INFO[card].body[0], INFO[card].try ? `Try this: ${INFO[card].try}` : ""].filter(Boolean).join(" "),
  asks: [INFO[card].title, ...asks],
  card,
  place,
}));

/** Written for Ilaw-san: the world, getting around, and the wider topic. */
const FAQ: Topic[] = [
  {
    id: "world",
    title: "About Seizorai",
    answer:
      "Seizorai is a learning world about solar futures: a solar, wind, and battery microgrid for a coastal town in Cebu, and a lab for a new kind of solar cell, perovskite. The plant runs live on the sky you see, so clouds and night really change what it makes.",
    asks: ["what is this place", "what is seizorai", "where am i", "what can i do here", "what is this world about", "ano ito", "nani kore"],
    place: PLACES.welcome,
  },
  {
    id: "microgrid",
    title: "What is a microgrid?",
    answer:
      "A microgrid is a small power system for one community: its own generators (here, sun and wind), storage (the battery), and the homes it serves. It can work with the main grid, or cut loose and run on its own in island mode when the main grid fails.",
    asks: ["what is a microgrid", "microgrid meaning", "local power system", "community energy"],
    place: PLACES.control,
  },
  {
    id: "tour",
    title: "A tour",
    answer:
      "Start with the welcome board in the hall. Then the garden: the solar array and the battery. Down the steps to the meadow for the wind turbines. Last, the classroom: the control room, where you can run the plant, and the perovskite lab, where you design a cell. Ask me to take you to any of them.",
    asks: ["give me a tour", "where should i go", "what should i see first", "show me around", "where to start", "pasyal", "annai shite"],
    place: PLACES.welcome,
  },
  {
    id: "controls",
    title: "Getting around",
    answer:
      "Walk with W A S D or the arrow keys, run with Shift, and jump with Space. Drag to look around. Double-click the floor to walk there. On a phone, use the pad at the bottom. Click any exhibit or board for its card.",
    asks: ["how do i move", "how to walk", "controls", "how do i run", "keyboard", "how do i jump", "paano maglakad"],
  },
  {
    id: "console",
    title: "Running the plant",
    answer:
      "The console beside the teacher's desk in the classroom runs the plant for everyone: breakers for the panels, the turbines, the battery, and the grid; the battery's mode; the time and the weather; and the El Niño 2026 scenario. If the room has an editor password, only editors can press it.",
    asks: ["how do i change the weather", "control panel", "can i turn off the grid", "breakers", "change the time", "make it rain", "run the plant"],
    place: PLACES.control,
  },
  {
    id: "sustainability",
    title: "Sustainability",
    answer:
      "Sustainability means meeting today's needs without taking away what people later will need. For energy, that's power from sources that don't run out or heat the planet, used carefully, and fairly shared, so a town can keep its lights on through heat, typhoons, and fuel price shocks.",
    asks: ["what is sustainability", "sustainable energy", "renewable energy", "why renewables", "green energy", "clean energy", "climate friendly power"],
  },
  {
    id: "climate",
    title: "Climate change",
    answer:
      "Burning coal, oil, and gas adds carbon dioxide to the air, which traps heat and warms the planet. For the Philippines that means hotter days, stronger rain, and rising seas. Solar and wind make electricity without burning anything; the control room counts the CO₂ the plant avoids.",
    asks: ["what is climate change", "global warming", "carbon dioxide", "co2", "greenhouse gas", "why is it getting hotter"],
    place: PLACES.control,
  },
  {
    id: "save",
    title: "Saving electricity at home",
    answer:
      "The big users in a Filipino home are aircon and the fridge. Set aircon a degree or two warmer, close doors and curtains on the sun, keep the fridge door shut and its coils clean, switch to LED bulbs, and unplug chargers and TVs at the wall. Fans use far less than aircon.",
    asks: ["how to save electricity", "lower my electric bill", "save energy at home", "tipid kuryente", "energy saving tips", "setsuden"],
  },
  {
    id: "rooftop",
    title: "Solar on your own roof",
    answer:
      "A home can have its own panels. In the Philippines, the Renewable Energy Act of 2008 (RA 9513) set up net metering, so a small rooftop system can send its spare power to the utility for a credit. How much it pays back depends on the roof, the shade, and the rates, so ask an accredited installer for a site check.",
    asks: ["can i put solar on my house", "rooftop solar", "net metering", "solar for my home", "is solar worth it"],
  },
  {
    id: "night",
    title: "Power at night",
    answer:
      "Solar makes nothing at night. Here, the battery covers the evening peak with sunlight stored during the day, the turbines help when there's wind, and the main grid fills the rest. Ask me what the battery is doing right now.",
    asks: ["what happens at night", "solar at night", "power when the sun sets", "no sun"],
    card: "battery",
    place: PLACES.battery,
  },
  {
    id: "typhoon",
    title: "Typhoons",
    answer:
      "In a typhoon the turbines feather their blades and brake so they survive, which means they make nothing; the clouds cut solar to a fraction. That's when storage, and being able to run as an island if the main grid goes down, matters most.",
    asks: ["what happens in a typhoon", "bagyo", "storm", "strong winds", "taifu"],
    card: "wind",
    place: PLACES.turbines,
  },
  {
    id: "camp",
    title: "The campsite",
    answer: "Everyone wakes up at the tent on the meadow. You can sit in the camp chairs round the fire, click the fire to light it or put it out, and lie down in the sleeping bags.",
    asks: ["where is the tent", "campfire", "where did i start", "can i sleep", "camp"],
    place: PLACES.camp,
  },
  {
    id: "voice",
    title: "Talking to people",
    answer: "Press Voice at the bottom to talk; people nearby hear you louder than people far away. Chat is next to it if you'd rather type. Gestures has waves, bows, and dances.",
    asks: ["how do i talk", "voice chat", "microphone", "how to chat", "gestures", "how do i wave"],
  },
];

/** Who Ilaw-san is, and small talk. */
const SELF: Topic[] = [
  {
    id: "self",
    title: "Ilaw-san",
    answer:
      "I'm Ilaw-san, Seizorai's guide. Ilaw means light in Filipino, and san is how you'd politely say someone's name in Japanese. I walk around the exhibits all day. I'm not a chatbot that makes things up: everything I say was written for this world, so if I don't know, I'll say so.",
    asks: ["who are you", "what are you", "your name", "are you an ai", "are you a robot", "are you human", "sino ka", "anata wa dare", "are you chatgpt", "are you real"],
  },
  {
    id: "how",
    title: "How I work",
    answer:
      "I compare your question with the questions I was taught, in your browser, and give the closest answer. Nothing you type leaves your device or is saved, and I don't use the internet.",
    asks: ["how do you work", "do you save my messages", "are you listening", "privacy", "do you use the internet", "is this recorded"],
  },
  {
    id: "joke",
    title: "A joke",
    answer: "Why did the solar panel get a good grade? It was a bright student. (I also know one about a battery, but it isn't charged up yet.)",
    asks: ["tell me a joke", "say something funny", "make me laugh", "joke", "biro"],
  },
  {
    id: "fav",
    title: "My favourite",
    answer: "The battery at sunset: all day it quietly saves sunlight, and then at dusk it keeps the town's lights on. Ask me to take you there.",
    asks: ["what is your favorite", "what do you like", "favourite exhibit", "best thing here"],
    place: PLACES.battery,
  },
];

export const TOPICS: Topic[] = [...cardTopics, ...FAQ, ...SELF];

/** What to suggest when someone doesn't know what to ask. */
export const STARTERS = ["What is this place?", "What's the battery doing now?", "Give me a tour", "How do solar panels work?", "What is El Niño?", "How can I save electricity?"];
