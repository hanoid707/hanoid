/**
 * AI 엔진 인터페이스 — "AI가 필요한 자리"를 전부 이 파일 하나에 모았다.
 *
 * 게임 로직(src/game)은 AI에게 "무슨 일이 일어났는지"만 묻고, 받은 결과를 규칙에 맞게 적용한다.
 * - 제미나이 엔진(gemini): 실제 구글 AI를 부른다. 앱은 내 API 키로, claude.ai 페이지는 Supabase DB를 거쳐.
 * - 클로드 엔진(claude): 클로드 아티팩트 페이지 안에서만. 보는 사람의 Claude 사용량으로 부른다.
 * 새 AI(다른 회사 모델 등)를 붙이고 싶으면 이 인터페이스만 구현하면 된다.
 */
import type { AgeGroup, AITune, Archetype, BadgeKind, CharacterType, CrowdRole, Deltas, Difficulty, EventChoice, GameEvent, GameTime, Gender, GhostAuthor, ID, RelationKind, RepStatus, RomanceLevel, SpeechRegister, Trend } from '../types';

export type Mood = 'positive' | 'negative' | 'funny' | 'apology' | 'question' | 'brag' | 'neutral';

/** AI에게 넘기는 세계 요약(프롬프트 재료) */
export interface AIContext {
  world: {
    templateId: string | null;
    name: string;
    setting: string;
    tone: string;
    vocab: string[];
    tag: string;
  };
  persona: { name: string; handle: string; role: string; bio: string; description: string };
  stats: { followers: number; level: number; aura: number; humor: number; reputation: number; status: RepStatus };
  clock: GameTime;
  cast: CastInfo[];
  /** 최근 타임라인(오래된 → 최신). authorId: (v3) 작성자 ID('me' = 플레이어) */
  recent: { author: string; text: string; authorId?: ID }[];
  /** 중요한 사건 기억 */
  memory: string[];
  /** 게시물에 붙일 수 있는 사진 장면(key: 설명) */
  scenes: { key: string; desc: string }[];
  /** 난이도(AI가 결과를 얼마나 냉정하게 매길지 참고) */
  difficulty: Difficulty;
  /** 연애·플러팅 수위(기본 normal) — 나 탭에서 사용자가 직접 조절 */
  romanceLevel: RomanceLevel;
  /** (v3) 지금 트렌드 해시태그(상위 몇 개) — 제안·미션 재료 */
  trends?: string[];
  /** (v3) 진행 중인 미션(오늘의 미션 키워드 포함) */
  quests?: { title: string; keyword?: string[] }[];
  /** (v3) 아직 답하지 않은 이벤트 제목(새 이벤트가 겹치지 않게) */
  pendingEvents?: string[];
  /** (v3) 플레이어가 최근에 올린 글(오래된 → 최신) — 제안 글이 말투를 따라가게 */
  myRecent?: string[];
  /** 빼 둔 화제(플레이어가 이야기에서 빼 달라고 한 낱말) — 맥락에서는 이미 빠져 있고, AI도 쓰지 않는다 */
  avoid?: string[];
  /** AI 조절값(답글·쪽지·새 글 수 …). 게임이 호출 직전에 붙인다(core.ctxOf). 없으면 기본값 */
  tune?: AITune;
}

export interface CastInfo {
  id: ID;
  name: string;
  handle: string;
  archetype: Archetype;
  /** 프로필 자기소개 */
  bio: string;
  /** 사용자가 직접 입력한 성격·특성·행동 규칙 */
  description: string;
  relations?: string;
  affinity: number;
  followsMe: boolean;
  iFollow: boolean;
  isNews: boolean;
  tier: 'core' | 'crowd';
  badge: BadgeKind | null;
  followers: number;
  /** 플레이어와 나눈 최근 쪽지(오래된 → 최신) */
  recentDM: string[];
  /** core: 나와의 관계 / crowd: 분류 */
  relation?: RelationKind;
  crowdRole?: CrowdRole;
  /** 플레이어에게 쓰는 말투(게임 규칙이 정한 값 — AI는 그대로 따른다) */
  register: SpeechRegister;
  /** 설렘 0~100 */
  romance: number;
  /** 정복도 0~100 */
  devotion: number;
  /** 공통 캐릭터(사용자가 넣은 계정 — 실존 인물일 수 있음): 연애·성적 반응 금지 */
  realPerson?: boolean;
  gender?: Gender;
  ageGroup?: AgeGroup;
  /** 성격 유형(MBTI 등)·말투 프리셋(선택) */
  personality?: string;
  speechStyle?: string;
  /** (v3) 플레이어와 마지막으로 쪽지를 주고받은 시각(ms, 없으면 0) — 프롬프트에 자세히 넣을 인물 고르기용 */
  dmTs?: number;
  /** (v3) 이 인물이 최근 공개적으로 한 말(글·답글, 최신 3개) — 쪽지에서 앞뒤가 맞게 */
  recentSaid?: string[];
}

export interface GeneratedLine {
  /** 캐릭터 ID. 이름 없는 일반인이 쓴 줄이면 GHOST('__ghost') + ghost 정보 */
  authorId: ID;
  text: string;
  /** 첨부 사진 장면 key(세계관 scenes) */
  media?: string;
  /** (v3) authorId === GHOST 일 때 임시 계정 정보 → 게임이 Post.ghost 에 그대로 넣는다 */
  ghost?: GhostAuthor;
  /** (v3.1) 인플루언서 답글에 달린 답글이면 그 인플루언서의 ID → 게임이 그 답글 아래(대댓글)에 붙인다 */
  replyTo?: ID;
  /** (v3.2) 이 글에 같이 달린 댓글(이벤트 반응 글 등) */
  comments?: GeneratedLine[];
}

/** 내 글에 대한 세계의 반응(한 번 호출로 여러 사람의 반응을 한꺼번에 받는다) */
export interface PostReaction {
  mood: Mood;
  /** AI가 쓴 문맥 있는 답글(핵심 인물 + 일반 유저, 기본 5~6개 + 인플루언서 대댓글 2~3개, 최대 8개) */
  replies: GeneratedLine[];
  likes: number;
  reposts: number;
  viral: boolean;
  /** 글의 매력도 0~100(참여 수치 계산 재료) */
  quality: number;
  deltas: Deltas;
  /** 뉴스 계정이 쓸 기사 제목들 */
  news: string[];
  newFollowers: ID[];
  unfollowers: ID[];
  /** 다음에 올릴 만한 글 제안(완성된 글 1~2줄, 0~2개) — 글쓰기 화면이 따로 호출하지 않고 재사용 */
  ideas: string[];
  /** 내 글을 보고 인물이 자기 계정에 따로 올리는 글(같은 일을 자기 쪽에서 이어 감) */
  echoPosts?: GeneratedLine[];
  /** 내 글을 보고 따로 보내는 쪽지 */
  openers?: GeneratedLine[];
}

/** 답글 스레드에서 캐릭터가 되받아치는 반응 */
export interface ThreadReaction {
  replies: GeneratedLine[];
  deltas: Deltas;
}

/** DM 답장 */
export interface DMReaction {
  mood: Mood;
  messages: string[];
  /** 상대가 대화방을 나가는지 */
  leave: boolean;
  affinityDelta: number;
  /** 설렘 변화 */
  romanceDelta: number;
  /** 정복도 변화 */
  devotionDelta: number;
  /** 대화가 길어졌을 때(12줄 넘음) AI가 새로 갱신한 이전 대화 요약 — 다음 호출의 priorSummary로 저장 */
  historySummary?: string;
  /** 이 대화 뒤에 그 인물이 자기 계정에 올리는 공개 글(가끔) */
  post?: string;
}

export interface EventDraft {
  emoji: string;
  title: string;
  body: string;
  involved: ID[];
  choices: EventChoice[];
  templateKey?: string;
}

export interface EventOutcome {
  /** 이벤트 화면에 보이는 결과 한두 문장(타임라인 글로는 올리지 않는다) */
  text: string;
  /** affinity·romance·devotion 포함(관련된 여러 인물). 게임 규칙이 난이도에 맞게 키우거나 줄인다 */
  deltas: Deltas;
  /** (v3.2) 플레이어의 답을 보고 인물·일반인이 올린 SNS 글(각 글에 댓글 1~3개) */
  posts: GeneratedLine[];
  /** 답의 질 -2(최악) ~ +2(최고) — 난이도 보정에 쓰인다 */
  grade: number;
}

/** 하루가 지날 때 세계가 움직이는 결과 */
export interface TickResult {
  npcPosts: GeneratedLine[];
  news: string[];
  trends: Trend[];
  event: EventDraft | null;
  dmOpeners: GeneratedLine[];
  mission: { title: string; desc: string; keyword: string[] } | null;
  /** 다음 글 제안(0~2개) */
  ideas: string[];
  /** 최근 일로 자기소개가 바뀐 인물(0~1명, 플레이어와 가까운 인물만) */
  bios: { id: ID; bio: string }[];
}

/** 캐릭터 만들기: 유형·특징 → 이름·아이디·자기소개 */
export interface CharacterDraftArgs {
  type: CharacterType;
  gender: Gender;
  ageGroup: AgeGroup;
  followers: number;
  traits: string;
  personality?: string;
  speechStyle?: string;
  /** 비어 있으면 AI가 지어 준다 */
  name?: string;
  handle?: string;
  /** (v3) 자기소개 다시 쓰기: 지금 소개(이것과 다르게 쓴다) */
  currentBio?: string;
}

export interface CharacterDraft {
  name: string;
  handle: string;
  bio: string;
  emoji: string;
  /** (v3.1) 새로 등장하며 올리는 첫 글(없으면 글 없이 등장) */
  post?: string;
}

export interface CastDraft {
  name: string;
  handle: string;
  emoji: string;
  archetype: Archetype;
  bio: string;
  description: string;
  /** 성별·나이(기본 사진 고르기용, 뉴스 계정은 없음) */
  gender?: Gender;
  age?: number;
  followers: number;
  isNews?: boolean;
  verified?: boolean;
}

export interface AIEngine {
  readonly id: 'gemini' | 'claude';
  /**
   * 내가 글을 올렸을 때: 답글·좋아요·팔로워·스탯 변화(+다음 글 제안).
   * opts.replies = AI가 써 줄 답글 수(팔로워 규모로 게임이 정함). (v3.1) 답글은 전부 AI가 글 내용에 맞춰 쓴다(로컬 채우기 없음).
   */
  reactToPost(ctx: AIContext, post: { id: ID; text: string; hasMedia?: boolean }, opts: { replies: number }): Promise<PostReaction>;
  /** 내가 캐릭터 글에 답글을 달았을 때: 그 캐릭터의 되받아치기 */
  replyInThread(
    ctx: AIContext,
    args: {
      root: { authorId: ID; text: string };
      /** name: 이름 없는 일반인(임시 계정)일 때 그 사람의 표시 이름 */
      target: { authorId: ID; text: string; name?: string };
      reply: string;
      /** 원글부터 내 답글 직전까지의 흐름(name: 일반인 표시 이름) */
      thread?: { authorId: ID; text: string; name?: string }[];
    },
  ): Promise<ThreadReaction>;
  /** DM 답장(읽음 → 입력 중 → 답장, 또는 대화방 나가기) */
  dmReply(
    ctx: AIContext,
    args: { characterId: ID; history: { from: 'me' | 'them'; text: string }[]; message: string; priorSummary?: string },
  ): Promise<DMReaction>;
  /** 타임라인 새로고침 때 여러 계정이 올리는 평소 글 */
  ambientPosts(ctx: AIContext, count: number): Promise<GeneratedLine[]>;
  /** 하루 정산: 캐릭터 글, 뉴스, 트렌드, 새 이벤트, 먼저 오는 DM, 오늘의 미션 */
  worldTick(ctx: AIContext, args: { day: number; usedEventKeys: string[]; returned?: ID[] }): Promise<TickResult>;
  /** 이벤트 결과: 선택지(choiceId) 또는 직접 쓴 답(customText) */
  resolveEvent(ctx: AIContext, args: { event: GameEvent; choiceId?: string; customText?: string }): Promise<EventOutcome>;
  /** "다른 이벤트" 새로고침: 로컬 후보가 바닥났을 때만 부른다 */
  newEvent(ctx: AIContext, args: { avoidTitles: string[] }): Promise<EventDraft | null>;
  /**
   * 글에 달린 댓글들(기본 count개 + 인플루언서 댓글 아래 대댓글): 남의 글을 처음 열 때 · 작성자 팔로워가 크게 늘었을 때.
   * post.authorId가 'me'(플레이어 글)면 플레이어에게 하는 답글로 쓴다. existing = 이미 달린 댓글(겹치지 않게)
   */
  threadComments(ctx: AIContext, args: { post: { authorId: ID; text: string }; count: number; existing?: string[] }): Promise<GeneratedLine[]>;
  /** (v3.1) 첫 팔로워가 플레이어를 팔로우하고 처음 보내는 쪽지 1~2줄(미리 써 둔 문장 대신 AI가) */
  firstDM(ctx: AIContext, args: { characterId: ID }): Promise<string[]>;
  /** 캐릭터 만들기: 이름·아이디·자기소개(짧고 담백하게, 성격이 드러나게) */
  draftCharacter(ctx: AIContext | null, args: CharacterDraftArgs): Promise<CharacterDraft>;
  /** 직접 만든 세계관의 등장인물 생성 */
  generateCast(world: { name: string; setting: string; tone: string }): Promise<CastDraft[]>;
}
