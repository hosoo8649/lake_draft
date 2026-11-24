import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

/* 링크 미리보기가 내부 네트워크(내 PC·공유기·클라우드 메타데이터)를 찌르지 않도록 막아요 */

const blocked = new net.BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const)
  blocked.addSubnet(addr, prefix, "ipv4");
for (const [addr, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::", 96], // IPv4 호환 주소 (::7f00:1 등)
  // IPv4 매핑 주소(::ffff:127.0.0.1, ::ffff:7f00:1)는 위 IPv4 규칙이 그대로 적용돼요
  ["64:ff9b::", 96], // NAT64
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  blocked.addSubnet(addr, prefix, "ipv6");

export function isPrivateAddress(ip: string): boolean {
  const v = ip.replace(/^\[|\]$/g, "");
  if (net.isIPv4(v)) return blocked.check(v, "ipv4");
  if (net.isIPv6(v)) return blocked.check(v, "ipv6");
  return true;
}

/** 연결할 때 실제로 쓰는 주소를 확인해요 (확인한 주소로만 연결 → DNS 리바인딩 차단) */
const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true }, (err, addrs) => {
    if (err) return callback(err, "", 0);
    if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) {
      return callback(Object.assign(new Error("공개 주소가 아니에요"), { code: "EBLOCKED" }), "", 0);
    }
    if ((options as dns.LookupOptions).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, addrs);
    callback(null, addrs[0].address, addrs[0].family);
  });
};

function getOnce(url: URL, signal: AbortSignal, maxBytes: number): Promise<{ status: number; location?: string; type: string; body: string }> {
  return new Promise((resolve, reject) => {
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && isPrivateAddress(host)) return reject(new Error("공개 주소가 아니에요"));
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      { method: "GET", lookup: safeLookup, signal, headers: { "User-Agent": "CarolDM-LinkPreview/1.0", Accept: "text/html" } },
      (res) => {
        const status = res.statusCode ?? 0;
        const type = String(res.headers["content-type"] ?? "");
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location: res.headers.location, type, body: "" });
        }
        if (!type.includes("text/html")) {
          res.destroy();
          return resolve({ status, type, body: "" });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          chunks.push(c);
          // 필요한 메타 태그는 앞쪽에 있어요 — 정해진 크기만 읽고 끊어요
          if (size >= maxBytes) res.destroy();
        });
        const done = () => resolve({ status, type, body: Buffer.concat(chunks).toString("utf8").slice(0, maxBytes) });
        res.on("end", done);
        res.on("close", done);
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end();
  });
}

/** 공개 주소만, 리디렉션도 한 번씩 확인하며 가져와요 */
export async function fetchPublic(rawUrl: string, opts: { timeoutMs?: number; maxBytes?: number } = {}): Promise<string> {
  let url = new URL(rawUrl);
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 6000);
  const maxBytes = opts.maxBytes ?? 300_000;
  for (let hop = 0; hop < 4; hop++) {
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("http/https만 쓸 수 있어요");
    if (url.username || url.password) throw new Error("주소에 계정 정보를 넣을 수 없어요");
    const r = await getOnce(url, signal, maxBytes);
    if (r.location) {
      url = new URL(r.location, url);
      continue;
    }
    return r.body;
  }
  throw new Error("리디렉션이 너무 많아요");
}
