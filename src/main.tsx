import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { GlobalStyles } from "./ui/GlobalStyles";
import { unlockAudio } from "./audio/sfx";
import { configureTextBuilder } from "troika-three-text";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Missing #root element — check index.html");
}

// 3D text (name tags) lays out its glyphs on the main thread. troika, the
// library behind drei's <Text>, does it in a worker by default, but that
// worker loads its code with importScripts() from a blob: URL, which the
// site's Content-Security-Policy forbids (script-src has no blob:, on
// purpose; see public/_headers). The worker then failed as soon as a
// second person's name tag had to be drawn, and took the scene down with
// it. Name tags are a few short words, so the main thread costs nothing.
configureTextBuilder({ useWorker: false });

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
