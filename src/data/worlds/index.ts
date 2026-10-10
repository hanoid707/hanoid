/**
 * 기본 세계관 6종
 * - 세계관마다 파일 하나(core 10명 내외 + 일반 유저 15명, 이벤트 7개, 장면 사진 6장).
 * - 실존 인물·단체는 쓰지 않았다(가상의 인물·구단·회사). 원작 소설(뉴로맨서)은 세계 규칙만 빌려왔다.
 * - 캐릭터는 전부 성인 설정.
 */
import type { CharacterSeed, WorldTemplate } from '../worldTypes';
import { CYBERPUNK } from './cyberpunk';
import { FOOTBALL } from './football';
import { INFLUENCER } from './influencer';
import { MILITARY } from './military';
import { OFFICE } from './office';
import { YOUTUBER } from './youtuber';

export type { CharacterSeed, EventTemplate, WorldTemplate } from '../worldTypes';

export const WORLDS: WorldTemplate[] = [CYBERPUNK, FOOTBALL, OFFICE, MILITARY, YOUTUBER, INFLUENCER];

export function getWorldTemplate(id: string | null | undefined): WorldTemplate | undefined {
  if (!id) return undefined;
  return WORLDS.find((w) => w.id === id);
}

/** 캐릭터 ID('ch_키') → 세계관 원본 설정 */
export function findSeed(templateId: string | null | undefined, characterId: string): CharacterSeed | undefined {
  const w = getWorldTemplate(templateId);
  if (!w || !characterId.startsWith('ch_')) return undefined;
  const key = characterId.slice(3);
  return w.cast.find((c) => c.key === key);
}

/** 세계관 장면 사진 키(src/data/photos.ts의 SCENES 키) */
export function sceneKey(worldId: string, key: string): string {
  return `${worldId}__${key}`;
}
