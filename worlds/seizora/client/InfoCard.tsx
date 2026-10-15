// The card that opens over the world when you click an exhibit or a board:
// an illustration, a short explanation, and something to try.
import { showWorldOverlay } from "../../../src/worlds/WorldExtension";
import { panelStyle, pillButtonStyle } from "../../../src/ui/styles";
import { INFO, type InfoKey } from "../sim/info";
import { REFERENCES } from "../sim/references";

export function openInfo(key: InfoKey) {
  showWorldOverlay(<InfoCard infoKey={key} />);
}

function InfoCard({ infoKey }: { infoKey: InfoKey }) {
  const card = INFO[infoKey];
  const close = () => showWorldOverlay(null);
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
        <div style={{ borderRadius: 8, overflow: "hidden", marginBottom: 10 }} dangerouslySetInnerHTML={{ __html: card.art }} />
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
