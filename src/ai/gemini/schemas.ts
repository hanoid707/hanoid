/**
 * 제미나이 응답 형식(JSON 스키마, OpenAPI 하위 집합)
 * AI가 이 모양 그대로 답하도록 강제한다 → 게임 코드가 안전하게 읽을 수 있다.
 * - 필드 이름은 짧게(h=아이디, t=글, d=변화량): 출력 토큰은 입력보다 8배 비싸다.
 * - propertyOrdering: AI가 쓰는 순서(먼저 분위기·답글을 쓰고 숫자는 나중에).
 * - maxItems: 배열이 길어지지 않게.
 */

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
/** (v3.1) 답글 한 줄 + re: 인플루언서 답글에 다는 대댓글이면 그 계정 아이디 */
const LINE_RE = obj({ h: STR, t: STR, re: { type: 'STRING', nullable: true } }, ['h', 't']);

/** 내 글 반응: 답글 수(n)만큼만 */
export function reactSchema(n: number) {
  return obj({
    mood: MOOD,
    replies: arr(LINE_RE, Math.min(8, Math.max(1, n) + 3)),
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
  });
}

export const THREAD_SCHEMA = obj({
  replies: arr(LINE, 8),
  aff: arr(DELTA, 8),
  rom: arr(DELTA, 4),
  dev: arr(DELTA, 4),
  rep: INT,
});

export const DM_SCHEMA = obj(
  {
    mood: MOOD,
    messages: arr(STR, 3),
    affinityDelta: INT,
    romanceDelta: INT,
    devotionDelta: INT,
    leave: BOOL,
    /** 대화가 12줄 넘게 길어졌을 때만 요청 — 갱신된 이전 대화 요약 */
    sum: STR,
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
  choices: arr(obj({ id: STR, label: STR, hint: STR }), 3),
};

export const EVENT_SCHEMA = obj(EVENT_PROPS);

/** 필수(posts·news·trends·mission)를 먼저, 이유가 있을 때만 채우는 것(event·dm)은 뒤에 — 빠뜨림을 줄인다 */
export const TICK_SCHEMA = obj({
  posts: arr(LINE_M, 5),
  news: arr(STR, 1),
  trends: arr(obj({ tag: STR, n: INT }), 6),
  mission: obj({ title: STR, desc: STR, kw: arr(STR, 2) }),
  event: { ...obj(EVENT_PROPS), nullable: true },
  dm: arr(LINE, 2),
});

/** 이벤트 결과: 결과 문장 + 답을 보고 올라온 SNS 글(댓글 포함) + 여러 인물의 수치 */
export const OUTCOME_SCHEMA = obj({
  text: STR,
  posts: arr(obj({ h: STR, t: STR, c: arr(LINE, 3) }), 4),
  grade: INT,
  followers: INT,
  aura: INT,
  humor: INT,
  rep: INT,
  xp: INT,
  aff: arr(DELTA, 8),
  rom: arr(DELTA, 4),
  dev: arr(DELTA, 6),
});

export function commentsSchema(count: number) {
  return obj({ comments: arr(LINE_RE, Math.min(8, Math.max(1, count) + 3)) });
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
      followers: INT,
      isNews: BOOL,
      verified: BOOL,
    }),
    10,
  ),
});

export const PING_SCHEMA = obj({ ok: BOOL, message: STR });
