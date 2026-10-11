/**
 * 게임 밸런스 상수 — 숫자를 바꾸면 게임 난이도가 바뀐다.
 * (원본의 에너지·커피·광고·결제는 현금 결제용 장치라 이 버전에선 전부 뺐다. 행동 횟수 제한 없음)
 */

/**
 * 행동별로 흐르는 게임 시간(분)
 *  - 글: 올릴 때마다 2~4시간이 흐른다(글쓰기 화면에서 올리는 시각을 직접 고르면 그 시각으로 간다)
 *  - 이벤트: 답하면 그날이 끝나고 다음 날 아침 9시가 된다(여기 값은 쓰지 않음 — events.ts)
 */
export const TIME_COST = {
  postMin: 120,
  postMax: 240,
  reply: 45,
  dm: 20,
  event: 180,
} as const;

/** 행동별 경험치 */
export const XP = {
  post: 12,
  reply: 5,
  dm: 4,
  event: 20,
  viral: 40,
} as const;

/** 다음 레벨까지 필요한 경험치 */
export function xpToNext(level: number): number {
  return 60 + (level - 1) * 40;
}

/** 평판 기준선 */
export const REP = {
  rising: 35,
  controversy: -40,
  cancelled: -70,
  /** 캔슬 후 재기 성공 시 평판 */
  recovered: -10,
  /** 하루가 지날 때 0 쪽으로 돌아오는 양 */
  dailyDrift: 4,
} as const;

/** 캔슬당하면 남는 팔로워 비율 */
export const CANCEL_KEEP_RATIO = 0.7;

/** 시작 팔로워(이름 없는 구경꾼 수) */
export const START_FOLLOWERS = 12;

/** AI가 한 번에 바꿀 수 있는 수치 범위(신뢰하지 않고 잘라낸다) */
export const CLAMP = {
  followersUpRatio: 0.6, // 한 번에 현재 팔로워의 60% + 300명까지만 증가
  followersUpFlat: 300,
  followersDownRatio: 0.35,
  stat: 12, // 아우라·유머 한 번 변화량
  reputation: 25,
  affinity: 25,
  /** 설렘 한 번 변화량(이벤트는 별도 상한) */
  romance: 20,
  /** 정복도 한 번 변화량 */
  devotion: 15,
  likesMax: 5_000_000,
} as const;

/** 저장 용량 관리를 위한 보관 개수 상한 */
export const KEEP = {
  posts: 360,
  /** 답글까지 합친 전체 글 수(넘으면 오래된 글부터 정리 — 기기 저장 항목당 약 2MB 제한 보호) */
  postsTotal: 2400,
  notis: 150,
  activity: 200,
  dmMessages: 150,
  memory: 30,
  itemLog: 30,
} as const;

export const CHARACTER_CAP = 80;
export const POST_MAX_LEN = 280;
export const DM_MAX_LEN = 500;

/** 게임 시작 시각: 1일차 오전 9시 */
export const START_TIME = { day: 1, hour: 9, minute: 0 } as const;
