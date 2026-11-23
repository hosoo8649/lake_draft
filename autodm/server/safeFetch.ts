import dns from "node:dns/promises";
import net from "node:net";

/** 사설·로컬 주소인지 (링크 미리보기가 내부 네트워크를 찌르지 않도록) */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb")) return true;
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateAddress(mapped[1]) : false;
}

async function assertPublic(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("http/https만 쓸 수 있어요");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  if (!addrs.length || addrs.some(isPrivateAddress)) throw new Error("공개 주소가 아니에요");
}

/** 공개 주소만, 리디렉션도 한 번씩 확인하며 가져와요 */
export async function fetchPublic(rawUrl: string, opts: { timeoutMs?: number; maxBytes?: number } = {}): Promise<string> {
  let url = new URL(rawUrl);
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 6000);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url);
    const res = await fetch(url, { redirect: "manual", signal, headers: { "User-Agent": "AutoDM-LinkPreview/1.0" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("text/html")) return "";
    const text = await res.text();
    return text.slice(0, opts.maxBytes ?? 300_000);
  }
  throw new Error("리디렉션이 너무 많아요");
}
