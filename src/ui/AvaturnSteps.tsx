import { ACCENT_COLOR } from "./styles";

/**
 * The Avaturn tab's instructions. Avaturn makes a realistic avatar from a
 * few selfies on its own site, free, and lets you download it as a .glb;
 * Seiza converts that to an optimized VRM when you drop it in (see
 * src/avatar/import/glbToVrm.ts). Their embeddable editor needs a paid
 * plan, so it's a link, not an embed: nothing of Avaturn's runs in Seiza.
 */
export function AvaturnSteps() {
  return (
    <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4, fontSize: 12, opacity: 0.85 }}>
      <li>
        Open{" "}
        <a href="https://avaturn.me" target="_blank" rel="noopener noreferrer" style={{ color: ACCENT_COLOR }}>
          Avaturn
        </a>{" "}
        in a new tab, take the selfies, and dress your avatar.
      </li>
      <li>Export it as a .glb file and download it.</li>
      <li>Drop that file here. Seiza turns it into a VRM, shrinks it, and you can preview it before using it.</li>
    </ol>
  );
}

export function AvaturnNotice() {
  return (
    <small style={{ opacity: 0.55 }}>
      Avaturn is a separate service with its own terms: your photos go to Avaturn, not to Seiza, and Seiza only receives
      the finished file you choose to upload. Avaturn avatars have no facial expressions, so they won't blink or smile,
      but they walk, sit, and gesture like any other avatar. Everyone in the room downloads your avatar, so it's your
      likeness they'll see.
    </small>
  );
}
