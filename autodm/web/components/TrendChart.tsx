import { HStack, Text } from "@seed-design/react";
import { useEffect, useRef, useState } from "react";
import type { DailyPoint } from "@shared/types";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
/** "2026-11-19" → "11월 19일 (목)" (툴팁·표) */
const fullDayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${m}월 ${d}일 (${DOW[new Date(y, m - 1, d).getDay()]})`;
};

/** 최근 7일 보낸 DM·클릭 — 같은 단위(건수)라 한 축에 묶은 막대 */
const SERIES = [
  { key: "sent" as const, label: "전송", color: "var(--seed-color-palette-blue-700)" },
  { key: "clicks" as const, label: "클릭", color: "var(--seed-color-palette-carrot-600)" },
];

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= v) return m * pow;
  return 10 * pow;
}

function barPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0) return "";
  const rr = Math.min(r, h, w / 2);
  // 위쪽 끝만 둥글게, 기준선 쪽은 각지게
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

const dayLabel = (d: string) => {
  const [, m, dd] = d.split("-").map(Number);
  return `${m}/${dd}`;
};

export function TrendChart({ data }: { data: DailyPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 220;
  const pad = { l: 36, r: 12, t: 16, b: 28 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...data.flatMap((d) => [d.sent, d.clicks])));
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max].filter((t) => Number.isInteger(t));
  const band = iw / Math.max(1, data.length);
  const barW = Math.min(24, (band - 16) / 2);
  const gap = 2;
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const last = data.length - 1;
  const empty = data.every((d) => d.sent === 0 && d.clicks === 0);

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <HStack className="legend" pb="x2" gap="x4">
        {SERIES.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </HStack>
      <svg className="chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="최근 7일 보낸 DM과 클릭 수" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--seed-color-stroke-neutral-subtle)" strokeWidth={1} />
            <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--seed-color-fg-neutral-subtle)">
              {t.toLocaleString("ko-KR")}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.l + band * i + band / 2;
          const x0 = cx - barW - gap / 2;
          return (
            <g key={d.date}>
              {hover === i && <rect x={pad.l + band * i + 4} y={pad.t} width={band - 8} height={ih} rx={6} fill="var(--seed-color-bg-neutral-weak)" />}
              {SERIES.map((s, k) => {
                const v = d[s.key];
                const top = y(v);
                return <path key={s.key} d={barPath(x0 + k * (barW + gap), top, barW, pad.t + ih - top)} fill={s.color} />;
              })}
              {/* 마지막 날만 값 표시 (선택적 직접 라벨) */}
              {i === last &&
                !empty &&
                SERIES.map((s, k) => (
                  <text
                    key={s.key}
                    x={x0 + k * (barW + gap) + barW / 2}
                    y={y(d[s.key]) - 6}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={600}
                    fill="var(--seed-color-fg-neutral-muted)"
                  >
                    {d[s.key]}
                  </text>
                ))}
              <text x={cx} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--seed-color-fg-neutral-subtle)">
                {i === last ? "오늘" : dayLabel(d.date)}
              </text>
              {/* 막대보다 넓은 호버 영역 */}
              <rect
                x={pad.l + band * i}
                y={pad.t}
                width={band}
                height={ih + pad.b}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                tabIndex={0}
                aria-label={`${dayLabel(d.date)} 보낸 DM ${d.sent}건, 클릭 ${d.clicks}건`}
              />
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} stroke="var(--seed-color-stroke-neutral-muted)" strokeWidth={1} />
      </svg>
      {/* 빈 상태 안내는 HTML로 — 좁은 화면에서도 줄바꿈되고 축 글자와 겹치지 않아요 */}
      {empty && (
        <div className="chart-empty" style={{ left: `${(pad.l / W) * 100}%`, right: `${(pad.r / W) * 100}%` }}>
          <span>아직 보낸 DM이 없어요. 자동화를 만들면 여기에 추이가 보여요</span>
        </div>
      )}
      {hover !== null && data[hover] && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            top: 28,
            left: `calc(${((pad.l + band * hover + band / 2) / W) * 100}% )`,
            transform: "translateX(-50%)",
            background: "var(--seed-color-bg-layer-floating)",
            boxShadow: "var(--seed-shadow-s2)",
            borderRadius: 10,
            padding: "8px 12px",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          <Text as="p" textStyle="t3Bold">
            {fullDayLabel(data[hover].date)}
          </Text>
          {SERIES.map((s) => (
            <Text as="p" key={s.key} textStyle="t3Regular" color="fg.neutralMuted">
              <i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: s.color, marginRight: 6 }} />
              {s.label} <b style={{ color: "var(--seed-color-fg-neutral)" }}>{data[hover][s.key].toLocaleString("ko-KR")}</b>
            </Text>
          ))}
        </div>
      )}
      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--seed-color-fg-neutral-muted)" }}>표로 보기</summary>
        <table className="table" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>날짜</th>
              <th>전송</th>
              <th>클릭</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.date}>
                <td>{fullDayLabel(d.date)}</td>
                <td>{d.sent.toLocaleString("ko-KR")}</td>
                <td>{d.clicks.toLocaleString("ko-KR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
