/**
 * 쪽지(DM)·선물 — 읽음 → 입력 중… → 한 줄씩 도착(AI 1회), 호감도·설렘은 관계 규칙으로
 * 선물 = 내가 보낸 선물 메시지 + 같은 쪽지 AI 호출로 답장(추가 호출 없음) + 선물 기본 효과
 */
import { getActive } from '../store/game';
import type { ID } from '../types';
import { clamp, fill, rand, sleep, uid } from '../utils';
import { tap } from '../utils/haptics';
import { addNpcLines, activeChar, alive, beginFlow, ctxOf, editIf, engine, ensureConversation, fail, G, OK, trimMessages, tune, type ActionResult, type Flow } from './core';
import { diffOf, scaleSocial } from './difficulty';
import { giftBlocked, giftEffect, GIFTS } from './items';
import { heartEligible, noteTouch, setHeart } from './love';
import { addMemory, addXp, applyAffinity, logActivity, noteParenFacts, noteTouchFromText, pushItemLog, questProgress, tickClock } from './progress';
import { DM_MAX_LEN, TIME_COST, XP } from './rules';
import { hitsAvoid, scrubAvoid, withCharAvoid } from '../ai/context';
import { takeAvoid } from './avoid';
import { runDayTick } from './tick';
import { snapshot } from './undo';

export function sendDM(characterId: ID, text: string): ActionResult {
  const sc = getActive();
  if (!sc) return fail('none');
  // (-단어)·(+단어): 화제 빼기/다시 넣기(그것만 썼으면 쪽지는 보내지 않는다)
  const cmd = takeAvoid(sc.id, text);
  const body = cmd.text.trim().slice(0, DM_MAX_LEN);
  if (!body) return cmd.changed ? OK : fail('empty');
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
    // 괄호로 쓴 행동에 스킨십이 있으면 이 인물에 적어 둔다
    noteTouchFromText(d, body, [characterId]);
    noteParenFacts(d, body, characterId);
  });
  tap();
  void dmConversation(beginFlow(sid), characterId, body, days);
  return OK;
}

/** 선물 보내기: 쪽지로 선물 + 캐릭터가 답장. 효과는 고른 수치 하나만 고정 +18 — 보내는 즉시 반영(답장 내용·난이도·바이럴 모먼트와 무관) */
export function sendGift(characterId: ID, giftId: string): ActionResult {
  const sc = getActive();
  if (!sc) return fail('none');
  const c = activeChar(sc, characterId);
  const gift = GIFTS.find((g) => g.id === giftId);
  if (!c || !gift || giftBlocked(c, gift)) return fail('none');
  const conv = sc.dms[characterId];
  if (conv?.leftUntilDay != null && conv.leftUntilDay > sc.clock.day) return fail('left');
  if (G().busy[`dm:${characterId}`]) return fail('busy');
  snapshot(sc, `선물: ${gift.name}`);

  const sid = sc.id;
  let days = 0;
  const base = giftEffect(gift);
  G().edit(sid, (d) => {
    days = tickClock(d, TIME_COST.dm);
    const cv = ensureConversation(d, characterId);
    cv.messages.push({ id: uid('m'), from: 'me', text: gift.message, ts: Date.now(), at: { ...d.clock } });
    trimMessages(cv);
    cv.updatedTs = Date.now();
    pushItemLog(d, 'gift', `${gift.emoji} ${c.name}님에게 ${gift.name}`, characterId);
    addXp(d, XP.dm);
    questProgress(d, 'dm', 1);
    logActivity(d, gift.emoji, fill('{c}님에게 {g}을(를) 선물했어요', { c: c.name, g: gift.name }));
    applyAffinity(d, characterId, base.affinity, base.romance, base.devotion);
    addMemory(d, fill('플레이어가 {c}에게 {g}을(를) 선물함', { c: c.name, g: gift.name }));
  });
  tap('success');
  void dmConversation(beginFlow(sid), characterId, gift.message, days, true);
  return OK;
}

/** gift = 선물 쪽지(효과는 보낼 때 이미 반영 — 답장의 수치 변화는 더하지 않는다) */
async function dmConversation(flow: Flow, characterId: ID, message: string, days: number, gift = false) {
  const sid = flow.sid;
  const key = `dm:${characterId}`;
  G().setBusy(key, true);
  try {
    // ① 읽음 표시
    await sleep(rand(600, 1400));
    if (!editIf(flow, (d) => d.dms[characterId]?.messages.forEach((m) => void (m.from === 'me' && (m.read = true))))) return;
    const sc = G().scenarios[sid];
    const ctx0 = ctxOf(sid);
    if (!sc || !ctx0) return;
    // 이 인물이 꺼내지 않는 화제(캐릭터 설정)도 이 대화에서는 빼 둔 화제와 똑같이 다룬다
    const ctx = withCharAvoid(ctx0, characterId);
    // 빼 둔 화제가 든 줄·요약 문장은 넘기지 않는다
    const history = (sc.dms[characterId]?.messages ?? [])
      .filter((m) => m.from !== 'system')
      .slice(-41, -1)
      .filter((m) => !hitsAvoid(ctx.avoid, m.text))
      .map((m) => ({ from: m.from as 'me' | 'them', text: m.text }));
    const priorSummary = scrubAvoid(ctx.avoid, sc.dms[characterId]?.summary) || undefined;
    // ② 입력 중… → 한 줄씩 답장
    editIf(flow, (d) => {
      if (d.dms[characterId]) d.dms[characterId].typing = true;
    });
    // AI 개수 조절에서 쪽지 답장 말풍선을 0으로 두면 답장하지 않는다(AI를 부르지 않음)
    const r = tune().dmBubbles <= 0 ? null : await engine().dmReply(ctx, { characterId, history, message, priorSummary });
    if (!r) {
      // AI가 끝내 답하지 못함 → 답장은 비워 둔다(틀 문장으로 채우지 않음)
      editIf(flow, (d) => {
        ensureConversation(d, characterId).typing = false;
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
      // 선물 쪽지는 보낼 때 이미 고정 효과를 반영했다 → 답장의 변화량은 더하지 않는다
      if (!gift) {
        const aff = scaleSocial(clamp(r.affinityDelta ?? 0, -10, 15), diff);
        const rom = scaleSocial(clamp(r.romanceDelta ?? 0, -6, 15), diff);
        const dev = scaleSocial(clamp(r.devotionDelta ?? 0, 0, 10), diff);
        applyAffinity(d, characterId, aff, rom, dev);
      }
      if (r.historySummary) cv.summary = r.historySummary;
      // 이 대화 직후의 속마음(여성 + 호감도 기준 이상일 때만) · 이 대화에서 실제로 한 스킨십
      if (r.heart && heartEligible(d, c)) setHeart(d, characterId, r.heart);
      if (r.touch && !r.leave && noteTouch(d, characterId, r.touch)) addMemory(d, fill('플레이어가 {c}와(과) {a}을(를) 함', { c: c.name, a: r.touch }));
      // 대화 끝에 그 인물이 자기 계정에 올리는 글(하루에 한 번까지, 대화방을 나가는 경우는 제외)
      if (r.post && !r.leave && !gift && cv.echoDay !== d.clock.day) {
        cv.echoDay = d.clock.day;
        addNpcLines(d, [{ authorId: characterId, text: r.post }]);
      }
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
