/**
 * 플레이어 행동 → 게임 진행 (이 앱의 "두뇌" 흐름) — 화면은 이 파일만 import한다.
 *
 *   ① 즉시 처리(동기): 되돌리기용 보관(snapshot) → 내 글/메시지 기록 → 시간·경험치·퀘스트
 *   ② AI 반응(비동기, 행동당 1회): 엔진에 물어봄 → 답글·쪽지가 시차를 두고 도착 → 수치 적용(관계·말투 자동 변화)
 *   ③ 날이 바뀌었으면: 하루 정산(월드 틱)
 *
 * 기능별 실제 구현: post(내 글) · thread(답글·남의 글 댓글) · dm(쪽지·선물) · events(이벤트·난이도)
 *                  tick(하루 정산·시간 건너뛰기·새로고침) · ideas(글쓰기 제안) · characters(캐릭터) · roster(공통 캐릭터)
 * 에너지·재화는 없다(행동 횟수 제한 없음). 같은 요청이 겹치지 않게 busy 표시만 한다:
 *   'post:<글ID>' · 'reply:<내 답글ID>' · 'dm:<캐릭터ID>' · 'event:<이벤트ID>' · 'eventVariant:<이벤트ID>' · 'thread:<글ID>'
 *   'tick:<시나리오ID>' · 'ideas' · 'character:new' · 'bio:<캐릭터ID>'
 */
import { getActive, useGame } from '../store/game';
import { useRoster } from '../store/roster';
import type { ID, Persona, Stats, World } from '../types';
import { clamp, cutText, sanitizeHandle } from '../utils';
import { tap } from '../utils/haptics';
import { G } from './core';
import { addMemory, addXp, applyAffinity, applyDeltas, liftCancel, logActivity, pushItemLog, pushNoti, questProgress, recomputeStatus } from './progress';
import { injectRoster, rosterNeedsUpdate } from './roster';
import { REP } from './rules';
import { runDayTick, tickDue } from './tick';
import { lastUndo, popUndo } from './undo';

export type { ActionResult } from './core';
export { publishPost } from './post';
export { replyToPost, ensureThreadComments } from './thread';
export { sendDM, sendGift, markConversationRead } from './dm';
export { chooseEventOption, answerEventCustom, editEvent, refreshEventVariant, setEventVariant, setDifficulty, setRomanceLevel, difficultyLabel } from './events';
export { runDayTick, skipToNextDay, skipTime, refreshFeed, nextMorningMinutes } from './tick';
export { getIdeas, hasMoreIdeas, refreshIdeas } from './ideas';
export { saveCharacter, deleteCharacter, createQuickCharacter, regenerateBio, onScenarioCreated } from './characters';
export type { CharacterInput, QuickCharacterInput } from './characters';

// ───────────────────────── 마음에 들어요 · 재게시 · 북마크 · 팔로우

export function toggleLike(postId: ID) {
  const sc = getActive();
  if (!sc?.posts[postId]) return;
  tap();
  G().edit(sc.id, (d) => {
    const p = d.posts[postId];
    p.liked = !p.liked;
    p.likes = Math.max(0, p.likes + (p.liked ? 1 : -1));
    if (p.liked && d.characters[p.authorId]) applyAffinity(d, p.authorId, 1);
  });
}

export function toggleRepost(postId: ID) {
  const sc = getActive();
  if (!sc?.posts[postId]) return;
  tap();
  G().edit(sc.id, (d) => {
    const p = d.posts[postId];
    p.reposted = !p.reposted;
    p.reposts = Math.max(0, p.reposts + (p.reposted ? 1 : -1));
    const c = d.characters[p.authorId];
    if (c && p.reposted) {
      applyAffinity(d, c.id, 2);
      logActivity(d, '🔁', `${c.name}님 글을 재게시했어요`);
    }
  });
}

export function toggleBookmark(postId: ID) {
  const sc = getActive();
  if (!sc?.posts[postId]) return;
  tap();
  const on = !sc.posts[postId].bookmarked;
  G().edit(sc.id, (d) => {
    d.posts[postId].bookmarked = on;
  });
  G().showToast(on ? '북마크에 추가했어요' : '북마크에서 삭제했어요');
}

export function toggleFollow(characterId: ID) {
  const sc = getActive();
  const c = sc?.characters[characterId];
  if (!sc || !c) return;
  tap();
  const nowFollowing = !c.iFollow;
  G().edit(sc.id, (d) => {
    const ch = d.characters[characterId];
    ch.iFollow = nowFollowing;
    if (nowFollowing) {
      ch.followers += 1;
      applyAffinity(d, characterId, 2);
    } else {
      ch.followers = Math.max(0, ch.followers - 1);
    }
    logActivity(d, nowFollowing ? '➕' : '➖', `${ch.name}님을 ${nowFollowing ? '팔로우' : '언팔로우'}했어요`);
  });
  // 맞팔로우는 호감도에 따라 잠시 뒤에
  if (nowFollowing && !c.followsMe && !c.isNews && !c.inactive && c.affinity >= 0 && Math.random() < 0.45 + c.affinity / 200) {
    setTimeout(() => {
      G().edit(sc.id, (d) => {
        const ch = d.characters[characterId];
        if (!ch || ch.followsMe || !ch.iFollow) return;
        ch.followsMe = true;
        d.stats.followers += 1;
        pushNoti(d, { type: 'follow', actorId: characterId, text: '님이 나를 맞팔로우했습니다' });
      });
    }, 1500 + Math.random() * 2000);
  }
}

// ───────────────────────── 퀘스트(미션)

export function claimQuest(questId: ID) {
  const sc = getActive();
  if (!sc) return;
  tap('success');
  G().edit(sc.id, (d) => {
    const q = d.quests.find((x) => x.id === questId);
    if (!q || !q.done || q.claimed) return;
    q.claimed = true;
    if (q.reward.xp) addXp(d, q.reward.xp);
    if (q.reward.followers) applyDeltas(d, { followers: q.reward.followers });
    logActivity(d, '🎁', `미션 보상: ${q.title}`);
  });
}

// ───────────────────────── 알림

export function markAllNotisRead() {
  const sc = getActive();
  if (!sc || !sc.notis.some((n) => !n.read)) return;
  G().edit(sc.id, (d) => {
    d.notis.forEach((n) => {
      n.read = true;
    });
  });
}

/** 내 프로필 수정 */
export function savePersona(patch: Partial<Persona>) {
  const sc = getActive();
  if (!sc) return;
  G().edit(sc.id, (d) => {
    const handle = patch.handle !== undefined ? sanitizeHandle(patch.handle) || d.persona.handle : d.persona.handle;
    d.persona = { ...d.persona, ...patch, handle };
    d.title = `${d.world.name} · ${d.persona.name}`;
    logActivity(d, '🪪', '프로필을 수정했어요');
  });
}

/** (v3.2) 세계관 전체 수정: 이름·이모지·한 줄 소개·설정·분위기·해시태그·자주 쓰는 말 */
export function saveWorld(patch: Partial<Pick<World, 'name' | 'emoji' | 'tagline' | 'setting' | 'tone' | 'tag' | 'vocab'>>) {
  const sc = getActive();
  if (!sc) return;
  G().edit(sc.id, (d) => {
    const w = d.world;
    if (patch.name !== undefined && patch.name.trim()) w.name = cutText(patch.name.trim(), 30);
    if (patch.emoji !== undefined && patch.emoji.trim()) w.emoji = cutText(patch.emoji.trim(), 8);
    if (patch.tagline !== undefined) w.tagline = cutText(patch.tagline.trim(), 120);
    if (patch.setting !== undefined && patch.setting.trim()) w.setting = cutText(patch.setting.trim(), 3000);
    if (patch.tone !== undefined) w.tone = cutText(patch.tone.trim(), 300);
    if (patch.tag !== undefined && patch.tag.trim()) w.tag = `#${patch.tag.trim().replace(/^#+/, '').replace(/\s+/g, '')}`;
    if (patch.vocab !== undefined) w.vocab = patch.vocab.map((x) => x.trim()).filter(Boolean).slice(0, 30);
    d.title = `${w.name} · ${d.persona.name}`;
    logActivity(d, '🌍', '세계관 설정을 바꿨어요');
    addMemory(d, `세계관 설정이 바뀜: ${cutText(w.setting, 60)}`);
  });
}

// ═════════════════════════ v3 계약 — 화면은 아래 이름·모양만 믿고 쓴다(바꾸면 안 된다, 추가는 가능)
// 이벤트: answerEventCustom · editEvent · refreshEventVariant · setEventVariant · setDifficulty  (events.ts)
// 남의 글 스레드: ensureThreadComments  (thread.ts)
// 글쓰기 제안: getIdeas · refreshIdeas  (ideas.ts)
// 아이템: sendGift(dm.ts) · armViralMoment · undoInfo · undoLast(아래) · skipTime(tick.ts)
// 캐릭터: createQuickCharacter · regenerateBio(characters.ts)
// 내 스탯: setMyStats · 공통 캐릭터: setRosterUse · applyRosterToActive(아래)

/** 바이럴 모먼트 켜기/끄기(다음 행동 1번 강화: 글·답글·이벤트·선물) */
export function armViralMoment(on: boolean): void {
  const sc = getActive();
  if (!sc || !!sc.boost === on) return;
  G().edit(sc.id, (d) => {
    if (on) {
      d.boost = { kind: 'viral', armedTs: Date.now() };
      pushItemLog(d, 'viral', '🚀 바이럴 모먼트 준비: 다음 행동 1번이 크게 강화돼요');
      logActivity(d, '🚀', '바이럴 모먼트를 켰어요');
    } else {
      d.boost = null;
      pushItemLog(d, 'viral', '바이럴 모먼트를 껐어요');
    }
  });
  tap(on ? 'success' : 'light');
}

/** 되돌릴 수 있는 마지막 행동 */
export function undoInfo(): { label: string; ts: number } | null {
  const sc = getActive();
  return sc ? lastUndo(sc.id) : null;
}

/** 마지막 행동 되돌리기(그 행동에 대해 늦게 오는 AI 반응은 버려진다) */
export function undoLast(): boolean {
  const sc = getActive();
  if (!sc) return false;
  const info = lastUndo(sc.id);
  const prev = popUndo(sc.id);
  if (!prev || !info) return false;
  G().replaceScenario(prev);
  G().edit(sc.id, (d) => {
    for (const cv of Object.values(d.dms)) cv.typing = false;
    pushItemLog(d, 'undo', `↩️ 되돌림: ${info.label}`);
    logActivity(d, '↩️', `되돌렸어요: ${info.label}`);
  });
  tap('success');
  G().showToast(`되돌렸어요: ${info.label}`, 'success');
  // 되돌린 시점에 하루 정산이 밀려 있으면 마저 돌린다
  const cur = G().scenarios[sc.id];
  if (tickDue(cur)) void runDayTick(sc.id);
  return true;
}

// ── 내 스탯 직접 조정(원할 때만)
export function setMyStats(patch: Partial<Pick<Stats, 'followers' | 'aura' | 'humor' | 'reputation' | 'level' | 'xp'>>): void {
  const sc = getActive();
  if (!sc) return;
  const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  G().edit(sc.id, (d) => {
    const s = d.stats;
    if (ok(patch.aura)) s.aura = clamp(Math.round(patch.aura), 0, 999);
    if (ok(patch.humor)) s.humor = clamp(Math.round(patch.humor), 0, 999);
    if (ok(patch.level)) s.level = clamp(Math.round(patch.level), 1, 99);
    if (ok(patch.xp)) s.xp = Math.max(0, Math.round(patch.xp));
    if (ok(patch.reputation)) {
      s.reputation = clamp(Math.round(patch.reputation), -100, 100);
      if (s.status === 'cancelled' && s.reputation > REP.controversy) liftCancel(d);
      if (s.status === 'controversy' && s.reputation > REP.controversy) s.status = 'normal';
    }
    recomputeStatus(d);
    // 직접 정한 팔로워는 마지막에(평판 때문에 캔슬돼도 정한 숫자 그대로)
    if (ok(patch.followers)) s.followers = clamp(Math.round(patch.followers), 0, 1_000_000_000);
    questProgress(d, 'followers', s.followers, 'set');
    questProgress(d, 'level', s.level, 'set');
    logActivity(d, '🛠️', '스탯을 직접 조정했어요');
  });
}

// ── 공통 캐릭터(세계관 공통 등장)

/** 지금 시나리오에 공통 캐릭터를 켜기/끄기/골라 넣기(ids). 켜면 캐릭터로 추가, 끄면 목록에서 빼되 지난 글은 남는다 */
export function setRosterUse(mode: 'on' | 'off' | 'select', ids?: ID[]): void {
  const sc = getActive();
  if (!sc) return;
  const entries = useRoster.getState().entries;
  G().edit(sc.id, (d) => {
    const prev = d.roster ?? { mode: 'off', ids: [] };
    d.roster = { mode, ids: (ids ?? prev.ids).filter((id) => !!entries[id]) };
    const r = injectRoster(d, entries);
    const n = Object.values(d.characters).filter((c) => c.rosterId && !c.inactive).length;
    logActivity(d, '👥', mode === 'off' ? '공통 캐릭터를 이 이야기에서 뺐어요' : `공통 캐릭터 ${n}명이 이 이야기에 있어요${r.added ? ` (새로 ${r.added}명)` : ''}`);
  });
}

/** 공통 캐릭터 목록이 바뀐 뒤(추가·수정·삭제) 지금 시나리오에 반영(바뀐 게 없으면 아무것도 안 함) */
export function applyRosterToActive(): void {
  const sc = getActive();
  if (!sc) return;
  const entries = useRoster.getState().entries;
  if (!rosterNeedsUpdate(sc, entries)) return;
  G().edit(sc.id, (d) => void injectRoster(d, entries));
}

// 다른 이야기로 바꾸거나, 목록이 바뀌면(다른 기기에서 동기화된 경우 포함) 지금 이야기에 자동 반영
let rosterTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRosterApply() {
  if (rosterTimer) clearTimeout(rosterTimer);
  rosterTimer = setTimeout(() => {
    rosterTimer = null;
    if (useGame.getState().hydrated && useRoster.getState().hydrated) applyRosterToActive();
  }, 300);
}
useRoster.subscribe((s, prev) => {
  if (s.entries !== prev.entries || s.hydrated !== prev.hydrated) scheduleRosterApply();
});
useGame.subscribe((s, prev) => {
  if (s.activeId !== prev.activeId || s.hydrated !== prev.hydrated) scheduleRosterApply();
});
