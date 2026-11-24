import "@seed-design/css/base.css";
// Pretendard — 앱 안에 넣어 둔 글꼴 (필요한 글자 묶음만 불러와요)
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { App } from "./App";
import { FeedbackProvider } from "./components/feedback";
import { AppStateProvider } from "./lib/appState";

// 데이터 라우터: 만들던 자동화를 나갈 때 한 번 더 묻기(useBlocker) 위해 사용해요
const router = createBrowserRouter([
  {
    path: "*",
    element: (
      <FeedbackProvider>
        <AppStateProvider>
          <App />
        </AppStateProvider>
      </FeedbackProvider>
    ),
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
