// Seizorai's HUD: the info cards (InfoCardHost), and Seiza's shared guide
// chat (src/guides/GuideHud.tsx) for talking to Ilaw-san. Shown through
// Seiza's world overlay.
import { GuideHud } from "../../../../src/guides/GuideHud";
import { INFO, type InfoKey } from "../../sim/info";
import { InfoCardHost, openInfo } from "../InfoCard";

export function SeizoraiHud() {
  return (
    <>
      <InfoCardHost />
      <GuideHud onOpenCard={(card) => openInfo(card as InfoKey)} cardTitle={(card) => INFO[card as InfoKey]?.title ?? card} />
    </>
  );
}
