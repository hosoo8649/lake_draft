import "@seed-design/css/base.css";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { FeedbackProvider } from "./components/feedback";
import { AppStateProvider } from "./lib/appState";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <FeedbackProvider>
        <AppStateProvider>
          <App />
        </AppStateProvider>
      </FeedbackProvider>
    </BrowserRouter>
  </StrictMode>,
);
