// The card that opens over the world when you click an exhibit or a board:
// an illustration, a short explanation, and something to try.
import { useEffect, useState } from "react";
import { showWorldOverlay } from "../../../src/worlds/WorldExtension";
import { panelStyle, pillButtonStyle } from "../../../src/ui/styles";
import { INFO, type InfoKey, type LiveContext } from "../sim/info";
import { REFERENCES } from "../sim/references";
import { dayTotals, live } from "./live";

export function openInfo(key: InfoKey) {
  showWorldOverlay(<InfoCard infoKey={key} />);
}

function InfoCard({ infoKey }: { infoKey: InfoKey }) {
  const card = INFO[infoKey];
  const close = () => showWorldOverlay(null);
  // A card with live parts redraws them once a second while it's open, and
  // never while it's closed.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!card.liveArt && !card.liveStats) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [card]);
  const ctx = liveContext();
  const art = card.liveArt && ctx ? card.liveArt(ctx) : card.art;
  const stats = card.liveStats && ctx ? card.liveStats(ctx) : null;
  return (
    <div
      role="dialog"
      aria-label={card.title}
      onClick={close}
      style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", padding: 16, pointerEvents: "auto", zIndex: 40 }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{ ...panelStyle, width: "min(440px, 100%)", maxHeight: "min(640px, 90vh)", overflowY: "auto", padding: 16, fontSize: 14, lineHeight: 1.5 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
          <strong style={{ fontSize: 16 }}>{card.title}</strong>
          <button style={pillButtonStyle} onClick={close} aria-label="Close">
            Close
          </button>
        </div>
        {/* Our own static SVG from sim/info.ts, never user content. */}
        <div style={{ borderRadius: 8, overflow: "hidden", marginBottom: 10 }} dangerouslySetInnerHTML={{ __html: art }} />
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 6, margin: "0 0 10px" }}>
            {stats.map(([label, value]) => (
              <div key={label} style={{ padding: "6px 8px", borderRadius: 8, background: "rgba(122,162,255,0.1)", border: "1px solid rgba(122,162,255,0.25)" }}>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{label}</div>
                <div style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</div>
              </div>
            ))}
          </div>
        )}
        {card.body.map((paragraph) => (
          <p key={paragraph.slice(0, 24)} style={{ margin: "0 0 8px" }}>
            {paragraph}
          </p>
        ))}
        {card.try && (
          <p style={{ margin: "10px 0 0", padding: "8px 10px", borderRadius: 8, background: "rgba(124,255,158,0.1)", border: "1px solid rgba(124,255,158,0.3)" }}>
            <strong>Try this:</strong> {card.try}
          </p>
        )}
        {card.sources.length > 0 && (
          <p style={{ margin: "10px 0 0", fontSize: 12, opacity: 0.75 }}>
            <strong>Sources:</strong>{" "}
            {card.sources.map((key, i) => {
              const ref = REFERENCES[key];
              return (
                <span key={key}>
                  {i > 0 && "; "}
                  {ref.url ? (
                    <a href={ref.url} target="_blank" rel="noopener noreferrer" title={ref.full} style={{ color: "inherit" }}>
                      {ref.short}
                    </a>
                  ) : (
                    <span title={ref.full}>{ref.short}</span>
                  )}
                </span>
              );
            })}
            . Full list in Seizora's README.
          </p>
        )}
      </div>
    </div>
  );
}

/** The plant's live state for a card, or null before it has started. */
function liveContext(): LiveContext | null {
  if (!live.now) return null;
  const c = live.controls;
  return {
    now: live.now,
    gridConnected: c.gridConnected,
    windBreaker: c.wind,
    batteryMode: c.batteryMode,
    encapsulation: c.encapsulation,
    day: dayTotals(),
  };
}
