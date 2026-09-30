import { Billboard, Text } from "@react-three/drei";
import { useEffect, useState } from "react";

interface ChatBubbleProps {
  /** Latest message from this player, or null for none. */
  text: string | null;
  /** Changes when a new message arrives, so repeating the same words
   *  re-shows the bubble instead of being ignored as "no change". */
  messageId: string | null;
  /** Height above the player's feet, in metres. */
  y: number;
}

/** How long a bubble stays up. Long enough to read a sentence at a
 *  glance, short enough that a room of talkers doesn't become a wall. */
const VISIBLE_MS = 6000;
/** Longer messages are clipped rather than allowed to become billboards
 *  the size of a wall. The chat panel has the full text. */
const MAX_CHARS = 90;

/**
 * The last thing somebody said, floating over their head for a few
 * seconds.
 *
 * This exists because the chat panel is a panel: reading it means
 * looking away from the room and from whoever is speaking, which in a
 * space whose entire point is spatial presence is exactly the wrong
 * direction to make people look. A bubble puts the words where the
 * person is.
 *
 * It supplements the panel rather than replacing it — bubbles expire,
 * clip long messages, and can overlap in a crowd, so the panel remains
 * the authoritative transcript.
 */
export function ChatBubble({ text, messageId, y }: ChatBubbleProps) {
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    if (!text || !messageId) return;
    setShown(text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS).trimEnd()}…` : text);
    const timer = window.setTimeout(() => setShown(null), VISIBLE_MS);
    // Keyed on messageId, not text: two identical messages in a row are
    // two events, and the second should restart the timer rather than
    // let the first one's expiry cut it short.
    return () => window.clearTimeout(timer);
  }, [text, messageId]);

  if (!shown) return null;

  return (
    <Billboard position={[0, y, 0]}>
      {/* No background plane behind the text: sizing one to wrapped text
          means measuring the glyphs, and an outline reads cleanly over
          both the bright sky and the dark interior without it. */}
      <Text
        fontSize={0.105}
        color="white"
        outlineWidth={0.011}
        outlineColor="#0b0d14"
        anchorX="center"
        anchorY="bottom"
        maxWidth={1.9}
        textAlign="center"
        overflowWrap="break-word"
      >
        {shown}
      </Text>
    </Billboard>
  );
}
