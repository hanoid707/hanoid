/**
 * 프롬프트 저장소(클라이언트 쪽) — Supabase aisns.prompts 에서 받은 지시문을 메모리에 들고 있는다.
 *  - DB 값이 있으면 그 값, 없으면(미연결·오프라인·행 없음) 호출한 쪽이 넘긴 기본 문구(src/ai/prompts.ts)를 쓴다.
 *  - 마지막으로 받은 값은 기기에 캐시해 두었다가 시작할 때 먼저 읽는다.
 */
import { loadPromptsLocal, savePromptsLocal } from '../store/persistence';

export interface PromptRow {
  key: string;
  content: string;
  version?: number;
}

let prompts: Record<string, string> = {};

/** 기기 캐시 읽기(시작할 때 한 번) */
export async function hydratePrompts(): Promise<void> {
  const cached = await loadPromptsLocal();
  prompts = { ...cached, ...prompts };
}

/** DB에서 받은 행 적용. 바뀐 게 있으면 true */
export function applyRemotePrompts(rows: PromptRow[]): boolean {
  const next: Record<string, string> = {};
  for (const r of rows) if (r && typeof r.key === 'string' && typeof r.content === 'string' && r.content.trim()) next[r.key] = r.content;
  const keys = new Set([...Object.keys(prompts), ...Object.keys(next)]);
  let changed = false;
  for (const k of keys) if (prompts[k] !== next[k]) changed = true;
  if (!changed) return false;
  prompts = next;
  void savePromptsLocal(prompts);
  return true;
}

/** key 의 지시문. DB 값이 없으면 fallback */
export function getPrompt(key: string, fallback: string): string {
  return prompts[key] ?? fallback;
}
