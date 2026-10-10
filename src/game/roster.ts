/**
 * 공통 캐릭터 → 시나리오 캐릭터('rs_<항목ID>')
 * - 켜기: 목록 전부 / 골라 넣기: 고른 것만 / 끄기: 없음
 * - 빠진 캐릭터는 inactive + 출연진(cast)에서 제외 — 지난 글이 그대로 보이게 캐릭터 객체는 남긴다.
 *   다시 켜면 호감도·관계 그대로 돌아온다.
 * - 목록이 바뀌면(이름·아이디·사진·소개·특징·팔로워·배지) 이미 들어간 캐릭터의 프로필만 고친다(호감도·관계 유지).
 * - AI가 특징을 읽도록 tier는 'core'. 유형이 관계면 그 관계로 시작, 분류(셀럽·팬…)면 crowdRole로.
 * 내용은 전부 사용자가 입력한 것이다(앱은 사람 정보를 넣지 않는다).
 */
import { useRoster } from '../store/roster';
import type { Character, CrowdRole, ID, PhotoRef, RosterEntry, Scenario } from '../types';
import { hashStr } from '../utils';
import { localBio } from './names';
import { initRelation, isRelationKind, PERSONALITY_PRESETS, SPEECH_PRESETS, typeDefaults } from './relationship';

export const rosterCharId = (entryId: ID) => `rs_${entryId}`;

/** 특징 + 성격·말투 프리셋 이름(AI가 읽는 설명) */
export function traitsWithPresets(traits: string, personality?: string, speechStyle?: string): string {
  const p = personality ? (PERSONALITY_PRESETS.find((x) => x.id === personality)?.label ?? personality) : '';
  const s = speechStyle ? (SPEECH_PRESETS.find((x) => x.id === speechStyle)?.label ?? speechStyle) : '';
  const tail = [p && `성격 유형: ${p}`, s && `말투: ${s}`].filter(Boolean).join(' / ');
  const base = traits.trim();
  return [base, tail].filter(Boolean).join('\n');
}

function avatarOf(e: RosterEntry): Character['avatar'] {
  const h = hashStr(e.id);
  const photo: PhotoRef = e.photo ?? {};
  return {
    emoji: e.emoji || ['⭐', '🌙', '🎧', '📸', '🎤', '💫'][h % 6],
    color: e.color || ['#6D4AFF', '#FF4F81', '#FFB020', '#12B5CB', '#16A34A', '#2E90FA'][(h >>> 3) % 6],
    ...(photo.url ? { url: photo.url } : {}),
    ...(photo.mediaId ? { mediaId: photo.mediaId } : {}),
    ...(photo.photo ? { photo: photo.photo } : {}),
    ...(photo.image ? { image: photo.image } : {}),
  };
}

/** 시나리오 안에서 겹치지 않는 아이디(세계관 캐릭터·나와 겹치면 뒤에 숫자) */
function uniqueHandle(d: Scenario, base: string, selfId: ID): string {
  const taken = new Set([d.persona.handle.toLowerCase(), ...Object.values(d.characters).filter((c) => c.id !== selfId).map((c) => c.handle.toLowerCase())]);
  let h = base;
  for (let i = 2; taken.has(h.toLowerCase()) && i < 99; i++) h = `${base.slice(0, 15 - String(i).length - 1)}_${i}`;
  return h;
}

/** 목록 항목 → 캐릭터 프로필 필드(호감도·관계는 건드리지 않음) */
function profileOf(d: Scenario, e: RosterEntry, selfId: ID, cur?: Character): Partial<Character> {
  const def = typeDefaults(e.type);
  return {
    name: e.name,
    handle: uniqueHandle(d, e.handle, selfId),
    avatar: avatarOf(e),
    banner: e.banner,
    bio: e.bio || cur?.bio || localBio(e.type, e.ageGroup, e.traits),
    description: traitsWithPresets(e.traits, e.personality, e.speechStyle) || cur?.description || '',
    followers: e.followers,
    following: e.following ?? cur?.following ?? 100 + (hashStr(e.id) % 900),
    badge: e.badge !== undefined ? e.badge : def.badge,
    gender: e.gender,
    ageGroup: e.ageGroup,
    personality: e.personality,
    speechStyle: e.speechStyle,
  };
}

const PROFILE_KEYS = ['name', 'handle', 'avatar', 'banner', 'bio', 'description', 'followers', 'following', 'badge', 'gender', 'ageGroup', 'personality', 'speechStyle'] as const;

function sameProfile(c: Character, p: Partial<Character>): boolean {
  return PROFILE_KEYS.every((k) => JSON.stringify(c[k] ?? null) === JSON.stringify(p[k] ?? null));
}

/** 새 캐릭터 */
export function rosterCharacter(d: Scenario, e: RosterEntry): Character {
  const def = typeDefaults(e.type);
  const id = rosterCharId(e.id);
  const day = d.clock.day;
  const c: Character = {
    id,
    name: e.name,
    handle: e.handle,
    avatar: avatarOf(e),
    bio: '',
    description: '',
    archetype: def.archetype,
    tier: 'core',
    isNews: def.isNews,
    followers: e.followers,
    joined: `20${10 + (hashStr(e.id) % 16)}년 ${1 + (hashStr(e.id) % 12)}월`,
    followsMe: def.followsMe,
    iFollow: e.type === 'celeb' || (isRelationKind(e.type) && def.affinity >= 35),
    affinity: def.affinity,
    romance: def.romance,
    relationBase: def.relationBase ?? null,
    ...(isRelationKind(e.type) ? { relation: e.type } : { crowdRole: e.type as CrowdRole }),
    custom: true,
    rosterId: e.id,
    bioDay: day,
  };
  Object.assign(c, profileOf(d, e, id));
  initRelation(c, day);
  return c;
}

function wantedIds(d: Scenario, entries: Record<ID, RosterEntry>): Set<ID> {
  const use = d.roster ?? { mode: 'off', ids: [] };
  if (use.mode === 'on') return new Set(Object.keys(entries));
  if (use.mode === 'select') return new Set(use.ids.filter((id) => entries[id]));
  return new Set();
}

/** 넣고 빼고 고칠 게 있는지(괜히 저장·동기화하지 않게) */
export function rosterNeedsUpdate(d: Scenario, entries: Record<ID, RosterEntry> = useRoster.getState().entries): boolean {
  const wanted = wantedIds(d, entries);
  for (const id of wanted) {
    const c = d.characters[rosterCharId(id)];
    if (!c || c.inactive || !d.cast.includes(c.id) || !sameProfile(c, profileOf(d, entries[id], c.id, c))) return true;
  }
  for (const c of Object.values(d.characters)) {
    if (!c.rosterId || wanted.has(c.rosterId)) continue;
    if (!c.inactive || d.cast.includes(c.id)) return true;
    const e = entries[c.rosterId];
    if (e && !sameProfile(c, profileOf(d, e, c.id, c))) return true;
  }
  return false;
}

/**
 * 시나리오(immer 초안 또는 새 객체)에 공통 캐릭터 반영 — d.roster 설정을 따른다.
 * 돌려주는 값: 새로 넣은 수 · 다시 켠 수 · 뺀 수
 */
export function injectRoster(d: Scenario, entries: Record<ID, RosterEntry> = useRoster.getState().entries): { added: number; restored: number; removed: number } {
  const wanted = wantedIds(d, entries);
  let added = 0;
  let restored = 0;
  let removed = 0;
  for (const c of Object.values(d.characters)) {
    if (!c.rosterId) continue;
    const e = entries[c.rosterId];
    if (e && wanted.has(e.id)) {
      const p = profileOf(d, e, c.id, c);
      if (!sameProfile(c, p)) Object.assign(c, p);
      if (c.inactive) {
        c.inactive = false;
        restored += 1;
      }
      if (!d.cast.includes(c.id)) d.cast.push(c.id);
    } else {
      if (e) {
        const p = profileOf(d, e, c.id, c);
        if (!sameProfile(c, p)) Object.assign(c, p);
      }
      if (!c.inactive) {
        c.inactive = true;
        removed += 1;
      }
      if (d.cast.includes(c.id)) d.cast = d.cast.filter((x) => x !== c.id);
    }
  }
  for (const id of wanted) {
    const cid = rosterCharId(id);
    if (d.characters[cid]) continue;
    d.characters[cid] = rosterCharacter(d, entries[id]);
    d.cast.push(cid);
    added += 1;
  }
  return { added, restored, removed };
}
