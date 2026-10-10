/**
 * 관계·말투 규칙 — 호감도(affinity)·설렘(romance)으로 "나와의 관계"와 "나에게 쓰는 말투"를 정한다.
 *
 *   호감도 -100 ─ 적 ─ -55 ─ 라이벌 ─ -15 ─ 아는 사이 ─ 35 ─ 친구 ─ 75 ─ 베프 ─ 100
 *   설렘 40↑ + 호감도 20↑ → 매콤함(썸·밀당) / 설렘 75↑ + 호감도 60↑ → 연인
 *   멘토·가족은 기본 관계라 호감도가 -55 아래로 떨어질 때만 적으로 바뀐다.
 *
 * 말투가 오락가락하지 않게:
 *   ① 경계값에 여유(HYST)를 둔다 — 경계를 8 이상 넘어야 바뀐다.
 *   ② 캐릭터 한 명의 관계는 게임 하루에 한 번만 바뀐다(나머지는 다음 날 반영).
 *   ③ 말투는 관계가 바뀔 때만 다시 계산한다(사용자가 고정하면 그대로).
 *
 * 이 파일은 순수 함수만 둔다(알림·기억 남기기는 호출하는 쪽에서).
 */
import type { Archetype, BadgeKind, Character, CharacterType, CrowdRole, ID, RelationChange, RelationKind, Scenario, SpeechRegister } from '../types';
import { registerHint } from '../ai/local/register';
import { clamp } from '../utils';

export const HYST = 8;

export const RELATION_LABEL: Record<RelationKind, string> = {
  acquaintance: '아는 사이',
  friend: '친구',
  bestie: '베프',
  spicy: '매콤함',
  lover: '연인',
  rival: '라이벌',
  enemy: '적',
  mentor: '멘토',
  family: '가족',
};
export const CROWD_LABEL: Record<CrowdRole, string> = {
  public: '일반',
  fan: '팬',
  superfan: '열혈 팬',
  antifan: '안티팬',
  news: '언론',
  magazine: '매거진',
  broadcaster: '방송사',
  sponsor: '협찬사',
  /** 세계관 안에서 유명한 계정(가상 인물). 세계관 밖 유명인을 지어내지 않는다 */
  celeb: '셀럽',
};

export const REGISTER_LABEL: Record<SpeechRegister, string> = {
  banmal: '반말',
  haeyo: '해요체',
  formal: '존댓말(격식)',
};

/** 캐릭터 만들기 화면의 "유형" 칩 순서 */
export const CORE_TYPES: RelationKind[] = ['friend', 'bestie', 'spicy', 'lover', 'rival', 'enemy', 'mentor', 'family', 'acquaintance'];
export const CROWD_TYPES: CrowdRole[] = ['fan', 'superfan', 'antifan', 'magazine', 'broadcaster', 'sponsor', 'celeb', 'news', 'public'];

export const isRelationKind = (t: string): t is RelationKind => t in RELATION_LABEL;
export const typeLabel = (t: CharacterType): string => (isRelationKind(t) ? RELATION_LABEL[t] : CROWD_LABEL[t as CrowdRole]);

const FAN_FAMILY: CrowdRole[] = ['public', 'fan', 'superfan', 'antifan'];
const ORG_ROLES: CrowdRole[] = ['news', 'magazine', 'broadcaster', 'sponsor'];

// ───────────────────────── 유형별 시작 값(캐릭터 만들기)

export interface TypeDefaults {
  tier: 'core' | 'crowd';
  archetype: Archetype;
  affinity: number;
  romance: number;
  relation?: RelationKind;
  relationBase?: 'mentor' | 'family' | null;
  crowdRole?: CrowdRole;
  badge: BadgeKind | null;
  isNews: boolean;
  followsMe: boolean;
}

export function typeDefaults(t: CharacterType): TypeDefaults {
  const core = (relation: RelationKind, archetype: Archetype, affinity: number, romance = 0, relationBase: TypeDefaults['relationBase'] = null): TypeDefaults => ({
    tier: 'core', archetype, affinity, romance, relation, relationBase, badge: 'blue', isNews: false, followsMe: affinity >= 0,
  });
  const crowd = (crowdRole: CrowdRole, archetype: Archetype, affinity: number, badge: BadgeKind | null, isNews = false, followsMe = false): TypeDefaults => ({
    tier: 'crowd', archetype, affinity, romance: 0, crowdRole, badge, isNews, followsMe,
  });
  switch (t) {
    case 'friend': return core('friend', 'bestie', 45);
    case 'bestie': return core('bestie', 'bestie', 82);
    case 'spicy': return core('spicy', 'crush', 35, 50);
    case 'lover': return core('lover', 'crush', 72, 82);
    case 'rival': return core('rival', 'rival', -28);
    case 'enemy': return core('enemy', 'rival', -65);
    case 'mentor': return core('mentor', 'mentor', 30, 0, 'mentor');
    case 'family': return core('family', 'bestie', 55, 0, 'family');
    case 'acquaintance': return core('acquaintance', 'chaos', 5);
    case 'fan': return crowd('fan', 'fan', 25, null, false, true);
    case 'superfan': return crowd('superfan', 'fan', 70, null, false, true);
    case 'antifan': return crowd('antifan', 'troll', -45, null, false, true);
    case 'news': return crowd('news', 'news', 10, 'gold', true);
    case 'magazine': return crowd('magazine', 'news', 10, 'gold', true);
    case 'broadcaster': return crowd('broadcaster', 'news', 10, 'gold', true);
    case 'sponsor': return crowd('sponsor', 'news', 10, 'gold', false);
    case 'celeb': return crowd('celeb', 'celeb', 0, 'blue');
    case 'public':
    default: return crowd('public', 'chaos', 0, null);
  }
}

/** 기존 세계관 캐릭터(시드)·구버전 세이브의 관계 초기값 */
export function initRelation(c: Character, day: number): void {
  if (c.romance === undefined) c.romance = c.archetype === 'crush' ? 35 : 0;
  if (c.isNews) {
    c.crowdRole = c.crowdRole ?? 'news';
  } else if (c.tier === 'crowd') {
    if (!c.crowdRole) {
      c.crowdRole = c.badge === 'gold' ? 'news' : c.archetype === 'fan' ? 'fan' : c.archetype === 'troll' ? 'antifan' : c.archetype === 'celeb' ? 'celeb' : 'public';
    }
  } else {
    if (c.relationBase === undefined) c.relationBase = c.archetype === 'mentor' ? 'mentor' : null;
    if (!c.crowdRole) {
      if (c.archetype === 'fan') c.crowdRole = c.affinity >= 60 ? 'superfan' : 'fan';
      else if (c.archetype === 'troll') c.crowdRole = 'antifan';
      else if (c.archetype === 'celeb') c.crowdRole = 'celeb';
    }
    if (!c.relation) c.relation = rawRelation(c.affinity, c.romance ?? 0, c.relationBase ?? null);
  }
  // 처음 말투: 세계관 설정에 "플레이어에게 반말/존댓말"이 적혀 있으면 그것부터(관계가 바뀌면 그때 규칙대로 다시 정함)
  if (!c.register) c.register = (c.tier !== 'crowd' && !c.isNews ? registerHint(c.description) : null) ?? computeRegister(c);
  if (c.relationSince === undefined) c.relationSince = day - 1;
  // (v3.2) 정복도 기본값: 열성 팬 40 · 팬 20 · 나머지 0
  if (c.devotion === undefined) c.devotion = c.crowdRole === 'superfan' ? 40 : c.crowdRole === 'fan' || c.archetype === 'fan' ? 20 : 0;
}

// ───────────────────────── 관계 계산

const BANDS: { rel: RelationKind; min: number }[] = [
  { rel: 'enemy', min: -101 },
  { rel: 'rival', min: -55 },
  { rel: 'acquaintance', min: -15 },
  { rel: 'friend', min: 35 },
  { rel: 'bestie', min: 75 },
];

function bandIndex(aff: number): number {
  let i = 0;
  for (let k = 0; k < BANDS.length; k++) if (aff >= BANDS[k].min) i = k;
  return i;
}

/** 여유 없이 계산한 관계(초기값용) */
export function rawRelation(aff: number, romance: number, base: 'mentor' | 'family' | null): RelationKind {
  if (base) {
    if (aff <= -55) return 'enemy';
    if (base === 'mentor' && romance >= 75 && aff >= 60) return 'lover';
    if (base === 'mentor' && romance >= 40 && aff >= 20) return 'spicy';
    return base;
  }
  if (romance >= 75 && aff >= 60) return 'lover';
  if (romance >= 40 && aff >= 20) return 'spicy';
  return BANDS[bandIndex(aff)].rel;
}

/** 이전 관계를 기준으로 여유(HYST)를 두고 계산 */
export function nextRelation(c: Character): RelationKind {
  const aff = c.affinity;
  const rom = c.romance ?? 0;
  const base = c.relationBase ?? null;
  const prev = c.relation ?? rawRelation(aff, rom, base);
  const romantic = prev === 'spicy' || prev === 'lover';
  // 로맨스: 경계에서 들어가고, 경계보다 HYST만큼 내려가야 빠져나온다
  const loverIn = rom >= 75 - (prev === 'lover' ? HYST : 0) && aff >= 60 - (prev === 'lover' ? HYST : 0);
  const spicyIn = rom >= 40 - (romantic ? HYST : 0) && aff >= 20 - (romantic ? HYST : 0);
  if (base === 'family') {
    if (aff <= -55 - (prev === 'enemy' ? -HYST : HYST)) return 'enemy';
    return 'family';
  }
  if (loverIn) return 'lover';
  if (spicyIn) return 'spicy';
  if (base === 'mentor') {
    if (aff <= -55 - (prev === 'enemy' ? -HYST : HYST)) return 'enemy';
    return 'mentor';
  }
  // 일반 띠: 한 칸 이상 움직이려면 경계를 HYST 넘게 넘어야 한다
  const prevIdx = BANDS.findIndex((b) => b.rel === prev);
  const raw = bandIndex(aff);
  if (prevIdx < 0) return BANDS[raw].rel; // 이전이 로맨스·멘토·가족이었으면 그냥 띠로
  if (raw > prevIdx) return BANDS[Math.max(prevIdx, bandIndex(aff - HYST))].rel;
  if (raw < prevIdx) return BANDS[Math.min(prevIdx, bandIndex(aff + HYST))].rel;
  return prev;
}

/** 팬 계열 분류(일반 ↔ 팬 ↔ 열혈 팬 ↔ 안티팬) */
export function nextCrowdRole(c: Character): CrowdRole | undefined {
  const role = c.crowdRole;
  if (!role || !FAN_FAMILY.includes(role)) return role;
  const a = c.affinity;
  if (role === 'antifan') return a >= -30 + HYST * 2 ? (a >= 30 ? 'fan' : 'public') : 'antifan';
  if (a <= -30 - HYST) return 'antifan';
  if (role === 'superfan') return a < 60 - HYST ? 'fan' : 'superfan';
  if (a >= 60 + HYST) return 'superfan';
  if (role === 'public') return a >= 30 + HYST ? 'fan' : 'public';
  return role; // fan 유지
}

// ───────────────────────── 말투

/** 지금 관계·분류로 정한 말투(고정값이 있으면 고정값) */
export function computeRegister(c: Character): SpeechRegister {
  if (c.registerOverride) return c.registerOverride;
  const prev = c.register;
  const role = c.crowdRole;
  if (role && ORG_ROLES.includes(role)) return 'formal';
  if (c.isNews) return 'formal';
  if (c.tier === 'crowd' || !c.relation) {
    if (role === 'antifan') return 'banmal';
    return 'haeyo';
  }
  switch (c.relation) {
    case 'friend':
    case 'bestie':
    case 'lover':
    case 'family':
      return 'banmal';
    case 'spicy':
      // 썸: 원래 말을 놓던 사이면 그대로 반말(가까워지는데 존댓말로 돌아가면 어색함). 처음엔 해요체, 호감 55↑면 말을 놓는다
      return prev === 'banmal' ? 'banmal' : c.affinity >= 55 ? 'banmal' : 'haeyo';
    case 'mentor':
      // 멘토: 이미 반말 쓰던 선배는 그대로. 아니면 호감 60↑에서 말을 놓는다
      return prev === 'banmal' ? 'banmal' : c.affinity >= 60 ? 'banmal' : 'haeyo';
    case 'rival':
    case 'enemy':
      // 원래 쓰던 말투 유지(친구였다가 틀어지면 반말 그대로, 처음부터 남이면 해요체)
      return prev ?? 'haeyo';
    case 'acquaintance':
    default:
      return 'haeyo';
  }
}

/** 지금 이 캐릭터가 나에게 쓰는 말투 */
export function registerOf(c: Character): SpeechRegister {
  return c.registerOverride ?? c.register ?? computeRegister(c);
}

// ───────────────────────── 적용

/**
 * 호감도·설렘을 바꾸고 관계·말투를 다시 계산한다(범위 제한 포함).
 * 관계 변화는 하루 한 번만: 오늘 이미 바뀌었으면 수치만 바꾸고 관계는 다음 날 반영.
 */
export function changeAffinity(d: Scenario, id: ID, delta: number, romanceDelta = 0, devotionDelta = 0): RelationChange | null {
  const c = d.characters[id];
  if (!c) return null;
  if (delta) c.affinity = clamp(Math.round(c.affinity + delta), -100, 100);
  // 공통 캐릭터(사용자가 넣은 계정 — 실존 인물일 수 있음)는 설렘을 올리지 않는다
  if (romanceDelta && c.relationBase !== 'family' && !c.rosterId) c.romance = clamp(Math.round((c.romance ?? 0) + romanceDelta), 0, 100);
  if (devotionDelta) c.devotion = clamp(Math.round((c.devotion ?? 0) + devotionDelta), 0, 100);
  return updateRelation(d, id);
}

/** 편집기에서 호감도·설렘·정복도를 직접 정할 때(관계·말투 즉시 다시 계산, 하루 제한 무시) */
export function setCharacterStats(d: Scenario, id: ID, s: { affinity?: number; romance?: number; devotion?: number }): RelationChange | null {
  const c = d.characters[id];
  if (!c) return null;
  if (s.affinity !== undefined) c.affinity = clamp(Math.round(s.affinity), -100, 100);
  if (s.romance !== undefined && c.relationBase !== 'family' && !c.rosterId) c.romance = clamp(Math.round(s.romance), 0, 100);
  if (s.devotion !== undefined) c.devotion = clamp(Math.round(s.devotion), 0, 100);
  return updateRelation(d, id, { force: true });
}

/** 관계·분류·말투 다시 계산(바뀌었으면 변화 기록을 돌려준다) */
export function updateRelation(d: Scenario, id: ID, opts: { force?: boolean } = {}): RelationChange | null {
  const c = d.characters[id];
  if (!c) return null;
  const day = d.clock.day;
  const prevType: CharacterType | undefined = c.tier !== 'crowd' && !c.isNews ? c.relation : c.crowdRole;
  const prevReg = registerOf(c);
  if (!opts.force && c.relationSince === day) return null; // 오늘은 이미 한 번 바뀜
  let nextType: CharacterType | undefined = prevType;
  if (c.tier !== 'crowd' && !c.isNews) {
    if (!c.relationLocked) c.relation = nextRelation(c);
    nextType = c.relation;
    // 핵심 인물의 팬 분류도 같이 갱신
    if (c.crowdRole && FAN_FAMILY.includes(c.crowdRole)) c.crowdRole = nextCrowdRole(c);
  } else {
    c.crowdRole = nextCrowdRole(c);
    nextType = c.crowdRole;
  }
  const typeChanged = !!prevType && !!nextType && prevType !== nextType;
  if (typeChanged || opts.force) c.register = computeRegister(c);
  const nextReg = registerOf(c);
  if (!typeChanged && prevReg === nextReg) return null;
  c.relationSince = day;
  return {
    characterId: id,
    from: (prevType ?? nextType) as CharacterType,
    to: (nextType ?? prevType) as CharacterType,
    register: prevReg !== nextReg ? { from: prevReg, to: nextReg } : undefined,
  };
}

/** 사용자가 편집기에서 유형을 직접 바꿨을 때(즉시 반영, 하루 제한 무시) */
export function setCharacterType(d: Scenario, id: ID, t: CharacterType, opts: { lock?: boolean } = {}): RelationChange | null {
  const c = d.characters[id];
  if (!c) return null;
  const def = typeDefaults(t);
  if (isRelationKind(t)) {
    c.tier = 'core';
    c.relation = t;
    c.relationBase = def.relationBase ?? null;
    // 고른 관계와 수치가 어긋나지 않게 맞춘다(이미 그 범위면 그대로)
    if (rawRelation(c.affinity, c.romance ?? 0, c.relationBase) !== t) {
      c.affinity = def.affinity;
      c.romance = def.romance;
    }
  } else {
    c.crowdRole = t;
    if (t === 'fan' || t === 'superfan' || t === 'antifan') c.affinity = def.affinity;
    c.isNews = def.isNews;
  }
  c.relationLocked = !!opts.lock;
  return updateRelation(d, id, { force: true });
}

// ───────────────────────── 멘션·목록 색 분류

/** celeb=노랑 · business=기본(언론·비즈니스) · friend=보라(친구 부류) · industry=파랑 외곽선(같은 업계) · fan/anti/public=표시 없음 */
export type MentionCategory = 'celeb' | 'business' | 'friend' | 'industry' | 'fan' | 'anti' | 'public';

export const MENTION_LABEL: Record<MentionCategory, string> = {
  celeb: '셀럽',
  business: '언론·비즈니스',
  friend: '친구',
  industry: '같은 업계',
  fan: '팬',
  anti: '안티',
  public: '일반',
};

export function mentionCategory(c: Character): MentionCategory {
  const role = c.crowdRole;
  if (c.isNews || c.badge === 'gold' || (role && ORG_ROLES.includes(role))) return 'business';
  const rel = c.tier !== 'crowd' ? c.relation : undefined;
  if (rel === 'friend' || rel === 'bestie' || rel === 'lover' || rel === 'spicy' || rel === 'family') return 'friend';
  if (role === 'celeb' || c.archetype === 'celeb') return 'celeb';
  if (role === 'fan' || role === 'superfan') return 'fan';
  if (role === 'antifan') return 'anti';
  if (c.tier !== 'crowd') return 'industry';
  return 'public';
}

/** 프로필·목록에 보일 관계 이름(core = 관계, crowd = 분류) */
export function relationLabel(c: Character): string {
  if (c.tier !== 'crowd' && !c.isNews && c.relation) return RELATION_LABEL[c.relation];
  if (c.crowdRole) return CROWD_LABEL[c.crowdRole];
  return '일반';
}

/** 변화 문구: "친구 → 베프" / "말투: 해요체 → 반말" */
export function describeChange(ch: RelationChange): string {
  const parts: string[] = [];
  if (ch.from !== ch.to) parts.push(`${typeLabel(ch.from)} → ${typeLabel(ch.to)}`);
  if (ch.register) parts.push(`말투 ${REGISTER_LABEL[ch.register.from]} → ${REGISTER_LABEL[ch.register.to]}`);
  return parts.join(' · ');
}

// ───────────────────────── 성격·말투 프리셋(캐릭터 만들기 드롭다운)

export const PERSONALITY_PRESETS: { id: string; label: string; desc: string }[] = [
  { id: 'ISTJ', label: 'ISTJ', desc: '원칙·책임감, 말수 적고 정확함' },
  { id: 'ISFJ', label: 'ISFJ', desc: '배려 깊고 조용히 챙겨 줌' },
  { id: 'INFJ', label: 'INFJ', desc: '속 깊고 통찰력, 은근 고집' },
  { id: 'INTJ', label: 'INTJ', desc: '계획형 전략가, 냉철한 팩트' },
  { id: 'ISTP', label: 'ISTP', desc: '무심한 듯 실용적, 귀찮음 많음' },
  { id: 'ISFP', label: 'ISFP', desc: '감성적이고 느긋한 자기 세계' },
  { id: 'INFP', label: 'INFP', desc: '여리고 이상주의, 상상력 풍부' },
  { id: 'INTP', label: 'INTP', desc: '논리 덕후, 엉뚱한 질문 많음' },
  { id: 'ESTP', label: 'ESTP', desc: '행동파·승부욕, 직설적' },
  { id: 'ESFP', label: 'ESFP', desc: '분위기 메이커, 즉흥적' },
  { id: 'ENFP', label: 'ENFP', desc: '텐션 높고 정 많음, 리액션 부자' },
  { id: 'ENTP', label: 'ENTP', desc: '말빨·드립, 토론 좋아함' },
  { id: 'ESTJ', label: 'ESTJ', desc: '현실적 리더, 정리·지시형' },
  { id: 'ESFJ', label: 'ESFJ', desc: '친화력 갑, 다정한 오지랖' },
  { id: 'ENFJ', label: 'ENFJ', desc: '사람 챙기는 리더, 따뜻함' },
  { id: 'ENTJ', label: 'ENTJ', desc: '야망가, 단호하고 추진력' },
];

export const SPEECH_PRESETS: { id: string; label: string; desc: string }[] = [
  { id: 'dry', label: '담백·건조', desc: '~함/~임 짧게, 이모지 거의 없음' },
  { id: 'warm', label: '다정다감', desc: '부드럽고 공감 많은 말투' },
  { id: 'hyper', label: '하이텐션', desc: 'ㅋㅋㅋ·느낌표 많고 리액션 큼' },
  { id: 'cute', label: '애교·이모지', desc: '이모지·물결(~) 자주' },
  { id: 'blunt', label: '직설·팩폭', desc: '돌려 말하지 않음' },
  { id: 'cold', label: '시크·무심', desc: '짧고 무뚝뚝, 속은 다정할 수도' },
  { id: 'meme', label: '밈·드립', desc: '유행어·밈 섞어 드립' },
  { id: 'emo', label: '새벽 감성', desc: '감성적, 말줄임표 많음' },
  { id: 'polite', label: '깍듯한 예의', desc: '예의 바르고 조심스러움' },
  { id: 'genz', label: '줄임말 장인', desc: '신조어·줄임말 많이' },
];

export const AGE_GROUPS = [10, 20, 30, 40, 50, 60] as const;
export const FOLLOWER_PRESETS = [100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000];
