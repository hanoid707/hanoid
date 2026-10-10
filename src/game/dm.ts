/**
 * 쪽지(DM)·선물 — 읽음 → 입력 중… → 한 줄씩 도착(AI 1회), 호감도·설렘은 관계 규칙으로
 * 선물 = 내가 보낸 선물 메시지 + 같은 쪽지 AI 호출로 답장(추가 호출 없음) + 선물 기본 효과
 */
import { getActive } from '../store/game';
import type { ID } from '../types';
import { clamp, fill, rand, sleep, uid } from '../utils';
import { tap } from '../utils/haptics';
import { activeChar, alive, beginFlow, ctxOf, editIf, engine, ensureConversation, fail, G, OK, trimMessages, type ActionResult, type Flow } from './core';
import { diffOf, scaleSocial } from './difficulty';
import { GIFTS, giftEffect } from './items';
import { addMemory, addXp, applyAffinity, consumeBoost, logActivity, pushItemLog, questProgress, tickClock } from './progress';
import { DM_MAX_LEN, TIME_COST, XP } from './rules';
import { runDayTick } from './tick';
import { snapshot } from './undo';

export function sendDM(characterId: ID, text: string): ActionResult {
  const sc = getActive();
  const body = text.trim().slice(0, DM_MAX_LEN);
  if (!sc) return fail('none');
  if (!body) return fail('empty');
  if (!activeChar(sc, characterId)) return fail('none');
  const conv = sc.dms[characterId];
  if (conv?.leftUntilDay != null && conv.leftUntilDay > sc.clock.day) return fail('left');
  if (G().busy[`dm:${characterId}`]) return fail('busy');
  snapshot(sc, '쪽지');

  const sid = sc.id;
  let days = 0;
  G().edit(sid, (d) => {
    days = tickClock(d, TIME_COST.dm);
    const cv = ensureConversation(d, characterId);
    cv.messages.push({ id: uid('m'), from: 'me', text: body, ts: Date.now(), at: { ...d.clock } });
    trimMessages(cv);
    cv.updatedTs = Date.now();
    addXp(d, XP.dm);
    questProgress(d, 'dm', 1);
  });
  tap();
  void dmConversation(beginFlow(sid), characterId, body, days);
  return OK;
}

/** 선물 보내기: 쪽지로 선물 + 캐릭터가 답장, 호감도·설렘 상승(난이도·관계로 보정) */
export function sendGift(characterId: ID, giftId: string): ActionResult {
  const sc = getActive();
  if (!sc) return fail('none');
  const c = activeChar(sc, characterId);
  const gift = GIFTS.find((g) => g.id === giftId);
  if (!c || !gift) return fail('none');
  const conv = sc.dms[characterId];
  if (conv?.leftUntilDay != null && conv.leftUntilDay > sc.clock.day) return fail('left');
  if (G().busy[`dm:${characterId}`]) return fail('busy');
  snapshot(sc, `선물: ${gift.name}`);

  const sid = sc.id;
  let days = 0;
  let base = { affinity: 0, romance: 0 };
  G().edit(sid, (d) => {
    days = tickClock(d, TIME_COST.dm);
    const boosted = consumeBoost(d, `${c.name}님에게 보낸 ${gift.name}`);
    const cv = ensureConversation(d, characterId);
    cv.messages.push({ id: uid('m'), from: 'me', text: gift.message, ts: Date.now(), at: { ...d.clock } });
    trimMessages(cv);
    cv.updatedTs = Date.now();
    const sameDay = (d.itemLog ?? []).filter((x) => x.item === 'gift' && x.target === characterId && x.at.day === d.clock.day).length;
    base = giftEffect(d.characters[characterId], gift, diffOf(d), boosted, sameDay);
    pushItemLog(d, 'gift', `${gift.emoji} ${c.name}님에게 ${gift.name}`, characterId);
    addXp(d, XP.dm);
    questProgress(d, 'dm', 1);
    logActivity(d, gift.emoji, fill('{c}님에게 {g}을(를) 선물했어요', { c: c.name, g: gift.name }));
  });
  tap('success');
  void dmConversation(beginFlow(sid), characterId, gift.message, days, { ...base, name: gift.name });
  return OK;
}

async function dmConversation(flow: Flow, characterId: ID, message: string, days: number, gift?: { affinity: number; romance: number; name: string }) {
  const sid = flow.sid;
  const key = `dm:${characterId}`;
  G().setBusy(key, true);
  try {
    // ① 읽음 표시
    await sleep(rand(600, 1400));
    if (!editIf(flow, (d) => d.dms[characterId]?.messages.forEach((m) => void (m.from === 'me' && (m.read = true))))) return;
    const sc = G().scenarios[sid];
    const ctx = ctxOf(sid);
    if (!sc || !ctx) return;
    const history = (sc.dms[characterId]?.messages ?? [])
      .filter((m) => m.from !== 'system')
      .slice(-41, -1)
      .map((m) => ({ from: m.from as 'me' | 'them', text: m.text }));
    const priorSummary = sc.dms[characterId]?.summary;
    // ② 입력 중… → 한 줄씩 답장
    editIf(flow, (d) => {
      if (d.dms[characterId]) d.dms[characterId].typing = true;
    });
    const r = await engine().dmReply(ctx, { characterId, history, message, priorSummary });
    if (!r) {
      // AI가 끝내 답하지 못함 → 답장은 비워 둔다(틀 문장으로 채우지 않음). 선물 효과만 반영
      editIf(flow, (d) => {
        const cv = ensureConversation(d, characterId);
        cv.typing = false;
        const c = d.characters[characterId];
        if (!c || !gift) return;
        applyAffinity(d, characterId, gift.affinity, gift.romance);
        addMemory(d, fill('플레이어가 {c}에게 {g}을(를) 선물함', { c: c.name, g: gift.name }));
      });
      return;
    }
    for (const text of r.messages) {
      await sleep(Math.min(2200, 500 + text.length * 35));
      const ok = editIf(flow, (d) => {
        const cv = ensureConversation(d, characterId);
        cv.messages.push({ id: uid('m'), from: 'them', text, ts: Date.now(), at: { ...d.clock } });
        trimMessages(cv);
        cv.unread += 1;
        cv.updatedTs = Date.now();
      });
      if (!ok) return;
    }
    // ③ 호감도·설렘(관계·말투 자동 변화) + 대화방 나가기
    editIf(flow, (d) => {
      const cv = ensureConversation(d, characterId);
      cv.typing = false;
      const c = d.characters[characterId];
      if (!c) return;
      const diff = diffOf(d);
      const aff = scaleSocial(clamp(r.affinityDelta ?? 0, -10, 15), diff) + (gift?.affinity ?? 0);
      const rom = scaleSocial(clamp(r.romanceDelta ?? 0, -6, 15), diff) + (gift?.romance ?? 0);
      // 선물은 정복도도 조금 올린다(받은 만큼 마음이 기운다)
      const dev = scaleSocial(clamp(r.devotionDelta ?? 0, 0, 10), diff) + (gift ? Math.max(1, Math.round(gift.affinity / 4)) : 0);
      applyAffinity(d, characterId, aff, rom, dev);
      if (r.historySummary) cv.summary = r.historySummary;
      if (gift) addMemory(d, fill('플레이어가 {c}에게 {g}을(를) 선물함', { c: c.name, g: gift.name }));
      if (r.leave) {
        cv.messages.push({ id: uid('m'), from: 'system', text: `${c.name}님이 대화방을 나갔습니다.`, ts: Date.now(), at: { ...d.clock } });
        cv.leftUntilDay = d.clock.day + 1;
        logActivity(d, '🚪', `${c.name}님이 쪽지 대화방을 나갔어요`);
        addMemory(d, fill('{c}와(과) 쪽지로 다퉈서 대화방을 나감', { c: c.name }));
      }
    });
  } finally {
    if (G().scenarios[sid]?.dms[characterId]?.typing) {
      G().edit(sid, (d) => {
        if (d.dms[characterId]) d.dms[characterId].typing = false;
      });
    }
    G().setBusy(key, false);
    if (days > 0 && alive(flow)) void runDayTick(sid);
  }
}

export function markConversationRead(characterId: ID) {
  const sc = getActive();
  if (!sc?.dms[characterId]?.unread) return;
  G().edit(sc.id, (d) => {
    d.dms[characterId].unread = 0;
  });
}
