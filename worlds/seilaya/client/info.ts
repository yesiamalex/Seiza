// Seilaya's cards: what each station and safety tool says, written for
// learners rather than lawyers. Every claim rests on the sources listed
// with it (references.ts). The law summaries aren't legal advice; a
// school's own Committee on Decorum and Investigation decides real cases.
import type { CardKey } from "./safety";
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
      ["Together gestures", "Ask someone nearby for a handshake, high five, or hug. It only plays if they accept. You can turn off requests completely."],
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
