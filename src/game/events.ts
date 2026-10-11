/**
 * 이벤트 — 선택지 또는 직접 쓴 답(AI 1회) → 결과를 한 번에 적용(화면이 수치 변화를 실시간으로 보여 줌)
 *
 *   시간: 이벤트에 답하면 그날이 끝난다 — 결과 글이 올라온 뒤 시계가 다음 날 아침 9시로 가고 하루 정산이 돈다
 *   수치: 난이도·답의 질·바이럴 모먼트로 보정(difficulty.ts). 관계 수치는 "적지 않게"(최소 ±6, 최대 ±30)
 *   후보: "다른 이벤트" = 그 세계관 파일에 직접 쓴 이벤트(토큰 0) 우선, 바닥나면 AI 1회. ◀ 1/2 ▶ 로 이전 후보 다시 고르기
 *   (v3.1) 세계관과 상관없는 공용 이벤트 틀은 없앴다 — 직접 만든 세계관은 처음부터 AI가 그 세계에 맞게 만든다
 *   고치기: 지금 보이는 후보에 저장(답하기 전까지만)
 */
import { getWorldTemplate } from '../data/worlds';
import { getActive } from '../store/game';
import { type Difficulty, type EventChoice, type EventVariant, type GameEvent, type ID, type RomanceLevel, type Scenario } from '../types';
import { clamp, cutText, fill, snippet } from '../utils';
import { tap } from '../utils/haptics';
import { ROMANCE_LABEL } from './content';
import { addThreadedPosts, alive, beginFlow, ctxOf, engine, fail, G, OK, type ActionResult, type Flow } from './core';
import { localVariant } from './localEvents';
import { DIFFICULTY_LABEL, EVENT_AFFINITY_CAP, EVENT_ROMANCE_CAP, diffOf, scaleEventDeltas } from './difficulty';
import { addMemory, addXp, applyDeltas, consumeBoost, logActivity, pushNoti, questProgress, recomputeStatus, tickClock } from './progress';
import { START_TIME, XP } from './rules';
import { runDayTick, usedEventKeys } from './tick';
import { snapshot } from './undo';

// ───────────────────────── 답하기

export function chooseEventOption(eventId: ID, choiceId: string): ActionResult {
  const sc = getActive();
  if (!sc) return fail('none');
  const ev = sc.events.find((e) => e.id === eventId);
  if (!ev || ev.status !== 'pending' || !ev.choices.some((c) => c.id === choiceId)) return fail('none');
  if (G().busy[`event:${eventId}`]) return fail('busy');
  snapshot(sc, `이벤트: ${ev.title}`);
  tap('medium');
  void resolveEventFlow(beginFlow(sc.id), eventId, { choiceId }, takeBoost(sc.id, ev.title));
  return OK;
}

/** 켜 둔 바이럴 모먼트를 답하는 순간 쓴다(AI를 기다리는 사이 다른 행동이 가져가지 않게) */
function takeBoost(sid: ID, title: string): boolean {
  if (!G().scenarios[sid]?.boost) return false;
  let used = false;
  G().edit(sid, (d) => {
    used = consumeBoost(d, `"${title}" 결과가 크게 강화돼요`);
  });
  return used;
}

/** 이벤트에 직접 쓴 답으로 응답(선택지 대신) */
export function answerEventCustom(eventId: ID, text: string): ActionResult {
  const sc = getActive();
  const body = cutText(text.trim(), 200);
  if (!sc) return fail('none');
  if (!body) return fail('empty');
  const ev = sc.events.find((e) => e.id === eventId);
  if (!ev || ev.status !== 'pending') return fail('none');
  if (G().busy[`event:${eventId}`]) return fail('busy');
  snapshot(sc, `이벤트: ${ev.title}`);
  tap('medium');
  void resolveEventFlow(beginFlow(sc.id), eventId, { customText: body }, takeBoost(sc.id, ev.title));
  return OK;
}

async function resolveEventFlow(flow: Flow, eventId: ID, ans: { choiceId?: string; customText?: string }, boosted: boolean) {
  const sid = flow.sid;
  const key = `event:${eventId}`;
  G().setBusy(key, true);
  let days = 0;
  try {
    const sc = G().scenarios[sid];
    const ctx = ctxOf(sid);
    const ev = sc?.events.find((e) => e.id === eventId);
    if (!sc || !ctx || !ev || ev.status !== 'pending') return;
    const outcome = await engine().resolveEvent(ctx, { event: ev, choiceId: ans.choiceId, customText: ans.customText });
    if (!alive(flow)) return;
    if (!outcome) {
      // AI가 결과를 쓰지 못함 → 이벤트는 그대로 대기(다시 답할 수 있게). 써 버린 바이럴 모먼트는 되돌려 둔다
      if (boosted) G().edit(sid, (d) => void (d.boost = { kind: 'viral', armedTs: Date.now() }));
      return;
    }
    const label = ans.customText ?? ev.choices.find((c) => c.id === ans.choiceId)?.label ?? '';
    G().edit(sid, (d) => {
      const e = d.events.find((x) => x.id === eventId);
      if (!e || e.status !== 'pending') return;
      e.status = 'resolved';
      const difficulty = diffOf(d);
      const grade = clamp(Math.round(outcome.grade ?? 0), -2, 2);
      const scaled = scaleEventDeltas(outcome.deltas ?? {}, { difficulty, grade, boost: boosted, involved: e.involved.filter((id) => d.characters[id] && !d.characters[id].inactive) });
      const applied = applyDeltas(d, { ...scaled, xp: undefined }, { affinityCap: EVENT_AFFINITY_CAP, romanceCap: EVENT_ROMANCE_CAP, devotionCap: EVENT_ROMANCE_CAP });
      const xp = (XP.event + clamp(outcome.deltas?.xp ?? 0, 0, 20)) * (boosted ? 2 : 1);
      addXp(d, xp);
      e.result = {
        choiceId: ans.customText ? 'custom' : (ans.choiceId ?? 'custom'),
        text: outcome.text,
        deltas: {
          followers: applied.followers,
          aura: applied.aura,
          humor: applied.humor,
          reputation: applied.reputation,
          xp,
          affinity: applied.affinity,
          romance: applied.romance,
          devotion: applied.devotion,
        },
        ...(ans.customText ? { custom: ans.customText } : {}),
        changes: applied.changes,
        ...(boosted ? { boosted: true } : {}),
        difficulty,
      };
      // (v3.2) 시스템 글 대신: 내 답을 보고 인물·일반인이 올린 SNS 글(댓글 포함)
      addThreadedPosts(d, outcome.posts, `ev:${eventId}`);
      pushNoti(d, { type: 'event', eventId, text: `${e.title}: ${snippet(outcome.text, 40)}` });
      addMemory(d, ans.customText ? `${e.title} → 직접 답: "${snippet(ans.customText, 40)}" → ${outcome.text}` : `${e.title} → "${label}" 선택 → ${outcome.text}`);
      logActivity(d, e.emoji, ans.customText ? `${e.title}: 직접 답함 "${snippet(ans.customText, 20)}"` : `${e.title}: "${label}"`);
      questProgress(d, 'event', 1);
      recomputeStatus(d);
      // 이벤트에 답하면 그날은 끝: 결과 글은 오늘 시각으로 남기고, 시계는 다음 날 아침으로
      days = tickClock(d, 1440 - (d.clock.hour * 60 + d.clock.minute) + START_TIME.hour * 60 + START_TIME.minute);
      logActivity(d, '🌙', `${e.title} 뒤로 하루가 지났어요`);
    });
  } finally {
    G().setBusy(key, false);
  }
  if (days > 0 && alive(flow)) await runDayTick(sid);
}

// ───────────────────────── 후보(◀ 1/2 ▶) · 고치기

function variantOf(e: GameEvent): EventVariant {
  return {
    emoji: e.emoji,
    title: e.title,
    body: e.body,
    choices: e.choices.map((c) => ({ ...c })),
    involved: [...e.involved],
    ...(e.templateKey ? { templateKey: e.templateKey } : {}),
    ...(e.edited ? { edited: true } : {}),
  };
}

/** 후보 목록을 처음 쓸 때 만든다(0번 = 처음 이벤트) */
function ensureVariants(e: GameEvent): EventVariant[] {
  if (!e.variants?.length) {
    e.variants = [variantOf(e)];
    e.vIndex = 0;
  }
  if (e.vIndex === undefined || e.vIndex < 0 || e.vIndex >= e.variants.length) e.vIndex = 0;
  return e.variants;
}

/** 후보 → 위쪽(지금 보이는) 사본 */
function showVariant(e: GameEvent, v: EventVariant) {
  e.emoji = v.emoji;
  e.title = v.title;
  e.body = v.body;
  e.choices = v.choices.map((c) => ({ ...c }));
  e.involved = [...v.involved];
  e.templateKey = v.templateKey;
  e.edited = !!v.edited;
}

/** 이벤트 내용 직접 고치기(지금 보이는 후보에 저장) */
export function editEvent(eventId: ID, patch: { emoji?: string; title?: string; body?: string; choices?: { id: string; label: string; hint?: string }[] }): void {
  const sc = getActive();
  const ev = sc?.events.find((e) => e.id === eventId);
  if (!sc || !ev || ev.status !== 'pending') return;
  G().edit(sc.id, (d) => {
    const e = d.events.find((x) => x.id === eventId);
    if (!e || e.status !== 'pending') return;
    const list = ensureVariants(e);
    const v = list[e.vIndex ?? 0];
    if (patch.emoji !== undefined && patch.emoji.trim()) v.emoji = cutText(patch.emoji.trim(), 8);
    if (patch.title !== undefined && patch.title.trim()) v.title = cutText(patch.title.trim(), 60);
    if (patch.body !== undefined) v.body = cutText(patch.body.trim(), 400);
    if (patch.choices) {
      const choices: EventChoice[] = patch.choices
        .map((c, i) => ({ id: (c.id || '').trim() || `c${i + 1}`, label: (c.label ?? '').trim().slice(0, 60), ...(c.hint?.trim() ? { hint: c.hint.trim().slice(0, 30) } : {}) }))
        .filter((c) => c.label)
        .slice(0, 4);
      if (choices.length) {
        const changed = choices.length !== v.choices.length || choices.some((c, i) => c.label !== v.choices[i]?.label || c.id !== v.choices[i]?.id);
        // 선택지를 바꿨으면 세계관 파일의 이벤트와 다른 이벤트가 된다(같은 이벤트가 후보로 다시 나올 수 있게 연결을 끊음)
        if (changed) delete v.templateKey;
        v.choices = choices;
      }
    }
    v.edited = true;
    showVariant(e, v);
  });
}

/** 후보 이동(이전/다음) — index는 0부터 */
export function setEventVariant(eventId: ID, index: number): void {
  const sc = getActive();
  const ev = sc?.events.find((e) => e.id === eventId);
  if (!sc || !ev || ev.status !== 'pending' || G().busy[`event:${eventId}`]) return;
  G().edit(sc.id, (d) => {
    const e = d.events.find((x) => x.id === eventId);
    if (!e || e.status !== 'pending') return;
    const list = ensureVariants(e);
    const i = clamp(Math.round(index), 0, list.length - 1);
    // 지금 보이는 사본에 고친 내용이 있으면 후보에 먼저 저장
    list[e.vIndex ?? 0] = { ...variantOf(e) };
    e.vIndex = i;
    showVariant(e, list[i]);
  });
}

/** "다른 이벤트": 새 후보를 만들어 그 후보로 이동(로컬 후보 우선, 바닥나면 AI). 실패하면 false */
export async function refreshEventVariant(eventId: ID): Promise<boolean> {
  const sc = getActive();
  const ev = sc?.events.find((e) => e.id === eventId);
  if (!sc || !ev || ev.status !== 'pending') return false;
  const key = `eventVariant:${eventId}`;
  if (G().busy[key] || G().busy[`event:${eventId}`]) return false;
  const sid = sc.id;
  G().setBusy(key, true);
  try {
    const used = new Set(usedEventKeys(sc));
    const titles = new Set<string>();
    for (const e of sc.events) {
      titles.add(e.title);
      for (const v of e.variants ?? []) titles.add(v.title);
    }
    // ① 그 세계관 파일의 이벤트(토큰 0)
    const pool = (getWorldTemplate(sc.world.templateId)?.events ?? []).filter((t) => !used.has(t.key));
    let next: EventVariant | null = null;
    for (const t of [...pool].sort(() => Math.random() - 0.5)) {
      const v = localVariant(sc, t);
      if (v && !titles.has(v.title)) {
        next = v;
        break;
      }
    }
    // ② 바닥나면 AI 1회
    if (!next) {
      const flow = beginFlow(sid);
      const ctx = ctxOf(sid);
      if (!ctx) return false;
      const draft = await engine().newEvent(ctx, { avoidTitles: [...titles] });
      if (!draft || !alive(flow) || titles.has(draft.title)) return false;
      next = { emoji: draft.emoji || '⚡', title: draft.title, body: draft.body, choices: draft.choices.slice(0, 4), involved: draft.involved, ...(draft.templateKey ? { templateKey: draft.templateKey } : {}) };
    }
    const v = next;
    let ok = false;
    G().edit(sid, (d) => {
      const e = d.events.find((x) => x.id === eventId);
      if (!e || e.status !== 'pending') return;
      const list = ensureVariants(e);
      list[e.vIndex ?? 0] = { ...variantOf(e) };
      v.involved = v.involved.filter((id) => d.characters[id] && !d.characters[id].inactive);
      list.push(v);
      e.vIndex = list.length - 1;
      showVariant(e, v);
      ok = true;
    });
    return ok;
  } finally {
    G().setBusy(key, false);
  }
}

// ───────────────────────── 난이도

/** 난이도 바꾸기 */
export function setDifficulty(level: Difficulty): void {
  const sc = getActive();
  if (!sc || !DIFFICULTY_LABEL[level] || (sc.difficulty ?? 'normal') === level) return;
  G().edit(sc.id, (d) => {
    d.difficulty = level;
    logActivity(d, '🎚️', fill('난이도를 {x}(으)로 바꿨어요', { x: DIFFICULTY_LABEL[level] }));
  });
}

/** 연애·플러팅 수위 바꾸기 — 공통 캐릭터(실존 인물)·가족에는 영향 없음(항상 연애 반응 0) */
export function setRomanceLevel(level: RomanceLevel): void {
  const sc = getActive();
  if (!sc || !ROMANCE_LABEL[level] || (sc.romanceLevel ?? 'racy') === level) return;
  G().edit(sc.id, (d) => {
    d.romanceLevel = level;
    logActivity(d, '🌶️', fill('연애 수위를 {x}(으)로 바꿨어요', { x: ROMANCE_LABEL[level] }));
  });
}

/** 이벤트 화면 안내용: 지금 난이도 이름 */
export function difficultyLabel(sc: Pick<Scenario, 'difficulty'> | null | undefined): string {
  return DIFFICULTY_LABEL[sc?.difficulty ?? 'normal'];
}
