/**
 * 제미나이 응답 형식(JSON 스키마, OpenAPI 하위 집합)
 * AI가 이 모양 그대로 답하도록 강제한다 → 게임 코드가 안전하게 읽을 수 있다.
 * - 필드 이름은 짧게(h=아이디, t=글, d=변화량): 출력 토큰은 입력보다 8배 비싸다.
 * - propertyOrdering: AI가 쓰는 순서(먼저 분위기·답글을 쓰고 숫자는 나중에).
 * - maxItems: 배열이 길어지지 않게.
 */

import type { AITune } from '../../types';

const STR = { type: 'STRING' } as const;
const INT = { type: 'INTEGER' } as const;
const BOOL = { type: 'BOOLEAN' } as const;
const arr = (items: object, maxItems?: number) => (maxItems ? { type: 'ARRAY', items, maxItems: String(maxItems) } : { type: 'ARRAY', items });
const obj = (properties: Record<string, object>, required = Object.keys(properties)) => ({ type: 'OBJECT', properties, required, propertyOrdering: Object.keys(properties) });

const MOOD = { type: 'STRING', format: 'enum', enum: ['positive', 'negative', 'funny', 'apology', 'question', 'brag', 'neutral'] };
/** 한 사람의 한 줄(h = 아이디, 이름 없는 일반인은 "-") */
const LINE = obj({ h: STR, t: STR });
/** 사진 장면 key(m)를 붙일 수 있는 글 */
const LINE_M = obj({ h: STR, t: STR, m: { type: 'STRING', nullable: true } }, ['h', 't']);
const DELTA = obj({ h: STR, d: INT });
/** 인물끼리의 사랑 변화(h가 to를 향해 d) */
const LOVE = obj({ h: STR, to: STR, d: INT });
/** (v3.1) 답글 한 줄 + re: 인플루언서 답글에 다는 대댓글이면 그 계정 아이디 */
const LINE_RE = obj({ h: STR, t: STR, re: { type: 'STRING', nullable: true } }, ['h', 't']);

/** 내 글 반응: 답글 수(n)만큼만. 뒤따르는 공개 글(posts)·쪽지(dm)는 조절값에서 켠 경우만 */
export function reactSchema(n: number, t?: AITune) {
  return obj({
    mood: MOOD,
    replies: arr(LINE_RE, Math.max(1, n + 3)),
    aff: arr(DELTA, 8),
    rom: arr(DELTA, 4),
    dev: arr(DELTA, 6),
    quality: INT,
    viral: BOOL,
    followers: INT,
    aura: INT,
    humor: INT,
    rep: INT,
    news: arr(STR, 1),
    follow: arr(STR, 3),
    unfollow: arr(STR, 3),
    love: arr(LOVE, 3),
    ...(t && t.echoPosts > 0 ? { posts: arr(LINE, t.echoPosts) } : {}),
    ...(t && t.echoDMs > 0 ? { dm: arr(LINE, t.echoDMs) } : {}),
  });
}

/** 내 답글에 달리는 답글: 조절값(n)만큼만 */
export function threadSchema(n: number) {
  return obj({
    replies: arr(LINE_RE, Math.max(1, n)),
    aff: arr(DELTA, 8),
    rom: arr(DELTA, 4),
    dev: arr(DELTA, 4),
    rep: INT,
  });
}

/** 쪽지 답장: 말풍선 최대 수(조절값) */
export const dmSchema = (bubbles: number, withPost = false, withHeart = false) => obj(
  {
    mood: MOOD,
    messages: arr(STR, Math.max(1, bubbles)),
    affinityDelta: INT,
    romanceDelta: INT,
    devotionDelta: INT,
    leave: BOOL,
    /** 대화가 12줄 넘게 길어졌을 때만 요청 — 갱신된 이전 대화 요약 */
    sum: STR,
    touch: STR,
    ...(withHeart ? { heart: STR } : {}),
    ...(withPost ? { post: STR } : {}),
  },
  ['mood', 'messages', 'affinityDelta', 'romanceDelta', 'devotionDelta', 'leave'],
);

export function ambientSchema(count: number) {
  return obj({ posts: arr(LINE_M, Math.max(1, count)) });
}

const EVENT_PROPS = {
  emoji: STR,
  title: STR,
  body: STR,
  inv: arr(STR, 3),
};

export const EVENT_SCHEMA = obj(EVENT_PROPS);

/**
 * 하루 정산: 조절값에서 켠 항목만 넣는다(끈 항목은 아예 쓰지 않게).
 * 필수(posts·news·trends·mission)를 먼저, 이유가 있을 때만 채우는 것(event·dm)은 뒤에 — 빠뜨림을 줄인다
 */
export function tickSchema(t: AITune, returned = 0, hearts = 0) {
  const props: Record<string, object> = {};
  if (t.dayPosts > 0) props.posts = arr(LINE_M, t.dayPosts);
  if (t.dayNews) props.news = arr(STR, 1);
  if (t.dayTrends) props.trends = arr(obj({ tag: STR, n: INT }), 6);
  if (t.dayMission) props.mission = obj({ title: STR, desc: STR, kw: arr(STR, 2) });
  if (t.dayEvent) props.event = { ...obj(EVENT_PROPS), nullable: true };
  if (t.dayDMs > 0 || returned > 0) props.dm = arr(LINE, Math.max(1, t.dayDMs, returned));
  if (hearts > 0) props.hearts = arr(LINE, hearts);
  props.love = arr(LOVE, 3);
  return obj(props);
}

/** 이벤트 결과: 결과 문장 + 답을 보고 올라온 SNS 글(댓글 포함, 조절값이 0이면 없음) + 여러 인물의 수치 */
export function outcomeSchema(posts: number) {
  return obj({
    text: STR,
    ...(posts > 0 ? { posts: arr(obj({ h: STR, t: STR, c: arr(LINE, 3) }), posts) } : {}),
    grade: INT,
    followers: INT,
    aura: INT,
    humor: INT,
    rep: INT,
    xp: INT,
    aff: arr(DELTA, 8),
    rom: arr(DELTA, 4),
    dev: arr(DELTA, 6),
    love: arr(LOVE, 3),
  });
}

/** 인물 정보 채우기: 직함·나이·사랑에 관심 없음·사랑하는 인물 + 첫 속마음 */
export const BONDS_SCHEMA = obj({
  info: arr(obj({ h: STR, title: STR, age: INT, off: BOOL, loves: arr(obj({ to: STR, v: INT }), 2) }), 16),
  hearts: arr(LINE, 4),
});

export function commentsSchema(count: number) {
  return obj({ comments: arr(LINE_RE, Math.max(1, count) + 3) });
}

export const FIRST_DM_SCHEMA = obj({ messages: arr(STR, 2) });

export const DRAFT_SCHEMA = obj({ name: STR, handle: STR, bio: STR, emoji: STR, post: STR }, ['name', 'handle', 'bio', 'emoji']);

export const CAST_SCHEMA = obj({
  cast: arr(
    obj({
      name: STR,
      handle: STR,
      emoji: STR,
      archetype: { type: 'STRING', format: 'enum', enum: ['bestie', 'rival', 'fan', 'mentor', 'troll', 'news', 'crush', 'chaos', 'celeb'] },
      bio: STR,
      description: STR,
      g: { type: 'STRING', format: 'enum', enum: ['m', 'f'] },
      age: INT,
      title: STR,
      followers: INT,
      isNews: BOOL,
      verified: BOOL,
    }),
    10,
  ),
});

export const PING_SCHEMA = obj({ ok: BOOL, message: STR });
