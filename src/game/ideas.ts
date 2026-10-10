/**
 * 글쓰기 "제안" — 지금 상황에서 올릴 만한 완성된 글 1~2줄(전부 AI가 쓴 것)
 *   saveIdeas():    AI 반응(내 글)·하루 정산에 얹어 온 제안을 모아 둔다(따로 부르지 않음 → 토큰 0)
 *   getIdeas():     모아 둔 제안 중 아직 안 올린 것 3개
 *   refreshIdeas(): "다른 제안" — 모아 둔 제안 중 지금 안 보이는 것(토큰 0, AI 호출 없음)
 * (v3.1) 미리 써 둔 틀 문장 조합(로컬 제안)은 없앴다 — 맥락 없는 글감이 섞이지 않게.
 */
import { getActive } from '../store/game';
import { ME, type Scenario } from '../types';

/** 모아 두는 제안 수(최신 것부터) */
const POOL = 9;

/** 최근에 내가 올린 글(같은 제안을 다시 보여 주지 않게) */
function myRecentTexts(sc: Scenario): Set<string> {
  return new Set(
    sc.feed
      .slice(0, 60)
      .map((id) => sc.posts[id])
      .filter((p) => p?.authorId === ME)
      .map((p) => p!.text.trim()),
  );
}

/** 아직 안 올린 제안(최신 것부터) */
function pool(sc: Scenario): string[] {
  const mine = myRecentTexts(sc);
  return (sc.ideas?.list ?? []).map((t) => t.trim()).filter((t) => t && !mine.has(t));
}

/** AI가 보내 준 제안을 모아 둔다(최신 것이 앞, 겹치면 하나만) */
export function saveIdeas(d: Scenario, list: string[] | undefined): void {
  const fresh = (list ?? []).map((t) => t.trim()).filter(Boolean);
  if (!fresh.length) return;
  const merged = [...fresh, ...(d.ideas?.list ?? [])].filter((t, i, a) => a.indexOf(t) === i).slice(0, POOL);
  d.ideas = { list: merged, ts: Date.now() };
}

/** 지금 보여 줄 제안(최대 3개, 토큰 0) */
export function getIdeas(): string[] {
  const sc = getActive();
  return sc ? pool(sc).slice(0, 3) : [];
}

/** 지금 보이는 것 말고 더 있는지("다른 제안" 버튼 표시용) */
export function hasMoreIdeas(shown: string[]): boolean {
  const sc = getActive();
  if (!sc) return false;
  const seen = new Set(shown.map((t) => t.trim()));
  return pool(sc).some((t) => !seen.has(t));
}

/** "다른 제안": 모아 둔 제안 중 지금 안 보이는 것 3개(모자라면 처음 것부터 다시 돌아가며 채움). AI를 부르지 않는다 */
export async function refreshIdeas(exclude: string[] = []): Promise<string[]> {
  const sc = getActive();
  if (!sc) return [];
  const all = pool(sc);
  const seen = new Set(exclude.map((t) => t.trim()));
  const next = all.filter((t) => !seen.has(t));
  if (!next.length) return [];
  return [...next, ...all.filter((t) => seen.has(t))].slice(0, 3);
}
