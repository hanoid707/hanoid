/**
 * 도메인 타입 모음
 * - 앱의 모든 데이터 구조가 여기 모여 있다. 화면·게임 로직·AI 엔진·DB 동기화가 전부 이 타입을 공유한다.
 * - 원본 앱(status)의 개념 → 이 앱의 타입 대응은 README의 "기능 대응표" 참고.
 */

export type ID = string;

/** 플레이어(나) 작성자 ID. 캐릭터 ID와 겹치지 않게 고정 문자열을 쓴다. */
export const ME = 'me';
/** 세계관 시스템 알림(이벤트 결과 등) 작성자 ID */
export const SYSTEM = '__system';

/** 캐릭터 성격 유형(관계 기본값·답글 다는 사람 고르기에 쓴다) */
export type Archetype =
  | 'bestie' // 절친
  | 'rival' // 라이벌
  | 'fan' // 팬
  | 'mentor' // 멘토·어른
  | 'troll' // 악플러
  | 'news' // 뉴스·가십 계정
  | 'crush' // 호감 가는 사람
  | 'chaos' // 엉뚱한 캐릭터
  | 'celeb'; // 셀럽·선배

/** 인증 배지: 파랑(개인 인증) · 금색(단체·언론) · 회색(기관) */
export type BadgeKind = 'blue' | 'gold' | 'gray';

/** 이름 없는 일반 유저(임시 계정)가 쓴 글·답글의 작성자 ID — 정보는 Post.ghost 에 들어 있다 */
export const GHOST = '__ghost';

export type Gender = 'f' | 'm';
/** 나이대(10 = 10대) */
export type AgeGroup = 10 | 20 | 30 | 40 | 50 | 60;
/** 게임 난이도: 수치가 얼마나 잘 오르고 쉽게 떨어지는지 */
export type Difficulty = 'easy' | 'normal' | 'hard';

/** 나와의 관계(인증 캐릭터 = core). 호감도·설렘에 따라 자동으로 바뀐다 */
export type RelationKind = 'acquaintance' | 'friend' | 'bestie' | 'spicy' | 'lover' | 'rival' | 'enemy' | 'mentor' | 'family';

/** 연애·플러팅 수위(기본 normal) — 공통 캐릭터(실존 인물)·가족은 이 설정과 무관하게 연애 반응 없음 */
export type RomanceLevel = 'mild' | 'normal' | 'spicy';
/** 일반 계정(crowd) 분류. 팬 계열은 호감도에 따라 팬 ↔ 열혈 팬 ↔ 안티팬으로 바뀐다 */
export type CrowdRole = 'public' | 'fan' | 'superfan' | 'antifan' | 'news' | 'magazine' | 'broadcaster' | 'sponsor' | 'celeb';
/** 캐릭터 만들기에서 고르는 "유형" */
export type CharacterType = RelationKind | CrowdRole;
/** 나에게 쓰는 말투: 반말 · 해요체 · 격식(합쇼체) */
export type SpeechRegister = 'banmal' | 'haeyo' | 'formal';

/** 관계·분류가 바뀐 기록(화면에 "친구 → 베프" 같은 연출용) */
export interface RelationChange {
  characterId: ID;
  from: CharacterType;
  to: CharacterType;
  /** 말투도 같이 바뀌었으면 */
  register?: { from: SpeechRegister; to: SpeechRegister };
}

/** 임시 계정 정보(타임라인·답글 숫자를 채우는 이름 없는 일반 유저) */
export interface GhostAuthor {
  name: string;
  handle: string;
  emoji: string;
  color: string;
  /** 기본 사진 키(src/data/photos.ts AVATARS) — 없으면 이모지 */
  photo?: string;
}

/** 사진 참조 — 셋 중 하나라도 있으면 사진, 없으면 이모지 */
export interface PhotoRef {
  /** 앱에 들어 있는 기본 사진 키(src/data/photos.ts) */
  photo?: string;
  /** 직접 고른 사진(DB·기기에 저장된 사진 ID) */
  mediaId?: string;
  /** (구버전 호환) data URI */
  image?: string;
  /** (v3) 인터넷 이미지 주소(공통 캐릭터 가져오기용). 폰·PC 앱에서만 보인다 */
  url?: string;
}

export interface Avatar extends PhotoRef {
  emoji: string;
  color: string;
}

/** 게임 속 시간. 글을 올릴 때마다 흐른다(원본: "트윗할 때마다 시간이 흐름") */
export interface GameTime {
  day: number;
  hour: number;
  minute: number;
}

export interface Character {
  id: ID;
  name: string;
  handle: string;
  avatar: Avatar;
  /** 프로필 배너 사진 */
  banner?: PhotoRef;
  /** 프로필 자기소개(공개) */
  bio: string;
  /** 성격·특성·행동 규칙(사용자가 직접 입력·수정) — AI가 이 캐릭터를 연기할 때 가장 먼저 읽는다 */
  description: string;
  /** 다른 인물·플레이어와의 관계 */
  relations?: string;
  archetype: Archetype;
  /** 인증 배지(없으면 배지 없음) */
  badge?: BadgeKind | null;
  /** (구버전 호환) 인증 여부 */
  verified?: boolean;
  isNews?: boolean;
  /** core = 이야기의 중심 인물, crowd = 타임라인을 채우는 일반 유저 */
  tier?: 'core' | 'crowd';
  followers: number;
  following?: number;
  location?: string;
  joined?: string;
  followsMe: boolean;
  iFollow: boolean;
  /** 나에 대한 호감도 -100 ~ 100 */
  affinity: number;
  /** 사용자가 직접 만든 캐릭터 여부 */
  custom?: boolean;
  /** (구버전 세이브 호환) 예전 글 재료 — 불러올 때 지운다 */
  postPool?: string[];

  // ── v3: 관계·말투·인물 정보
  gender?: Gender;
  ageGroup?: AgeGroup;
  /** core: 지금 나와의 관계(호감도·설렘으로 자동 변화, relationLocked면 고정) */
  relation?: RelationKind;
  /** 멘토·가족처럼 호감도와 상관없이 유지되는 기본 관계(호감도가 아주 낮아지면 적으로만 바뀜) */
  relationBase?: 'mentor' | 'family' | null;
  /** 사용자가 관계를 직접 고정했는지 */
  relationLocked?: boolean;
  /** 관계가 마지막으로 바뀐 게임 일차(하루에 여러 번 오락가락하지 않게) */
  relationSince?: number;
  /** crowd: 분류(팬·열혈 팬·안티팬·언론·매거진·방송사·협찬사·셀럽·일반) */
  crowdRole?: CrowdRole;
  /** 설렘(로맨스) 0~100 — 매콤함·연인 판정에 쓰인다 */
  romance?: number;
  /** (v3.2) 정복도 0~100 — 높을수록 플레이어 부탁을 기꺼이 들어주고 먼저 더 해 준다(열성 팬 같은 헌신) */
  devotion?: number;
  /** 지금 나에게 쓰는 말투(관계·호감도로 자동 계산, 잦은 변화 방지 적용) */
  register?: SpeechRegister;
  /** 사용자가 고정한 말투(null/없음 = 자동) */
  registerOverride?: SpeechRegister | null;
  /** 성격 유형(예: ENFP) — 선택 */
  personality?: string;
  /** 말투 프리셋 id — 선택 */
  speechStyle?: string;
  /** 자기소개를 AI가 마지막으로 고친 게임 일차 */
  bioDay?: number;
  /** 공통 캐릭터에서 온 계정이면 그 RosterEntry.id */
  rosterId?: ID;
  /** 시나리오에서 빠진 상태(목록·AI에서 제외, 지난 글 표시용으로만 남김) */
  inactive?: boolean;
}

export interface Persona {
  name: string;
  handle: string;
  avatar: Avatar;
  banner?: PhotoRef;
  /** 역할(콘솔 카우보이, 신입 유튜버 등) */
  role: string;
  /** 한 줄 소개 */
  bio: string;
  /** 성격·배경 설정 — AI가 나를 이해하는 데 쓰인다 */
  description: string;
  location?: string;
  badge?: BadgeKind | null;
}

export interface World {
  /** 기본 세계관이면 템플릿 ID, 직접 만든 세계관이면 null */
  templateId: string | null;
  name: string;
  emoji: string;
  color: string;
  tagline: string;
  /** 세계관 설정 문장 — AI 프롬프트의 핵심 재료 */
  setting: string;
  /** 분위기(코믹, 진지 등) */
  tone: string;
  /** 이 세계에서 자주 쓰는 단어(AI 프롬프트 재료) */
  vocab: string[];
  /** 플레이어가 고를 수 있는 역할 */
  roles: string[];
  /** 대표 해시태그 */
  tag: string;
}

export type PostKind = 'post' | 'reply' | 'news' | 'event' | 'system';

export interface Post {
  id: ID;
  authorId: ID;
  text: string;
  kind: PostKind;
  at: GameTime;
  ts: number;
  likes: number;
  reposts: number;
  /** 조회수(없으면 좋아요·리포스트로 추정) */
  views?: number;
  /** 답글 ID 목록 */
  replies: ID[];
  parentId?: ID;
  rootId?: ID;
  liked?: boolean;
  reposted?: boolean;
  bookmarked?: boolean;
  /** 첨부 사진 */
  media?: PhotoRef;
  badge?: 'viral' | 'controversy';
  /** 이벤트 결과 글이면 원본 이벤트 ID */
  eventId?: ID;
  /** authorId === GHOST 일 때 작성자 정보 */
  ghost?: GhostAuthor;
  /** 숫자가 자라는 연출(표시 전용): 이 값에서 지금 값까지 ms 동안 올라간다 */
  growFrom?: { likes: number; reposts: number; views: number; ts: number; ms: number };
  /** 남의 글을 처음 열었을 때 댓글을 만든 기록(작성자 팔로워 50%↑이면 추가 생성) */
  threadGen?: { followers: number; count: number; ts: number };
  /** 바이럴 모먼트 효과를 받은 글 */
  boosted?: boolean;
}

export interface DMMessage {
  id: ID;
  from: 'me' | 'them' | 'system';
  text: string;
  ts: number;
  at: GameTime;
  /** 내가 보낸 메시지를 상대가 읽었는지(읽음 표시) */
  read?: boolean;
}

export interface Conversation {
  characterId: ID;
  messages: DMMessage[];
  unread: number;
  /** 상대가 대화방을 나간 경우, 돌아오는 날(게임 일차). null이면 대화 가능 */
  leftUntilDay: number | null;
  typing: boolean;
  updatedTs: number;
  /** AI가 요약한 이전 대화(화면에 보여 주는 최근 12줄보다 앞선 부분) — 대화가 길어져도 맥락이 끊기지 않게 */
  summary?: string;
}

export type NotiType =
  | 'like'
  | 'reply'
  | 'repost'
  | 'follow'
  | 'unfollow'
  | 'mention'
  | 'dm'
  | 'event'
  | 'level'
  | 'quest'
  | 'news'
  | 'viral'
  | 'cancel'
  | 'recover'
  | 'relation'
  | 'item'
  | 'system';

export interface Noti {
  id: ID;
  type: NotiType;
  actorId?: ID;
  postId?: ID;
  eventId?: ID;
  text: string;
  ts: number;
  at: GameTime;
  read: boolean;
}

/** 평판 상태: 보통 / 상승세 / 떡상 / 논란 / 캔슬 */
export type RepStatus = 'normal' | 'rising' | 'viral' | 'controversy' | 'cancelled';

export interface Stats {
  followers: number;
  aura: number;
  humor: number;
  xp: number;
  level: number;
  /** 평판 -100 ~ 100 */
  reputation: number;
  status: RepStatus;
  posts: number;
}

/** 수치 변화량. AI가 제안하고 게임 규칙이 범위를 제한해서 적용한다. */
export interface Deltas {
  followers?: number;
  aura?: number;
  humor?: number;
  reputation?: number;
  xp?: number;
  /** 캐릭터ID → 호감도 변화 */
  affinity?: Record<ID, number>;
  /** 캐릭터ID → 설렘 변화 */
  romance?: Record<ID, number>;
  /** 캐릭터ID → 정복도 변화 */
  devotion?: Record<ID, number>;
}

export interface EventChoice {
  id: string;
  label: string;
  hint?: string;
}

/** 같은 자리에 올 수 있는 이벤트 후보 하나(이벤트 "다른 이벤트" 새로고침용) */
export interface EventVariant {
  emoji: string;
  title: string;
  body: string;
  choices: EventChoice[];
  involved: ID[];
  templateKey?: string;
  /** (v3) 이 후보를 사용자가 직접 고쳤는지 */
  edited?: boolean;
}

export interface GameEvent {
  id: ID;
  emoji: string;
  title: string;
  body: string;
  choices: EventChoice[];
  involved: ID[];
  at: GameTime;
  status: 'pending' | 'resolved';
  result?: {
    /** 고른 선택지 id. 직접 쓴 답이면 'custom' */
    choiceId: string;
    text: string;
    deltas: Deltas;
    /** 직접 쓴 답 */
    custom?: string;
    /** 이 선택으로 바뀐 관계 */
    changes?: RelationChange[];
    /** (v3) 바이럴 모먼트 효과를 받았는지 */
    boosted?: boolean;
    /** (v3) 그때의 난이도 */
    difficulty?: Difficulty;
  };
  /** 세계관 파일의 이벤트 키(같은 이벤트가 다시 나오지 않게) */
  templateKey?: string;
  /** 후보 목록(0번 = 처음 이벤트). 위의 emoji·title… 는 지금 보이는 후보(vIndex)의 사본 */
  variants?: EventVariant[];
  vIndex?: number;
  /** 사용자가 내용을 직접 고쳤는지 */
  edited?: boolean;
}

/** 아이템(재화 없이 언제든 사용) */
export type ItemKind = 'gift' | 'viral' | 'undo' | 'skip';

/**
 * 공통 캐릭터 — 세계관과 상관없이 사용자가 직접 추가해 두는 계정 목록(기기 저장 + 동기화).
 * 각 시나리오에서 켜기/끄기/골라 넣기로 등장시킨다. 내용(이름·사진·특징)은 전부 사용자가 입력한다.
 */
export interface RosterEntry {
  id: ID;
  name: string;
  handle: string;
  gender?: Gender;
  ageGroup?: AgeGroup;
  /** 유형(기본 셀럽) */
  type: CharacterType;
  followers: number;
  following?: number;
  /** 프로필 자기소개(비우면 AI가 만들어 줌) */
  bio: string;
  /** 성격·특징·말투(AI가 연기할 때 읽음) */
  traits: string;
  personality?: string;
  speechStyle?: string;
  photo?: PhotoRef;
  banner?: PhotoRef;
  badge?: BadgeKind | null;
  emoji?: string;
  color?: string;
  /** 사용자 메모(분류·출처 등, AI에는 안 넘김) */
  memo?: string;
  updatedTs: number;
}

/** 시나리오별 공통 캐릭터 등장 방식 */
export interface RosterUse {
  mode: 'on' | 'off' | 'select';
  /** mode = select 일 때 등장시킬 RosterEntry.id */
  ids: ID[];
}

export type QuestGoal = 'post' | 'reply' | 'dm' | 'event' | 'followers' | 'level' | 'keyword' | 'recover';

export interface Quest {
  id: ID;
  title: string;
  desc: string;
  goal: QuestGoal;
  target: number;
  progress: number;
  keyword?: string[];
  /** 보상: 경험치·팔로워(재화 없음) */
  reward: { xp?: number; followers?: number };
  done: boolean;
  claimed: boolean;
  /** 오늘의 미션이면 해당 일차 */
  day?: number;
}

export interface Activity {
  id: ID;
  icon: string;
  text: string;
  ts: number;
  at: GameTime;
}

export interface Trend {
  tag: string;
  count: number;
  hot?: boolean;
}

/** 시나리오 = 세이브 슬롯 하나. 세계관 + 내 페르소나 + 그 안의 모든 기록 */
export interface Scenario {
  id: ID;
  title: string;
  createdTs: number;
  updatedTs: number;
  world: World;
  persona: Persona;
  characters: Record<ID, Character>;
  cast: ID[];
  posts: Record<ID, Post>;
  /** 타임라인에 보이는 글(답글 제외) 최신순 */
  feed: ID[];
  dms: Record<ID, Conversation>;
  notis: Noti[];
  stats: Stats;
  clock: GameTime;
  events: GameEvent[];
  quests: Quest[];
  activity: Activity[];
  trends: Trend[];
  /** AI에게 넘기는 세계 기억(중요 사건 요약) */
  memory: string[];
  /** 마지막으로 하루 정산(평판 회복·대화방 복귀 등 규칙 정리)을 돌린 일차 */
  lastTickDay: number;
  /** (v3.1) 하루 정산의 AI 부분(오늘 글·뉴스·이벤트·쪽지)을 마친 일차 — AI가 실패하면 그대로 두고 다음에 다시 시도 */
  tickAIDay?: number;
  /** (v3.1) 첫 팔로워(시작 직후 AI가 첫 쪽지를 쓴다) */
  firstFollowerId?: ID;

  // ── v3
  /** 난이도(기본 normal) */
  difficulty?: Difficulty;
  /** 연애·플러팅 수위(기본 normal, 나 탭에서 직접 조절). 공통 캐릭터(실존 인물)·가족은 무관하게 연애 반응 없음 */
  romanceLevel?: RomanceLevel;
  /** 바이럴 모먼트: 켜 두면 다음 행동 1번의 결과가 크게 강화된다 */
  boost?: { kind: 'viral'; armedTs: number } | null;
  /** 글쓰기 화면 "제안"(다른 AI 응답에 얹어 받아 둔 것 — 따로 호출하지 않음) */
  ideas?: { list: string[]; ts: number };
  /** 아이템 사용 기록(최근 30개, 최신이 앞). target = 선물 받은 캐릭터 등 */
  itemLog?: { id: ID; item: ItemKind; text: string; ts: number; at: GameTime; target?: ID }[];
  /** 공통 캐릭터 등장 방식(없으면 off) */
  roster?: RosterUse;
}

/** 쓸 AI(예전 세이브의 'mock'은 불러올 때 'gemini'로 바뀐다) */
export type AIProvider = 'gemini' | 'claude';

export interface AISettings {
  provider: AIProvider;
  apiKey: string;
  model: string;
  /** 클로드(웹 아티팩트 전용) 속도/품질: 빠름 · 균형 · 고품질 */
  claudeMode?: 'fast' | 'balanced' | 'quality';
  /** 사용자가 AI 연결 화면에서 직접 고른 적이 있는지(없으면 실행 환경에 맞게 자동 선택) */
  chosen?: boolean;
  /** 사용량 화면: 남은 예산 계산용(충전한 금액, 달러) */
  budgetUsd?: number;
  /** 사용량 화면: 원화 환산 환율 */
  usdKrw?: number;
}

export interface SyncSettings {
  /** DB 자동 동기화 켜기 */
  enabled: boolean;
  /** 동기화 코드(이 코드가 같은 기기끼리 데이터를 공유) */
  key: string;
}

export interface Settings {
  ai: AISettings;
  theme: 'system' | 'light' | 'dark';
  haptics: boolean;
  sync: SyncSettings;
}
