/**
 * 게임 행동 공용 도구 — 스토어 접근, AI 엔진, 비동기 흐름 보호(되돌리기·삭제), 쪽지방·NPC 글 도우미
 * actions.ts와 기능별 파일(post·thread·dm·events·…)이 같이 쓴다. 기능별 파일을 import하지 않는다(순환 참조 방지).
 */
import { buildContext, createEngine } from '../ai';
import { ghostAuthor } from '../ai/local/ghost';
import { normTune } from '../ai/tune';
import type { AIEngine, GeneratedLine } from '../ai/types';
import { sceneKey } from '../data/worlds';
import { useGame } from '../store/game';
import { GHOST, type AITune, type Character, type Conversation, type GhostAuthor, type ID, type PhotoRef, type Scenario } from '../types';
import { uid } from '../utils';
import { npcEngagement } from './engagement';
import { addPost, addReply, pushNoti } from './progress';
import { KEEP } from './rules';
import { flowSeq, isUndone } from './undo';

export type ActionResult = { ok: true } | { ok: false; reason: 'empty' | 'left' | 'none' | 'limit' | 'busy' };
export const OK: ActionResult = { ok: true };
export const fail = (reason: Exclude<ActionResult, { ok: true }>['reason']): ActionResult => ({ ok: false, reason });

export const G = () => useGame.getState();

let lastErrorToast = 0;
let lastFailToast = 0;

/** 게임이 쓰는 AI: 실패하면 null(그 반응은 비워 둔다 — 틀 문장으로 채우지 않음) */
type OrNull<F> = F extends (...a: infer A) => Promise<infer R> ? (...a: A) => Promise<R | null> : never;
export type GameAI = { id: AIEngine['id'] } & { [K in Exclude<keyof AIEngine, 'id'>]: OrNull<AIEngine[K]> };

/** AI가 끝내 답하지 못했을 때 알림(연타 방지) */
function aiFailed(e: unknown) {
  const err = e as { code?: string; message?: string };
  if (Date.now() - lastFailToast < 8000) return;
  lastFailToast = Date.now();
  if (err?.code === 'no_ai') G().showToast('AI 연결이 필요해요 — 나 탭 → AI 연결에서 키를 넣어 주세요', 'error');
  else G().showToast(`AI 답을 받지 못했어요 — 잠시 뒤 다시 해 보세요${err?.message ? ` (${err.message})` : ''}`, 'error');
}

export function engine(): GameAI {
  const s = G();
  const raw = createEngine(s.settings.ai, (e) => {
    const fb = (e as { fallback?: string }).fallback ?? '다른 AI';
    // 한 AI가 막혀 다음 AI가 대신 답한 경우(키 오류·잔액 없음·허용 거절 등은 이번 접속 동안 건너뜀)
    if ((e as { permanent?: boolean }).permanent) {
      G().showToast(`${e.message} → 이번 접속은 ${fb}${fb === '클로드' ? '로' : '으로'} 이어 갈게요(나 탭 → AI 연결에서 다시 시도)`, 'error');
      return;
    }
    if (Date.now() - lastErrorToast < 6000) return; // 같은 오류 알림 연타 방지
    lastErrorToast = Date.now();
    G().showToast(`AI 연결 오류 → 이번 반응은 ${fb}${fb === '클로드' ? '가' : '이'} 대신했어요 (${e.message})`, 'error');
  });
  const soft = <K extends Exclude<keyof AIEngine, 'id'>>(key: K) =>
    (async (...args: unknown[]) => {
      try {
        return await (raw[key] as (...a: unknown[]) => Promise<unknown>).apply(raw, args);
      } catch (e) {
        aiFailed(e);
        return null;
      }
    }) as GameAI[K];
  return {
    id: raw.id,
    reactToPost: soft('reactToPost'),
    replyInThread: soft('replyInThread'),
    dmReply: soft('dmReply'),
    firstDM: soft('firstDM'),
    ambientPosts: soft('ambientPosts'),
    worldTick: soft('worldTick'),
    resolveEvent: soft('resolveEvent'),
    newEvent: soft('newEvent'),
    threadComments: soft('threadComments'),
    draftCharacter: soft('draftCharacter'),
    generateCast: soft('generateCast'),
    castBonds: soft('castBonds'),
  };
}

/** 지금 AI 조절값(답글·댓글·쪽지·새 글 수 …). 설정에서 바꾸면 다음 호출부터 바로 반영된다 */
export function tune(): AITune {
  return normTune(G().settings.ai.tune);
}

/** AI에게 넘길 요약본 + 지금 조절값 */
export function ctxOf(sid: ID) {
  const sc = G().scenarios[sid];
  return sc ? { ...buildContext(sc), tune: tune() } : null;
}

// ───────────────────────── 비동기 흐름 보호

/** AI를 기다리는 작업 하나. 되돌리기·시나리오 삭제가 일어나면 늦게 온 결과는 버린다 */
export interface Flow {
  sid: ID;
  seq: number;
}

/** 행동의 snapshot() 다음에 호출 */
export function beginFlow(sid: ID): Flow {
  return { sid, seq: flowSeq() };
}

export function alive(f: Flow): boolean {
  return !!G().scenarios[f.sid] && !isUndone(f.sid, f.seq);
}

/** 아직 유효하면 고친다(고쳤으면 true) */
export function editIf(f: Flow, recipe: (d: Scenario) => void): boolean {
  if (!alive(f)) return false;
  G().edit(f.sid, recipe);
  return true;
}

/** delays[i] 뒤에 each(i)를 적용(흐름이 취소되면 건너뜀). 마지막 것까지 끝나면 resolve */
export function revealLater(f: Flow, delays: number[], each: (i: number, d: Scenario) => void): Promise<void> {
  return new Promise((resolve) => {
    if (!delays.length) return resolve();
    let left = delays.length;
    delays.forEach((ms, i) => {
      setTimeout(() => {
        try {
          editIf(f, (d) => each(i, d));
        } finally {
          left -= 1;
          if (left === 0) resolve();
        }
      }, Math.max(0, ms));
    });
  });
}
// ───────────────────────── 캐릭터 고르기

/** 지금 시나리오에서 활동 중인 캐릭터(공통 캐릭터를 끈 경우 등 inactive 제외) */
export function activeChar(d: Scenario, id: ID | undefined): Character | undefined {
  if (!id) return undefined;
  const c = d.characters[id];
  return c && !c.inactive ? c : undefined;
}

export function castChars(d: Scenario): Character[] {
  return d.cast.map((id) => d.characters[id]).filter((c): c is Character => !!c && !c.inactive);
}

/** 캐릭터 유형(core = 관계, 그 밖 = 분류) */
export function charType(c: Character) {
  return c.tier !== 'crowd' && !c.isNews && c.relation ? c.relation : (c.crowdRole ?? 'public');
}

// ───────────────────────── 쪽지방

export function ensureConversation(d: Scenario, characterId: ID): Conversation {
  if (!d.dms[characterId]) {
    d.dms[characterId] = { characterId, messages: [], unread: 0, leftUntilDay: null, typing: false, updatedTs: Date.now() };
  }
  return d.dms[characterId];
}

export function trimMessages(cv: Conversation) {
  if (cv.messages.length > KEEP.dmMessages) cv.messages.splice(0, cv.messages.length - KEEP.dmMessages);
}

/**
 * 인물이 먼저 보내는 쪽지 넣기(하루 정산의 먼저 오는 쪽지 · 내 글을 보고 따로 보내는 쪽지).
 * limit: 받을 인물 수 상한. always: 상한과 상관없이 받는 인물(대화방에 돌아온 사람).
 */
export function deliverOpeners(d: Scenario, lines: GeneratedLine[], limit = lines.length, always: ID[] = []): void {
  let n = 0;
  for (const o of lines) {
    if (!activeChar(d, o.authorId)) continue;
    if (d.dms[o.authorId]?.typing) continue;
    if (!always.includes(o.authorId) && ++n > limit) continue;
    const cv = ensureConversation(d, o.authorId);
    if (cv.leftUntilDay !== null) continue;
    cv.messages.push({ id: uid('m'), from: 'them', text: o.text, ts: Date.now(), at: { ...d.clock } });
    trimMessages(cv);
    cv.unread += 1;
    cv.updatedTs = Date.now();
    pushNoti(d, { type: 'dm', actorId: o.authorId, text: '님이 쪽지를 보냈습니다' });
  }
}

// ───────────────────────── NPC 글

/** 장면 키 → 첨부 사진 참조 */
export function mediaRef(d: Scenario, key?: string): PhotoRef | undefined {
  if (!key || !d.world.templateId) return undefined;
  return { photo: sceneKey(d.world.templateId, key) };
}
/** 이 인물이 오늘(게임 일차) 이미 글을 올렸는지 — 한 인물은 하루에 글 1개까지(답글·뉴스 계정 제외) */
export function postedToday(d: Scenario, id: ID): boolean {
  const c = d.characters[id];
  if (!c || c.isNews) return false;
  const day = d.clock.day;
  for (const pid of d.feed) {
    const p = d.posts[pid];
    if (!p) continue;
    if (p.at.day < day - 1) break; // 타임라인은 최신순(어제 이전까지만 보면 된다)
    if (p.authorId === id && p.kind !== 'reply' && p.at.day === day) return true;
  }
  return false;
}

export function addNpcLines(d: Scenario, lines: GeneratedLine[]) {
  for (const p of lines) {
    const c = activeChar(d, p.authorId);
    if (!c) continue;
    if (postedToday(d, c.id)) continue; // 한 인물은 하루에 글 1개까지
    const e = npcEngagement(c.followers);
    addPost(d, { authorId: p.authorId, text: p.text, kind: c.isNews ? 'news' : 'post', likes: e.likes, reposts: e.reposts, views: e.views, media: mediaRef(d, p.media) }, true);
  }
}

/**
 * (v3.2) 댓글이 같이 달린 글들(이벤트에 답한 뒤 올라오는 반응 글 등): 작성자는 인물 또는 일반인(임시 계정).
 * 댓글이 이미 달려 있으니 처음 열 때 댓글을 또 부르지 않게 threadGen 표시를 해 둔다.
 */
export function addThreadedPosts(d: Scenario, lines: GeneratedLine[], seed: string): ID[] {
  const ids: ID[] = [];
  lines.forEach((line, i) => {
    if (!line.comments?.length) return;
    let who = lineAuthor(d, line, `${seed}:p${i}`, ghostAuthor);
    // 오늘 이미 글을 올린 인물이면 이름 없는 일반인 글로 돌린다(한 인물은 하루에 글 1개까지)
    if (who.authorId !== GHOST && postedToday(d, who.authorId)) who = { authorId: GHOST, ghost: ghostAuthor(`${seed}:p${i}:g`) };
    const c = who.authorId === GHOST ? undefined : d.characters[who.authorId];
    const e = npcEngagement(c?.followers ?? 300 + Math.floor(Math.random() * 3000));
    const post = addPost(d, { authorId: who.authorId, text: line.text, kind: c?.isNews ? 'news' : 'post', likes: e.likes, reposts: e.reposts, views: e.views, ghost: who.ghost, media: mediaRef(d, line.media) }, true);
    line.comments.forEach((cm, k) => {
      const cw = lineAuthor(d, cm, `${seed}:p${i}:c${k}`, ghostAuthor);
      if (cw.authorId === who.authorId && cw.authorId !== GHOST) return;
      addReply(d, post.id, cw.authorId, cm.text, { ghost: cw.ghost, noti: false, likes: Math.max(0, Math.round(post.likes * (0.02 + Math.random() * 0.08))) });
    });
    post.threadGen = { followers: c?.followers ?? 0, count: post.replies.length, ts: Date.now() };
    ids.push(post.id);
  });
  return ids;
}

/** AI가 쓴 줄의 작성자: 활동 중인 캐릭터면 그대로, 아니면 임시 계정(GHOST) */
export function lineAuthor(d: Scenario, line: GeneratedLine, seed: string, mkGhost: (seed: string) => GhostAuthor): { authorId: ID; ghost?: GhostAuthor } {
  if (line.authorId !== GHOST && activeChar(d, line.authorId)) return { authorId: line.authorId };
  return { authorId: GHOST, ghost: line.ghost ?? mkGhost(seed) };
}
