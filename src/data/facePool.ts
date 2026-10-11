/**
 * 기본 얼굴 사진 풀 — 직접 만든 캐릭터·세계관 인물에 성별·세계 분위기에 맞는 기본 사진을 골라 준다.
 * 사진은 전부 AI로 만든 가상 인물(전원 20대)이고, 골라 둔 프리셋 목록(data/facePresets)만 쓴다.
 */
import type { Gender } from '../types';
import { hashStr } from '../utils';
import { FACE_ALIAS } from './faceAlias';
import { FACE_PRESETS, type FacePreset, type FaceTheme } from './facePresets';
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

/** 프리셋 얼굴의 성별(프리셋이 아니면 undefined) */
export function faceGender(key: string | undefined): Gender | undefined {
  if (!key) return undefined;
  const k = resolveFace(key);
  return faces().find((f) => f.key === k)?.gender;
}

export type FaceEntry = FacePreset;

let cache: FaceEntry[] | null = null;
export function faces(): FaceEntry[] {
  if (!cache) cache = FACE_PRESETS.filter((f) => !!AVATARS[f.key]);
  return cache;
}

/** 기본 세계관 → 그 세계에 어울리는 사진 분위기(복장·배경). 직접 만든 세계관은 일상 */
const WORLD_THEME: Record<string, FaceTheme> = { cyberpunk: 'cyberpunk', football: 'football', office: 'office', military: 'military', youtuber: 'travel', influencer: 'influencer' };
export function themeOfWorld(templateId: string | null | undefined): FaceTheme {
  return (templateId && WORLD_THEME[templateId]) || 'daily';
}

/**
 * 성별에 맞는 사진 키 — 그 세계 분위기(theme) 사진 → 일상 사진 → 나머지 순으로, 이미 쓰는 사진은 피해서 고른다(같은 seed면 같은 결과).
 * 사진은 전부 20대다(나이대로 고르지 않는다).
 */
export function pickFace(gender: Gender, used: Set<string>, seed: string, theme: FaceTheme = 'daily'): string | undefined {
  const all = faces().filter((f) => f.gender === gender);
  if (!all.length) return undefined;
  const free = all.filter((f) => !used.has(f.key));
  const tiers = [free.filter((f) => f.theme === theme), free.filter((f) => f.theme === 'daily'), free, all];
  const list = tiers.find((t) => t.length) ?? all;
  return list[hashStr(seed) % list.length].key;
}
