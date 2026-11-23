import fs from "node:fs";
import path from "node:path";
import express from "express";
import { createApp } from "./app";
import { config, liveConfigured } from "./config";
import { Store } from "./store";

const store = new Store(config.dataFile);
const { app, start } = createApp(store);

// 빌드된 웹 화면 제공 (npm run build 후 npm start)
const dist = path.resolve("dist");
if (fs.existsSync(path.join(dist, "index.html"))) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|r\/|webhooks|auth|uploads).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const stop = start();
const server = app.listen(config.port, () => {
  console.log(`\n  ▶ AutoDM 서버: http://localhost:${config.port}`);
  console.log(`  ▶ 데이터 파일: ${config.dataFile}`);
  console.log(`  ▶ 실제 인스타그램 연동: ${liveConfigured() ? "사용 가능" : "미설정 (.env의 IG_APP_ID / IG_APP_SECRET) — 데모 모드로 체험할 수 있어요"}`);
  if (config.publicBaseUrl) console.log(`  ▶ 웹훅 주소: ${config.publicBaseUrl}/webhooks/instagram`);
  console.log("");
});

function shutdown() {
  stop();
  store.flush();
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
