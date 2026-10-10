/**
 * 지금 쓸 AI 엔진을 고른다(대체 순서가 있는 사슬).
 *  - 폰 앱·PC 웹: 제미나이(내 API 키로 직접)
 *  - 클로드 아티팩트: 제미나이(Supabase DB 경유, 키는 서버 금고) → 클로드(내 Claude 사용량)
 *    (설정에서 클로드를 고르면 클로드만)
 * (v3.1) 미리 써 둔 틀 문장으로 대신 답하던 "모의 엔진"은 없앴다 — 맥락 없는 말이 섞이지 않게.
 *  AI가 끝내 답하지 못하면 그 반응은 비워 두고(아무 말이나 채우지 않음) 알림으로 알린다.
 * 호출이 실패하면:
 *  - 잠깐 문제(시간 초과·네트워크·서버 오류): 같은 AI로 한 번 더 → 그래도 안 되면 다음 AI
 *  - 한도 초과: 45초 쉬었다가 다시
 *  - 다시 해도 안 되는 문제(키 오류·잔액 없음·허용 거절 등): 이번 접속 동안 그 AI를 건너뛴다(키·모델을 바꾸면 다시 켜짐)
 */
import { CONFIG, isArtifactRuntime } from '../config';
import type { AISettings } from '../types';
import { hashStr } from '../utils';
import { createClaudeEngine } from './claude/engine';
import { DEFAULT_GEMINI_MODEL } from './gemini/client';
import { createGeminiEngine } from './gemini/engine';
import type { AIEngine } from './types';

export { buildContext } from './context';
export type { AIEngine } from './types';
export { DEFAULT_GEMINI_MODEL };

/** AI 연결 화면의 모델 칩(가격은 src/store/usage.ts PRICES) */
export const GEMINI_MODEL_PRESETS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest'];

type LinkId = 'gemini-rest' | 'gemini-db' | 'claude';

/** 엔진 사슬의 한 칸 */
interface Link {
  id: LinkId;
  label: string;
  engine: AIEngine;
}

/** 대체가 일어났을 때 onError로 넘기는 오류 */
export interface AIFallbackError extends Error {
  /** 사슬의 AI가 전부 막혔는지 */
  permanent: boolean;
  /** 대신 답한 엔진 이름(예: '클로드') */
  fallback: string;
  /** 실패한 엔진 이름 */
  failed: string;
  code?: string;
  status?: number;
}

// ───────────────────────── 이번 접속 동안의 상태(앱을 다시 켜면 초기화)

/** 다시 해도 안 되는 오류로 꺼 둔 길: 키 = 길 + 설정 서명(키·모델이 바뀌면 다른 키) */
const disabled = new Map<string, { message: string; short: string; ts: number }>();
/** 오류 코드 → 짧은 이유(엔진 이름 옆에 표시) */
const SHORT_REASON: Record<string, string> = {
  bad_key: '키 오류',
  no_key: '키 없음',
  no_balance: '잔액 없음',
  forbidden: '권한 없음',
  model: '모델 없음',
  region: '지역 제한',
  not_granted: '허용 안 됨',
  sampling_disabled: '계정에서 꺼짐',
  session_expired: '다시 로그인 필요',
};
/** 한도 초과로 잠깐 쉬는 길: 이 시각까지 건너뜀 */
const cooldown = new Map<string, number>();
const COOLDOWN_MS = 45_000;

function sigOf(id: LinkId, s: AISettings): string {
  const model = s.model?.trim() || DEFAULT_GEMINI_MODEL;
  if (id === 'gemini-rest') return `${id}|${model}|${hashStr(s.apiKey.trim())}`;
  if (id === 'gemini-db') return `${id}|${model}`;
  return id;
}

/** AI 연결 화면에서 엔진을 다시 고르거나 연결 테스트를 할 때: 꺼 둔 길을 다시 켠다 */
export function resetEngineState(): void {
  disabled.clear();
  cooldown.clear();
}

/** 설정 → 시도할 순서 */
function chainFor(settings: AISettings): LinkId[] {
  if (isArtifactRuntime()) {
    const db: LinkId[] = CONFIG.supabaseProject ? ['gemini-db'] : [];
    return settings.provider === 'claude' ? ['claude'] : [...db, 'claude'];
  }
  // 앱·PC 웹: 클로드는 쓸 수 없다. 키가 없으면 AI 없음(반응을 지어내지 않는다)
  return settings.apiKey.trim() ? ['gemini-rest'] : [];
}

/** AI를 쓸 수 없는 상태 — 어떤 호출이든 "연결 필요" 오류(게임은 반응을 비워 둔다) */
export class NoAIError extends Error {
  code = 'no_ai';
  permanent = false;
  constructor(message = 'AI 연결이 필요해요(나 탭 → AI 연결에서 키를 넣어 주세요)') {
    super(message);
  }
}

const offline = async (): Promise<never> => {
  throw new NoAIError();
};
const offlineEngine: AIEngine = {
  id: 'gemini',
  reactToPost: offline,
  replyInThread: offline,
  dmReply: offline,
  firstDM: offline,
  ambientPosts: offline,
  worldTick: offline,
  resolveEvent: offline,
  newEvent: offline,
  threadComments: offline,
  draftCharacter: offline,
  generateCast: offline,
};

const CLAUDE_MODE = { fast: '빠름', balanced: '균형', quality: '고품질' } as const;

function labelOf(id: LinkId, s: AISettings): string {
  const model = s.model?.trim() || DEFAULT_GEMINI_MODEL;
  if (id === 'gemini-rest') return `제미나이 (${model})`;
  if (id === 'gemini-db') return `제미나이 (${model}, DB 경유)`;
  if (id === 'claude') return `클로드 (${CLAUDE_MODE[s.claudeMode ?? 'balanced']})`;
  return 'AI';
}

function shortLabel(id: LinkId): string {
  return id === 'claude' ? '클로드' : '제미나이';
}

function engineOf(id: LinkId, s: AISettings): AIEngine {
  if (id === 'gemini-rest') return createGeminiEngine(s, { via: 'rest' });
  if (id === 'gemini-db') return createGeminiEngine(s, { via: 'db' });
  return createClaudeEngine(s);
}

const isOff = (key: string) => disabled.has(key) || (cooldown.get(key) ?? 0) > Date.now();

/** 사슬로 감싼 엔진: 앞 칸이 실패하면 다음 칸 */
function withChain(links: Link[], settings: AISettings, onError: (e: Error) => void): AIEngine {
  const wrap = <K extends Exclude<keyof AIEngine, 'id'>>(key: K): AIEngine[K] =>
    (async (...args: unknown[]) => {
      let failed: { link: Link; err: Error & { permanent?: boolean; status?: number; code?: string } } | null = null;
      for (const link of links) {
        const sk = sigOf(link.id, settings);
        if (isOff(sk)) continue;
        try {
          const call = () => (link.engine[key] as (...a: unknown[]) => Promise<unknown>).apply(link.engine, args);
          let out: unknown;
          try {
            out = await call();
          } catch (e1) {
            // (v3.1) 일시적 오류(시간 초과·네트워크·빈 응답·잘린 JSON·5xx)는 같은 AI로 한 번 더 —
            // 조금 늦더라도 문맥에 맞는 답이 낫다(틀 문장으로 대신하지 않음)
            const er = e1 as { permanent?: boolean; status?: number; code?: string };
            const transient = !er.permanent && er.status !== 429 && er.code !== 'rate_limit' && er.code !== 'rate_limited' && er.code !== 'blocked';
            if (!transient) throw e1;
            await new Promise((res) => setTimeout(res, 1200));
            out = await call();
          }
          if (failed) {
            const realLeft = links.some((l) => !isOff(sigOf(l.id, settings)));
            const e = Object.assign(new Error(failed.err.message), {
              permanent: !realLeft,
              fallback: shortLabel(link.id),
              failed: shortLabel(failed.link.id),
              code: failed.err.code,
              status: failed.err.status,
            }) as AIFallbackError;
            onError(e);
          }
          return out;
        } catch (e) {
          const err = e as Error & { permanent?: boolean; status?: number; code?: string };
          if (err.permanent) disabled.set(sk, { message: err.message, short: SHORT_REASON[err.code ?? ''] ?? (link.id === 'gemini-db' ? 'DB 연결 오류' : '연결 오류'), ts: Date.now() });
          else if (err.status === 429 || err.code === 'rate_limit' || err.code === 'rate_limited') cooldown.set(sk, Date.now() + COOLDOWN_MS);
          // 같은 호출에서 처음 실패한 이유를 알린다
          if (!failed) failed = { link, err };
        }
      }
      throw failed?.err ?? new NoAIError('지금 답할 수 있는 AI가 없어요(잠시 뒤 다시 해 보세요)');
    }) as AIEngine[K];

  const first = links.find((l) => !isOff(sigOf(l.id, settings))) ?? links[links.length - 1];
  return {
    id: first.engine.id,
    reactToPost: wrap('reactToPost'),
    replyInThread: wrap('replyInThread'),
    dmReply: wrap('dmReply'),
    firstDM: wrap('firstDM'),
    ambientPosts: wrap('ambientPosts'),
    worldTick: wrap('worldTick'),
    resolveEvent: wrap('resolveEvent'),
    newEvent: wrap('newEvent'),
    threadComments: wrap('threadComments'),
    draftCharacter: wrap('draftCharacter'),
    generateCast: wrap('generateCast'),
  };
}

export function createEngine(settings: AISettings, onError: (e: Error) => void): AIEngine {
  const ids = chainFor(settings);
  if (!ids.length) return offlineEngine;
  return withChain(
    ids.map((id) => ({ id, label: labelOf(id, settings), engine: engineOf(id, settings) })),
    settings,
    onError,
  );
}

/** 지금 실제로 답하는 엔진(꺼 둔 길은 건너뛰고) */
export function activeEngine(settings: AISettings): { id: LinkId | null; label: string; primary: LinkId | null; reason?: string } {
  const ids = chainFor(settings);
  const primary = ids[0] ?? null;
  if (!primary) return { id: null, label: 'AI 연결 안 됨', primary: null, reason: isArtifactRuntime() ? undefined : 'API 키 없음' };
  const id = ids.find((x) => !isOff(sigOf(x, settings))) ?? null;
  const off = id !== primary ? (disabled.get(sigOf(primary, settings))?.short ?? (cooldown.has(sigOf(primary, settings)) ? '잠시 한도 초과' : undefined)) : undefined;
  return { id, label: id ? labelOf(id, settings) : '지금 답할 수 있는 AI 없음', primary, reason: off };
}

/** 지금 실제로 쓰이는 엔진 이름(화면 표시용) */
export function engineLabel(settings: AISettings): string {
  const a = activeEngine(settings);
  if (!a.primary) return a.label;
  if (a.id === a.primary) return a.label;
  return `${shortLabel(a.primary)} 사용 불가${a.reason ? `(${a.reason})` : ''} → ${a.label}`;
}

/** (v3 계약) AI 연결 화면: 지금 실행 환경에서 고를 수 있는 AI 목록 */
export interface ProviderOption {
  id: AISettings['provider'];
  label: string;
  desc: string;
  /** 지금 바로 쓸 수 있는지(키 없음·환경 불가 등) */
  available: boolean;
  /** 못 쓰는 이유, 또는 쓸 수 있지만 최근에 난 오류(이번 접속에서 꺼 둠) */
  reason?: string;
}

export function availableProviders(settings: AISettings): ProviderOption[] {
  const art = isArtifactRuntime();
  const model = settings.model?.trim() || DEFAULT_GEMINI_MODEL;
  const gemLink: LinkId = art ? 'gemini-db' : 'gemini-rest';
  const gemOff = disabled.get(sigOf(gemLink, settings))?.message;
  const claudeOff = disabled.get(sigOf('claude', settings))?.message;
  const gemAvailable = art ? !!CONFIG.supabaseProject : !!settings.apiKey.trim();
  return [
    {
      id: 'gemini',
      label: '제미나이',
      desc: art ? `Supabase DB를 거쳐 서버에 저장된 키로 호출 · ${model}` : `내 API 키로 직접 호출 · ${model}`,
      available: gemAvailable,
      reason: !gemAvailable ? (art ? '이 빌드에 DB 연결 정보(Supabase 프로젝트)가 없어요' : 'API 키를 넣어 주세요') : gemOff ? `최근 오류: ${gemOff}` : undefined,
    },
    {
      id: 'claude',
      label: '클로드',
      desc: 'claude.ai 페이지 안에서만 · 내 Claude 사용량으로 호출(요금 0)',
      available: art,
      reason: !art ? '클로드 아티팩트(claude.ai 페이지) 안에서만 쓸 수 있어요' : claudeOff ? `최근 오류: ${claudeOff}` : undefined,
    },
  ];
}
