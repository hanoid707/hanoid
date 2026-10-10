/**
 * 기본 얼굴 사진 풀 — 직접 만든 캐릭터·세계관 인물에 성별·나이대에 맞는 기본 사진을 골라 준다.
 * 사진은 전부 AI로 만든 가상 인물이고, 골라 둔 프리셋 목록(data/facePresets)만 쓴다.
 * 그 나이대 사진이 없으면 가장 가까운 나이대에서 고른다(10대 → 20대 초반, 50·60대 → 가장 나이 많은 사진).
 */
import type { AgeGroup, Gender } from '../types';
import { hashStr } from '../utils';
import { FACE_ALIAS } from './faceAlias';
import { FACE_PRESETS } from './facePresets';
import { AVATARS } from './photos';

/**
 * 사진 키 → 실제로 보이는 사진 키.
 * 기본 세계관 인물 중 자기 얼굴 사진이 없는 사람은 프리셋 얼굴을 대신 쓴다(data/faceAlias, 예전 세이브의 키도 그대로 통한다).
 */
export function resolveFace(key: string): string {
  return FACE_ALIAS[key] ?? key;
}

/** 이 사람들이 이미 쓰는 얼굴 사진(실제로 보이는 키) — 새 얼굴을 고를 때 겹치지 않게 */
export function usedFaceKeys(list: Iterable<{ avatar: { photo?: string } }>, skipId?: (x: { avatar: { photo?: string } }) => boolean): Set<string> {
  const out = new Set<string>();
  for (const x of list) if (x.avatar.photo && !skipId?.(x)) out.add(resolveFace(x.avatar.photo));
  return out;
}

/** 프리셋 얼굴의 나이대(프리셋이 아니면 undefined) */
export function faceAgeGroup(key: string | undefined): AgeGroup | undefined {
  if (!key) return undefined;
  const k = resolveFace(key);
  const f = faces().find((x) => x.key === k);
  return f ? (Math.min(60, Math.max(10, Math.floor(f.age / 10) * 10)) as AgeGroup) : undefined;
}

/** 프리셋 얼굴의 성별(프리셋이 아니면 undefined) */
export function faceGender(key: string | undefined): Gender | undefined {
  if (!key) return undefined;
  const k = resolveFace(key);
  return faces().find((f) => f.key === k)?.gender;
}

export interface FaceEntry {
  key: string;
  gender: Gender;
  age: number;
}

let cache: FaceEntry[] | null = null;
export function faces(): FaceEntry[] {
  if (!cache) cache = FACE_PRESETS.filter((f) => !!AVATARS[f.key]);
  return cache;
}

/** 나이대 가운데(25, 35 …)와의 거리 */
const distance = (f: FaceEntry, ageGroup: AgeGroup) => Math.abs(f.age - (ageGroup + 5));

/** 성별·나이대에 맞는 사진 키(이미 쓰는 사진은 피함, 같은 seed면 같은 결과) */
export function pickFace(gender: Gender, ageGroup: AgeGroup, used: Set<string>, seed: string): string | undefined {
  const all = faces().filter((f) => f.gender === gender);
  if (!all.length) return undefined;
  const exact = all.filter((f) => Math.floor(f.age / 10) * 10 === ageGroup);
  let pool = exact;
  if (!pool.length) {
    // 가장 가까운 나이의 사진들(최소 3장 후보)
    const sorted = [...all].sort((a, b) => distance(a, ageGroup) - distance(b, ageGroup));
    const cut = distance(sorted[Math.min(2, sorted.length - 1)], ageGroup);
    pool = sorted.filter((f) => distance(f, ageGroup) <= cut);
  }
  const free = pool.filter((f) => !used.has(f.key));
  const list = free.length ? free : pool;
  return list[hashStr(seed) % list.length].key;
}
