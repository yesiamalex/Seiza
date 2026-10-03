/**
 * App-wide motion and interaction polish, in one place.
 *
 * Almost every component here styles itself with inline React styles,
 * which can't express `:hover`, `:focus-visible` or keyframes. This sheet
 * fills that gap and keeps the timing consistent: one easing curve and
 * three durations, so panels, tabs and dialogs all move the same way
 * instead of each picking their own.
 *
 * Transitions are deliberately unhurried — around a quarter of a second,
 * which reads as smooth rather than twitchy — and everything collapses to
 * nothing when the viewer asks for reduced motion.
 */
export function GlobalStyles() {
  return <style>{CSS}</style>;
}

const CSS = `
  :root {
    --seiza-ease: cubic-bezier(0.22, 1, 0.36, 1);
    --seiza-fast: 200ms;
    --seiza-mid: 280ms;
    --seiza-slow: 360ms;
    --seiza-accent: #e8c37a;
  }

  /* Scrollbars, everywhere at once: the guide, chat, roster, gesture and
     edit panels all scroll, and the browser's default bar was the one
     unstyled thing left in each. A thin translucent thumb on a clear
     track, like the panels' own borders, brightening toward the accent
     while held. Firefox reads the two standard properties; Chromium and
     Safari read the -webkit- rules. */
  * {
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.22) transparent;
  }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 999px;
    /* The clear border insets the thumb, so it floats inside the panel's
       rounded corners instead of running into them. */
    border: 3px solid transparent;
    background-clip: padding-box;
  }
  ::-webkit-scrollbar-thumb:hover { background-color: rgba(255, 255, 255, 0.34); }
  ::-webkit-scrollbar-thumb:active { background-color: rgba(232, 195, 122, 0.7); }
  ::-webkit-scrollbar-corner { background: transparent; }

  button, select, a {
    transition:
      background-color var(--seiza-mid) var(--seiza-ease),
      border-color var(--seiza-mid) var(--seiza-ease),
      box-shadow var(--seiza-mid) var(--seiza-ease),
      color var(--seiza-mid) var(--seiza-ease),
      opacity var(--seiza-mid) var(--seiza-ease),
      transform var(--seiza-fast) var(--seiza-ease);
  }
  button:not(:disabled):hover { filter: brightness(1.09); }
  button:not(:disabled):active { transform: scale(0.975); }
  button:disabled { cursor: not-allowed; }
  button:focus-visible, select:focus-visible, input:focus-visible, [role="tab"]:focus-visible {
    outline: 2px solid rgba(232, 195, 122, 0.85);
    outline-offset: 2px;
  }
  input[type="checkbox"], input[type="range"], input[type="color"] { accent-color: var(--seiza-accent); }
  input[type="text"], input[type="file"], select {
    transition: border-color var(--seiza-mid) var(--seiza-ease), background-color var(--seiza-mid) var(--seiza-ease);
  }

  /* Tab panels (Design / Presets / Upload VRM) cross-fade upward, so
     switching sources feels like turning a page rather than a hard cut. */
  .seiza-tabpanel { animation: seiza-panel-in var(--seiza-slow) var(--seiza-ease) both; }
  @keyframes seiza-panel-in {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: none; }
  }

  .seiza-rise-in { animation: seiza-rise-in 560ms var(--seiza-ease) both; }
  @keyframes seiza-rise-in {
    from { opacity: 0; transform: translateY(16px) scale(0.99); }
    to { opacity: 1; transform: none; }
  }

  .seiza-fade-in { animation: seiza-fade-in 420ms ease both; }
  @keyframes seiza-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .seiza-swatch { transition: transform var(--seiza-fast) var(--seiza-ease), box-shadow var(--seiza-mid) var(--seiza-ease); }
  .seiza-swatch:hover { transform: scale(1.14); }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 1ms !important;
      animation-delay: 0ms !important;
      transition-duration: 1ms !important;
    }
    button:not(:disabled):active { transform: none; }
  }
`;
