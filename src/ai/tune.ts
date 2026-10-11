/**
 * AI 조절값 — AI가 한 번에 써 주는 양(답글·댓글·쪽지·새 글 수 …)을 사용자가 직접 정한다(나 탭 > AI 연결).
 *  - 값은 설정(settings.ai.tune)에 들어 있고, 호출할 때마다 지금 값을 읽는다 → 바꾸면 다음 호출부터 바로 반영.
 *  - DB 동기화를 쓰면 Supabase(aisns.settings)에 같이 올라가 다른 기기에도 그대로 적용된다(sync/index.ts).
 *  - 0 = 그 일에 AI를 쓰지 않는다(호출 자체가 없어진다). 켬/끔 항목은 1/0.
 * 예상 소모(토큰·요금)는 실측(2026-10, 기본 세계관)에 맞춘 어림값이다 — 입력은 호출 종류마다 거의 고정, 출력은 개수에 비례.
 */
import type { AITune } from '../types';

export const DEFAULT_TUNE: AITune = {
  replies: 6,
  echoPosts: 1,
  echoDMs: 1,
  thread: 6,
  dmBubbles: 3,
  dmPost: 1,
  eventPosts: 3,
  comments: 6,
  refreshPosts: 3,
  dayPosts: 4,
  dayDMs: 2,
  dayNews: 1,
  dayTrends: 1,
  dayMission: 1,
  dayEvent: 1,
  firstDM: 1,
};

/** 항목별 [최소, 최대] */
export const TUNE_RANGE: Record<keyof AITune, [number, number]> = {
  replies: [1, 6],
  echoPosts: [0, 3],
  echoDMs: [0, 2],
  thread: [5, 8],
  dmBubbles: [1, 3],
  dmPost: [0, 1],
  eventPosts: [0, 4],
  comments: [0, 6],
  refreshPosts: [0, 5],
  dayPosts: [0, 6],
  dayDMs: [0, 3],
  dayNews: [0, 1],
  dayTrends: [0, 1],
  dayMission: [0, 1],
  dayEvent: [0, 1],
  firstDM: [0, 1],
};

/** 저장된 값(일부만 있거나 범위를 벗어날 수 있음) → 쓸 수 있는 값 */
export function normTune(p?: Partial<AITune> | null): AITune {
  const out = { ...DEFAULT_TUNE };
  if (!p || typeof p !== 'object') return out;
  for (const k of Object.keys(DEFAULT_TUNE) as (keyof AITune)[]) {
    const v = Number((p as Record<string, unknown>)[k]);
    if (!Number.isFinite(v)) continue;
    const [min, max] = TUNE_RANGE[k];
    out[k] = Math.min(max, Math.max(min, Math.round(v)));
  }
  return out;
}

/** 두 조절값이 같은지 */
export function sameTune(a?: Partial<AITune> | null, b?: Partial<AITune> | null): boolean {
  const x = normTune(a);
  const y = normTune(b);
  return (Object.keys(DEFAULT_TUNE) as (keyof AITune)[]).every((k) => x[k] === y[k]);
}

/** 하루 정산을 어떻게 부를지: full = 하루 정산 1회 / posts = 새 글만(빠른 호출 1회) / none = AI 없음 */
export function dayPlan(t: AITune): 'full' | 'posts' | 'none' {
  const extras = t.dayDMs + t.dayNews + t.dayTrends + t.dayMission + t.dayEvent;
  if (extras > 0) return 'full';
  return t.dayPosts > 0 ? 'posts' : 'none';
}

// ───────────────────────── 예상 소모

export type CallKind = 'react' | 'thread' | 'dm' | 'event' | 'comments' | 'refresh' | 'day' | 'firstDM' | 'draft';
export interface CallCost {
  inTok: number;
  outTok: number;
}

/** 호출 1번의 입력 토큰(규칙+세계관+인물 목록 — 개수 조절과 거의 무관) */
const IN: Record<Exclude<CallKind, 'day' | 'refresh'> | 'tick' | 'ambient', number> = {
  react: 4500,
  thread: 3850,
  dm: 3250,
  event: 4400,
  comments: 3600,
  ambient: 3550,
  tick: 4650,
  firstDM: 2950,
  draft: 2900,
};
/** 출력에는 생각(thinking) 토큰이 조금 붙는다 */
const OUT_PAD = 1.1;
const NONE: CallCost = { inTok: 0, outTok: 0 };

/** 그 일을 한 번 할 때 드는 토큰(0이면 AI를 부르지 않음) */
export function callCost(kind: CallKind, t: AITune): CallCost {
  const c = (inTok: number, out: number): CallCost => ({ inTok, outTok: Math.round(out * OUT_PAD) });
  switch (kind) {
    case 'react':
      return c(IN.react, 130 + t.replies * 55 + t.echoPosts * 70 + t.echoDMs * 30);
    case 'thread':
      return c(IN.thread, 70 + Math.max(5, t.thread) * 55);
    case 'dm':
      return c(IN.dm, 60 + ((1 + t.dmBubbles) / 2) * 45 + t.dmPost * 25);
    case 'event':
      return c(IN.event, 250 + t.eventPosts * 150);
    case 'comments':
      return t.comments > 0 ? c(IN.comments, 20 + t.comments * 55) : NONE;
    case 'refresh':
      return t.refreshPosts > 0 ? c(IN.ambient, 20 + t.refreshPosts * 70) : NONE;
    case 'day': {
      const plan = dayPlan(t);
      if (plan === 'none') return NONE;
      if (plan === 'posts') return c(IN.ambient, 20 + t.dayPosts * 70);
      return c(IN.tick, 20 + t.dayPosts * 70 + t.dayNews * 30 + t.dayTrends * 90 + t.dayMission * 50 + t.dayEvent * 35 + t.dayDMs * 25);
    }
    case 'firstDM':
      return t.firstDM ? c(IN.firstDM, 70) : NONE;
    case 'draft':
      return c(IN.draft, 150);
  }
}

/** "한 판" = 새 이야기 시작(첫 쪽지) · 내 글 2개 · 답글 1번 · 남의 글 2개 열기 · 쪽지 2번 · 이벤트 1번 · 하루 정산 1번 · 캐릭터 만들기 2번 */
const PLAY: [CallKind, number][] = [
  ['firstDM', 1],
  ['react', 2],
  ['thread', 1],
  ['comments', 2],
  ['dm', 2],
  ['event', 1],
  ['day', 1],
  ['draft', 2],
];

/** 이 조절값으로 한 판 했을 때의 호출 수·토큰 */
export function playCost(t: AITune): CallCost & { calls: number } {
  let inTok = 0;
  let outTok = 0;
  let calls = 0;
  for (const [kind, n] of PLAY) {
    const c = callCost(kind, t);
    if (!c.inTok) continue;
    inTok += c.inTok * n;
    outTok += c.outTok * n;
    calls += n;
  }
  return { inTok, outTok, calls };
}
