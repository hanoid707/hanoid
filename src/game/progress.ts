/**
 * 게임 규칙의 핵심 — 수치 적용, 관계 변화 기록, 레벨업, 퀘스트, 평판 상태(떡상·논란·캔슬)
 * 모든 함수는 immer 초안(draft)을 직접 고친다. AI가 준 숫자도 여기서 범위를 잘라낸 뒤 적용한다.
 * 호감도·설렘은 반드시 applyAffinity(→ relationship.changeAffinity)로 바꾼다(관계·말투 자동 변화 + 알림·기억).
 */
import { safeGhost } from './lookalike';
import { GHOST, ME, SYSTEM, type Character, type CharacterType, type Deltas, type GameTime, type GhostAuthor, type ID, type ItemKind, type Noti, type Post, type QuestGoal, type RelationChange, type Scenario, type SpeechRegister } from '../types';
import { clamp, fill, rand, snippet, uid } from '../utils';
import { advanceClock } from './clock';
import { changeAffinity, describeChange, typeLabel, updateRelation } from './relationship';
import { CANCEL_KEEP_RATIO, CLAMP, KEEP, REP, xpToNext } from './rules';

// ───────────────────────── 기록 남기기

export function pushNoti(d: Scenario, n: Omit<Noti, 'id' | 'ts' | 'at' | 'read'>) {
  d.notis.unshift({ ...n, id: uid('n'), ts: Date.now(), at: { ...d.clock }, read: false });
  if (d.notis.length > KEEP.notis) d.notis.length = KEEP.notis;
}

export function logActivity(d: Scenario, icon: string, text: string) {
  d.activity.unshift({ id: uid('a'), icon, text, ts: Date.now(), at: { ...d.clock } });
  if (d.activity.length > KEEP.activity) d.activity.length = KEEP.activity;
}

export function addMemory(d: Scenario, text: string) {
  d.memory.push(`${d.clock.day}일차: ${text}`);
  if (d.memory.length > KEEP.memory) d.memory.splice(0, d.memory.length - KEEP.memory);
}

/** 아이템 사용 기록(최신이 앞, 30개까지) */
export function pushItemLog(d: Scenario, item: ItemKind, text: string, target?: ID) {
  if (!d.itemLog) d.itemLog = [];
  d.itemLog.unshift({ id: uid('it'), item, text, ts: Date.now(), at: { ...d.clock }, ...(target ? { target } : {}) });
  if (d.itemLog.length > KEEP.itemLog) d.itemLog.length = KEEP.itemLog;
}

/** 켜 둔 바이럴 모먼트를 이번 행동에 쓴다(켜져 있었으면 true) */
export function consumeBoost(d: Scenario, what: string): boolean {
  if (!d.boost) return false;
  d.boost = null;
  pushItemLog(d, 'viral', `🚀 바이럴 모먼트 발동: ${what}`);
  pushNoti(d, { type: 'item', text: `🚀 바이럴 모먼트 발동! ${what}` });
  logActivity(d, '🚀', `바이럴 모먼트 발동: ${what}`);
  return true;
}

/** 시간을 흘리고, 지나간 날 수를 돌려준다 */
export function tickClock(d: Scenario, minutes: number): number {
  const { time, daysPassed } = advanceClock(d.clock, minutes);
  d.clock = time;
  return daysPassed;
}

// ───────────────────────── 글

export function addPost(d: Scenario, p: Pick<Post, 'authorId' | 'text' | 'kind'> & Partial<Post>, toFeed: boolean): Post {
  const post: Post = {
    id: p.id ?? uid('p'),
    authorId: p.authorId,
    text: p.text,
    kind: p.kind,
    at: { ...d.clock },
    ts: Date.now(),
    likes: p.likes ?? 0,
    reposts: p.reposts ?? 0,
    views: p.views,
    replies: [],
    parentId: p.parentId,
    rootId: p.rootId,
    badge: p.badge,
    eventId: p.eventId,
    media: p.media,
  };
  if (p.at) post.at = { ...p.at };
  // 임시 계정이 플레이어와 헷갈리는 이름·프사면 다른 사람으로(game/lookalike.ts)
  if (p.ghost) post.ghost = safeGhost(d, p.ghost, post.id);
  if (p.quote?.length) post.quote = p.quote;
  if (p.growFrom) post.growFrom = p.growFrom;
  if (p.boosted) post.boosted = true;
  d.posts[post.id] = post;
  if (toFeed) {
    d.feed.unshift(post.id);
    trimFeed(d);
  }
  return post;
}

/** 글 하나와 그 아래 답글을 전부 지우고, 지운 개수를 돌려준다 */
function dropTree(d: Scenario, id: ID): number {
  const p = d.posts[id];
  if (!p) return 0;
  let n = 1;
  for (const r of p.replies) n += dropTree(d, r);
  delete d.posts[id];
  return n;
}

/** 오래된 글 정리(답글까지 같이 지움). 답글이 아주 많아지면 전체 글 수로도 정리(저장 용량 보호) */
function trimFeed(d: Scenario) {
  const limit = Math.floor(KEEP.posts / 2);
  if (d.feed.length > limit) d.feed.splice(limit).forEach((id) => dropTree(d, id));
  let total = Object.keys(d.posts).length;
  while (total > KEEP.postsTotal && d.feed.length > 30) {
    total -= dropTree(d, d.feed.pop()!);
  }
}

export interface ReplyOpts {
  /** authorId === GHOST 일 때 임시 계정 정보 */
  ghost?: GhostAuthor;
  /** 알림을 남길지(기본 true, 임시 계정은 항상 안 남김) */
  noti?: boolean;
  /** 글이 달린 시각(이미 있던 댓글을 채울 때) */
  at?: GameTime;
  likes?: number;
  boosted?: boolean;
}

export function addReply(d: Scenario, parentId: ID, authorId: ID, text: string, opts: ReplyOpts = {}): Post | null {
  const parent = d.posts[parentId];
  if (!parent) return null;
  const reply = addPost(
    d,
    { authorId, text, kind: 'reply', parentId, rootId: parent.rootId ?? parent.id, at: opts.at, likes: opts.likes, ghost: authorId === GHOST ? opts.ghost : undefined, boosted: opts.boosted },
    false,
  );
  parent.replies.push(reply.id);
  if (authorId === ME || authorId === GHOST || opts.noti === false) return reply;
  if (parent.authorId === ME) {
    pushNoti(d, { type: 'reply', actorId: authorId, postId: reply.rootId ?? parentId, text: snippet(text, 40) });
  } else if (text.includes(`@${d.persona.handle}`)) {
    pushNoti(d, { type: 'mention', actorId: authorId, postId: reply.rootId ?? parentId, text: snippet(text, 40) });
  }
  return reply;
}

/** 뉴스 계정(없으면 시스템) 이름으로 글 올리기 */
export function addNewsPost(d: Scenario, text: string, extra: Partial<Post> = {}): Post {
  const ok = (id: ID) => !!d.characters[id]?.isNews && !d.characters[id]?.inactive;
  const newsId = d.cast.find((id) => ok(id) && d.characters[id]?.tier !== 'crowd') ?? d.cast.find(ok);
  return addPost(d, { authorId: newsId ?? SYSTEM, text, kind: 'news', likes: rand(40, 900), reposts: rand(5, 120), ...extra }, true);
}

// ───────────────────────── 관계(호감도·설렘 → 관계·말투)

const REG_NOW: Record<SpeechRegister, string> = {
  banmal: '이제 반말을 써요',
  haeyo: '이제 해요체를 써요',
  formal: '이제 격식 있는 존댓말을 써요',
};

const RANK: Partial<Record<CharacterType, number>> = {
  enemy: 0, rival: 1, acquaintance: 2, friend: 3, mentor: 3, bestie: 4, spicy: 4, family: 4, lover: 5,
  antifan: 0, public: 1, fan: 2, superfan: 3,
};

/** 관계 변화 → AI가 기억할 한 줄 */
function relationMemory(c: Character, ch: RelationChange): string {
  const n = c.name;
  const up = (RANK[ch.to] ?? 2) > (RANK[ch.from] ?? 2);
  const parts: string[] = [];
  if (ch.from !== ch.to) {
    const t: Partial<Record<CharacterType, string>> = {
      friend: up ? '{n}와(과) 친구가 됨' : '{n}와(과) 조금 멀어져 그냥 친구 사이가 됨',
      bestie: '{n}와(과) 소울메이트급 베프가 됨',
      spicy: up ? '{n}와(과) 묘한 기류(썸)가 생김' : '{n}와(과) 연인에서 애매한 사이로 돌아감',
      lover: '{n}와(과) 연인이 됨',
      rival: up ? '{n}와(과) 앙금이 조금 풀려 라이벌 정도가 됨' : '{n}와(과) 라이벌 관계가 됨',
      enemy: '{n}와(과) 완전히 틀어져 적이 됨',
      acquaintance: up ? '{n}와(과) 앙금이 풀려 아는 사이가 됨' : '{n}와(과) 사이가 서먹해짐',
      mentor: '{n}이(가) 다시 플레이어를 이끌어 주는 멘토가 됨',
      family: '{n}와(과) 다시 가족답게 지내게 됨',
      superfan: '{n}이(가) 플레이어의 열혈 팬이 됨',
      fan: up ? '{n}이(가) 플레이어의 팬이 됨' : '{n}의 팬심이 조금 식음',
      antifan: '{n}이(가) 플레이어의 안티팬으로 돌아섬',
      public: up ? '{n}이(가) 더는 시비를 걸지 않음' : '{n}이(가) 플레이어에게 관심을 거둠',
    };
    const tpl = t[ch.to];
    parts.push(tpl ? fill(tpl, { n }) : `${n}: ${describeChange({ ...ch, register: undefined })}`);
  }
  if (ch.register) {
    const r: Record<SpeechRegister, string> = {
      banmal: '{n}이(가) 플레이어에게 말을 놓기 시작함',
      haeyo: '{n}이(가) 플레이어에게 다시 해요체를 씀',
      formal: '{n}이(가) 플레이어에게 격식 있게 말하기 시작함',
    };
    parts.push(fill(r[ch.register.to], { n }));
  }
  return parts.join(', ');
}

/** 관계·말투가 바뀌었을 때: 알림(relation) + 세계 기억 + 활동 기록 */
export function noteRelationChange(d: Scenario, ch: RelationChange): void {
  const c = d.characters[ch.characterId];
  if (!c) return;
  const typeChanged = ch.from !== ch.to;
  const reg = ch.register ? REG_NOW[ch.register.to] : '';
  const text = typeChanged
    ? fill(`님과의 관계가 ${typeLabel(ch.from)} → {to}로 바뀌었어요`, { to: typeLabel(ch.to) }) + (reg ? ` · ${reg}` : '')
    : `님이 ${reg}`;
  pushNoti(d, { type: 'relation', actorId: c.id, text });
  addMemory(d, relationMemory(c, ch));
  logActivity(d, '💞', `${c.name}: ${describeChange(ch)}`);
}

/** 호감도·설렘 바꾸기(범위 제한 + 관계·말투 재계산 + 바뀌면 알림·기억). 바뀐 관계를 돌려준다 */
export function applyAffinity(d: Scenario, id: ID, delta: number, romanceDelta = 0, devotionDelta = 0): RelationChange | null {
  const c = d.characters[id];
  if (!c || (!delta && !romanceDelta && !devotionDelta)) return null;
  const ch = changeAffinity(d, id, delta, romanceDelta, devotionDelta);
  if (ch) noteRelationChange(d, ch);
  return ch;
}

// ───────────────────────── 수치 적용

export interface Applied {
  followers: number;
  aura: number;
  humor: number;
  reputation: number;
  /** 실제로 바뀐 호감도·설렘(캐릭터별, 범위 제한 뒤) */
  affinity: Record<ID, number>;
  romance: Record<ID, number>;
  devotion: Record<ID, number>;
  /** 이번 변화로 바뀐 관계 */
  changes: RelationChange[];
}

export interface DeltaOpts {
  /** 한 번에 바뀌는 호감도 상한(기본 ±20, 이벤트 ±30) */
  affinityCap?: number;
  /** 한 번에 바뀌는 설렘 상한(기본 ±15) */
  romanceCap?: number;
  /** 한 번에 바뀌는 정복도 상한(기본 ±15, 이벤트 ±25) */
  devotionCap?: number;
}

/** AI가 제안한 변화량을 범위 제한 후 적용 */
export function applyDeltas(d: Scenario, delta: Deltas, opts: DeltaOpts = {}): Applied {
  const s = d.stats;
  const before = { ...s };
  if (delta.followers) {
    const up = Math.floor(s.followers * CLAMP.followersUpRatio) + CLAMP.followersUpFlat;
    const down = Math.floor(s.followers * CLAMP.followersDownRatio) + 3;
    s.followers = Math.max(0, s.followers + clamp(Math.round(delta.followers), -down, up));
  }
  if (delta.aura) s.aura = clamp(s.aura + clamp(Math.round(delta.aura), -CLAMP.stat, CLAMP.stat), 0, 999);
  if (delta.humor) s.humor = clamp(s.humor + clamp(Math.round(delta.humor), -CLAMP.stat, CLAMP.stat), 0, 999);
  if (delta.reputation) s.reputation = clamp(s.reputation + clamp(Math.round(delta.reputation), -CLAMP.reputation, CLAMP.reputation), -100, 100);

  const affCap = opts.affinityCap ?? CLAMP.affinity;
  const romCap = opts.romanceCap ?? CLAMP.romance;
  const affinity: Record<ID, number> = {};
  const romance: Record<ID, number> = {};
  const devotion: Record<ID, number> = {};
  const devCap = opts.devotionCap ?? CLAMP.devotion;
  const changes: RelationChange[] = [];
  const ids = new Set([...Object.keys(delta.affinity ?? {}), ...Object.keys(delta.romance ?? {}), ...Object.keys(delta.devotion ?? {})]);
  for (const id of ids) {
    const c = d.characters[id];
    if (!c || c.inactive) continue;
    const a0 = c.affinity;
    const r0 = c.romance ?? 0;
    const v0 = c.devotion ?? 0;
    const ch = applyAffinity(
      d,
      id,
      clamp(Math.round(delta.affinity?.[id] ?? 0), -affCap, affCap),
      clamp(Math.round(delta.romance?.[id] ?? 0), -romCap, romCap),
      clamp(Math.round(delta.devotion?.[id] ?? 0), -devCap, devCap),
    );
    if (ch) changes.push(ch);
    if (c.affinity !== a0) affinity[id] = c.affinity - a0;
    if ((c.romance ?? 0) !== r0) romance[id] = (c.romance ?? 0) - r0;
    if ((c.devotion ?? 0) !== v0) devotion[id] = (c.devotion ?? 0) - v0;
  }
  if (delta.xp) addXp(d, clamp(delta.xp, 0, 50));
  checkMilestones(d, before.followers);
  questProgress(d, 'followers', s.followers, 'set');
  return {
    followers: s.followers - before.followers,
    aura: s.aura - before.aura,
    humor: s.humor - before.humor,
    reputation: s.reputation - before.reputation,
    affinity,
    romance,
    devotion,
    changes,
  };
}

export function addXp(d: Scenario, amount: number) {
  const s = d.stats;
  s.xp += amount;
  while (s.xp >= xpToNext(s.level)) {
    s.xp -= xpToNext(s.level);
    s.level += 1;
    pushNoti(d, { type: 'level', text: `레벨 ${s.level} 달성! 계정 영향력이 커졌어요` });
    logActivity(d, '🆙', `레벨 ${s.level} 달성`);
    questProgress(d, 'level', s.level, 'set');
  }
}

const MILESTONES = [50, 100, 300, 500, 1000, 3000, 5000, 10_000, 30_000, 50_000, 100_000, 300_000, 500_000, 1_000_000, 3_000_000, 10_000_000];

function checkMilestones(d: Scenario, before: number) {
  const after = d.stats.followers;
  const crossed = MILESTONES.filter((m) => before < m && after >= m).pop();
  if (!crossed) return;
  // 뉴스 글은 미리 써 둔 틀로 만들지 않는다 — 주요 사건으로 남겨 두면 다음 하루 정산에서 AI가 소식으로 다룬다
  pushNoti(d, { type: 'news', text: `팔로워 ${crossed.toLocaleString('ko-KR')}명 돌파!` });
  addMemory(d, `플레이어 팔로워 ${crossed.toLocaleString('ko-KR')}명 돌파`);
}

// ───────────────────────── 퀘스트

export function questProgress(d: Scenario, goal: QuestGoal, value: number, mode: 'add' | 'set' = 'add') {
  for (const q of d.quests) {
    if (q.goal !== goal || q.done) continue;
    q.progress = mode === 'add' ? q.progress + value : Math.max(q.progress, value);
    if (q.progress >= q.target) {
      q.progress = q.target;
      q.done = true;
      pushNoti(d, { type: 'quest', text: `미션 완료: ${q.title} — 보상을 받으세요` });
      if (goal === 'recover') recoverFromCancel(d);
    }
  }
}

/** "오늘의 미션": 특정 단어가 들어간 글 */
export function questKeyword(d: Scenario, text: string) {
  for (const q of d.quests) {
    if (q.goal !== 'keyword' || q.done || !q.keyword?.length) continue;
    if (q.keyword.some((k) => text.includes(k))) {
      q.progress = q.target;
      q.done = true;
      pushNoti(d, { type: 'quest', text: `미션 완료: ${q.title} — 보상을 받으세요` });
    }
  }
}

// ───────────────────────── 평판 상태: 떡상 · 논란 · 캔슬

export function recomputeStatus(d: Scenario) {
  const s = d.stats;
  if (s.status === 'cancelled') return; // 캔슬은 "재기하기" 퀘스트로만 풀린다
  if (s.reputation <= REP.cancelled) return triggerCancel(d);
  if (s.reputation <= REP.controversy) {
    if (s.status !== 'controversy') {
      s.status = 'controversy';
      pushNoti(d, { type: 'system', text: '⚠️ 논란이 커지고 있어요. 평판이 더 떨어지면 캔슬당할 수 있어요' });
    }
    return;
  }
  if (s.status === 'viral') return; // 떡상은 하루 동안 유지
  s.status = s.reputation >= REP.rising ? 'rising' : 'normal';
}

export function markViral(d: Scenario, post: Post) {
  post.badge = 'viral';
  if (d.stats.status !== 'cancelled') d.stats.status = 'viral';
  d.trends.unshift({ tag: `#${d.persona.name.replace(/\s/g, '')}`, count: rand(20_000, 120_000), hot: true });
  d.trends = d.trends.slice(0, 6);
  pushNoti(d, { type: 'viral', postId: post.id, text: '🔥 회원님의 글이 떡상 중이에요!' });
  addMemory(d, `"${snippet(post.text, 24)}" 글이 크게 화제가 됨`);
  logActivity(d, '🔥', '글이 떡상했어요');
}

function triggerCancel(d: Scenario) {
  const s = d.stats;
  s.status = 'cancelled';
  const lost = s.followers - Math.floor(s.followers * CANCEL_KEEP_RATIO);
  s.followers -= lost;
  const cancelTag = `#${d.persona.handle}_아웃`;
  d.trends.unshift({ tag: cancelTag, count: rand(30_000, 150_000), hot: true });
  d.trends = d.trends.slice(0, 6);
  d.quests.unshift({
    id: uid('q'),
    title: '재기하기',
    desc: '진심이 담긴 글(사과·긍정적인 글)을 3번 올려 여론을 돌리세요.',
    goal: 'recover',
    target: 3,
    progress: 0,
    reward: { xp: 40, followers: 50 },
    done: false,
    claimed: false,
  });
  pushNoti(d, { type: 'cancel', text: `🚫 캔슬당했어요. 팔로워 ${lost.toLocaleString('ko-KR')}명이 떠났어요` });
  addMemory(d, '여론이 최악으로 치달아 캔슬당함');
  logActivity(d, '🚫', '캔슬당했어요');
}

function recoverFromCancel(d: Scenario) {
  if (d.stats.status !== 'cancelled') return;
  d.stats.status = 'normal';
  d.stats.reputation = REP.recovered;
  d.trends = d.trends.filter((t) => !t.tag.endsWith('_아웃'));
  pushNoti(d, { type: 'recover', text: '🌱 여론이 돌아섰어요. 재기 성공!' });
  addMemory(d, '진심 어린 글로 캔슬에서 재기함');
  logActivity(d, '🌱', '캔슬에서 재기했어요');
}

/** 스탯 직접 조정으로 캔슬 상태를 벗어날 때(재기 미션 없이) */
export function liftCancel(d: Scenario) {
  if (d.stats.status !== 'cancelled') return;
  d.stats.status = 'normal';
  d.trends = d.trends.filter((t) => !t.tag.endsWith('_아웃'));
  d.quests = d.quests.filter((q) => q.goal !== 'recover' || q.done);
}

/**
 * 하루가 바뀔 때 기본 정리: 평판 회복, 떡상 종료, 나갔던 캐릭터 복귀, 지난 미션 정리,
 * 그리고 어제 미뤄 둔 관계 변화(하루 한 번 규칙)를 다시 계산한다.
 */
export function dailyHousekeeping(d: Scenario) {
  const s = d.stats;
  if (s.status !== 'cancelled') {
    if (s.reputation > 0) s.reputation = Math.max(0, s.reputation - REP.dailyDrift);
    else if (s.reputation < 0) s.reputation = Math.min(0, s.reputation + REP.dailyDrift);
    if (s.status === 'viral') s.status = 'normal';
    recomputeStatus(d);
  }
  for (const conv of Object.values(d.dms)) {
    if (conv.leftUntilDay !== null && conv.leftUntilDay <= d.clock.day) {
      conv.leftUntilDay = null;
      const c = d.characters[conv.characterId];
      if (!c || c.inactive) continue;
      // 돌아오며 하는 말은 미리 써 둔 문장 대신 하루 정산 AI가 맥락을 보고 쓴다(tick.ts → returned)
      conv.messages.push({ id: uid('m'), from: 'system', text: `${c.name}님이 대화방에 돌아왔습니다.`, ts: Date.now(), at: { ...d.clock } });
      conv.updatedTs = Date.now();
    }
  }
  // 미뤄 둔 관계 변화 반영
  for (const id of Object.keys(d.characters)) {
    if (d.characters[id].inactive) continue;
    const ch = updateRelation(d, id);
    if (ch) noteRelationChange(d, ch);
  }
  d.quests = d.quests.filter((q) => q.day === undefined || q.day >= d.clock.day || q.done);
}
