// The card that opens over the world when you click an exhibit or a board:
// an illustration, a short explanation, and something to try.
import { useEffect, useState } from "react";
import { showWorldOverlay } from "../../../src/worlds/WorldExtension";
import { panelStyle, pillButtonStyle } from "../../../src/ui/styles";
import { INFO, type InfoKey, type LiveContext, type Trend } from "../sim/info";
import { REFERENCES } from "../sim/references";
import { dayTotals, live, rotorRpm, SAMPLE_MINUTES } from "./live";

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
  const trend = card.liveTrend && ctx && ctx.history.length > 1 ? <Sparkline trend={card.liveTrend} live={ctx} /> : null;
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
        {trend}
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
    history: live.history,
    sampleHours: SAMPLE_MINUTES / 60,
    rpm: rotorRpm(),
  };
}

/** A reading over the last 24 hours: one small SVG line from the history
 *  the plant already keeps (144 samples, nothing new stored), redrawn with
 *  the card once a second. */
function Sparkline({ trend, live: c }: { trend: Trend; live: LiveContext }) {
  // The samples, then the live value, so the line ends where the readings are.
  const values = [...c.history.map(trend.value), trend.value(c.now)];
  const lo = trend.min ?? Math.min(...values);
  let hi = trend.max ?? Math.max(...values);
  if (hi - lo < 1e-9) hi = lo + 1;
  const W = 300, H = 56;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - 4 - ((v - lo) / (hi - lo)) * (H - 8);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const digits = trend.digits ?? 2;
  const latest = values[values.length - 1];
  return (
    <div style={{ margin: "0 0 10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.75, marginBottom: 2 }}>
        <span>{trend.label}, last 24 h</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          now {latest.toFixed(digits)}
          {trend.unit === "%" ? "%" : ` ${trend.unit}`}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block", borderRadius: 6, background: "rgba(127,127,127,0.08)" }}>
        {lo < 0 && hi > 0 && <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity={0.3} strokeDasharray="3 3" />}
        <polyline points={points} fill="none" stroke={trend.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, opacity: 0.6 }}>
        <span>24 h ago</span>
        <span>now</span>
      </div>
    </div>
  );
}
