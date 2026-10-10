/**
 * AI 사용량 기록 — 호출 수·토큰·예상 요금(이 기기 기준). 설정 > AI 연결 화면에서 보여 준다.
 * 실제 청구·남은 한도는 Google AI Studio에서만 정확히 볼 수 있어서, 여기 숫자는 "응답에 적힌 토큰 × 가격표" 추정치다.
 *
 *   요금 = (입력 − 캐시) × 입력 단가 + 캐시 × 캐시 단가 + (출력 + 생각) × 출력 단가
 *   - 생각(thinking) 토큰은 출력 단가로 청구된다.
 *   - 캐시 단가를 모르면 입력 단가의 25%로 계산한다. 가격표에 없는 모델은 Flash-Lite 가격으로 계산한다.
 *   - 클로드(아티팩트)는 토큰을 글자 수로 추정하고 요금은 0(Claude 요금제 사용량에서 차감).
 *
 * 기기에 저장(키 mainchar:usage:v1, 1.5초 모아서 저장). 앱 시작 때 hydrateUsage()로 불러온다.
 */
import { create } from 'zustand';
import { kv } from './persistence';

export interface UsageBucket {
  calls: number;
  errors: number;
  /** 입력 토큰(캐시된 것 포함) */
  inTok: number;
  /** 출력 토큰(생각 토큰 포함 — 출력 단가로 청구) */
  outTok: number;
  /** 입력 중 캐시로 싸게 계산된 토큰 */
  cachedTok: number;
  /** 예상 요금(달러) */
  usd: number;
  /** 출력 중 생각(thinking) 토큰(참고용) */
  thinkTok?: number;
  /** 응답 시간 합계(ms) — 평균 응답 시간 = ms / calls */
  ms?: number;
}

export interface UsageEvent {
  provider: 'gemini' | 'claude';
  model: string;
  /** 어떤 기능에서 불렀는지(react, dm, firstDM, thread, tick, event, newEvent, threadComments, draft, cast, ping …) */
  kind: string;
  /** 입력 토큰(캐시된 것 포함) */
  inTok: number;
  /** 출력 토큰(생각 토큰 제외) */
  outTok: number;
  /** 생각 토큰(출력 단가로 청구) */
  thinkTok?: number;
  cachedTok?: number;
  ms: number;
  ok: boolean;
  via: 'rest' | 'db' | 'sample' | 'proxy';
  /** 토큰 수가 응답에 없어서 글자 수로 추정했는지 */
  estimated?: boolean;
}

export interface UsageState {
  hydrated: boolean;
  total: UsageBucket;
  /** YYYY-MM-DD(기기 시간대) → 집계 */
  byDay: Record<string, UsageBucket>;
  byModel: Record<string, UsageBucket>;
  byKind: Record<string, UsageBucket>;
  last: (UsageEvent & { ts: number; usd?: number }) | null;
}

export const emptyBucket = (): UsageBucket => ({ calls: 0, errors: 0, inTok: 0, outTok: 0, cachedTok: 0, usd: 0, thinkTok: 0, ms: 0 });

export const useUsage = create<UsageState>()(() => ({
  hydrated: false,
  total: emptyBucket(),
  byDay: {},
  byModel: {},
  byKind: {},
  last: null,
}));

/** 가격표(달러 / 100만 토큰, 유료 Standard) — 2026년 10월 Google 공개 가격(변동 가능) */
export const PRICES: Record<string, { in: number; out: number; cachedIn?: number }> = {
  'gemini-3.5-flash-lite': { in: 0.3, out: 2.5, cachedIn: 0.03 },
  'gemini-3.5-flash': { in: 1.5, out: 9, cachedIn: 0.15 },
  'gemini-3.8-flash': { in: 0.75, out: 3.75, cachedIn: 0.075 },
  'gemini-3.1-flash-lite': { in: 0.25, out: 1.5, cachedIn: 0.025 },
  'gemini-3-flash': { in: 0.5, out: 3, cachedIn: 0.05 },
  'gemini-2.5-flash-lite': { in: 0.1, out: 0.4, cachedIn: 0.01 },
  'gemini-2.5-flash': { in: 0.3, out: 2.5, cachedIn: 0.03 },
};

/** 별칭 → 실제 모델(응답의 modelVersion이 없을 때 가격 찾기용) */
const ALIAS: Record<string, string> = {
  'gemini-flash-latest': 'gemini-3.8-flash',
  'gemini-flash-lite-latest': 'gemini-3.5-flash-lite',
};

const FALLBACK_PRICE_MODEL = 'gemini-3.5-flash-lite';

/** 모델 이름 → 가격(정확히 없으면 가장 긴 앞부분 일치, 그래도 없으면 Flash-Lite 가격) */
export function priceOf(model: string): { in: number; out: number; cachedIn?: number } {
  const m = ALIAS[model] ?? model.replace(/^models\//, '');
  if (PRICES[m]) return PRICES[m];
  const key = Object.keys(PRICES)
    .filter((k) => m.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return PRICES[key ?? FALLBACK_PRICE_MODEL];
}

/**
 * "한 판" 기준 — 자동 플레이(2026-10 v3.2, gemini-3.5-flash-lite)로 잰 호출·토큰.
 * 한 판 = 새 이야기 시작(첫 쪽지) · 내 글 2개 · 답글 1번 · 남의 글 댓글 2번 · 쪽지 2번 · 이벤트 1번 · 하루 정산 1번 · 캐릭터 만들기 2번
 */
export const PLAY_PROFILE = { calls: 13, inTok: 45_000, cachedTok: 0, outTok: 4_300 } as const;

/** 이 모델로 한 판 했을 때 예상 요금(달러) */
export function playCostUsd(model: string): number {
  return costOf({ provider: 'gemini', model, inTok: PLAY_PROFILE.inTok, outTok: PLAY_PROFILE.outTok, cachedTok: PLAY_PROFILE.cachedTok });
}

/** 한 번 호출의 예상 요금(달러) */
export function costOf(e: Pick<UsageEvent, 'provider' | 'model' | 'inTok' | 'outTok' | 'thinkTok' | 'cachedTok'>): number {
  if (e.provider !== 'gemini') return 0;
  const p = priceOf(e.model);
  const cached = Math.min(Math.max(0, e.cachedTok ?? 0), Math.max(0, e.inTok));
  const fresh = Math.max(0, e.inTok - cached);
  const cachedPrice = p.cachedIn ?? p.in * 0.25;
  return (fresh * p.in + cached * cachedPrice + (Math.max(0, e.outTok) + Math.max(0, e.thinkTok ?? 0)) * p.out) / 1_000_000;
}

// ───────────────────────── 날짜 키

const pad = (n: number) => String(n).padStart(2, '0');
/** YYYY-MM-DD(기기 시간대) */
export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** 여러 묶음 합치기 */
export function sumBuckets(list: (UsageBucket | undefined)[]): UsageBucket {
  const out = emptyBucket();
  for (const b of list) {
    if (!b) continue;
    out.calls += b.calls;
    out.errors += b.errors;
    out.inTok += b.inTok;
    out.outTok += b.outTok;
    out.cachedTok += b.cachedTok;
    out.usd += b.usd;
    out.thinkTok = (out.thinkTok ?? 0) + (b.thinkTok ?? 0);
    out.ms = (out.ms ?? 0) + (b.ms ?? 0);
  }
  return out;
}// ───────────────────────── 기록

function addTo(b: UsageBucket | undefined, e: UsageEvent, usd: number): UsageBucket {
  const x = b ? { ...emptyBucket(), ...b } : emptyBucket();
  x.calls += 1;
  if (!e.ok) x.errors += 1;
  x.inTok += Math.max(0, e.inTok);
  x.outTok += Math.max(0, e.outTok) + Math.max(0, e.thinkTok ?? 0);
  x.cachedTok += Math.max(0, e.cachedTok ?? 0);
  x.thinkTok = (x.thinkTok ?? 0) + Math.max(0, e.thinkTok ?? 0);
  x.ms = (x.ms ?? 0) + Math.max(0, e.ms);
  x.usd += usd;
  return x;
}

/** 일별 기록은 최근 120일만 보관 */
function pruneDays(byDay: Record<string, UsageBucket>): Record<string, UsageBucket> {
  const keys = Object.keys(byDay).sort();
  if (keys.length <= 120) return byDay;
  const keep: Record<string, UsageBucket> = {};
  for (const k of keys.slice(-120)) keep[k] = byDay[k];
  return keep;
}

/** 한 번의 AI 호출 기록(엔진이 부른다) */
export function recordUsage(e: UsageEvent): void {
  const usd = costOf(e);
  const day = dayKey();
  useUsage.setState((s) => ({
    total: addTo(s.total, e, usd),
    byDay: pruneDays({ ...s.byDay, [day]: addTo(s.byDay[day], e, usd) }),
    byModel: { ...s.byModel, [e.model]: addTo(s.byModel[e.model], e, usd) },
    byKind: { ...s.byKind, [e.kind]: addTo(s.byKind[e.kind], e, usd) },
    last: { ...e, ts: Date.now(), usd },
  }));
  scheduleSave();
}

// ───────────────────────── 기기 저장

const KEY = 'mainchar:usage:v1';
const SAVE_DELAY = 1500;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let savePending = false;

type Saved = Omit<UsageState, 'hydrated'> & { v: 1 };

function snapshot(): Saved {
  const s = useUsage.getState();
  return { v: 1, total: s.total, byDay: s.byDay, byModel: s.byModel, byKind: s.byKind, last: s.last };
}

async function saveNow(): Promise<void> {
  saveTimer = null;
  try {
    await kv.setItem(KEY, JSON.stringify(snapshot()));
  } catch (e) {
    console.warn('[사용량] 저장 실패', e);
  }
}

function scheduleSave() {
  // 불러오기 전에 저장하면 기기에 있던 기록을 덮어쓴다 → 불러온 뒤에 저장
  if (!useUsage.getState().hydrated) {
    savePending = true;
    return;
  }
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void saveNow(), SAVE_DELAY);
}

function mergeMap(a: Record<string, UsageBucket> = {}, b: Record<string, UsageBucket> = {}): Record<string, UsageBucket> {
  const out: Record<string, UsageBucket> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = out[k] ? sumBuckets([out[k], v]) : v;
  return out;
}

let hydrating: Promise<void> | null = null;

/** 앱 시작 때 저장된 사용량 불러오기(그 사이 기록된 호출은 합친다) */
export function hydrateUsage(): Promise<void> {
  if (useUsage.getState().hydrated) return Promise.resolve();
  if (!hydrating) {
    hydrating = (async () => {
      let saved: Partial<Saved> | null = null;
      try {
        const raw = await kv.getItem(KEY);
        if (raw) saved = JSON.parse(raw) as Partial<Saved>;
      } catch (e) {
        console.warn('[사용량] 불러오기 실패', e);
      }
      const cur = useUsage.getState();
      useUsage.setState({
        hydrated: true,
        total: sumBuckets([saved?.total, cur.total]),
        byDay: pruneDays(mergeMap(saved?.byDay, cur.byDay)),
        byModel: mergeMap(saved?.byModel, cur.byModel),
        byKind: mergeMap(saved?.byKind, cur.byKind),
        last: cur.last ?? saved?.last ?? null,
      });
      if (savePending) {
        savePending = false;
        scheduleSave();
      }
    })();
  }
  return hydrating;
}

/** 사용량 기록 지우기 */
export function resetUsage(): void {
  useUsage.setState({ total: emptyBucket(), byDay: {}, byModel: {}, byKind: {}, last: null });
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (useUsage.getState().hydrated) void saveNow();
  else savePending = true;
}
