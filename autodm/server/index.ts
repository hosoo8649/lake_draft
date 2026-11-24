import fs from "node:fs";
import path from "node:path";
import express from "express";
import { createApp } from "./app";
import { config, liveConfigured } from "./config";
import { Store } from "./store";

const store = new Store(config.dataFile);
const { app, start, auth } = createApp(store);

// 빌드된 웹 화면 제공 (npm run build 후 npm start)
const dist = path.resolve("dist");
if (fs.existsSync(path.join(dist, "index.html"))) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|r\/|webhooks|auth|uploads).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const stop = start();
const server = app.listen(config.port, config.host, () => {
  const { password, fromEnv } = auth.ensureSecrets();
  console.log(`\n  ▶ 캐롤DM 서버: http://localhost:${config.port}  (${config.host === "127.0.0.1" ? "이 PC에서만 접속" : `${config.host}에서 접속 허용`})`);
  console.log(`  ▶ 바깥(터널·다른 기기)에서 접속할 때 관리자 비밀번호: ${fromEnv ? "(.env의 ADMIN_PASSWORD)" : password}  — 이 PC의 localhost에서는 필요 없어요`);
  console.log(`  ▶ 데이터 파일: ${config.dataFile}`);
  console.log(`  ▶ 실제 인스타그램 연동: ${liveConfigured() ? "사용 가능" : "미설정 (.env의 IG_APP_ID / IG_APP_SECRET) — 데모 모드로 체험할 수 있어요"}`);
  if (config.publicBaseUrl) console.log(`  ▶ 웹훅 주소: ${config.publicBaseUrl}/webhooks/instagram`);
  console.log("");
});

function shutdown() {
  stop();
  store.flush();
  // 실시간 갱신(SSE)처럼 열려 있는 연결이 있어도 바로 끝나도록
  server.closeAllConnections();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
