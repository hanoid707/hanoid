/**
 * 제미나이 API 호출 — JSON 형식으로 답을 받는다(구조화 출력).
 * 공식 문서: https://ai.google.dev/api/generate-content
 *
 * 길(transport)이 두 가지:
 *  - rest: 폰 앱·PC 웹. 주신 API 키로 구글 서버를 직접 부른다.
 *  - db  : 클로드 아티팩트 페이지. 외부 인터넷이 막혀 있어 Supabase DB 함수(aisns.gemini_label)가 대신 부른다.
 *          키는 DB 금고에만 있고 페이지에는 없다(src/sync/backend.ts geminiViaDb).
 * 호출마다 응답의 usageMetadata(입력·출력·생각·캐시 토큰)를 사용량 기록(src/store/usage.ts)에 남긴다.
 *
 * ⚠️ 공부용 구조: 앱 안에 API 키를 넣으면 앱을 뜯어서 키를 볼 수 있다.
 *    실제 서비스라면 키는 서버(예: 클라우드 함수)에 두고, 앱은 그 서버를 부른다.
 */
import { Platform } from 'react-native';
import { isArtifactRuntime } from '../../config';
import { recordUsage } from '../../store/usage';
import { geminiViaDb } from '../../sync/backend';
import { parseJSONLoose } from '../normalize';
import { safeJson } from '../../utils';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
/** 기본 모델(가볍고 싼 모델 — 게임 반응은 이걸로 충분) */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const TIMEOUT_MS = { rest: 25_000, db: 45_000 } as const;

export type GeminiVia = 'rest' | 'db' | 'proxy';

export interface GeminiRequest {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  /** OpenAPI 형식 응답 스키마 */
  schema: object;
  temperature?: number;
  /** 출력 토큰 상한(생각 토큰 포함) — 호출 종류마다 작게 */
  maxOutputTokens?: number;
  /** 사용량 기록용 기능 이름(react, dm, thread, tick …) */
  kind?: string;
  /** 길 강제(기본: 아티팩트면 db, 아니면 rest) */
  via?: GeminiVia;
}

export class GeminiError extends Error {
  constructor(
    message: string,
    public status?: number,
    /** 다시 해도 안 되는 오류(키 오류·잔액 없음·모델 없음 등) → 이번 접속은 다음 엔진으로 */
    public permanent = false,
    public code = 'error',
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

/** 지금 실행 환경의 기본 길(내 키가 있으면 그걸 먼저 쓴다) */
export function geminiTransport(hasOwnKey = false): GeminiVia {
  if (isArtifactRuntime()) return 'db';
  if (hasOwnKey) return 'rest';
  // Cloudflare 배포: 내 키가 없어도 서버(/api/gemini)가 대신 불러 준다
  if (hasServerProxy()) return 'proxy';
  return 'rest';
}

/** /api/gemini 를 쓸 수 있는 환경인가(웹 + 로그인으로 받은 동기화 코드 보유) */
export function hasServerProxy(): boolean {
  return Platform.OS === 'web' && !!getProxyKey();
}

/** 로그인(/api/login)이 내려 준 동기화 코드 — 서버 호출의 암호 역할 */
const PROXY_KEY_STORAGE = 'aisns:proxyKey:v1';
let proxyKeyMemo: string | null = null;

export function setProxyKey(key: string) {
  proxyKeyMemo = key || null;
  try {
    if (key) globalThis.localStorage?.setItem(PROXY_KEY_STORAGE, key);
    else globalThis.localStorage?.removeItem(PROXY_KEY_STORAGE);
  } catch {
    /* 저장이 막힌 브라우저여도 이번 접속 동안은 메모리로 동작한다 */
  }
}

export function getProxyKey(): string {
  if (proxyKeyMemo) return proxyKeyMemo;
  try {
    proxyKeyMemo = globalThis.localStorage?.getItem(PROXY_KEY_STORAGE) ?? null;
  } catch {
    proxyKeyMemo = null;
  }
  return proxyKeyMemo ?? '';
}

// ───────────────────────── 생각(thinking) 설정

type Think = 'minimal' | 'low' | 'off';
/** 모델별로 실제로 받아 준 생각 단계(지원 안 하면 한 단계씩 올린다) */
const thinkMemo = new Map<string, Think>();

function thinkingConfig(model: string): object | undefined {
  const m = model.toLowerCase();
  if (/^gemini-2\.5-(flash|flash-lite)/.test(m)) return thinkMemo.get(model) === 'off' ? undefined : { thinkingBudget: 0 };
  if (/^gemini-2\.5-pro/.test(m)) return { thinkingBudget: 128 };
  if (/^gemini-[3-9]|^gemini-.*latest/.test(m)) {
    const lv = thinkMemo.get(model) ?? 'minimal';
    return lv === 'off' ? undefined : { thinkingLevel: lv };
  }
  return undefined;
}

/** "이 모델은 그 생각 단계 안 됨" 오류 → 다음 단계로 */
function downgradeThinking(model: string): boolean {
  const cur = thinkMemo.get(model) ?? 'minimal';
  const next: Think | null = cur === 'minimal' ? 'low' : cur === 'low' ? 'off' : null;
  if (!next) return false;
  thinkMemo.set(model, next);
  return true;
}

// ───────────────────────── 오류 메시지(한국어)

function errorFrom(status: number, body: unknown): GeminiError {
  const err = (body as { error?: { message?: string; status?: string } } | null)?.error;
  const raw = `${err?.status ?? ''} ${err?.message ?? (typeof body === 'string' ? body : '')}`.trim();
  const short = raw.slice(0, 140);
  if (status === 429) return new GeminiError('제미나이 한도 초과 — 잠시 후 다시 시도해 주세요', 429, false, 'rate_limit');
  if (status === 402) return new GeminiError('제미나이 선불 잔액이 없어요(Google AI Studio에서 충전 필요)', 402, true, 'no_balance');
  if (status === 401 || /API[_ ]?KEY[_ ]?INVALID|API key not valid|API key expired/i.test(raw)) return new GeminiError('제미나이 API 키가 올바르지 않아요(설정에서 키를 확인해 주세요)', status, true, 'bad_key');
  if (status === 403) return new GeminiError('제미나이 API 키에 권한이 없어요(키·결제 설정을 확인해 주세요)', 403, true, 'forbidden');
  if (status === 400 && /location is not supported|User location/i.test(raw)) return new GeminiError('이 지역에서는 제미나이 API를 쓸 수 없어요', 400, true, 'region');
  if (status === 404) return new GeminiError('제미나이 모델 이름을 찾을 수 없어요(설정에서 모델 확인)', 404, true, 'model');
  if (status >= 500) return new GeminiError(`제미나이 서버가 잠시 불안정해요(${status})`, status, false, 'server');
  if (status === 400) return new GeminiError(`제미나이 요청 형식 오류: ${short}`, 400, false, 'bad_request');
  return new GeminiError(`제미나이 요청 실패 ${status}: ${short}`, status, false, 'http');
}

// ───────────────────────── 보내기

/** Cloudflare Functions 경유 — 키는 서버에만 있고 이쪽은 동기화 코드만 보낸다 */
async function sendProxy(model: string, body: object): Promise<{ status: number; body: unknown }> {
  const key = getProxyKey();
  if (!key) throw new GeminiError('로그인이 필요해요', 0, true, 'no_key');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS.rest);
  try {
    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sync-key': key },
      body: safeJson({ model, body }),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { status: res.status, body: text };
    }
    // 서버는 { status, body } 모양으로 돌려준다(구글 응답을 그대로 감싼 것)
    const wrapped = parsed as { status?: number; body?: unknown };
    if (typeof wrapped?.status === 'number') return { status: wrapped.status, body: wrapped.body };
    return { status: res.status, body: parsed };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new GeminiError('제미나이 응답 시간 초과', 0, false, 'timeout');
    throw new GeminiError(`네트워크 오류: ${(e as Error).message}`, 0, false, 'network');
  } finally {
    clearTimeout(timer);
  }
}

async function sendRest(model: string, body: object, apiKey: string): Promise<{ status: number; body: unknown }> {
  if (!apiKey) throw new GeminiError('제미나이 API 키가 없어요(설정 > AI 연결)', 0, true, 'no_key');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS.rest);
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: safeJson(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* 본문이 JSON이 아니면 문자열 그대로 */
    }
    return { status: res.status, body: parsed };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new GeminiError('제미나이 응답 시간 초과', 0, false, 'timeout');
    throw new GeminiError(`네트워크 오류: ${(e as Error).message}`, 0, false, 'network');
  } finally {
    clearTimeout(timer);
  }
}

async function sendDb(model: string, body: object): Promise<{ status: number; body: unknown }> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new GeminiError('제미나이(DB 경유) 응답 시간 초과', 0, false, 'timeout')), TIMEOUT_MS.db);
  });
  try {
    const r = await Promise.race([geminiViaDb(model, body), timeout]);
    let parsed = r.body;
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        /* 문자열 그대로 */
      }
    }
    return { status: r.status, body: parsed };
  } catch (e) {
    if (e instanceof GeminiError) throw e;
    // 커넥터 승인·연결이 필요한 상태(blocked)는 다시 해도 안 된다
    const se = e as { message?: string; code?: string; blocked?: boolean };
    throw new GeminiError(`제미나이(DB 경유) 오류: ${se.message ?? se.code ?? '알 수 없음'}`, 0, !!se.blocked, se.code ?? 'db');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface GenResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number };
  modelVersion?: string;
}

/** 한 번 부르고 JSON으로 받기(사용량 기록 포함) */
export async function generateJSON<T>(req: GeminiRequest): Promise<T> {
  const via = req.via ?? geminiTransport(!!req.apiKey?.trim());
  const kind = req.kind ?? 'other';
  const t0 = Date.now();
  const fail = (e: GeminiError): never => {
    recordUsage({ provider: 'gemini', model: req.model, kind, inTok: 0, outTok: 0, ms: Date.now() - t0, ok: false, via });
    throw e;
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    const thinking = thinkingConfig(req.model);
    const lowThink = !!thinking && (thinking as { thinkingLevel?: string }).thinkingLevel === 'low';
    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
      generationConfig: {
        // 3.x부터는 온도 조절을 권하지 않는다(1.0 미만에서 반복·품질 저하 보고, 공식 문서). 2.x에만 적용
        ...(/^gemini-2\./.test(req.model) ? { temperature: req.temperature ?? 0.95 } : {}),
        responseMimeType: 'application/json',
        responseSchema: req.schema,
        // 생각 토큰도 출력 상한에 포함된다 → 생각을 쓰는 모델이면 여유를 더 준다
        ...(req.maxOutputTokens ? { maxOutputTokens: req.maxOutputTokens + (lowThink ? 1024 : 0) } : {}),
        ...(thinking ? { thinkingConfig: thinking } : {}),
      },
    };
    let res: { status: number; body: unknown };
    try {
      res = via === 'db' ? await sendDb(req.model, body) : via === 'proxy' ? await sendProxy(req.model, body) : await sendRest(req.model, body, req.apiKey);
    } catch (e) {
      return fail(e instanceof GeminiError ? e : new GeminiError((e as Error).message, 0, false, 'network'));
    }
    if (res.status !== 200) {
      const msg = JSON.stringify(res.body ?? '').slice(0, 400);
      if (res.status === 400 && /thinking/i.test(msg) && downgradeThinking(req.model)) continue;
      return fail(errorFrom(res.status, res.body));
    }
    const data = (res.body ?? {}) as GenResponse;
    const um = data.usageMetadata ?? {};
    recordUsage({
      provider: 'gemini',
      model: data.modelVersion || req.model,
      kind,
      inTok: um.promptTokenCount ?? 0,
      outTok: um.candidatesTokenCount ?? 0,
      thinkTok: um.thoughtsTokenCount ?? 0,
      cachedTok: um.cachedContentTokenCount ?? 0,
      ms: Date.now() - t0,
      ok: true,
      via,
    });
    if (data.promptFeedback?.blockReason) throw new GeminiError(`안전 필터로 차단됨: ${data.promptFeedback.blockReason}`, 200, false, 'blocked');
    const cand = data.candidates?.[0];
    const text = cand?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? '').join('') ?? '';
    if (!text) throw new GeminiError(`빈 응답 (${cand?.finishReason ?? '이유 없음'})`, 200, false, 'empty');
    try {
      return parseJSONLoose<T>(text);
    } catch {
      throw new GeminiError(`응답 JSON을 읽지 못했어요(${cand?.finishReason ?? '?'})`, 200, false, 'parse');
    }
  }
  return fail(new GeminiError('제미나이 생각 설정을 맞추지 못했어요', 400, false, 'thinking'));
}
