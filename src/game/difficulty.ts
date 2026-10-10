/**
 * 난이도 — 수치가 얼마나 잘 오르고 쉽게 떨어지는지
 *
 *            오를 때   떨어질 때
 *   쉬움       ×1.8      ×0.5     (이벤트·선물)   쪽지·답글·글: ×1.7 / ×0.5
 *   보통       ×1.5      ×0.9                      ×1.4 / ×0.8
 *   어려움     ×1.1      ×1.4                      ×1.1 / ×1.2
 * (v3.2) 플레이어 말에 더 쉽게 휩쓸리게: 오를 때 배율을 키우고 떨어질 때는 줄였다.
 *
 * 이벤트 호감도는 "적지 않게": 0이 아니면 최소 ±6(난이도 적용 전), 한 이벤트에 최대 ±30.
 * 답의 질(-2~+2)이 기울기를 더한다: 쉬움은 -1 답의 하락을 줄이고, 어려움은 +1 답의 상승을 줄인다.
 */
import type { Deltas, Difficulty, ID } from '../types';
import { clamp, rand } from '../utils';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: '쉬움', normal: '보통', hard: '어려움' };
export const DIFFICULTY_DESC: Record<Difficulty, string> = {
  easy: '호감도·스탯이 잘 오르고 잘 안 떨어져요',
  normal: '오를 땐 조금 더 오르고, 떨어질 땐 그대로',
  hard: '오르기 어렵고 한 번 실수하면 크게 떨어져요',
};

export interface Mul {
  pos: number;
  neg: number;
}

/** 이벤트·선물 */
export const EVENT_MUL: Record<Difficulty, Mul> = {
  easy: { pos: 1.8, neg: 0.5 },
  normal: { pos: 1.5, neg: 0.9 },
  hard: { pos: 1.1, neg: 1.4 },
};

/** 쪽지·답글·내 글 반응(조금 순하게) */
export const SOCIAL_MUL: Record<Difficulty, Mul> = {
  easy: { pos: 1.7, neg: 0.5 },
  normal: { pos: 1.4, neg: 0.8 },
  hard: { pos: 1.1, neg: 1.2 },
};

export const EVENT_AFFINITY_MIN = 6;
export const EVENT_AFFINITY_CAP = 30;
export const EVENT_ROMANCE_MIN = 4;
export const EVENT_ROMANCE_CAP = 25;

export const diffOf = (d: { difficulty?: Difficulty }): Difficulty => d.difficulty ?? 'normal';

export function scaled(v: number, m: Mul): number {
  if (!v) return 0;
  return Math.round(v * (v > 0 ? m.pos : m.neg));
}

/** 답의 질에 따른 기울기 */
export function gradeTilt(diff: Difficulty, grade: number): Mul {
  const g = Math.round(clamp(grade, -2, 2));
  if (diff === 'easy') {
    if (g === -1) return { pos: 1, neg: 0.6 };
    if (g <= -2) return { pos: 1, neg: 0.85 };
    if (g >= 2) return { pos: 1.15, neg: 1 };
  }
  if (diff === 'hard') {
    if (g === 1) return { pos: 0.65, neg: 1 };
    if (g >= 2) return { pos: 0.9, neg: 1 };
    if (g <= -2) return { pos: 1, neg: 1.15 };
  }
  return { pos: 1, neg: 1 };
}

/** 0이 아니면 크기를 최소 min으로 */
export function atLeast(v: number, min: number): number {
  if (!v) return 0;
  return Math.sign(v) * Math.max(min, Math.abs(Math.round(v)));
}

export interface EventScaleOpts {
  difficulty: Difficulty;
  /** 답의 질 -2~+2 */
  grade: number;
  /** 바이럴 모먼트: 오르는 쪽 ×2 */
  boost: boolean;
  /** 이벤트 관련 인물(AI가 호감도를 빠뜨리면 답의 질로 채운다) */
  involved: ID[];
}

/** 이벤트 결과 수치 → 난이도·답의 질·바이럴 모먼트 반영 */
export function scaleEventDeltas(raw: Deltas, o: EventScaleOpts): Deltas {
  const m = EVENT_MUL[o.difficulty];
  const t = gradeTilt(o.difficulty, o.grade);
  const mul: Mul = { pos: m.pos * t.pos * (o.boost ? 2 : 1), neg: m.neg * t.neg };
  const g = Math.round(clamp(o.grade, -2, 2));

  const src: Record<ID, number> = { ...(raw.affinity ?? {}) };
  if (g !== 0) {
    for (const id of o.involved) if (!src[id]) src[id] = g * rand(4, 7);
  }
  const affinity: Record<ID, number> = {};
  for (const [id, v] of Object.entries(src)) {
    const x = clamp(scaled(atLeast(v, EVENT_AFFINITY_MIN), mul), -EVENT_AFFINITY_CAP, EVENT_AFFINITY_CAP);
    if (x) affinity[id] = x;
  }
  const romance: Record<ID, number> = {};
  for (const [id, v] of Object.entries(raw.romance ?? {})) {
    const x = clamp(scaled(atLeast(v, EVENT_ROMANCE_MIN), mul), -EVENT_ROMANCE_CAP, EVENT_ROMANCE_CAP);
    if (x) romance[id] = x;
  }
  const devotion: Record<ID, number> = {};
  for (const [id, v] of Object.entries(raw.devotion ?? {})) {
    const x = clamp(scaled(v, mul), -EVENT_ROMANCE_CAP, EVENT_ROMANCE_CAP);
    if (x) devotion[id] = x;
  }
  return {
    followers: scaled(raw.followers ?? 0, mul),
    aura: scaled(raw.aura ?? 0, mul),
    humor: scaled(raw.humor ?? 0, mul),
    reputation: scaled(raw.reputation ?? 0, mul),
    xp: raw.xp,
    affinity,
    romance,
    devotion,
  };
}

/** 쪽지·답글·글 반응의 호감도·설렘·평판(순한 배율). boost면 오르는 쪽 ×2 */
export function scaleSocial(v: number, diff: Difficulty, boost = false): number {
  if (!v) return 0;
  const m = SOCIAL_MUL[diff];
  return Math.round(v * (v > 0 ? m.pos * (boost ? 2 : 1) : m.neg));
}
