import "dotenv/config";
import path from "node:path";

const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  port: num(process.env.PORT, 8787),
  /** 데이터 파일 경로 */
  dataFile: path.resolve(process.env.DATA_FILE ?? "data/db.json"),
  /** Meta(Instagram) 앱 설정 — 비어 있으면 데모 모드로만 동작 */
  igAppId: process.env.IG_APP_ID ?? "",
  igAppSecret: process.env.IG_APP_SECRET ?? "",
  webhookVerifyToken: process.env.WEBHOOK_VERIFY_TOKEN ?? "",
  /** 외부에서 접근 가능한 주소 (웹훅·OAuth 리다이렉트·클릭 추적) */
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, ""),
  graphVersion: process.env.IG_GRAPH_VERSION ?? "v23.0",
  /** 웹 화면 주소 (OAuth 완료 후 돌아갈 곳). 개발 중에는 Vite 주소 */
  webBaseUrl: (process.env.WEB_BASE_URL ?? "").replace(/\/$/, ""),
  isProd: process.env.NODE_ENV === "production",
};

export const liveConfigured = () => Boolean(config.igAppId && config.igAppSecret);

export const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
  "instagram_business_content_publish",
  "instagram_business_manage_insights",
];
