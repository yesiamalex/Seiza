import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { GlobalStyles } from "./ui/GlobalStyles";
import { unlockAudio } from "./audio/sfx";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Missing #root element — check index.html");
}

// Arms the audio context on the first click or keypress, so world sounds
// are not silently dropped into a suspended context later.
unlockAudio();

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    {/* Mounted above App so the shared motion styles also cover the join
        screen, which renders before the world exists. */}
    <GlobalStyles />
    <App />
  </React.StrictMode>
);
