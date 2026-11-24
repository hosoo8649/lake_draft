import { afterEach, describe, expect, it } from "vitest";
import { config } from "../server/config";
import { authorizeUrl } from "../server/instagram/live";

const saved = { ...config };
afterEach(() => Object.assign(config, saved));

describe("인스타그램 로그인 주소", () => {
  it("구성 ID가 없으면 기존 Instagram 로그인 주소", () => {
    Object.assign(config, { igAppId: "111", igLoginConfigId: "" });
    const u = new URL(authorizeUrl("https://x.test/auth/instagram/callback", "st", ["instagram_business_basic"], false));
    expect(u.origin + u.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(u.searchParams.get("client_id")).toBe("111");
    expect(u.searchParams.get("scope")).toBe("instagram_business_basic");
  });

  it("구성 ID가 있으면 통합 로그인(페이스북 로그인 창 + config_id, scope 없음)", () => {
    Object.assign(config, { igAppId: "222", igLoginConfigId: "999" });
    const u = new URL(authorizeUrl("https://x.test/auth/instagram/callback", "st", ["instagram_business_basic"], true));
    expect(u.origin + u.pathname).toBe("https://www.facebook.com/dialog/oauth");
    expect(u.searchParams.get("client_id")).toBe("222");
    expect(u.searchParams.get("config_id")).toBe("999");
    expect(u.searchParams.get("redirect_uri")).toBe("https://x.test/auth/instagram/callback");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("state")).toBe("st");
    expect(u.searchParams.get("prompt")).toBe("login");
    expect(u.searchParams.has("scope")).toBe(false);
  });
});
