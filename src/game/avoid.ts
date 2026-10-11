/**
 * 빼 둔 화제 — 원치 않는 전개를 바꾸는 장치.
 *   글·답글·쪽지에 (-떡볶이) 처럼 쓰면 그 세계관에서 '떡볶이'를 뺀다. (+떡볶이) 는 다시 넣기.
 *   뺀 화제는:
 *     ① AI에게 넘기는 맥락(최근 타임라인·인물의 최근 글·둘만의 쪽지·주요 사건·쪽지 요약·트렌드·미션)에서 그 낱말이 든 줄을 뺀다(ai/context.ts)
 *     ② 시스템 지시에 "이 화제는 쓰지 않는다"로 들어간다(ai/prompts.ts systemFor)
 *     ③ AI가 그래도 그 낱말을 쓴 줄은 버린다(ai/normalize.ts)
 *     ④ 화면에 남아 그 화제를 다시 불러오는 것들 — 트렌드 · 아직 안 끝낸 미션 · 대기 중인 이벤트 · 글쓰기 제안 — 은 뺄 때 같이 치운다(sweepAvoid)
 *   글·답글·쪽지에 쓰는 대신 세계관 설정(빼 둘 화제)에서 직접 고칠 수도 있고, 인물마다 따로 정할 수도 있다(캐릭터 설정 > 꺼내지 않을 화제).
 *   지나간 글 자체는 타임라인에 그대로 남는다(지우지 않음 — 다시 넣으면 원래대로 돌아온다).
 * 괄호 안이 한글·영문으로 시작할 때만 명령으로 본다((-_-) 같은 이모티콘·숫자는 그대로 둔다).
 */
import { hitsAvoid } from '../ai/context';
import type { ID, Scenario } from '../types';
import { G } from './core';
import { logActivity } from './progress';

const CMD = /\(\s*([-+])\s*#?([^()\n]{1,20}?)\s*\)/g;
/** 한 세계관에서 빼 둘 수 있는 화제 수 */
export const AVOID_MAX = 20;

/** 글에서 (-단어)·(+단어)를 골라내고, 그 부분을 뺀 글을 돌려준다 */
export function parseAvoid(text: string): { text: string; add: string[]; remove: string[] } {
  const add: string[] = [];
  const remove: string[] = [];
  const rest = text.replace(CMD, (m: string, sign: string, word: string) => {
    const w = word.trim();
    if (!/^[가-힣a-zA-Z]/.test(w)) return m;
    (sign === '-' ? add : remove).push(w);
    return ' ';
  });
  if (!add.length && !remove.length) return { text, add, remove };
  return { text: rest.replace(/[ \t]{2,}/g, ' ').replace(/ +\n/g, '\n').trim(), add, remove };
}

/**
 * 글·답글·쪽지를 보내기 직전에 부른다: 들어 있는 (-단어)/(+단어)를 그 세계관에 적용하고 그 부분을 뺀 글을 돌려준다.
 * changed = 명령이 하나라도 있었는지(남은 글이 비면 글은 올리지 않고 화제만 바꾼다).
 */
export function takeAvoid(sid: ID, text: string): { text: string; changed: boolean } {
  const p = parseAvoid(text);
  if (!p.add.length && !p.remove.length) return { text, changed: false };
  let added: string[] = [];
  let removed: string[] = [];
  G().edit(sid, (d) => {
    const cur = d.avoid ?? [];
    removed = p.remove.filter((w) => cur.includes(w));
    let next = cur.filter((w) => !p.remove.includes(w));
    added = p.add.filter((w, i) => !next.includes(w) && p.add.indexOf(w) === i);
    next = [...next, ...added].slice(-AVOID_MAX);
    d.avoid = next;
    if (added.length) sweepAvoid(d, added);
    if (added.length) logActivity(d, '🚫', `이야기에서 뺐어요: ${added.join(', ')}`);
    if (removed.length) logActivity(d, '↩️', `다시 넣었어요: ${removed.join(', ')}`);
  });
  const parts = [added.length ? `‘${added.join('’, ‘')}’ 화제를 이야기에서 뺐어요` : '', removed.length ? `‘${removed.join('’, ‘')}’ 화제를 다시 넣었어요` : ''].filter(Boolean);
  G().showToast(parts.join(' · ') || '이미 반영돼 있어요', 'success');
  return { text: p.text, changed: true };
}

/** 빼 둔 화제 하나를 다시 넣기(글쓰기 화면의 ✕) */
export function removeAvoid(word: string): void {
  const s = G();
  const sid = s.activeId;
  if (!sid || !s.scenarios[sid]?.avoid?.includes(word)) return;
  s.edit(sid, (d) => {
    d.avoid = (d.avoid ?? []).filter((w) => w !== word);
    logActivity(d, '↩️', `다시 넣었어요: ${word}`);
  });
}

/** 쉼표·줄바꿈으로 적은 낱말들 → 목록(앞뒤 공백·# 제거, 중복 제거, 20자·AVOID_MAX개까지) */
export function splitAvoid(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[,，、\n]/)) {
    const w = raw.trim().replace(/^[-+#(（]+|[)）]+$/g, '').trim().slice(0, 20);
    if (w && !out.includes(w)) out.push(w);
  }
  return out.slice(0, AVOID_MAX);
}

/**
 * 뺀 화제가 화면에 남아 다시 불려 오지 않게 치운다: 그 낱말이 든 트렌드 · 아직 안 끝낸 미션 · 대기 중인 이벤트 · 글쓰기 제안.
 * (지나간 글·쪽지는 그대로 두고 AI에게만 안 보여 준다)
 */
export function sweepAvoid(d: Scenario, words: string[]): void {
  if (!words.length) return;
  const hit = (t: string | undefined) => hitsAvoid(words, t);
  if (d.trends) d.trends = d.trends.filter((x) => !hit(x.tag));
  if (d.quests) d.quests = d.quests.filter((q) => q.done || !(hit(q.title) || hit(q.desc) || (q.keyword ?? []).some((k) => hit(k))));
  if (d.events) d.events = d.events.filter((e) => e.status !== 'pending' || !(hit(e.title) || hit(e.body)));
  if (d.ideas?.list) d.ideas.list = d.ideas.list.filter((x) => !hit(x));
}

/** 세계관 설정 화면에서 빼 둘 화제 목록을 통째로 고친다 */
export function setAvoidWords(words: string[]): void {
  const s = G();
  const sid = s.activeId;
  if (!sid) return;
  s.edit(sid, (d) => {
    const cur = d.avoid ?? [];
    const next = words.slice(0, AVOID_MAX);
    const added = next.filter((w) => !cur.includes(w));
    const removed = cur.filter((w) => !next.includes(w));
    if (!added.length && !removed.length) return;
    d.avoid = next;
    if (added.length) {
      sweepAvoid(d, added);
      logActivity(d, '🚫', `이야기에서 뺐어요: ${added.join(', ')}`);
    }
    if (removed.length) logActivity(d, '↩️', `다시 넣었어요: ${removed.join(', ')}`);
  });
}
