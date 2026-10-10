/**
 * 참여 수치(좋아요·재게시·조회수·답글 수) 계산 + "툭 투둑" 도착 연출 시간표
 * 팔로워 수에 비례해 폭발적으로 늘고, 글의 매력도·분위기·바이럴·난이도의 영향을 받는다.
 */
import type { Mood } from '../ai/types';
import type { Difficulty } from '../types';
import { clamp, rand } from '../utils';

export interface EngagementInput {
  followers: number;
  /** 글 매력도 0~100 (AI가 매김) */
  quality: number;
  mood: Mood;
  viral: boolean;
  /** 바이럴 모먼트 아이템 효과 */
  boost: boolean;
  difficulty: Difficulty;
}

export interface Engagement {
  likes: number;
  reposts: number;
  views: number;
}

/** 좋아요 상한(숫자가 터무니없어지지 않게) */
export const LIKES_MAX = 5_000_000;

/** 80만을 넘는 좋아요는 점점 덜 늘게(딱 떨어지는 상한값 "500만"이 그대로 보이지 않게) */
export function softCapLikes(n: number): number {
  const knee = 800_000;
  if (n <= knee) return Math.max(0, Math.round(n));
  return Math.min(LIKES_MAX - rand(0, 99_999), Math.round(knee + Math.pow(n - knee, 0.88)));
}

/** 내 글의 참여 수치 */
export function postEngagement(i: EngagementInput): Engagement {
  const f = Math.max(0, i.followers);
  const q = clamp(i.quality, 0, 100) / 100;
  const diff = i.difficulty === 'easy' ? 1.3 : i.difficulty === 'hard' ? 0.8 : 1;
  const mood = { funny: 1.4, positive: 1.15, brag: 1.05, question: 1.1, apology: 0.9, negative: 0.8, neutral: 0.95 }[i.mood] ?? 1;
  // (v3.1) 팔로워 대비 반응을 현실 수준으로(보통 글은 팔로워의 약 0.5~3%)
  const rate = (0.006 + q * 0.035) * mood * diff * (0.6 + Math.random() * 0.9);
  let likes = Math.round(f * rate + rand(1, 6) + Math.sqrt(f) * q);
  if (i.viral) likes = Math.round(likes * rand(5, 12) + f * 0.05);
  if (i.boost) likes = Math.round(likes * rand(3, 6));
  likes = softCapLikes(likes);
  const reposts = Math.round(likes * (0.04 + Math.random() * 0.1));
  const views = Math.max(likes * rand(18, 45) + reposts * 60 + Math.round(f * (0.2 + Math.random() * 0.6)), 30);
  return { likes, reposts, views };
}

/**
 * 한 번에 달리는 답글·댓글 수(v3.1): 보통 5~6개. 그중 인플루언서(팔로워 10만↑·셀럽)가 답글을 달면
 * 그 답글 아래로 2~3개가 더 달린다(대댓글). 한 번에 최대 8개. 전부 AI가 글 내용에 맞춰 쓴다.
 */
export const BURST = { min: 5, max: 6, cascadeMax: 3, total: 8 } as const;

/** 이번에 달릴 기본 답글 수(5~6) */
export function burstCount(): number {
  return rand(BURST.min, BURST.max);
}

/** 인플루언서: 팔로워 10만 이상이거나 셀럽 분류(뉴스·단체 계정 제외) */
export function isInfluencer(c: { followers: number; crowdRole?: string; isNews?: boolean } | undefined): boolean {
  if (!c || c.isNews) return false;
  return c.followers >= 100_000 || c.crowdRole === 'celeb';
}

/** 캐릭터(NPC) 글의 반응 수: 팔로워 비례, 큰 계정은 조금 더 후하게. 조회수 ≈ 좋아요 × 20~40 */
export function npcEngagement(followers: number): { likes: number; reposts: number; views: number } {
  const f = Math.max(0, followers);
  let likes = Math.sqrt(f) * (1.5 + Math.random() * 5.5);
  if (f > 50_000) likes += f * (0.0005 + Math.random() * 0.0025);
  const l = clamp(Math.round(likes), 1, LIKES_MAX);
  const reposts = Math.round((l * rand(2, 12)) / 100);
  return { likes: l, reposts, views: l * rand(20, 40) + reposts * 30 };
}

/**
 * 숫자가 자라는 연출 값(화면·게임 공용): from → to 를 ms 동안 처음엔 빠르게, 나중엔 천천히(ease-out).
 * Post.growFrom = { likes, reposts, views, ts, ms } 와 지금 값(post.likes …)을 넣으면 된다.
 */
export function growValue(from: number, to: number, ts: number, ms: number, now = Date.now()): number {
  if (ms <= 0 || now >= ts + ms || to <= from) return to;
  if (now <= ts) return from;
  const t = (now - ts) / ms;
  // 화면(components/GrowingCount)과 같은 곡선 — 이어서 자랄 때 숫자가 튀지 않게
  return Math.floor(from + (to - from) * (1 - Math.pow(1 - t, 2.4)));
}

/**
 * "툭 투둑 툭 투두둑" — n개의 반응이 1~3개씩 묶여 불규칙한 간격으로 도착하는 시간표(ms)
 * @param startMs 첫 묶음이 도착하는 시각
 */
export function burstDelays(n: number, startMs = 600): number[] {
  const out: number[] = [];
  let t = startMs;
  while (out.length < n) {
    const size = Math.min(n - out.length, rand(1, 3));
    for (let k = 0; k < size; k++) out.push(t + k * rand(80, 260));
    t += rand(900, 2600);
  }
  return out;
}
