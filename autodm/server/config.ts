import "dotenv/config";
import path from "node:path";

const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  port: num(process.env.PORT, 8787),
  /** 기본은 이 PC에서만 접속 (다른 기기에서 열려면 HOST=0.0.0.0) */
  host: process.env.HOST ?? "127.0.0.1",
  /** 바깥(터널·다른 기기)에서 접속할 때 쓰는 관리자 비밀번호. 비우면 자동으로 만들어 콘솔에 보여 줘요 */
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  /** 데이터 파일 경로 */
  dataFile: path.resolve(process.env.DATA_FILE ?? "data/db.json"),
  /** Meta(Instagram) 앱 설정 — 비어 있으면 데모 모드로만 동작 */
  igAppId: process.env.IG_APP_ID ?? "",
  igAppSecret: process.env.IG_APP_SECRET ?? "",
  /**
   * 통합 로그인(Unified login) 구성 ID. 2026년 10월 이후 새로 만든 Meta 앱은 별도의 Instagram 앱 ID가 없고
   * "API setup with Unified login"만 제공해요. 이 값을 넣으면 IG_APP_ID/IG_APP_SECRET에 Meta 앱 ID·시크릿을 쓰고
   * 페이스북 로그인 창(config_id) + graph.facebook.com 으로 연동해요. 비우면 기존 Instagram 로그인 방식.
   */
  igLoginConfigId: process.env.IG_LOGIN_CONFIG_ID ?? "",
  webhookVerifyToken: process.env.WEBHOOK_VERIFY_TOKEN ?? "",
  /** 외부에서 접근 가능한 주소 (웹훅·OAuth 리다이렉트·클릭 추적) */
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, ""),
  graphVersion: process.env.IG_GRAPH_VERSION ?? "v23.0",
  /** 웹 화면 주소 (OAuth 완료 후 돌아갈 곳). 개발 중에는 Vite 주소 */
  webBaseUrl: (process.env.WEB_BASE_URL ?? "").replace(/\/$/, ""),
  isProd: process.env.NODE_ENV === "production",
};

export const liveConfigured = () => Boolean(config.igAppId && config.igAppSecret);

/** 통합 로그인(config_id) 방식인지 */
export const unifiedLogin = () => Boolean(config.igLoginConfigId);

export const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
  "instagram_business_content_publish",
  "instagram_business_manage_insights",
];
