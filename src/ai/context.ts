/**
 * 시나리오(세이브 데이터) → AI에게 넘길 요약본(AIContext) + 프롬프트 조각
 *
 * 토큰 절약 구조(제미나이·클로드 공용):
 *  ① 시스템 지시(prompts.ts systemFor) = 규칙 + 세계관 + 플레이어 설정. 한 시나리오 안에서 글자 하나 안 바뀐다
 *     → 제미나이 자동 캐시(같은 앞부분은 싸게 계산)가 걸린다. 시각·수치처럼 자주 바뀌는 건 넣지 않는다.
 *  ② 사용자 프롬프트(매번) = 이번 일에 필요한 인물만 자세히(≤6) + 나머지 한 줄 + 일반 유저(≤6) + 타임라인(≤6) + 기억(≤8) + 할 일
 * 캐릭터 설정·쪽지·관계를 같이 넘겨서 타임라인 답글과 쪽지 말투가 서로 이어지게 한다.
 */
import { getWorldTemplate } from '../data/worlds';
import { canLove, genderOf, heartEligible, heartTargets, jealousOf, lovable, lovables, loveOf, topLove, touchCandidates } from '../game/love';
import { CROWD_LABEL, PERSONALITY_PRESETS, REGISTER_LABEL, RELATION_LABEL, SPEECH_PRESETS, registerOf } from '../game/relationship';
import { GHOST, ME, SYSTEM, type Character, type Difficulty, type ID, type Post, type RepStatus, type Scenario, type SpeechRegister } from '../types';
import { cutText, formatCount, hashStr } from '../utils';
import type { AIContext, CastInfo } from './types';

// ───────────────────────── 시나리오 → AIContext

export function buildContext(sc: Scenario): AIContext {
  // 공통 캐릭터를 끈 경우 등: inactive 이거나 cast 에 없는 인물은 AI에게 보이지 않는다
  const chars = sc.cast.map((id) => sc.characters[id]).filter((c): c is Character => !!c && !c.inactive);
  // 빼 둔 화제: 그 낱말이 든 글·쪽지·기억은 AI에게 넘기지 않는다(원치 않는 전개를 끊는다)
  const avoid = (sc.avoid ?? []).filter(Boolean);
  const hit = (t: string | undefined) => hitsAvoid(avoid, t);
  const authorName = (p: Post) => {
    if (p.authorId === ME) return `${sc.persona.name}(플레이어)`;
    if (p.authorId === SYSTEM) return '시스템';
    if (p.authorId === GHOST) return p.ghost?.name ?? '일반인';
    return sc.characters[p.authorId]?.name ?? '알 수 없음';
  };
  const feedPosts = sc.feed.map((id) => sc.posts[id]).filter((p): p is Post => !!p && !hit(p.text));
  const recent = feedPosts
    .slice(0, 10)
    .reverse()
    .map((p) => {
      // 이어 쓴 글(재게시해서 그 밑에 쓴 글)은 앞 글과 함께 읽혀야 뜻이 통한다 → 앞 글을 같이 넘긴다
      const q = p.quote?.[p.quote.length - 1];
      const lead = q && !hit(q.text) ? `[${q.authorId === ME ? '자기' : q.name} 글 "${cutText(q.text.replace(/\s+/g, ' '), 40)}"에 이어서] ` : '';
      return { author: authorName(p), text: lead + p.text, authorId: p.authorId };
    });
  const t = getWorldTemplate(sc.world.templateId);
  // 인물끼리의 마음(누가 누구를 사랑하는지)
  const pool = lovables(sc);
  const lovedBy = new Map<ID, { name: string; v: number }[]>();
  for (const a of pool) {
    for (const b of pool) {
      const v = a.id === b.id ? 0 : loveOf(a, b.id);
      if (v > 0) lovedBy.set(b.id, [...(lovedBy.get(b.id) ?? []), { name: a.name, v }]);
    }
  }
  // 인물별 최근 공개 발언(글·답글) 최신 3개 — 한 번 훑어서 모은다
  const castIds = new Set(chars.map((c) => c.id));
  const saidBy = new Map<ID, { k: number; line: string }[]>();
  for (const p of Object.values(sc.posts)) {
    if (!castIds.has(p.authorId) || !p.text || hit(p.text)) continue;
    const k = p.at.day * 1440 + p.at.hour * 60 + p.at.minute;
    const parent = p.parentId ? sc.posts[p.parentId] : undefined;
    const where = parent ? (parent.authorId === ME ? '플레이어 글에 답글' : '답글') : '글';
    const arr = saidBy.get(p.authorId) ?? [];
    arr.push({ k, line: `(${where}) ${p.text.replace(/\s+/g, ' ').slice(0, 70)}` });
    saidBy.set(p.authorId, arr);
  }
  const recentSaidOf = (id: ID) =>
    (saidBy.get(id) ?? [])
      .sort((a, b) => b.k - a.k)
      .slice(0, 3)
      .reverse()
      .map((x) => x.line);

  return {
    world: {
      templateId: sc.world.templateId,
      name: sc.world.name,
      setting: sc.world.setting,
      tone: sc.world.tone,
      vocab: sc.world.vocab,
      tag: sc.world.tag,
    },
    persona: {
      name: sc.persona.name,
      handle: sc.persona.handle,
      role: sc.persona.role,
      bio: sc.persona.bio,
      description: sc.persona.description,
    },
    stats: {
      followers: sc.stats.followers,
      level: sc.stats.level,
      aura: sc.stats.aura,
      humor: sc.stats.humor,
      reputation: sc.stats.reputation,
      status: sc.stats.status,
    },
    clock: sc.clock,
    cast: chars.map((c): CastInfo => {
      // 이 인물이 꺼내지 않는 화제(캐릭터 설정)까지 합쳐서, 그 낱말이 든 소개·특성 문장·쪽지·최근 글은 넘기지 않는다
      const own = (c.avoid ?? []).filter(Boolean);
      const all = own.length ? [...avoid, ...own] : avoid;
      const hitC = (t: string | undefined) => hitsAvoid(all, t);
      const msgs = (sc.dms[c.id]?.messages ?? []).filter((m) => m.from !== 'system' && !hitC(m.text));
      return {
        id: c.id,
        name: c.name,
        handle: c.handle,
        archetype: c.archetype,
        bio: scrubAvoid(all, c.bio),
        description: scrubAvoid(all, c.description),
        relations: scrubAvoid(all, c.relations) || undefined,
        ...(own.length ? { avoid: own } : {}),
        ...(c.title ? { title: c.title } : {}),
        ...(c.age ? { age: c.age } : {}),
        affinity: c.affinity,
        followsMe: c.followsMe,
        iFollow: c.iFollow,
        isNews: !!c.isNews,
        tier: c.tier ?? 'core',
        badge: c.badge ?? null,
        followers: c.followers,
        recentDM: msgs.slice(-4).map((m) => `${m.from === 'me' ? '플레이어' : c.name}: ${m.text}`),
        relation: c.tier !== 'crowd' && !c.isNews ? c.relation : undefined,
        crowdRole: c.crowdRole,
        register: registerOf(c),
        romance: c.romance ?? 0,
        devotion: c.devotion ?? 0,
        ...(c.rosterId ? { realPerson: true } : {}),
        gender: genderOf(c),
        ageGroup: c.ageGroup,
        personality: c.personality,
        speechStyle: c.speechStyle,
        dmTs: msgs.length ? msgs[msgs.length - 1].ts : 0,
        recentSaid: own.length ? recentSaidOf(c.id).filter((x) => !hitsAvoid(own, x)) : recentSaidOf(c.id),
        ...loveInfo(sc, c, lovedBy.get(c.id), hitC),
      };
    }),
    recent,
    memory: sc.memory.filter((m) => !hit(m)).slice(-12),
    scenes: (t?.scenes ?? []).map((s) => ({ key: s.key, desc: s.prompt.split(',').slice(0, 2).join(',').slice(0, 60) })),
    difficulty: sc.difficulty ?? 'normal',
    romanceLevel: sc.romanceLevel ?? 'racy',
    trends: (sc.trends ?? [])
      .filter((x) => !hit(x.tag))
      .slice(0, 6)
      .map((x) => x.tag),
    quests: (sc.quests ?? [])
      .filter((q) => !q.done && !hit(q.title) && !(q.keyword ?? []).some((k) => hit(k)))
      .slice(0, 4)
      .map((q) => ({ title: q.title, keyword: q.keyword })),
    pendingEvents: (sc.events ?? []).filter((e) => e.status === 'pending' && !hit(e.title)).map((e) => e.title),
    ...(avoid.length ? { avoid } : {}),
    heartAsk: heartTargets(sc, 3).map((c) => c.id),
    postedToday: [...new Set(sc.feed.map((id) => sc.posts[id]).filter((p) => !!p && p.kind !== 'reply' && p.at.day === sc.clock.day && castIds.has(p.authorId) && !sc.characters[p.authorId]?.isNews).map((p) => sc.characters[p.authorId].handle))],
    touchAsk: touchCandidates(sc)
      .filter((x) => !hit(x.act))
      .map((x) => ({ id: x.c.id, act: x.act })),
    myRecent: feedPosts
      .filter((p) => p.authorId === ME && p.kind === 'post' && p.text)
      .slice(0, 3)
      .reverse()
      .map((p) => p.text),
  };
}

/** 한 인물의 마음 정보: 사랑하는 인물·가장 큰 쪽·받는 마음·무관심·질투·속마음·플레이어와 한 스킨십 */
function loveInfo(sc: Scenario, c: Character, lovedBy: { name: string; v: number }[] | undefined, hit: (t: string | undefined) => boolean): Partial<CastInfo> {
  const heartOk = heartEligible(sc, c);
  if (!canLove(c)) return { ...(heartOk ? { heartOk } : {}), ...(c.heart && heartOk && !hit(c.heart) ? { heart: c.heart } : {}) };
  const loves = Object.entries(c.loves ?? {})
    .filter(([to, v]) => v > 0 && lovable(sc.characters[to]))
    .map(([to, v]) => ({ name: sc.characters[to].name, v: Math.round(v) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 3);
  const top = topLove(sc, c);
  const jealous = jealousOf(sc, c).map((x) => x.name);
  const touch = (c.touch ?? []).map((t) => t.act).filter((a) => !hit(a));
  return {
    ...(loves.length ? { loves } : {}),
    ...(top && (loves.length || top.id !== 'me') ? { loveTop: top.id === 'me' ? '플레이어' : top.name } : {}),
    ...(lovedBy?.length ? { lovedBy: [...lovedBy].sort((a, b) => b.v - a.v).slice(0, 3) } : {}),
    ...(c.loveOff && !loves.length ? { loveOff: true } : {}),
    ...(jealous.length ? { jealous } : {}),
    ...(heartOk ? { heartOk } : {}),
    ...(c.heart && heartOk && !hit(c.heart) ? { heart: c.heart } : {}),
    ...(touch.length ? { touch } : {}),
  };
}

/** 한 인물과 둘이 하는 일(쪽지)용 맥락: 그 인물이 꺼내지 않는 화제를 빼 둔 화제에 합친다 */
export function withCharAvoid(ctx: AIContext, characterId: ID): AIContext {
  const own = ctx.cast.find((c) => c.id === characterId)?.avoid;
  if (!own?.length) return ctx;
  return { ...ctx, avoid: [...new Set([...(ctx.avoid ?? []), ...own])] };
}

/** 빼 둔 화제가 들어 있는 글인지(띄어쓰기·대소문자 무시) */
export function hitsAvoid(avoid: string[] | undefined, text: string | undefined): boolean {
  if (!avoid?.length || !text) return false;
  const t = text.replace(/\s+/g, '').toLowerCase();
  return avoid.some((w) => t.includes(w.replace(/\s+/g, '').toLowerCase()));
}

/** 요약 글에서 빼 둔 화제가 든 문장만 덜어 낸다(쪽지 요약 등) */
export function scrubAvoid(avoid: string[] | undefined, text: string | undefined): string {
  if (!text || !avoid?.length || !hitsAvoid(avoid, text)) return text ?? '';
  return sentences(text)
    .filter((s) => !hitsAvoid(avoid, s))
    .join(' ');
}

// ───────────────────────── 글자 줄이기

/** 공백 정리 + 길이 제한(넘치면 …) */
export function clip(text: string | undefined, max: number): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${cutText(t, max - 1).trimEnd()}…` : t;
}

/** 문장 단위로 자르기(정규식 뒤돌아보기 없이) */
function sentences(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    cur += text[i];
    if (/[.!?。]/.test(text[i]) && (text[i + 1] === ' ' || i === text.length - 1)) {
      out.push(cur.trim());
      cur = '';
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * 성격 설명 안의 "존댓말/반말" 지시가 지금 말투 등급과 다르면 등급으로 바꿔 읽힌다(AI 혼동 방지).
 * 말투 등급은 관계·호감도로 게임이 정한 값이라 설명보다 우선한다(성격·말버릇·이모지 같은 스타일은 그대로).
 */
export function alignRegister(desc: string, register: CastInfo['register']): string {
  if (!desc) return desc;
  if (register === 'banmal') return desc.replace(/(정중한 |정돈된 |깍듯한 |부드러운 )?(존댓말|존대|해요체|높임말|합쇼체)(\s*\([^)]*\))?/g, '$1반말');
  if (register === 'haeyo') return desc.replace(/(완전 |100% |늘 |항상 )?(반말|평어체|평어)(\s*\([^)]*\))?/g, '해요체').replace(/(합쇼체|다나까)/g, '해요체');
  return desc.replace(/(완전 |100% |늘 |항상 )?(반말|평어체|평어|해요체)(\s*\([^)]*\))?/g, '격식 존댓말');
}

const STYLE_KEYS = /말투|말버릇|이모지|문장|반말|존댓말|음슴체|플레이어/;
const TASTE_KEYS = /반응|싫어|좋아|절대|안 쓴|속으로|질투|태도/;

/**
 * 긴 성격 설명 → max자 요약: 첫 문장(누구인지) + 말투·플레이어 대하는 태도 문장을 우선 남긴다(원래 순서 유지).
 */
export function digest(desc: string, max: number): string {
  const t = desc.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const ss = sentences(t);
  if (ss.length <= 1) return clip(t, max);
  const rank = (s: string, i: number) => (i === 0 ? 3 : STYLE_KEYS.test(s) ? 2 : TASTE_KEYS.test(s) ? 1 : 0);
  const order = ss.map((s, i) => ({ s, i, r: rank(s, i) })).sort((a, b) => b.r - a.r || a.i - b.i);
  const keep = new Set<number>();
  let len = 0;
  for (const o of order) {
    const add = Math.min(o.s.length, o.i === 0 ? 70 : o.s.length) + 1;
    if (len + add > max) continue;
    keep.add(o.i);
    len += add;
  }
  const out = ss
    .map((s, i) => (keep.has(i) ? (i === 0 ? clip(s, 70) : s) : null))
    .filter(Boolean)
    .join(' ');
  return out || clip(t, max);
}

// ───────────────────────── 인물 한 줄

const BADGE_SHORT = { blue: '파란인증', gold: '금색인증', gray: '회색인증' } as const;
const STATUS_LABEL: Record<RepStatus, string> = { normal: '보통', rising: '상승세', viral: '떡상', controversy: '논란', cancelled: '캔슬' };
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: '쉬움', normal: '보통', hard: '어려움' };

/** 관계(핵심 인물) 또는 분류(일반 계정) 이름 */
export function kindLabel(c: CastInfo): string {
  if (c.tier !== 'crowd' && !c.isNews && c.relation) return RELATION_LABEL[c.relation];
  if (c.crowdRole) return CROWD_LABEL[c.crowdRole];
  return c.isNews ? '언론' : '일반';
}

export const registerText = (c: CastInfo) => REGISTER_LABEL[c.register] ?? '해요체';

function presetLabel(id: string | undefined, list: { id: string; label: string; desc: string }[], desc: string): string {
  if (!id) return '';
  const p = list.find((x) => x.id === id);
  const label = p?.label ?? id;
  if (desc.includes(label)) return ''; // 설명에 이미 들어 있음
  return p ? `${p.label}(${p.desc})` : id;
}

/** 자세한 인물 항목(이번 일의 중심 인물). said=false면 최근 글(말투 표본) 줄을 뺀다(따로 보여 줄 때) */
export function fullEntry(c: CastInfo, descMax = 160, opts: { said?: boolean } = {}): string {
  const head = [
    `@${c.handle} ${c.name}`,
    `${kindLabel(c)} | 플레이어에게 ${registerText(c)}`,
    `호감${c.affinity}${c.romance > 0 && !c.realPerson ? ` 설렘${c.romance}` : ''}${c.devotion > 0 ? ` 정복${c.devotion}` : ''}`,
    c.realPerson ? '연애X(실존 인물일 수 있음)' : c.ageGroup === 10 ? '연애X(10대)' : '',
    [c.tier !== 'crowd' && c.crowdRole && c.crowdRole !== 'public' ? CROWD_LABEL[c.crowdRole] : '', c.badge ? BADGE_SHORT[c.badge] : '', `팔로워${formatCount(c.followers)}`]
      .filter(Boolean)
      .join('·'),
    [c.age ? `${c.age}살` : c.ageGroup ? `${c.ageGroup}대` : '', c.gender ? (c.gender === 'f' ? '여' : '남') : ''].filter(Boolean).join(' '),
    c.title ? `자리: ${clip(c.title, 16)}` : '',
    [presetLabel(c.personality, PERSONALITY_PRESETS, c.description), presetLabel(c.speechStyle, SPEECH_PRESETS, c.description)].filter(Boolean).join('·'),
    c.followsMe && c.iFollow ? '맞팔' : c.followsMe ? '플레이어를 팔로우' : c.iFollow ? '플레이어가 팔로우' : '',
  ].filter(Boolean);
  const lines = [`- ${head.join(' | ')}`];
  const desc = digest(alignRegister(c.description ?? '', c.register), descMax);
  if (desc) lines.push(`  특성: ${desc}`);
  if (c.bio && (c.description ?? '').length < 60) lines.push(`  소개: ${clip(c.bio, 50)}`);
  if (c.relations) lines.push(`  관계: ${clip(c.relations, 60)}`);
  if (c.avoid?.length) lines.push(`  꺼내지 않는 화제: ${c.avoid.map((w) => clip(w, 20)).join(' · ')} (이 인물은 이 낱말·소재를 절대 말하지 않는다)`);
  if (c.loves?.length) {
    const all = [...c.loves.map((l) => `${l.name} ${l.v}`), ...(c.romance > 0 && !c.realPerson ? [`플레이어 ${c.romance}`] : [])];
    lines.push(`  사랑: ${all.join(' · ')}${c.loveTop ? ` → 마음이 가장 큰 쪽은 ${c.loveTop}(그쪽을 따라간다)` : ''}`);
  }
  if (c.lovedBy?.length) lines.push(`  받는 마음: ${c.lovedBy.map((l) => `${l.name} ${l.v}`).join(' · ')}(본인은 수치를 모른다)`);
  if (c.loveOff) lines.push('  연애 무관심: 일·자기 생활이 먼저다. 특별한 계기 없이는 누구에게도 연애 감정을 드러내지 않는다');
  if (c.jealous?.length) lines.push(`  질투: 좋아하는 ${c.jealous.join('·')}이(가) 플레이어에게 마음이 있다 → 그 장면에서는 플레이어를 견제하거나 삐딱해진다(매번은 아님)`);
  if (c.touch?.length) lines.push(`  스킨십: 플레이어와 ${c.touch.map((a) => clip(a, 14)).join('·')}까지 실제로 한 사이`);
  if (c.heart) lines.push(`  속마음(본인만 안다): ${clip(c.heart, 44)}`);
  if (c.recentDM.length) lines.push(`  둘만의 쪽지: ${c.recentDM.slice(-2).map((m) => clip(m, 45)).join(' / ')}`);
  // 본인이 실제로 쓴 최신 글 한 줄 = 그 인물 말투의 표본(지어낸 예시보다 낫다)
  if (opts.said !== false && c.recentSaid?.length) lines.push(`  최근 글: ${clip(c.recentSaid[c.recentSaid.length - 1], 50)}`);
  return lines.join('\n');
}

/** 짧은 인물 항목(곁다리) */
export function briefEntry(c: CastInfo): string {
  const first = sentences(alignRegister((c.description || c.bio || '').replace(/\s+/g, ' ').trim(), c.register))[0] ?? '';
  const trait = clip(first, 40);
  const seat = [c.title ? clip(c.title, 12) : '', c.age ? `${c.age}살` : ''].filter(Boolean).join(' ');
  return `- @${c.handle} ${c.name}${seat ? `(${seat})` : ''} | ${kindLabel(c)}·${registerText(c)} | 호감${c.affinity}${c.devotion >= 30 ? ` 정복${c.devotion}` : ''}${c.realPerson || c.ageGroup === 10 ? ' | 연애X' : ''}${trait ? ` | ${trait}` : ''}${c.avoid?.length ? ` | 금지 화제: ${c.avoid.map((w) => clip(w, 12)).join('·')}` : ''}${c.loves?.length ? ` | 사랑→${c.loves[0].name}${c.loves[0].v}` : ''}${c.loveOff ? ' | 연애 무관심' : ''}${c.jealous?.length ? ` | 질투(${c.jealous[0]})` : ''}`;
}

// ───────────────────────── 이번 일에 넣을 인물 고르기

export interface CastPick {
  /** 자세히 */
  full: CastInfo[];
  /** 한 줄 */
  brief: CastInfo[];
  /** 일반 유저 한 줄 */
  crowd: CastInfo[];
}

export interface PickOpts {
  /** 꼭 자세히 넣을 인물(쪽지 상대·답글 대상·이벤트 관련 인물) */
  must?: ID[];
  /** 이 글에 @멘션된 인물은 자세히 */
  text?: string;
  full?: number;
  brief?: number;
  crowd?: number;
  /** 매번 다른 사람이 나오게 섞기(타임라인 새 글 등) */
  shuffle?: boolean;
  /** 섞기·일반 유저 고르기 씨앗(같은 값이면 같은 결과) */
  seed?: string;
  /** 일반 유저 중 먼저 넣을 분류 */
  crowdFirst?: CharacterTypeLike[];
}
type CharacterTypeLike = NonNullable<CastInfo['crowdRole']>;

const STRONG_REL = new Set(['lover', 'bestie', 'spicy', 'rival', 'enemy', 'family']);

/** 글에 나온 인물: @아이디 또는 이름(한글 2자 이상 부분) */
export function mentionedIds(ctx: AIContext, text: string): ID[] {
  if (!text) return [];
  const out: ID[] = [];
  const lower = text.toLowerCase();
  for (const m of text.matchAll(/@([a-zA-Z0-9_]+)/g)) {
    const c = ctx.cast.find((x) => x.handle.toLowerCase() === m[1].toLowerCase());
    if (c && !out.includes(c.id)) out.push(c.id);
  }
  // 이름으로 찾기는 핵심 인물만(일반 유저 닉네임은 흔한 단어라 헷갈림)
  for (const c of ctx.cast) {
    if (out.includes(c.id) || c.tier === 'crowd') continue;
    const ko = (c.name.match(/[가-힣]{2,}/g) ?? []).filter((w) => w !== ctx.persona.name && !['팀장', '선배', '공식', '소식'].includes(w));
    if (ko.some((w) => lower.includes(w))) out.push(c.id);
  }
  return out;
}

export function pickCast(ctx: AIContext, o: PickOpts = {}): CastPick {
  const nFull = o.full ?? 6;
  const nBrief = o.brief ?? 4;
  const nCrowd = o.crowd ?? 6;
  let h = hashStr(o.seed ?? `${ctx.clock.day}:${ctx.clock.hour}:${ctx.clock.minute}`);
  const rnd = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    return (h % 10000) / 10000;
  };
  const byId = new Map(ctx.cast.map((c) => [c.id, c]));
  const used = new Set<ID>();
  const full: CastInfo[] = [];
  const take = (c: CastInfo | undefined) => {
    if (!c || used.has(c.id)) return;
    used.add(c.id);
    full.push(c);
  };
  for (const id of o.must ?? []) take(byId.get(id));
  for (const id of mentionedIds(ctx, o.text ?? '')) take(byId.get(id));

  // 핵심 인물 점수: 호감 크기 + 설렘 + 최근 쪽지 + 진한 관계
  const core = ctx.cast.filter((c) => c.tier !== 'crowd' && !c.isNews && !used.has(c.id));
  const dmOrder = [...ctx.cast].filter((c) => (c.dmTs ?? 0) > 0).sort((a, b) => (b.dmTs ?? 0) - (a.dmTs ?? 0));
  const dmBonus = new Map<ID, number>(dmOrder.slice(0, 3).map((c, i) => [c.id, [40, 28, 16][i]]));
  const score = (c: CastInfo) =>
    Math.abs(c.affinity) + c.romance * 0.6 + (dmBonus.get(c.id) ?? 0) + (c.relation && STRONG_REL.has(c.relation) ? 15 : 0) + (c.followsMe ? 4 : 0) + (o.shuffle ? rnd() * 70 : 0);
  const ranked = core.map((c) => ({ c, s: score(c) })).sort((a, b) => b.s - a.s).map((x) => x.c);
  for (const c of ranked) {
    if (full.length >= nFull) break;
    take(c);
  }
  const brief = ranked.filter((c) => !used.has(c.id)).slice(0, nBrief);
  brief.forEach((c) => used.add(c.id));

  // 일반 유저: 팬·안티·셀럽·협찬 등을 골고루, 씨앗으로 섞기
  const first = new Set(o.crowdFirst ?? []);
  const crowdPool = ctx.cast
    .filter((c) => c.tier === 'crowd' && !c.isNews && !used.has(c.id))
    .map((c) => ({ c, s: (c.crowdRole && first.has(c.crowdRole) ? 1 : 0) + rnd() }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c);
  return { full, brief, crowd: crowdPool.slice(0, nCrowd) };
}

/** 고른 인물 → 프롬프트 블록 */
export function castBlock(p: CastPick, opts: { descMax?: number; firstDescMax?: number } = {}): string {
  const out: string[] = [];
  if (p.full.length) out.push('[인물]', ...p.full.map((c, i) => fullEntry(c, i === 0 && opts.firstDescMax ? opts.firstDescMax : (opts.descMax ?? 160))));
  if (p.brief.length) out.push('[그 밖의 인물]', ...p.brief.map(briefEntry));
  if (p.crowd.length) out.push('[일반 유저]', ...p.crowd.map(briefEntry));
  return out.join('\n');
}

/** 말투 등급 요약 한 줄(할 일 바로 위에 다시 알려 주면 AI가 더 잘 지킨다). 제일 큰 무리는 "나머지"로 줄여 글자를 아낀다 */
export function registerMap(p: CastPick): string {
  const groups: Record<SpeechRegister, string[]> = { banmal: [], haeyo: [], formal: [] };
  for (const c of [...p.full, ...p.brief, ...p.crowd]) groups[c.register]?.push(`@${c.handle}`);
  const label: Record<SpeechRegister, string> = { banmal: '반말(~요 금지)', haeyo: '해요체(야·너 금지)', formal: '존댓말(~습니다)' };
  const order: SpeechRegister[] = ['banmal', 'haeyo', 'formal'];
  const total = order.reduce((n, k) => n + groups[k].length, 0);
  if (!total) return '';
  const biggest = order.reduce((a, b) => (groups[b].length > groups[a].length ? b : a));
  const parts = order.filter((k) => k !== biggest && groups[k].length).map((k) => `${label[k]}: ${groups[k].join(' ')}`);
  parts.push(`나머지 ${label[biggest]}`);
  return `[말투 확인: 플레이어에게] ${parts.join(' / ')}`;
}

// ───────────────────────── 타임라인·기억·지금 상태

function speaker(r: AIContext['recent'][number]): string {
  if (r.authorId === ME) return '플레이어';
  return r.author.replace(/\(플레이어\)$/, '');
}

/** 최근 타임라인 n개(오래된 → 최신, 글은 len자까지) */
export function recentBlock(ctx: AIContext, n = 6, len = 60): string {
  const list = ctx.recent.slice(-n);
  if (!list.length) return '';
  return ['[최근 타임라인]', ...list.map((r) => `- ${speaker(r)}: ${clip(r.text, len)}`)].join('\n');
}

export function memoryBlock(ctx: AIContext, n = 8, len = 70): string {
  const list = ctx.memory.slice(-n);
  if (!list.length) return '';
  return ['[주요 사건]', ...list.map((m) => `- ${clip(m, len)}`)].join('\n');
}

/** 지금 시각·플레이어 수치·난이도 한 줄 */
export function nowLine(ctx: AIContext): string {
  const s = ctx.stats;
  const hh = String(ctx.clock.hour).padStart(2, '0');
  const mm = String(ctx.clock.minute).padStart(2, '0');
  return `[지금] ${ctx.clock.day}일차 ${hh}:${mm} | 플레이어 팔로워 ${s.followers.toLocaleString('ko-KR')}·Lv${s.level}·평판 ${s.reputation}(${STATUS_LABEL[s.status]})·아우라 ${s.aura}·유머 ${s.humor} | 난이도 ${DIFFICULTY_LABEL[ctx.difficulty] ?? '보통'}`;
}

/** 트렌드·진행 중 미션(제안 글 재료) */
export function hooksBlock(ctx: AIContext): string {
  const out: string[] = [];
  if (ctx.trends?.length) out.push(`[트렌드] ${ctx.trends.slice(0, 5).join(' ')}`);
  const qs = (ctx.quests ?? []).filter((q) => q.keyword?.length).slice(0, 2);
  if (qs.length) out.push(`[미션] ${qs.map((q) => `${clip(q.title, 30)}(키워드: ${q.keyword!.join(', ')})`).join(' / ')}`);
  if (ctx.myRecent?.length) out.push(`[플레이어 최근 글] ${ctx.myRecent.slice(-2).map((t) => `"${clip(t, 50)}"`).join(' / ')}`);
  return out.join('\n');
}
