/**
 * 스레드 — 내 답글에 대한 되받아치기(AI 1회) + 남의 글 댓글
 * (v3.1) 맥락 없는 로컬 채우기 답글은 쓰지 않는다. 답글·댓글은 전부 AI가 글과 앞 대화에 맞춰 쓴다.
 *
 * 남의 글 댓글(ensureThreadComments)
 *   처음 열 때   댓글 5~6개(AI 1회) — 그중 인플루언서(팔로워 10만↑·셀럽) 댓글이 있으면 그 아래 대댓글 2~3개(한 번에 최대 8개)
 *   다시 열 때   그대로(토큰 0). 작성자 팔로워가 그때보다 50% 이상 늘었으면 2~3개 더(AI 1회, 이미 달린 댓글과 겹치지 않게)
 *   시간·경험치는 바뀌지 않는다(원래 있던 댓글이니까)
 */
import { ghostAuthor } from '../ai/local/ghost';
import type { GeneratedLine } from '../ai/types';
import { getActive } from '../store/game';
import { GHOST, ME, SYSTEM, type Character, type GameTime, type ID, type Post, type Scenario } from '../types';
import { cutText, rand, uid, viewsOf } from '../utils';
import { tap } from '../utils/haptics';
import { advanceClock, minutesBetween } from './clock';
import { activeChar, alive, beginFlow, ctxOf, editIf, engine, fail, G, lineAuthor, OK, revealLater, type ActionResult, type Flow } from './core';
import { diffOf, scaleSocial } from './difficulty';
import { burstCount, burstDelays, isInfluencer, npcEngagement } from './engagement';
import { dedupeLines, replyLikes } from './post';
import { addReply, addXp, applyDeltas, consumeBoost, logActivity, questProgress, recomputeStatus, tickClock } from './progress';
import { POST_MAX_LEN, TIME_COST, XP } from './rules';
import { runDayTick } from './tick';
import { snapshot } from './undo';

// ───────────────────────── 내 답글

export function replyToPost(parentId: ID, text: string): ActionResult {
  const sc = getActive();
  const body = cutText(text.trim(), POST_MAX_LEN);
  if (!sc) return fail('none');
  if (!body) return fail('empty');
  const parent = sc.posts[parentId];
  if (!parent) return fail('none');
  snapshot(sc, '답글');

  const sid = sc.id;
  let myReplyId = '';
  let days = 0;
  let boosted = false;
  G().edit(sid, (d) => {
    days = tickClock(d, TIME_COST.reply);
    boosted = consumeBoost(d, '이번 답글이 크게 주목받아요');
    const mine = addReply(d, parentId, ME, body, { boosted });
    myReplyId = mine?.id ?? '';
    if (mine) {
      // 내 답글에도 원글 규모에 맞춰 좋아요가 천천히 붙는다
      const root = d.posts[mine.rootId ?? parentId];
      const f = root?.authorId === ME ? d.stats.followers : (d.characters[root?.authorId ?? '']?.followers ?? 300);
      let likes = Math.round(Math.sqrt(Math.max(0, f)) * (0.15 + Math.random() * 0.5)) + rand(0, 3);
      if (boosted) likes = Math.round(likes * rand(3, 6)) + rand(20, 80);
      mine.likes = likes;
      mine.reposts = Math.round((likes * rand(0, 8)) / 100);
      mine.views = likes * rand(25, 60) + rand(10, 80);
      mine.growFrom = { likes: 0, reposts: 0, views: 0, ts: Date.now(), ms: rand(15_000, 25_000) };
    }
    addXp(d, XP.reply);
    questProgress(d, 'reply', 1);
    const target = d.characters[parent.authorId];
    logActivity(d, '💬', target ? `${target.name}님 글에 답글을 달았어요` : '답글을 달았어요');
  });
  tap();
  if (myReplyId) void reactToMyReply(beginFlow(sid), parentId, myReplyId, body, days, boosted);
  return OK;
}

async function reactToMyReply(flow: Flow, parentId: ID, myReplyId: ID, text: string, days: number, boosted: boolean) {
  const sid = flow.sid;
  const key = `reply:${myReplyId}`;
  G().setBusy(key, true);
  try {
    const sc = G().scenarios[sid];
    const ctx = ctxOf(sid);
    if (!sc || !ctx) return;
    const parent = sc.posts[parentId];
    const root = sc.posts[parent?.rootId ?? parentId] ?? parent;
    if (!parent || !root) return;
    // 내 글에 내가 답글을 단 경우: 그 글에 마지막으로 답한 캐릭터가 대신 반응한다
    let target: Post = parent;
    if (parent.authorId === ME) {
      const lastChar = [...parent.replies]
        .reverse()
        .map((id) => sc.posts[id])
        .find((p) => p && p.authorId !== ME && activeChar(sc, p.authorId) && !sc.characters[p.authorId].isNews);
      if (lastChar) target = lastChar;
    }
    // 스레드 흐름(원글 → … → 내 답글 직전). 이름 없는 일반인은 표시 이름까지 넘겨서 같은 사람이 이어 말하게
    const chain: { authorId: ID; text: string; name?: string }[] = [];
    let cur: Post | undefined = parent;
    while (cur && chain.length < 8) {
      chain.unshift({ authorId: cur.authorId, text: cur.text, ...(cur.authorId === GHOST && cur.ghost ? { name: cur.ghost.name } : {}) });
      cur = cur.parentId ? sc.posts[cur.parentId] : undefined;
    }
    const r = await engine().replyInThread(ctx, {
      root: { authorId: root.authorId, text: root.text },
      target: { authorId: target.authorId, text: target.text, ...(target.authorId === GHOST && target.ghost ? { name: target.ghost.name } : {}) },
      reply: text,
      thread: chain,
    });
    if (!alive(flow) || !r) return; // AI가 답하지 못하면 아무도 답하지 않은 채로 둔다
    // AI가 쓴 답글만(맥락 없는 구경꾼 채우기 없음). 일반인 대상이면 첫 일반인 답글은 그 사람 본인
    const lines = dedupeLines(r.replies.filter((l) => l.text?.trim()));
    let ghostUsed = false;
    await revealLater(flow, burstDelays(lines.length, rand(600, 1100)), (i, d) => {
      if (!d.posts[myReplyId]) return;
      const line = lines[i];
      const t = cutText(line.text.trim(), POST_MAX_LEN);
      const who = lineAuthor(d, line, `${myReplyId}:a${i}`, ghostAuthor);
      if (who.authorId === GHOST && target.authorId === GHOST && target.ghost && !ghostUsed) {
        ghostUsed = true;
        addReply(d, myReplyId, GHOST, t, { ghost: target.ghost, likes: rand(0, 3) });
        return;
      }
      addReply(d, myReplyId, who.authorId, t, { ghost: who.ghost, likes: rand(0, 5) });
    });
    editIf(flow, (d) => {
      const diff = diffOf(d);
      const affinity: Record<ID, number> = {};
      for (const [id, v] of Object.entries(r.deltas.affinity ?? {})) affinity[id] = scaleSocial(v, diff, boosted);
      const romance: Record<ID, number> = {};
      for (const [id, v] of Object.entries(r.deltas.romance ?? {})) romance[id] = scaleSocial(v, diff, boosted);
      const devotion: Record<ID, number> = {};
      for (const [id, v] of Object.entries(r.deltas.devotion ?? {})) devotion[id] = scaleSocial(v, diff, boosted);
      applyDeltas(d, { ...r.deltas, reputation: scaleSocial(r.deltas.reputation ?? 0, diff), affinity, romance, devotion });
      recomputeStatus(d);
    });
  } finally {
    G().setBusy(key, false);
  }
  if (days > 0 && alive(flow)) await runDayTick(sid);
}

// ───────────────────────── 남의 글 댓글

/** t보다 m분 전 */
function minutesBefore(t: GameTime, m: number): GameTime {
  const abs = t.day * 1440 + t.hour * 60 + t.minute - Math.max(0, Math.round(m));
  const day = Math.floor(abs / 1440);
  const rem = abs - day * 1440;
  return { day, hour: Math.floor(rem / 60), minute: rem % 60 };
}

/**
 * 원글 시각 ~ 지금 사이의 그럴듯한 시각(앞쪽 = 글 올라온 직후에 더 몰리게)
 * lo~hi: 구간의 어느 부분에 둘지(0~1). 문맥 있는 댓글은 앞쪽, 짧은 일반인 반응은 뒤쪽에 둬서
 * 시간순으로 정렬해도 위에는 글과 맞는 댓글이 먼저 보이게 한다(X의 "관련성 높은 답글" 느낌).
 */
function timeBetween(from: GameTime, to: GameTime, lo = 0, hi = 1): GameTime {
  const span = minutesBetween(from, to);
  if (span <= 1) return { ...to };
  const off = Math.max(1, Math.round(span * (lo + (hi - lo) * Math.pow(Math.random(), 1.8))));
  return advanceClock(from, Math.min(off, span)).time;
}

/** 작성자 팔로워에 비해 반응이 너무 적으면 맞춰 준다(화면에 보이던 숫자보다 줄어들지 않게) */
function fixNpcCounts(p: Post, followers: number) {
  const shown = viewsOf(p); // 저장값이 없으면 화면이 쓰던 추정치
  const e = npcEngagement(followers);
  if (p.likes < e.likes * 0.3) {
    const from = { likes: p.likes, reposts: p.reposts, views: shown };
    p.likes = e.likes;
    p.reposts = Math.max(p.reposts, e.reposts);
    p.views = Math.max(shown, e.views);
    p.growFrom = { ...from, ts: Date.now(), ms: rand(6_000, 12_000) };
  } else {
    p.views = Math.max(shown, p.views ?? 0);
  }
}

function threadable(sc: Scenario, post: Post | undefined): Character | null {
  if (!post || post.parentId || post.kind === 'reply' || post.kind === 'system' || post.kind === 'event') return null;
  if (post.authorId === ME || post.authorId === SYSTEM || post.authorId === GHOST) return null;
  return sc.characters[post.authorId] ?? null;
}

/**
 * 남의 글을 열 때 호출(PostDetail 포커스 시): 처음이면 작성자 팔로워에 비례해 댓글 생성(최소 5),
 * 팔로워가 50% 이상 늘었으면 절반만큼 추가. 진행 중엔 busy['thread:<postId>'].
 */
export async function ensureThreadComments(postId: ID): Promise<void> {
  const sc = getActive();
  if (!sc) return;
  const post = sc.posts[postId];
  const author = threadable(sc, post);
  if (!post || !author) return;
  const key = `thread:${postId}`;
  if (G().busy[key]) return;
  const gen = post.threadGen;
  if (gen && author.followers < gen.followers * 1.5) return; // 이미 만든 스레드: 그대로
  const flow = beginFlow(sc.id);
  G().setBusy(key, true);
  try {
    if (!gen) await firstFill(flow, postId, author);
    else await growThread(flow, postId, author, gen);
  } catch (e) {
    console.warn('[스레드] 댓글 만들기 실패', e);
  } finally {
    G().setBusy(key, false);
  }
}

async function firstFill(flow: Flow, postId: ID, author: Character) {
  const sid = flow.sid;
  const sc = G().scenarios[sid];
  const post = sc?.posts[postId];
  if (!sc || !post) return;
  const n = burstCount();

  // ① 바로: 기록 + 숫자 보정(댓글은 AI가 쓴 것만 붙인다 — 그동안 "댓글 불러오는 중…")
  editIf(flow, (d) => {
    const p = d.posts[postId];
    if (!p) return;
    p.threadGen = { followers: author.followers, count: n, ts: Date.now() };
    fixNpcCounts(p, author.followers);
  });
  const already = post.replies.filter((id) => sc.posts[id] && sc.posts[id].authorId !== ME).length;
  if (already >= n) return;

  // ② AI 댓글(1회) — 글 내용에 맞춘 것만. 너무 적게 오면(3개 미만) 한 번 더
  let lines = await commentsFor(sid, post, n - already, []);
  if (!alive(flow)) return;
  if (lines.filter((l) => !l.replyTo).length < Math.min(3, n - already)) {
    const more = await commentsFor(sid, post, n - already - lines.length, lines.map((l) => l.text));
    if (!alive(flow)) return;
    lines = [...lines, ...more.filter((l) => !l.replyTo)].slice(0, 8);
  }
  editIf(flow, (d) => {
    const p = d.posts[postId];
    if (!p) return;
    placeBurst(d, p, lines, `${postId}:ta`, (q) => timeBetween(q.at, d.clock));
  });
}

/**
 * 이미 달려 있던 댓글처럼 한 번에 넣기: 기본 댓글은 글 아래, 대댓글은 그 인플루언서 댓글 아래.
 * 인플루언서 댓글은 마음에 들어요가 많아서 위쪽에 보인다(X의 "관련성 높은 답글").
 */
function placeBurst(d: Scenario, p: Post, lines: GeneratedLine[], seed: string, at: (parent: Post) => GameTime) {
  const replyOf = new Map<ID, ID>();
  lines
    .filter((l) => !l.replyTo)
    .forEach((line, i) => {
      const who = lineAuthor(d, line, `${seed}${i}`, ghostAuthor);
      const c = activeChar(d, who.authorId);
      const likes = replyLikes(p.likes, true) + (c && c.tier !== 'crowd' ? rand(1, 4) : 0) + (c && isInfluencer(c) ? rand(10, 60) : 0);
      const added = addReply(d, p.id, who.authorId, cutText(line.text.trim(), POST_MAX_LEN), { ghost: who.ghost, noti: false, at: at(p), likes });
      if (added && c) replyOf.set(c.id, added.id);
    });
  lines
    .filter((l) => l.replyTo && replyOf.has(l.replyTo))
    .forEach((line, i) => {
      const parent = d.posts[replyOf.get(line.replyTo!)!];
      if (!parent) return;
      const who = lineAuthor(d, line, `${seed}c${i}`, ghostAuthor);
      addReply(d, parent.id, who.authorId, cutText(line.text.trim(), POST_MAX_LEN), { ghost: who.ghost, noti: false, at: timeBetween(parent.at, d.clock), likes: replyLikes(parent.likes, false) });
    });
  sortRepliesByLikes(d, p);
}

/** 처음 채운 댓글은 X의 "관련성 높은 답글"처럼 마음에 들어요 많은 순(같으면 먼저 달린 순) */
function sortRepliesByLikes(d: Scenario, p: Post) {
  const key = (id: ID) => {
    const r = d.posts[id];
    return { likes: r?.likes ?? 0, t: r ? r.at.day * 1440 + r.at.hour * 60 + r.at.minute : Number.MAX_SAFE_INTEGER };
  };
  const order = p.replies.map((id, i) => ({ id, i, ...key(id) }));
  order.sort((a, b) => b.likes - a.likes || a.t - b.t || a.i - b.i);
  p.replies = order.map((o) => o.id);
}

/** 댓글 AI 호출(작성자가 빠진 계정이면 부르지 않음). 실패하면 빈 배열 — 대신 아무 말이나 붙이지 않는다 */
async function commentsFor(sid: ID, post: Post, count: number, existing: string[]): Promise<GeneratedLine[]> {
  const ctx = ctxOf(sid);
  if (!ctx || count <= 0) return [];
  const sc = G().scenarios[sid];
  if (post.authorId !== ME && (!sc || sc.characters[post.authorId]?.inactive)) return [];
  const lines = await engine().threadComments(ctx, { post: { authorId: post.authorId, text: post.text }, count, existing });
  if (!lines) return [];
  const seen = new Set(existing.map((t) => t.replace(/\s+/g, '').slice(0, 12)));
  return dedupeLines(lines.filter((l) => l.text?.trim())).filter((l) => !seen.has(l.text.replace(/\s+/g, '').slice(0, 12)));
}

/** 작성자 팔로워가 50% 이상 늘었을 때: 2~3개 더(AI 1회, 이미 달린 댓글과 겹치지 않게, 아래쪽 최근 시각) */
async function growThread(flow: Flow, postId: ID, author: Character, gen: NonNullable<Post['threadGen']>) {
  const sid = flow.sid;
  const sc = G().scenarios[sid];
  const post = sc?.posts[postId];
  if (!sc || !post) return;
  const extra = rand(2, 3);
  const existing = post.replies.map((id) => sc.posts[id]?.text).filter((t): t is string => !!t);
  const lines = (await commentsFor(sid, post, extra, existing)).filter((l) => !l.replyTo).slice(0, extra);
  if (!alive(flow)) return;
  editIf(flow, (d) => {
    const p = d.posts[postId];
    if (!p) return;
    const recent = minutesBefore(d.clock, 180);
    const from = minutesBetween(p.at, recent) > 0 ? recent : p.at;
    lines.forEach((line, i) => {
      const who = lineAuthor(d, line, `${postId}:ua${gen.count + i}:${uid('g')}`, ghostAuthor);
      addReply(d, postId, who.authorId, cutText(line.text.trim(), POST_MAX_LEN), { ghost: who.ghost, noti: false, at: timeBetween(from, d.clock, 0.4, 1), likes: replyLikes(p.likes, false) });
    });
    fixNpcCounts(p, author.followers);
    p.threadGen = { followers: author.followers, count: gen.count + lines.length, ts: Date.now() };
  });
}
