/**
 * AI가 준 JSON → 게임이 쓰는 모양으로 정리(제미나이·클로드 공용)
 * - AI는 인물을 handle(@아이디, 짧게 h)로 말하므로 게임 내부 ID로 바꾼다. h가 "-"(이름 없는 일반인)면 임시 계정(GHOST)을 붙인다.
 * - 이상한 값(없는 인물, 숫자 아님, 너무 긴 글 등)은 버리거나 자른다. 수치 범위는 게임 규칙(progress.ts)이 한 번 더 자른다.
 * - 예전 필드 이름(handle/text/affinity/followerDelta …)도 그대로 읽는다.
 */
import { GHOST, type Archetype, type Deltas, type GameEvent, type ID, type SpeechRegister } from '../types';
import { hashStr } from '../utils';
import { ghostAuthor } from './local/ghost';
import { localBio, localEmoji, nameCore, toHandle } from './local/names';
import { hasBanmalAddress, textRegister, toRegister } from './local/register';
import { LIMITS } from './prompts';
import { DEFAULT_TUNE } from './tune';
import type { AIContext, CastDraft, CharacterDraft, CharacterDraftArgs, DMReaction, EventDraft, EventOutcome, GeneratedLine, Mood, PostReaction, ThreadReaction, TickResult } from './types';

export type RawLine = { h?: string; handle?: string; t?: string; text?: string; m?: string | null; media?: string | null; re?: string | null };
type Raw = Record<string, unknown>;

const MOODS: Mood[] = ['positive', 'negative', 'funny', 'apology', 'question', 'brag', 'neutral'];
const ARCHETYPES: Archetype[] = ['bestie', 'rival', 'fan', 'mentor', 'troll', 'news', 'crush', 'chaos', 'celeb'];

export const num = (n: unknown, fallback = 0) => {
  const v = typeof n === 'string' ? Number(n) : n;
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
};
export const moodOf = (m: unknown): Mood => (MOODS.includes(m as Mood) ? (m as Mood) : 'neutral');
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** 이모지 하나(서로게이트 쌍·기호·합자 포함) */
const EMOJI_RE = /(?:[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF])(?:\uFE0F|\u200D(?:[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF])\uFE0F?)*/;
/** 첫 번째로 있는 값 */
const pick1 = (r: Raw, ...keys: string[]) => keys.map((k) => r[k]).find((v) => v !== undefined && v !== null);

/** 글 다듬기: 따옴표·"이름:" 머리말 제거, 공백 정리, 너무 길면 자름 */
export function cleanText(raw: unknown, max: number): string {
  let t = str(raw)
    .replace(/^@?[a-z0-9_]{2,15}\s*[:：]\s+/i, '')
    // 롤플레이 지문(*웃으며*)과 줄표는 SNS 화면에 없다 — 프롬프트에 금지어로 적는 대신 여기서 지운다
    .replace(/\*[^*\n]{1,30}\*/g, ' ')
    .replace(/\s*[—–]\s*/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
  // 글 전체를 감싼 따옴표만 벗긴다(글 안의 인용은 그대로)
  if (/^["“'‘]/.test(t) && /["”'’]$/.test(t) && t.length > 2) t = t.slice(1, -1).trim();
  if (t.length > max) {
    // 문장 끝에서 자를 수 있으면 거기서, 아니면 글자 수로
    const cut = t.slice(0, max);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('ㅋ '), cut.lastIndexOf('… '));
    t = end > max * 0.6 ? cut.slice(0, end + 1).trim() : `${cut.slice(0, max - 1).trimEnd()}…`;
  }
  return t;
}

/**
 * 말투 등급 안전망(토큰 0): AI가 등급을 어겼으면(반말 인물이 ~요, 해요체 인물이 반말) 끝말을 고쳐 준다.
 * 안전하게 못 고치면 원문 그대로. 플레이어에게 하는 말(내 글 답글·쪽지·스레드)에만 쓴다.
 */
export function fixRegister(text: string, reg: SpeechRegister | undefined): string {
  if (!reg || reg === 'formal') return text;
  const cur = textRegister(text);
  // 반말 인물: 글 안쪽에 섞인 '~요'까지 고친다(반말로 분류돼도)
  if (reg === 'banmal') return cur === 'formal' ? text : (toRegister(text, 'banmal') ?? text);
  if (cur === 'neutral' || cur === reg || cur === 'formal') return text;
  return toRegister(text, reg) ?? text;
}

export function idOf(ctx: AIContext, handle: unknown): ID | undefined {
  if (typeof handle !== 'string' || !handle) return undefined;
  const h = handle.trim().replace(/^@/, '').toLowerCase();
  return ctx.cast.find((c) => c.handle.toLowerCase() === h)?.id;
}

const handleOfLine = (l: RawLine) => str(l?.h ?? l?.handle);
const textOfLine = (l: RawLine) => l?.t ?? l?.text;

export interface LineOpts {
  /** 이름 없는 일반인("-"·목록에 없는 아이디)을 임시 계정으로 살릴지(아니면 버림) */
  ghost?: boolean;
  /** 임시 계정 씨앗(같은 값이면 같은 사람) */
  seed?: string;
  max?: number;
  maxLen?: number;
  /** 이 인물은 쓰지 않음(작성자 본인 등) */
  exclude?: ID[];
  /** 뉴스 계정 제외 */
  noNews?: boolean;
  /** 플레이어에게 하는 말이면 말투 등급 안전망 적용 */
  toPlayer?: boolean;
  /** 평소 글: 플레이어를 부르거나 언급한 글에만 안전망 적용 */
  toPlayerIfAddressed?: boolean;
}

export function lines(ctx: AIContext, list: unknown, o: LineOpts = {}): GeneratedLine[] {
  const keys = new Set(ctx.scenes.map((s) => s.key));
  const me = ctx.persona.handle.toLowerCase();
  const seen = new Set<string>();
  const out: GeneratedLine[] = [];
  let g = 0;
  for (const l of arr<RawLine>(list)) {
    if (!l || typeof l !== 'object') continue;
    const h = handleOfLine(l).replace(/^@/, '');
    if (h.toLowerCase() === me) continue; // 플레이어 대사는 쓰지 않는다
    const text = cleanText(textOfLine(l), o.maxLen ?? 140);
    if (!text || seen.has(text)) continue;
    let authorId = idOf(ctx, h);
    const c = authorId ? ctx.cast.find((x) => x.id === authorId) : undefined;
    if (authorId && (o.exclude?.includes(authorId) || (o.noNews && c?.isNews))) continue;
    const media = str(l.m ?? l.media);
    let line: GeneratedLine;
    if (authorId) {
      const addressed = o.toPlayerIfAddressed && (text.includes(ctx.persona.name) || text.toLowerCase().includes(`@${me}`) || hasBanmalAddress(text));
      const fixed = o.toPlayer || addressed ? fixRegister(text, c?.register) : text;
      line = media && keys.has(media) ? { authorId, text: fixed, media } : { authorId, text: fixed };
    } else {
      if (!o.ghost) continue;
      authorId = GHOST;
      line = { authorId, text, ghost: ghostAuthor(`${o.seed ?? ''}:${hashStr(text)}:${g++}`) };
    }
    const re = idOf(ctx, str(l.re ?? '').replace(/^@/, ''));
    if (re && re !== authorId) line.replyTo = re;
    seen.add(text);
    out.push(line);
    if (o.max && out.length >= o.max) break;
  }
  return out;
}

/**
 * 한 번에 달리는 답글 모양 맞추기(v3.1): 기본 답글(최대 base개) + 인플루언서 답글에 달린 대댓글(최대 3개), 전체 최대 8개.
 * 대댓글(replyTo)은 그 인플루언서가 이번 기본 답글을 단 경우에만 인정 — 아니면 그냥 기본 답글로 본다.
 */
export function shapeBurst(ctx: AIContext, list: GeneratedLine[], base: number): GeneratedLine[] {
  const infl = (id: ID) => {
    const c = ctx.cast.find((x) => x.id === id);
    return !!c && !c.isNews && (c.followers >= 100_000 || c.crowdRole === 'celeb');
  };
  const top: GeneratedLine[] = [];
  const casc: GeneratedLine[] = [];
  for (const l of list) {
    if (l.replyTo && casc.length < 3 && top.some((t) => t.authorId === l.replyTo) && infl(l.replyTo)) casc.push(l);
    else if (top.length < base) top.push({ ...l, replyTo: undefined });
  }
  const out = [...top, ...casc].slice(0, 8);
  return out.map((l) => (l.replyTo ? l : (({ replyTo: _r, ...rest }) => rest)(l)));
}

export function affinityMap(ctx: AIContext, list: unknown): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const a of arr<{ h?: string; handle?: string; d?: number; delta?: number }>(list)) {
    const id = idOf(ctx, a?.h ?? a?.handle);
    const d = num(a?.d ?? a?.delta);
    if (id && d) out[id] = (out[id] ?? 0) + d;
  }
  return out;
}

function handles(ctx: AIContext, list: unknown): ID[] {
  return [...new Set(arr<string>(list).map((h) => idOf(ctx, h)).filter((x): x is ID => !!x))];
}

function ideasOf(v: unknown): string[] {
  return arr<string>(v)
    .map((t) => cleanText(t, LIMITS.idea + 20))
    .filter((t) => t.length >= 4)
    .slice(0, 2);
}

// ───────────────────────── 내 글 반응

export function normReact(ctx: AIContext, r: Raw, o: { n?: number; seed?: string } = {}): PostReaction {
  const quality = clampN(num(r.quality, 50), 0, 100);
  const deltas: Deltas = {
    followers: num(pick1(r, 'followers', 'followerDelta')),
    aura: num(pick1(r, 'aura', 'auraDelta')),
    humor: num(pick1(r, 'humor', 'humorDelta')),
    reputation: num(pick1(r, 'rep', 'reputationDelta')),
    affinity: affinityMap(ctx, pick1(r, 'aff', 'affinity')),
    romance: affinityMap(ctx, pick1(r, 'rom', 'romance')),
    devotion: affinityMap(ctx, pick1(r, 'dev', 'devotion')),
  };
  const viral = r.viral === true;
  // 좋아요·재게시는 게임이 팔로워·매력도로 다시 계산한다(postEngagement). 여기 값은 예전 흐름용 추정치
  const f = ctx.stats.followers;
  const estLikes = Math.round(f * (0.015 + (quality / 100) * 0.06) + 2 + Math.sqrt(f) * (quality / 100)) * (viral ? 6 : 1);
  const likes = r.likes !== undefined ? Math.max(0, num(r.likes)) : estLikes;
  return {
    mood: moodOf(r.mood),
    replies: shapeBurst(ctx, lines(ctx, r.replies, { ghost: true, seed: o.seed, max: 8, maxLen: LIMITS.reply + 50, noNews: true, toPlayer: true }), o.n ?? 6),
    likes,
    reposts: r.reposts !== undefined ? Math.max(0, num(r.reposts)) : Math.round(likes * 0.08),
    viral,
    quality,
    deltas,
    news: arr<string>(r.news).map((t) => cleanText(t, 90)).filter(Boolean).slice(0, 1),
    newFollowers: handles(ctx, pick1(r, 'follow', 'newFollowers')),
    unfollowers: handles(ctx, pick1(r, 'unfollow', 'unfollowers')),
    ideas: ideasOf(r.ideas),
  };
}

// ───────────────────────── 답글 스레드

export function normThread(ctx: AIContext, r: Raw, seed?: string): ThreadReaction {
  return {
    replies: lines(ctx, r.replies, { ghost: true, seed, max: Math.min(8, Math.max(1, (ctx.tune ?? DEFAULT_TUNE).thread)), maxLen: LIMITS.reply + 50, noNews: true, toPlayer: true }),
    deltas: {
      affinity: affinityMap(ctx, pick1(r, 'aff', 'affinity')),
      romance: affinityMap(ctx, pick1(r, 'rom', 'romance')),
      devotion: affinityMap(ctx, pick1(r, 'dev', 'devotion')),
      reputation: num(pick1(r, 'rep', 'reputationDelta')),
    },
  };
}

// ───────────────────────── 쪽지

/** 너무 긴 한 줄은 메신저처럼 두 줄로 */
function splitMessage(t: string): string[] {
  if (t.length <= LIMITS.dm + 10) return [t];
  const cut = t.slice(0, LIMITS.dm + 10);
  const at = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '), cut.lastIndexOf('ㅋ '), cut.lastIndexOf('ㅠ '), cut.lastIndexOf('~ '));
  if (at < 12) return [cleanText(t, 100)];
  return [t.slice(0, at + 1).trim(), cleanText(t.slice(at + 1), 100)].filter(Boolean);
}

export function normDM(r: Raw, reg?: SpeechRegister, maxBubbles = 3): DMReaction {
  const raw = arr<string>(pick1(r, 'messages', 'lines'))
    .map((t) => fixRegister(cleanText(t, 160), reg))
    .filter(Boolean);
  const messages = raw.flatMap(splitMessage).slice(0, Math.min(3, Math.max(1, maxBubbles)));
  const summary = cleanText(str(pick1(r, 'sum', 'historySummary')), 260);
  return {
    mood: moodOf(r.mood),
    messages,
    leave: r.leave === true,
    affinityDelta: num(pick1(r, 'affinityDelta', 'aff')),
    romanceDelta: num(pick1(r, 'romanceDelta', 'rom')),
    devotionDelta: num(pick1(r, 'devotionDelta', 'dev')),
    ...(summary ? { historySummary: summary } : {}),
  };
}

// ───────────────────────── 타임라인 글

export function normAmbient(ctx: AIContext, r: Raw, count: number): GeneratedLine[] {
  // 타임라인 글은 목록 인물만(임시 계정 글은 게임이 받지 않는다)
  return lines(ctx, r.posts, { max: count, maxLen: 160, noNews: false, toPlayerIfAddressed: true });
}

// ───────────────────────── 이벤트

type RawEvent = { emoji?: string; title?: string; body?: string; inv?: string[]; involved?: string[] };

/** 이벤트 = 상황만(선택지 없음 — 플레이어가 직접 답한다) */
export function normEventDraft(ctx: AIContext, v: unknown): EventDraft | null {
  const ev = v as RawEvent | null;
  if (!ev || typeof ev !== 'object' || !str(ev.title) || !str(ev.body)) return null;
  return {
    emoji: str(ev.emoji).match(EMOJI_RE)?.[0] ?? '⚡',
    title: cleanText(ev.title, 40),
    body: cleanText(ev.body, 200),
    involved: handles(ctx, ev.inv ?? ev.involved)
      .filter((id) => !ctx.cast.find((c) => c.id === id)?.isNews)
      .slice(0, 3),
    choices: [],
  };
}

// ───────────────────────── 하루 정산

export function normTick(ctx: AIContext, r: Raw): TickResult {
  const mission = r.mission as { title?: string; desc?: string; kw?: string[]; keyword?: string[] } | undefined;
  const kw = arr<string>(mission?.kw ?? mission?.keyword)
    .map(str)
    .filter(Boolean)
    .slice(0, 2);
  return {
    npcPosts: lines(ctx, pick1(r, 'posts', 'npcPosts'), { max: 6, maxLen: 160, toPlayerIfAddressed: true }),
    news: arr<string>(r.news).map((t) => cleanText(t, 90)).filter(Boolean).slice(0, 2),
    trends: arr<{ tag?: string; n?: number; count?: number }>(r.trends)
      .filter((t) => str(t?.tag))
      .slice(0, 8)
      .map((t, i) => ({ tag: str(t.tag).startsWith('#') ? str(t.tag).replace(/\s+/g, '') : `#${str(t.tag).replace(/\s+/g, '')}`, count: Math.max(100, num(t.n ?? t.count, 1000)), hot: i === 0 })),
    event: normEventDraft(ctx, r.event),
    dmOpeners: lines(ctx, pick1(r, 'dm', 'dmOpeners'), { max: 4, maxLen: 120, noNews: true, toPlayer: true }).filter((l) => ctx.cast.find((c) => c.id === l.authorId)?.tier !== 'crowd'),
    mission: str(mission?.title) && kw.length ? { title: cleanText(mission!.title, 30), desc: cleanText(mission!.desc, 80), keyword: kw } : null,
    ideas: ideasOf(r.ideas),
    bios: arr<{ h?: string; handle?: string; bio?: string }>(r.bios)
      .map((b) => ({ id: idOf(ctx, b?.h ?? b?.handle), bio: cleanText(b?.bio, LIMITS.bio + 10) }))
      .filter((b): b is { id: ID; bio: string } => !!b.id && !!b.bio)
      .slice(0, 1),
  };
}

// ───────────────────────── 이벤트 결과

export function normOutcome(ctx: AIContext, r: Raw, event?: Pick<GameEvent, 'involved'>): EventOutcome {
  const grade = clampN(num(r.grade), -2, 2);
  const affinity = affinityMap(ctx, pick1(r, 'aff', 'affinity'));
  // 관련 인물의 호감도 변화는 확실하게(±5~±20): 빠졌으면 답의 질(grade)로 채우고, 너무 작으면 5로
  for (const id of event?.involved ?? []) {
    const d = affinity[id];
    if (d === undefined || d === 0) {
      if (grade !== 0) affinity[id] = grade * 6;
    } else if (Math.abs(d) < 5) affinity[id] = Math.sign(d) * 5;
  }
  for (const id of Object.keys(affinity)) affinity[id] = clampN(affinity[id], -25, 25);
  const text = cleanText(r.text, 200);
  // 답을 보고 올라온 글(댓글 포함) — 댓글 없는 글은 버린다(시스템 글처럼 보이지 않게)
  const posts: GeneratedLine[] = [];
  arr<Raw>(r.posts).slice(0, Math.min(4, (ctx.tune ?? DEFAULT_TUNE).eventPosts)).forEach((p, i) => {
    const main = lines(ctx, [p], { ghost: true, seed: `ev${i}:${text.slice(0, 12)}`, max: 1, maxLen: LIMITS.post + 40 })[0];
    if (!main) return;
    const comments = lines(ctx, pick1(p, 'c', 'comments'), { ghost: true, seed: `evc${i}:${main.text.slice(0, 12)}`, max: 3, maxLen: LIMITS.reply + 40, noNews: true, exclude: main.authorId.startsWith('__') ? [] : [main.authorId] });
    if (comments.length) posts.push({ ...main, comments });
  });
  // 결과 문장이 비면 지어내지 않고 실패로(같은 AI로 한 번 더 → 그래도 없으면 이벤트는 그대로 대기)
  if (!text) throw Object.assign(new Error('이벤트 결과가 비어 있어요'), { code: 'empty' });
  return {
    text,
    deltas: {
      followers: num(pick1(r, 'followers', 'followerDelta')),
      aura: num(pick1(r, 'aura', 'auraDelta')),
      humor: num(pick1(r, 'humor', 'humorDelta')),
      reputation: num(pick1(r, 'rep', 'reputationDelta')),
      xp: Math.max(0, num(r.xp)),
      affinity,
      romance: affinityMap(ctx, pick1(r, 'rom', 'romance')),
      devotion: affinityMap(ctx, pick1(r, 'dev', 'devotion')),
    },
    posts,
    grade,
  };
}

// ───────────────────────── 남의 글 댓글

export function normComments(ctx: AIContext, r: Raw, o: { count: number; seed?: string; authorId?: ID }): GeneratedLine[] {
  const mine = o.authorId === 'me';
  const out = lines(ctx, pick1(r, 'comments', 'replies'), {
    ghost: true,
    seed: o.seed,
    max: 8,
    maxLen: LIMITS.reply + 50,
    exclude: o.authorId && !mine ? [o.authorId] : [],
    noNews: true,
    // 플레이어 글에 달린 답글이면 플레이어에게 쓰는 말투 등급으로 맞춘다
    toPlayer: mine,
  });
  return shapeBurst(ctx, out, Math.min(o.count, 6));
}

/** 첫 쪽지 1~2줄 */
export function normFirstDM(r: Raw, reg?: SpeechRegister): string[] {
  return arr<string>(pick1(r, 'messages', 'lines'))
    .map((t) => fixRegister(cleanText(t, 160), reg))
    .filter(Boolean)
    .flatMap(splitMessage)
    .slice(0, 2);
}

// ───────────────────────── 캐릭터 만들기


export function normDraft(r: Raw, a: CharacterDraftArgs, seed: string): CharacterDraft {
  // 이름이 비면 빈 값(부르는 쪽이 로컬 이름 생성기로 짓는다 — "새 계정" 같은 자리표시 이름을 쓰지 않음)
  const name = a.name?.trim() || cleanText(r.name, 20).replace(/^@/, '');
  const given = (a.handle ?? '').replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 15);
  let handle = given || str(r.handle).replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 15);
  if (handle.length < 4) handle = name ? toHandle(nameCore(name), seed) : '';
  const bio = cleanText(r.bio, LIMITS.bio + 15) || localBio(a.type, a.ageGroup, a.traits);
  const emoji = str(r.emoji).match(EMOJI_RE)?.[0] ?? localEmoji(a.type, seed);
  const post = cleanText(r.post, LIMITS.post + 30);
  return { name, handle, bio, emoji, ...(post ? { post } : {}) };
}

export function normCast(r: Raw): CastDraft[] {
  return arr<Raw>(r.cast)
    .slice(0, 10)
    .filter((c) => cleanText(c.name, 24)) // 이름 없는 인물은 버린다(자리표시 이름을 쓰지 않음)
    .map((c) => {
      const name = cleanText(c.name, 24);
      let handle = (str(c.handle) || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 15);
      if (handle.length < 4) handle = toHandle(nameCore(name), name);
      return {
        name,
        handle,
        emoji: str(c.emoji).match(EMOJI_RE)?.[0] ?? '🙂',
        archetype: ARCHETYPES.includes(c.archetype as Archetype) ? (c.archetype as Archetype) : 'chaos',
        bio: cleanText(c.bio, 30),
        description: cleanText(c.description, 70),
        ...(c.g === 'm' || c.g === 'f' ? { gender: c.g as 'm' | 'f' } : {}),
        ...(num(c.age, 0) >= 18 ? { age: Math.min(79, num(c.age, 0)) } : {}),
        followers: Math.max(0, num(c.followers, 1000)),
        isNews: c.isNews === true,
        verified: c.verified === true,
      };
    });
}
// ───────────────────────── 잘린 JSON 살리기

/**
 * JSON 파싱(관대하게): 코드펜스 제거 → 그대로 파싱 → 실패하면(출력 한도에서 잘림 등)
 * 마지막으로 완성된 값까지 자르고 열린 괄호를 닫아서 다시 시도한다.
 */
export function parseJSONLoose<T = Raw>(text: string): T {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(t) as T;
  } catch {
    /* 아래에서 복구 시도 */
  }
  const start = t.search(/[{[]/);
  if (start < 0) throw new Error('JSON 아님');
  const s = t.slice(start);
  // 문자열 밖의 괄호 깊이를 따라가며 "값이 막 끝난 자리"를 기록
  const stack: string[] = [];
  const cuts: { at: number; closers: string }[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') {
        inStr = false;
        cuts.push({ at: i + 1, closers: [...stack].reverse().join('') });
      }
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') {
      stack.pop();
      cuts.push({ at: i + 1, closers: [...stack].reverse().join('') });
    } else if (/[0-9el]/.test(ch) && /[,}\]\s]/.test(s[i + 1] ?? ',')) {
      cuts.push({ at: i + 1, closers: [...stack].reverse().join('') });
    }
  }
  for (let k = cuts.length - 1; k >= 0 && k >= cuts.length - 400; k--) {
    const { at, closers } = cuts[k];
    const body = s.slice(0, at).replace(/,\s*$/, '');
    try {
      return JSON.parse(body + closers) as T;
    } catch {
      /* 더 앞에서 */
    }
  }
  throw new Error('JSON 복구 실패');
}
