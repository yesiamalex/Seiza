// Tala, Seisugbo's guide: who she is, how she looks (a designed avatar,
// built in code, so there's no file to ship), where she spends her day,
// and the way she walks the meadow. What she knows is in knowledge.ts.
//
// The meadow has no navmesh, and a straight line from the tent to the
// court runs through the lane's houses, so she walks a small graph of
// open ground instead (findPath below): the lane's middle, the path from
// the garden, and round the ends of the court's lines.
import * as THREE from "three";
import type { Persona, Place } from "../../../src/guides/brain";
import type { Stop } from "../../../src/guides/route";
import { encodeAvatarSpec } from "../../../src/avatar/designer/avatarSpec";
import { Y } from "./plan";

export const TALA: Persona = {
  name: "Tala",
  self: "I'm Tala, Seisugbo's guide. Tala means star in Filipino, and Seiza, which this world runs on, means constellation in Japanese, so I'm one small star in it. I wasn't on the Urbanity Walk myself: I'm made from what the people who were there wrote down, so I'll only tell you what they did, and if I don't know something, I'll say so.",
  invite: "Ask me about the Urbanity Walk, the art, the forum, or how and why this world was made. I can walk you around too.",
  nameJa: "タラ",
  selfJa:
    "タラです。Seisugboのガイドです。「タラ」はフィリピン語で「星」、このワールドが動いているSeizaは日本語の「星座」なので、わたしはその中の小さな星のひとつです。わたし自身はアーバニティ・ウォークに参加していません。参加した人たちが書き残したことからできているので、その人たちのしたことだけをお話しします。知らないことは知らないと言いますね。",
  inviteJa: "アーバニティ・ウォーク、作品、フォーラム、このワールドの作り方と理由、何でも聞いてください。案内もできますよ。",
};

/** A designed avatar: a ponytail, a guide's cap, and a sunset-orange shirt. */
export const TALA_AVATAR = encodeAvatarSpec({
  skin: "#d9a07a",
  hairStyle: "ponytail",
  hairColor: "#1f1a17",
  eyeColor: "#2e2118",
  top: "tshirt",
  topColor: "#d97b3f",
  bottom: "pants",
  bottomColor: "#1d2433",
  shoeColor: "#f2f0eb",
  accessories: ["cap"],
  accessoryColor: "#2f8fb0",
  height: 0.96,
  build: 0.94,
  shoulders: 0.9,
  waist: 0.82,
});

/** Where visitors wake (world.json), which she faces from home. */
export const TALA_FACES: [number, number] = [-13.03, 58.35];

// --- the ground she walks ------------------------------------------------------------------------

const NODES = {
  home: [-8.2, 60.4], // by the tent, just outside the arch
  welcome: [-9.0, 56.2], // in front of the welcome board
  arch: [-6.4, 60],
  corner: [0, 60], // where the path from the garden meets the lane
  mid: [13, 60],
  courtGate: [13, 54.2],
  court: [13, 52], // inside the court, by Group A's line
  courtEast: [19, 52], // round the east end of the lines
  collage: [19, 47.4], // in front of the collage wall
  path: [0, 54],
  low: [0, 47.1],
  portals: [1.9, 47.1],
  steps: [0, 41.5],
} satisfies Record<string, [number, number]>;
type Node = keyof typeof NODES;

const EDGES: [Node, Node][] = [
  ["home", "arch"],
  ["home", "welcome"],
  ["arch", "corner"],
  ["corner", "mid"],
  ["mid", "courtGate"],
  ["courtGate", "court"],
  ["court", "courtEast"],
  ["courtEast", "collage"],
  ["corner", "path"],
  ["path", "low"],
  ["low", "portals"],
  ["low", "steps"],
];

const place = (id: string, label: string, labelJa: string, node: Node): Place => ({ id, label, labelJa, at: [NODES[node][0], Y, NODES[node][1]] });

export const PLACES = {
  welcome: place("welcome", "the welcome board by the tent", "テントのそばの案内板", "welcome"),
  lane: place("lane", "the lane and the walking tour's photos", "路地とまち歩きの写真", "arch"),
  court: place("court", "the covered court", "屋根つきコート", "court"),
  collage: place("collage", "the collage wall", "コラージュの壁", "collage"),
  portals: place("portals", "the portals to FrameVR", "FrameVRへのポータル", "portals"),
  // Seiza's hall and classroom, up the garden steps: taken there at once.
  hall: { id: "hall", label: "the arts-based research board in the hall", labelJa: "ホールのアートベース・リサーチの案内板", at: [5.1, 0, 13.0], walk: false } as Place,
  classroom: { id: "classroom", label: "the classroom's Let's talk board", labelJa: "教室の「話そう」ボード", at: [-5.9, 0, -16.2], walk: false } as Place,
};

/** Her day: mostly at home, greeting arrivals, with a stroll down the lane
 *  to the court and back now and then. Home is the first stop. */
export const TALA_ROUTE: Stop[] = (
  [
    ["home", 300],
    ["court", 25],
    ["home", 300],
    ["portals", 20],
  ] as [Node, number][]
).map(([node, wait]) => ({ at: [NODES[node][0], Y, NODES[node][1]], wait }));

const nearest = (x: number, z: number) => {
  let best: Node = "home";
  let bestD = Infinity;
  for (const [name, [nx, nz]] of Object.entries(NODES) as [Node, [number, number]][]) {
    const d = (nx - x) ** 2 + (nz - z) ** 2;
    if (d < bestD) [best, bestD] = [name, d];
  }
  return best;
};

/** The way from one point on the meadow to another, along the graph:
 *  to the nearest node, node to node, then on to where it's going.
 *  Null off the meadow (the hall and classroom), for a straight walk. */
export function findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null {
  if (from.z < 38 || to.z < 38) return null;
  const start = nearest(from.x, from.z);
  const goal = nearest(to.x, to.z);
  // Dijkstra over a dozen nodes.
  const dist = new Map<Node, number>([[start, 0]]);
  const prev = new Map<Node, Node>();
  const open = new Set<Node>([start]);
  while (open.size) {
    const at = [...open].reduce((a, b) => ((dist.get(a) ?? Infinity) <= (dist.get(b) ?? Infinity) ? a : b));
    open.delete(at);
    if (at === goal) break;
    for (const [a, b] of EDGES) {
      const next = a === at ? b : b === at ? a : null;
      if (!next) continue;
      const d = (dist.get(at) ?? 0) + Math.hypot(NODES[at][0] - NODES[next][0], NODES[at][1] - NODES[next][1]);
      if (d < (dist.get(next) ?? Infinity)) {
        dist.set(next, d);
        prev.set(next, at);
        open.add(next);
      }
    }
  }
  const nodes: Node[] = [goal];
  while (nodes[0] !== start) {
    const back = prev.get(nodes[0]);
    if (!back) return null;
    nodes.unshift(back);
  }
  const point = (node: Node) => new THREE.Vector3(NODES[node][0], Y, NODES[node][1]);
  return [from.clone(), ...nodes.map(point), to.clone()];
}
