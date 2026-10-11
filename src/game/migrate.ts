/**
 * 예전 버전 세이브 고치기(기기에서 불러올 때 · DB에서 받을 때 공통)
 * - v1: 에너지·커피 제거, 인증 배지 변환
 * - v3: 난이도(보통)·아이템 기록·공통 캐릭터 설정 기본값, 모든 인물에 관계·말투 초기값(initRelation)
 * - v3.1: 기본 세계관 인물의 긴 설명(말투·이모지·말버릇 규칙)을 핵심 특징만 남긴 새 설명으로(사용자가 고친 설명은 그대로)
 * - v3.3: 연애 수위 값 이름 변경(normal→racy, spicy→erotic)
 * - v3.4: 등장인물(핵심 인물)은 반드시 사람 얼굴 사진 — 사진 없이 이모지만 쓰던 사람에게 성별·나이대에 맞는 프리셋 얼굴을 준다
 * 받은 객체(JSON에서 막 읽은 것)를 직접 고친다.
 */
import { separateFromPlayer } from './lookalike';
import { pickFace, resolveFace, themeOfWorld, usedFaceKeys } from '../data/facePool';
import { AVATARS } from '../data/photos';
import { findSeed } from '../data/worlds';
import { LEGACY_DESC_HASH } from '../data/worlds/legacy';
import type { Character, Scenario } from '../types';
import { hashStr } from '../utils';
import { initRelation } from './relationship';
import { KEEP } from './rules';

/** 얼굴 사진이 꼭 있어야 하는 사람: 핵심 인물(뉴스·단체·공통 캐릭터 제외). 공통 캐릭터는 실존 인물일 수 있어 가상 얼굴을 붙이지 않는다 */
const needsFace = (c: Character) => c.tier !== 'crowd' && !c.isNews && c.badge !== 'gold' && !c.rosterId && !c.inactive;
const hasFace = (c: Character) => !!(c.avatar?.mediaId || c.avatar?.url || c.avatar?.image || (c.avatar?.photo && AVATARS[resolveFace(c.avatar.photo)]));

/** 사진 없는 등장인물에게 프리셋 얼굴 주기(같은 인물이면 늘 같은 얼굴, 그 세계 안에서 겹치지 않게) */
function ensureFaces(sc: Scenario): void {
  const all = Object.values(sc.characters ?? {});
  const missing = all.filter((c) => c.avatar && needsFace(c) && !hasFace(c));
  if (!missing.length) return;
  const used = usedFaceKeys(all);
  if (sc.persona?.avatar?.photo) used.add(resolveFace(sc.persona.avatar.photo));
  for (const c of missing) {
    const key = pickFace(c.gender ?? (hashStr(c.id) % 2 ? 'm' : 'f'), used, c.id, themeOfWorld(sc.world?.templateId));
    if (!key) continue;
    c.avatar.photo = key;
    used.add(key);
  }
}

export function migrateScenarioData(raw: Scenario): Scenario {
  const sc = raw as Scenario & { energy?: unknown; wallet?: unknown };
  delete sc.energy;
  delete sc.wallet;
  for (const q of sc.quests ?? []) {
    const r = q.reward as { coffee?: number; xp?: number; followers?: number };
    if (r.coffee) {
      r.xp = (r.xp ?? 0) + r.coffee * 10;
      delete r.coffee;
    }
  }
  const day = sc.clock?.day ?? 1;
  const tid = sc.world?.templateId;
  for (const c of Object.values(sc.characters ?? {})) {
    if (c.badge === undefined) c.badge = c.isNews ? 'gold' : c.verified ? 'blue' : null;
    delete c.postPool;
    // v3.1: 손대지 않은 세계관 인물 설명 → 새 설명(핵심 특징만)
    if (tid && !c.custom && !c.rosterId && c.id.startsWith('ch_')) {
      const legacy = LEGACY_DESC_HASH[`${tid}:${c.id.slice(3)}`];
      if (legacy !== undefined && hashStr(c.description ?? '') === legacy) {
        const seed = findSeed(tid, c.id);
        if (seed) c.description = seed.description;
      }
    }
    initRelation(c, day);
  }
  ensureFaces(sc);
  // 플레이어와 헷갈리는 계정(같은·비슷한 이름, 같은 프사)이 남아 있지 않게
  if (sc.persona && sc.posts) separateFromPlayer(sc);
  // v3 기본값
  if (!sc.difficulty) sc.difficulty = 'normal';
  // v3.3: 연애 수위 이름 변경(normal→racy, spicy→erotic). 모르는 값은 기본(보통)으로
  {
    const lv = sc.romanceLevel as string | undefined;
    if (lv === 'normal') sc.romanceLevel = 'racy';
    else if (lv === 'spicy') sc.romanceLevel = 'erotic';
    else if (lv !== undefined && !['mild', 'racy', 'erotic'].includes(lv)) sc.romanceLevel = 'racy';
  }
  if (sc.boost === undefined) sc.boost = null;
  if (!Array.isArray(sc.itemLog)) sc.itemLog = [];
  else if (sc.itemLog.length > KEEP.itemLog) sc.itemLog.length = KEEP.itemLog;
  if (!sc.roster || !['on', 'off', 'select'].includes(sc.roster.mode)) sc.roster = { mode: 'off', ids: [] };
  if (!Array.isArray(sc.roster.ids)) sc.roster.ids = [];
  // 빠진 공통 캐릭터가 출연진에 남아 있지 않게
  if (Array.isArray(sc.cast)) sc.cast = sc.cast.filter((id) => sc.characters?.[id] && !sc.characters[id].inactive);
  return sc;
}
