// Boarding the Seikansen from one world to another: who you are goes
// with you, so the next world takes you straight onto the train (its
// loading screen) instead of its join screen.
//
// Only what can make the trip: your name always, and your avatar when it's
// a designer avatar (its spec is the whole avatar, a line of text). An
// uploaded file or a world's preset lives on, or belongs to, the world you
// left, so with those the next world's join screen opens with your name
// filled in, and you choose there.
//
// It rides in the link's #fragment, which browsers never send to a server,
// and the next world takes it out of the address bar as soon as it reads it.
import { decodeAvatarSpec, isDesignerAvatarUrl } from "../avatar/designer/avatarSpec";

export interface Traveller {
  name: string;
  /** A designer avatar's spec (seiza-avatar:v1:…), when that's what you wear. */
  avatar?: string;
}

const KEY = "board";
const MAX_NAME = 32;

const toBase64Url = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

/** A world's address with you on board. */
export function boardingUrl(url: string, traveller: Traveller | null): string {
  if (!traveller?.name.trim()) return url;
  const payload: Traveller = { name: traveller.name.trim().slice(0, MAX_NAME) };
  if (traveller.avatar && isDesignerAvatarUrl(traveller.avatar)) payload.avatar = traveller.avatar;
  return `${url.split("#")[0]}#${KEY}=${toBase64Url(JSON.stringify(payload))}`;
}

/** Whoever just arrived by train, read once from the address and taken out of it. */
export function takeTraveller(location: Pick<Location, "hash" | "pathname" | "search"> = window.location, replace: (url: string) => void = (u) => window.history.replaceState(null, "", u)): Traveller | null {
  const match = location.hash.match(new RegExp(`(?:^#|&)${KEY}=([A-Za-z0-9_-]+)`));
  if (!match) return null;
  replace(location.pathname + location.search);
  try {
    const raw = JSON.parse(fromBase64Url(match[1])) as Partial<Traveller>;
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, MAX_NAME) : "";
    if (!name) return null;
    const avatar = typeof raw.avatar === "string" && isDesignerAvatarUrl(raw.avatar) && decodeAvatarSpec(raw.avatar) ? raw.avatar : undefined;
    return { name, ...(avatar ? { avatar } : {}) };
  } catch {
    return null;
  }
}
