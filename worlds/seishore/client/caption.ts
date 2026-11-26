// A caption for what you're doing (praying, a fortune, an order): Japanese
// first, English under it, for a few seconds (the Hud shows it).
import { useSyncExternalStore } from "react";

let caption: { ja: string; en: string } | null = null;
let captionTimer = 0;
const captionListeners = new Set<() => void>();

export function showCaption(ja: string, en: string, seconds = 3) {
  caption = { ja, en };
  window.clearTimeout(captionTimer);
  captionTimer = window.setTimeout(() => {
    caption = null;
    captionListeners.forEach((l) => l());
  }, seconds * 1000);
  captionListeners.forEach((l) => l());
}

export const useCaption = () =>
  useSyncExternalStore(
    (l) => {
      captionListeners.add(l);
      return () => captionListeners.delete(l);
    },
    () => caption,
    () => null
  );
