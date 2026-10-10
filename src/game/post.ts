/**
 * 내 글 올리기 — 반응이 자연스럽게 붙는 흐름(AI 1회)
 *
 *   0초      글이 올라가고 숫자(좋아요·재게시·조회수)가 바로 자라기 시작(로컬 추정치) + "반응이 달리는 중…"
 *   AI 도착   매력도·바이럴을 반영한 최종 숫자로 이어서 자람 · 스탯·팔로우 적용 · 글쓰기 제안 저장
 *            글 내용에 맞춘 AI 답글 5~6개를 1~3개씩 "툭 투둑" 공개
 *            그중 인플루언서(팔로워 10만↑·셀럽)가 답글을 달면 조금 뒤 그 답글 아래로 2~3개 더(한 번에 최대 8개)
 *            (v3.1) 맥락 없는 로컬 채우기 답글은 없앴다 — 조금 늦어도 자연스러운 쪽이 우선
 *   끝       좋아요·재게시·답글 알림을 묶어서("님 외 N명") + 뉴스
 */
import { analyze, type Analysis } from '../ai/local/analyze';
import { ghostAuthor } from '../ai/local/ghost';
import type { GeneratedLine, PostReaction } from '../ai/types';
import { getActive } from '../store/game';
import { ME, type Character, type Deltas, type ID, type PhotoRef, type Post, type Scenario } from '../types';
import { clamp, cutText, pick, rand, snippet, uid } from '../utils';
import { tap } from '../utils/haptics';
import { activeChar, alive, beginFlow, castChars, ctxOf, editIf, engine, fail, G, lineAuthor, OK, revealLater, type ActionResult, type Flow } from './core';
import { diffOf, scaleSocial } from './difficulty';
import { burstCount, burstDelays, growValue, isInfluencer, LIKES_MAX, postEngagement } from './engagement';
import { addNewsPost, addPost, addReply, addXp, applyDeltas, consumeBoost, logActivity, markViral, pushNoti, questKeyword, questProgress, recomputeStatus, tickClock } from './progress';
import { POST_MAX_LEN, TIME_COST, XP } from './rules';
import { saveIdeas } from './ideas';
import { runDayTick } from './tick';
import { snapshot } from './undo';

/** 로컬 분석으로 매긴 글 매력도(AI 결과 전 임시값) */
function localQuality(a: Analysis): number {
  return clamp(45 + a.humor * 8 + a.aura * 5 - Math.round(a.toxicity * 40) + (a.mood === 'funny' ? 10 : 0), 0, 100);
}

/** AI가 끝내 답하지 못했을 때: 숫자(좋아요·조회수)만 게임 규칙으로 — 답글·뉴스 같은 글은 지어내지 않는다 */
function silentReaction(text: string): PostReaction {
  const a = analyze(text);
  return { mood: a.mood, replies: [], likes: 0, reposts: 0, viral: false, quality: localQuality(a), deltas: {}, news: [], newFollowers: [], unfollowers: [], ideas: [] };
}

/** 답글에 붙는 좋아요(원글 반응에 비례, 핵심 인물 답글은 조금 더) */
export function replyLikes(postLikes: number, core: boolean): number {
  return rand(0, Math.max(1, Math.round(Math.sqrt(Math.max(0, postLikes)) * (core ? 1.2 : 0.5))));
}

/** 지금 자라는 중인 숫자에서 이어서 새 목표값까지 자라게 */
export function regrow(p: Post, target: { likes: number; reposts: number; views: number }, ms: number) {
  const now = Date.now();
  const g = p.growFrom;
  const cur = g
    ? { likes: growValue(g.likes, p.likes, g.ts, g.ms, now), reposts: growValue(g.reposts, p.reposts, g.ts, g.ms, now), views: growValue(g.views, p.views ?? 0, g.ts, g.ms, now) }
    : { likes: p.likes, reposts: p.reposts, views: p.views ?? 0 };
  p.likes = clamp(Math.max(target.likes + (p.liked ? 1 : 0), cur.likes), 0, LIKES_MAX);
  p.reposts = Math.max(target.reposts + (p.reposted ? 1 : 0), cur.reposts);
  p.views = Math.max(target.views, cur.views, p.likes * 12);
  p.growFrom = { likes: cur.likes, reposts: cur.reposts, views: cur.views, ts: now, ms };
}

export function publishPost(text: string, media?: PhotoRef): ActionResult {
  const sc = getActive();
  const body = cutText(text.trim(), POST_MAX_LEN);
  if (!sc) return fail('none');
  if (!body && !media) return fail('empty');
  snapshot(sc, '글 올리기');

  const sid = sc.id;
  const postId = uid('p');
  const local = analyze(body, pick(sc.world.vocab.length ? sc.world.vocab : ['이거']));
  let days = 0;
  let boosted = false;
  G().edit(sid, (d) => {
    days = tickClock(d, TIME_COST.post); // 글을 쓰는 데 걸린 시간만큼 먼저 흐르고, 그 시각에 글이 올라간다
    boosted = consumeBoost(d, '이번 글이 크게 퍼지고 있어요');
    const p = addPost(d, { id: postId, authorId: ME, text: body, kind: 'post', media, boosted }, true);
    // 숫자는 바로 자라기 시작(로컬 추정치) → AI 반응이 오면 최종값으로 이어서 자란다
    const pre = postEngagement({ followers: d.stats.followers, quality: localQuality(local), mood: local.mood, viral: false, boost: boosted, difficulty: diffOf(d) });
    p.likes = pre.likes;
    p.reposts = pre.reposts;
    p.views = pre.views;
    p.growFrom = { likes: 0, reposts: 0, views: 0, ts: Date.now(), ms: 30_000 };
    d.stats.posts += 1;
    addXp(d, XP.post);
    questProgress(d, 'post', 1);
    questKeyword(d, body);
    logActivity(d, '✍️', `글을 올렸어요: "${snippet(body || '(사진)', 24)}"`);
  });
  tap('medium');
  void reactToMyPost(beginFlow(sid), postId, body || '(사진만 올림)', !!media, days, boosted);
  return OK;
}

async function reactToMyPost(flow: Flow, postId: ID, text: string, hasMedia: boolean, days: number, boosted: boolean) {
  const sid = flow.sid;
  const key = `post:${postId}`;
  G().setBusy(key, true);
  try {
    const ctx = ctxOf(sid);
    if (!ctx) return;
    const r = (await engine().reactToPost(ctx, { id: postId, text, hasMedia }, { replies: burstCount() })) ?? silentReaction(text);
    if (!alive(flow)) return;

    // ② 최종 숫자 + 스탯·팔로우·제안
    const ai = dedupeLines(r.replies.filter((l) => l.text?.trim()));
    G().edit(sid, (d) => {
      const p = d.posts[postId];
      if (!p) return;
      const viral = (r.viral || boosted) && d.stats.status !== 'cancelled';
      const eng = postEngagement({ followers: d.stats.followers, quality: r.quality ?? 50, mood: r.mood, viral, boost: boosted, difficulty: diffOf(d) });
      regrow(p, eng, rand(20_000, 32_000));
      applyPostReaction(d, postId, r, { viral, boosted, likes: eng.likes });
    });
    if (days > 0) void runDayTick(sid);

    // ③ 글 내용에 맞춘 AI 답글만: 기본 답글을 1~3개씩 → 인플루언서 답글이 있으면 조금 뒤 그 아래로 대댓글
    let grouped = 0;
    let groupActor: ID | undefined;
    await revealBurst(flow, postId, ai, `${postId}:a`, (d, c, core) => {
      if (!core) {
        grouped += 1;
        if (c && !groupActor) groupActor = c.id;
      }
    });

    // ④ 마무리: 묶음 알림 + 뉴스
    editIf(flow, (d) => finishPostNotis(d, postId, r, grouped, groupActor));
  } finally {
    G().setBusy(key, false);
  }
}

/**
 * 답글 묶음 공개(v3.1): 기본 답글(replyTo 없음)을 1~3개씩 시차를 두고 → 그다음 인플루언서 답글 아래 대댓글을 조금 뒤에.
 * onAdd: 기본 답글이 하나 붙을 때마다(알림 묶기용). 대댓글은 그 인플루언서 답글에 붙는다.
 */
export async function revealBurst(
  flow: Flow,
  rootId: ID,
  lines: GeneratedLine[],
  seed: string,
  onAdd?: (d: Scenario, c: Character | undefined, core: boolean) => void,
): Promise<void> {
  const top = lines.filter((l) => !l.replyTo);
  const casc = lines.filter((l) => l.replyTo);
  const replyOf = new Map<ID, ID>(); // 인플루언서 ID → 그 사람이 단 답글 ID
  await revealLater(flow, burstDelays(top.length, rand(150, 400)), (i, d) => {
    const p = d.posts[rootId];
    if (!p) return;
    const line = top[i];
    const who = lineAuthor(d, line, `${seed}${i}`, ghostAuthor);
    const c = activeChar(d, who.authorId);
    const core = !!c && c.tier !== 'crowd';
    const added = addReply(d, rootId, who.authorId, cutText(line.text.trim(), POST_MAX_LEN), { ghost: who.ghost, noti: core, likes: replyLikes(p.likes, core) + (c && isInfluencer(c) ? rand(5, 30) : 0) });
    if (added && c) replyOf.set(c.id, added.id);
    onAdd?.(d, c, core);
  });
  const nested = casc.filter((l) => l.replyTo && replyOf.has(l.replyTo));
  if (!nested.length || !alive(flow)) return;
  await revealLater(flow, burstDelays(nested.length, rand(1400, 2600)), (i, d) => {
    const line = nested[i];
    const parentId = replyOf.get(line.replyTo!)!;
    const parent = d.posts[parentId];
    if (!parent) return;
    const who = lineAuthor(d, line, `${seed}c${i}`, ghostAuthor);
    addReply(d, parentId, who.authorId, cutText(line.text.trim(), POST_MAX_LEN), { ghost: who.ghost, noti: false, likes: replyLikes(parent.likes, false) });
  });
}

/** 같은 말·거의 같은 말이 두 번 나오지 않게(앞 12글자 기준) */
export function dedupeLines<T extends { text: string }>(lines: T[]): T[] {
  const seen = new Set<string>();
  return lines.filter((l) => {
    const k = l.text.replace(/[\s~!.?ㅋㅎㅠㅜ]+/g, '').slice(0, 12);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** AI 반응 → 스탯·관계·팔로우·떡상·논란 적용(숫자는 게임 규칙이 정한다) */
function applyPostReaction(d: Scenario, postId: ID, r: PostReaction, o: { viral: boolean; boosted: boolean; likes: number }) {
  const post = d.posts[postId];
  if (!post) return;
  const diff = diffOf(d);
  const f = d.stats.followers;
  // 팔로워: 좋아요가 새 팔로워로 이어진다(팔로워가 많을수록 폭발적). AI가 더 크게 줬거나 음수(역풍)면 그쪽
  const gain = Math.round(o.likes * (0.02 + Math.random() * 0.04)) + rand(1, 5);
  const aiF = r.deltas.followers ?? 0;
  let followers = aiF < 0 ? scaleSocial(aiF, diff) + Math.round(gain * 0.3) : Math.max(scaleSocial(aiF, diff), gain);
  if (o.viral) followers += Math.round(f * (0.05 + Math.random() * 0.1)) + rand(30, 120);
  if (o.boosted && followers > 0) followers *= 3;
  const affinity: Record<ID, number> = {};
  for (const [id, v] of Object.entries(r.deltas.affinity ?? {})) affinity[id] = scaleSocial(v, diff, o.boosted);
  const romance: Record<ID, number> = {};
  for (const [id, v] of Object.entries(r.deltas.romance ?? {})) romance[id] = scaleSocial(v, diff, o.boosted);
  const devotion: Record<ID, number> = {};
  for (const [id, v] of Object.entries(r.deltas.devotion ?? {})) devotion[id] = scaleSocial(v, diff, o.boosted);
  const deltas: Deltas = {
    followers,
    aura: r.deltas.aura,
    humor: r.deltas.humor,
    reputation: scaleSocial(r.deltas.reputation ?? 0, diff),
    affinity,
    romance,
    devotion,
  };
  const applied = applyDeltas(d, deltas);

  for (const id of r.newFollowers) {
    const c = activeChar(d, id);
    if (!c || c.followsMe) continue;
    c.followsMe = true;
    d.stats.followers += 1;
    pushNoti(d, { type: 'follow', actorId: id, text: '님이 나를 팔로우했습니다' });
  }
  for (const id of r.unfollowers) {
    const c = activeChar(d, id);
    if (!c || !c.followsMe) continue;
    c.followsMe = false;
    d.stats.followers = Math.max(0, d.stats.followers - 1);
    pushNoti(d, { type: 'unfollow', actorId: id, text: '님이 나를 언팔로우했습니다' });
  }
  if (o.viral) {
    addXp(d, XP.viral);
    markViral(d, post);
  } else if (r.mood === 'negative' && applied.reputation <= -8) {
    post.badge = 'controversy';
  }
  if (d.stats.status === 'cancelled' && (r.mood === 'apology' || r.mood === 'positive')) questProgress(d, 'recover', 1);
  saveIdeas(d, r.ideas);
  recomputeStatus(d);
}

/** 반응이 다 붙은 뒤: 알림을 묶어서 하나씩(답글 · 마음에 들어요 · 재게시) + 뉴스 */
function finishPostNotis(d: Scenario, postId: ID, r: PostReaction, grouped: number, groupActor: ID | undefined) {
  const post = d.posts[postId];
  if (!post) return;
  if (grouped > 0) {
    pushNoti(d, {
      type: 'reply',
      actorId: groupActor,
      postId,
      text: groupActor ? (grouped > 1 ? `님 외 ${(grouped - 1).toLocaleString('ko-KR')}명이 답글을 남겼어요` : '님이 답글을 남겼어요') : `${grouped.toLocaleString('ko-KR')}명이 내 게시물에 답글을 남겼어요`,
    });
  }
  const fans = castChars(d).filter((c) => !c.isNews && c.affinity > 10);
  if (post.likes > 0) {
    const who = fans.length ? pick(fans) : undefined;
    pushNoti(d, {
      type: 'like',
      actorId: who?.id,
      postId,
      text: who ? (post.likes > 1 ? `님 외 ${(post.likes - 1).toLocaleString('ko-KR')}명이 내 게시물을 마음에 들어합니다` : '님이 내 게시물을 마음에 들어합니다') : `${post.likes.toLocaleString('ko-KR')}명이 내 게시물을 마음에 들어합니다`,
    });
  }
  if (post.reposts > 0) {
    const who = fans.find((c) => c.affinity > 15);
    pushNoti(d, {
      type: 'repost',
      actorId: who?.id,
      postId,
      text: who ? (post.reposts > 1 ? `님 외 ${(post.reposts - 1).toLocaleString('ko-KR')}명이 내 게시물을 재게시했습니다` : '님이 내 게시물을 재게시했습니다') : `${post.reposts.toLocaleString('ko-KR')}명이 내 게시물을 재게시했습니다`,
    });
  }
  for (const headline of r.news) addNewsPost(d, headline);
}
