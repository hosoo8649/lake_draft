import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { LIMITS, MAX_VARIANTS } from "../shared/limits";
import { glen } from "../shared/validation";

/*
 * DM 문구 변형 만들기 (선택 기능)
 * 똑같은 문구를 수백 번 보내는 것보다 뜻은 같고 표현이 조금씩 다른 문구를 섞어 보내는 편이
 * 인스타그램 스팸 정책에서 더 안전해요. ANTHROPIC_API_KEY가 있을 때만 켜져요.
 */

export const aiAvailable = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

const VariantsSchema = z.object({
  variants: z.array(z.string()),
});

const SYSTEM = `당신은 인스타그램 크리에이터의 자동 DM 문구를 다듬는 카피라이터예요.
주어진 DM과 뜻이 같지만 표현이 조금씩 다른 문구를 만들어요. 팬이 받았을 때 자연스러운 한국어 DM이어야 해요.

규칙:
- 뜻, 말투(존댓말·반말), 길이는 원문과 비슷하게 유지해요.
- 단어 선택, 어순, 줄바꿈, 이모지만 조금씩 바꿔요. 새로운 약속·혜택·가격·날짜를 지어내지 않아요.
- 원문에 있는 링크(URL), 숫자, 날짜, 상품명, 코드, {이름} 같은 중괄호 자리표시는 글자 그대로 남겨요.
- 각 문구는 서로 달라야 하고 원문과도 달라야 해요.`;

/** 원문에서 그대로 남아야 하는 조각 (링크·{자리표시}) */
function mustKeep(text: string): string[] {
  return [...new Set([...(text.match(/https?:\/\/\S+/g) ?? []), ...(text.match(/\{[^{}\s]{1,20}\}/g) ?? [])])];
}

/** AI가 만든 문구 중 쓸 수 있는 것만 — 원문·중복·너무 긴 것, 링크나 {이름}이 빠진 것은 버려요 */
export function filterVariants(text: string, candidates: string[], n: number): string[] {
  const keep = mustKeep(text);
  const seen = new Set([text.trim()]);
  const out: string[] = [];
  for (const v of candidates) {
    const t = v.trim();
    if (!t || seen.has(t)) continue;
    if (glen(t) > LIMITS.dmText) continue;
    if (keep.some((k) => !t.includes(k))) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= n) break;
  }
  return out;
}

export class AiError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

/** 원문과 뜻이 같은 다른 문구 count개 (링크·{이름}이 빠진 것은 버려요) */
export async function generateVariants(text: string, count: number): Promise<string[]> {
  if (!aiAvailable()) throw new AiError("AI 문구 변형을 쓰려면 .env에 ANTHROPIC_API_KEY를 넣어 주세요", 503);
  const n = Math.max(1, Math.min(MAX_VARIANTS, Math.round(count)));
  const client = new Anthropic();
  let response;
  try {
    response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      // 안전 분류기가 거절하면 다른 모델로 자동으로 다시 시도해요
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(VariantsSchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `아래 DM과 뜻이 같은 다른 문구를 ${n}개 만들어 주세요.\n\n<dm>\n${text}\n</dm>`,
        },
      ],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("AI 키가 올바르지 않아요. .env의 ANTHROPIC_API_KEY를 확인해 주세요", 503);
    if (e instanceof Anthropic.RateLimitError) throw new AiError("AI 요청이 많아요. 잠시 뒤 다시 시도해 주세요", 429);
    if (e instanceof Anthropic.APIError) throw new AiError(`AI 문구를 만들지 못했어요 (${e.status ?? "오류"})`);
    throw new AiError("AI에 연결하지 못했어요. 인터넷 연결을 확인해 주세요");
  }
  if (response.stop_reason === "refusal") throw new AiError("이 문구로는 AI 변형을 만들 수 없어요. 문구를 조금 바꿔 다시 시도해 주세요", 422);

  const out = filterVariants(text, response.parsed_output?.variants ?? [], n);
  if (!out.length) throw new AiError("쓸 만한 문구를 만들지 못했어요. 다시 시도해 주세요");
  return out;
}
