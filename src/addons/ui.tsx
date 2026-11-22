import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useExclusiveMenu } from "../ui/exclusiveMenu";
import { useDismissOnOutside } from "../ui/useDismissOnOutside";
import { BAR_LABEL_CLASS, barButtonStyle, panelStyle, pillButtonStyle, popoverStyle } from "../ui/styles";
import { L } from "../i18n/lang";

/** Each mode's own colour, so its button reads as the mode's, not Seiza's. */
export const MODE_ACCENTS = { fantasy: "#ff6b81", band: "#b48cff" } as const;

const tint = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

/** A room mode's button in the bar, in its colour, with its panel above. */
export function ModeButton({ id, accent, icon, label, title, children, onOpenChange }: { id: string; accent: string; icon: ReactNode; label: string; title: string; children: ReactNode; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpenState] = useState(false);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  useEffect(() => onOpenChangeRef.current?.(open), [open]);
  const setOpen = setOpenState;
  const ref = useRef<HTMLDivElement>(null);
  useExclusiveMenu(id, open, () => setOpen(false));
  useDismissOnOutside(ref, open, () => setOpen(false));
  const style: CSSProperties = {
    ...barButtonStyle,
    color: accent,
    background: tint(accent, open ? 0.26 : 0.12),
    border: `1px solid ${tint(accent, open ? 0.75 : 0.4)}`,
  };
  return (
    <div ref={ref} style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button type="button" className="seiza-bar-btn" style={style} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={title} title={title}>
        {icon}
        <span className={BAR_LABEL_CLASS}>{label}</span>
      </button>
      {open && (
        <div
          className="seiza-popover"
          style={{
            ...panelStyle,
            ...popoverStyle,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            width: "min(320px, calc(100vw - 32px))",
            maxHeight: "min(520px, calc(100svh - 150px))",
            overflowY: "auto",
            boxSizing: "border-box",
            borderColor: tint(accent, 0.35),
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** A labelled row of choices, one of which is picked. */
export function Choices<T extends string>({
  title,
  options,
  value,
  onChange,
  accent,
  render,
}: {
  title: string;
  options: readonly T[];
  value: T | null;
  onChange: (value: T) => void;
  accent: string;
  render: (option: T) => ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <strong style={{ fontSize: 12, opacity: 0.85 }}>{title}</strong>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            style={{
              ...pillButtonStyle,
              padding: "7px 12px",
              fontSize: 12,
              ...(value === option ? { background: tint(accent, 0.28), border: `1px solid ${tint(accent, 0.8)}` } : {}),
            }}
          >
            {render(option)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A mode's help text. In a string, **these** are set bold in the mode's
 *  colour: the controls, so they stand out of the paragraph. */
export const Hint = ({ children, accent }: { children: ReactNode; accent?: string }) => (
  <small style={{ opacity: 0.75, lineHeight: 1.45 }}>
    {typeof children === "string"
      ? children.split(/\*\*(.+?)\*\*/g).map((part, i) =>
          i % 2 ? (
            <strong key={i} style={{ color: accent, fontWeight: 700 }}>
              {part}
            </strong>
          ) : (
            part
          )
        )
      : children}
  </small>
);

/** A switch for a room mode, for whoever may change the room. */
export function ModeSwitch({ label, description, on, accent, onChange, disabled }: { label: string; description: string; on: boolean; accent: string; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1 }}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 2, accentColor: accent }} />
      <span style={{ display: "grid", gap: 2 }}>
        <span style={{ color: on ? accent : undefined }}>{label}</span>
        <small style={{ opacity: 0.6, lineHeight: 1.4 }}>{description}</small>
      </span>
    </label>
  );
}

export const SwordIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
    <path d="m13 19 6-6M16 16l4 4M19 21l2-2" />
  </svg>
);

export const MusicIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

export { L };
