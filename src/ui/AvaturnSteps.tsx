import { L, useLang } from "../i18n/lang";
import { ACCENT_COLOR } from "./styles";

/**
 * The Avaturn tab's instructions. Avaturn makes a realistic avatar from a
 * few selfies on its own site, free, and lets you download it as a .glb;
 * Seiza converts that to an optimized VRM when you drop it in (see
 * src/avatar/import/glbToVrm.ts). Their embeddable editor needs a paid
 * plan, so it's a link, not an embed: nothing of Avaturn's runs in Seiza.
 */
export function AvaturnSteps() {
  useLang();
  return (
    <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4, fontSize: 12, opacity: 0.85 }}>
      <li>
        {L("Open", "")}{" "}
        <a href="https://avaturn.me" target="_blank" rel="noopener noreferrer" style={{ color: ACCENT_COLOR }}>
          Avaturn
        </a>{" "}
        {L("in a new tab, take the selfies, and dress your avatar.", "を新しいタブで開き、自撮りをして、アバターの服を選びます。")}
      </li>
      <li>{L("Export it as a .glb file and download it.", ".glb ファイルとして書き出し、ダウンロードします。")}</li>
      <li>{L("Drop that file here. Seiza turns it into a VRM, shrinks it, and you can preview it before using it.", "そのファイルをここにドロップします。SeizaがVRMに変換して軽量化し、使う前にプレビューできます。")}</li>
    </ol>
  );
}

export function AvaturnNotice() {
  useLang();
  return (
    <small style={{ opacity: 0.55 }}>
      {L(
        "Avaturn is a separate service with its own terms: your photos go to Avaturn, not to Seiza, and Seiza only receives the finished file you choose to upload. Avaturn avatars have no facial expressions, so they won't blink or smile, but they walk, sit, and gesture like any other avatar. Everyone in the room downloads your avatar, so it's your likeness they'll see.",
        "Avaturnは独自の規約を持つ別のサービスです。写真はSeizaではなくAvaturnに送られ、Seizaが受け取るのはあなたがアップロードした完成ファイルだけです。Avaturnのアバターには表情がないため、まばたきや笑顔はしませんが、ほかのアバターと同じように歩き、座り、ジェスチャーができます。部屋の全員があなたのアバターをダウンロードするので、あなたの姿が見られることになります。"
      )}
    </small>
  );
}
