/**
 * 기본 얼굴 사진 풀 — 직접 만든 캐릭터(첫 팔로워 등)에 성별·나이대에 맞는 기본 사진을 골라 준다.
 * 세계관 파일의 photo 사양(kind=face, gender, age)을 그대로 쓴다. 사진은 전부 AI로 만든 가상 인물.
 * 그 나이대 사진이 없으면 가장 가까운 나이대에서 고른다(10대 → 20대 초반, 50·60대 → 가장 나이 많은 사진).
 */
import type { AgeGroup, Gender } from '../types';
import { hashStr } from '../utils';
import { AVATARS } from './photos';
import { WORLDS } from './worlds';

export interface FaceEntry {
  key: string;
  gender: Gender;
  age: number;
}

let cache: FaceEntry[] | null = null;
export function faces(): FaceEntry[] {
  if (!cache) {
    cache = [];
    for (const w of WORLDS) {
      for (const s of w.cast) {
        const p = s.photo;
        const key = `${w.id}__${s.key}`;
        if (p.kind === 'face' && p.gender && p.age && AVATARS[key]) cache.push({ key, gender: p.gender, age: p.age });
      }
    }
  }
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
