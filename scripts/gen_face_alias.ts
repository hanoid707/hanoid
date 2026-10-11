// @ts-nocheck — 노드에서 한 번 돌리는 생성 스크립트(앱 번들에 들어가지 않는다)
/**
 * 얼굴 사진 대신 쓰기 표(src/data/faceAlias.ts) 만들기 — 실행: npx tsx scripts/gen_face_alias.ts
 *
 * 기본 세계관의 "사람" 계정(핵심 인물 전원 + 얼굴 사진을 쓰는 일반 유저)에게 얼굴 풀(data/facePresets)에서
 * 그 세계 분위기(군복·축구·네온·회사·여행·인플루언서)와 성별에 맞는 사진을, 한 세계관 안에서 겹치지 않게 골라 준다.
 *  - 결과는 고정 표(같은 입력이면 같은 결과). 사진·인물을 바꾼 뒤 다시 실행한다.
 *  - 뉴스·단체 계정(logo)과 얼굴 없는 일반 유저(반려동물·풍경 사진)는 자기 사진을 그대로 쓴다.
 *  - 예전 프리셋 키(preset__*)와 풀에서 뺀 얼굴(scripts/faces/removed.json)도 새 얼굴로 이어 준다(예전 세이브의 직접 만든 캐릭터·내 프로필이 이모지로 떨어지지 않게).
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { FACE_PRESETS } from '../src/data/facePresets';
import { WORLDS } from '../src/data/worlds';

/** 세계관 → 사진 분위기(1순위, 2순위) */
const THEME: Record<string, string[]> = {
  cyberpunk: ['cyberpunk'],
  football: ['football'],
  office: ['office'],
  military: ['military'],
  youtuber: ['travel', 'daily'],
  influencer: ['influencer'],
};
/** 얼굴 없는 사진을 쓰던 핵심 인물(익명 계정)의 성별 */
const CORE_FACELESS: Record<string, 'm' | 'f'> = {
  cyberpunk__mute: 'f',
  football__rater: 'm',
  office__toesa: 'f',
  military__bulchim: 'f',
  influencer__adcheck: 'f',
};
/** 자기 사진을 그대로 쓰는 사람(외국인 선수 — 전용 사진이 avatars 폴더에 따로 있다) */
const KEEP = new Set(['football__abel', 'football__rocha']);
/** 예전 프리셋 키(지금은 없는 사진) — 성별만 맞춰 새 얼굴로 잇는다 */
const OLD_PRESETS =
  'f_01br f_02br f_03bl f_06bl f_07tl f_08tl f_14tr f_50tr f_56tr f_61tr f_64tl f_66br m_01tr m_04b1 m_04t2 m_06br m_06tr m_07br m_08br m_08tr m_51tl m_52tl m_53bl m_54bl m_55bl m_58tl m_61tl m_62bl m_64br m_66tl'.split(
    ' ',
  );

// 고정 난수(같은 입력 → 같은 결과)
let seed = 20261011;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const globalUse = new Map<string, number>();
const alias: Record<string, string> = {};
const report: string[] = [];
const pickFor = (g: 'm' | 'f', themes: string[], used: Set<string>, core: boolean) => {
  let best: (typeof FACE_PRESETS)[number] | undefined;
  let bestCost = Infinity;
  for (const f of FACE_PRESETS) {
    if (f.gender !== g || used.has(f.key)) continue;
    const ti = themes.indexOf(f.theme);
    // 분위기가 맞을수록, 한국인일수록(기본 세계관은 한국 배경), 다른 세계관에서 덜 쓴 얼굴일수록 먼저
    const cost = (ti === 0 ? 0 : ti > 0 ? 2 : f.theme === 'daily' ? (core ? 6 : 3) : 12) + (f.origin === 'fr' ? 6 : 0) + (globalUse.get(f.key) ?? 0) * 5 + rnd() * 1.5;
    if (cost < bestCost) {
      best = f;
      bestCost = cost;
    }
  }
  return best;
};

for (const w of WORLDS) {
  const used = new Set<string>();
  const themes = THEME[w.id] ?? ['daily'];
  const needs = w.cast
    .map((c) => {
      const key = `${w.id}__${c.key}`;
      if (KEEP.has(key) || c.isNews || c.org) return null;
      const g = CORE_FACELESS[key] ?? (c.photo.kind === 'face' ? c.photo.gender : undefined);
      return g ? { key, name: c.name, tier: c.tier, g } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => (a.tier === b.tier ? 0 : a.tier === 'core' ? -1 : 1));
  for (const n of needs) {
    const best = pickFor(n.g, themes, used, n.tier === 'core');
    if (!best) {
      report.push(`!! ${n.key} (${n.g}) 얼굴 없음`);
      continue;
    }
    alias[n.key] = best.key;
    used.add(best.key);
    globalUse.set(best.key, (globalUse.get(best.key) ?? 0) + 1);
    report.push(`${n.key} (${n.g}, ${n.tier}) ${n.name} → ${best.key} [${best.theme}${best.origin === 'fr' ? ', 외국인' : ''}]`);
  }
}
const castCount = Object.keys(alias).length;
{
  // 예전 프리셋끼리만 안 겹치면 된다(남자 얼굴은 수가 적어 세계관 인물과는 겹칠 수 있다)
  const used = new Set<string>();
  for (const k of OLD_PRESETS) {
    const best = pickFor(k[0] as 'm' | 'f', ['daily'], used, false);
    if (!best) continue;
    alias[`preset__${k}`] = best.key;
    used.add(best.key);
  }
}

// 풀에서 뺀 얼굴(안경·골든아워·역광 등)을 쓰던 예전 세이브: 성별·분위기·머리가 비슷한 얼굴로 잇는다
let removedCount = 0;
{
  const file = join(__dirname, 'faces', 'removed.json');
  const removed: { key: string; gender: 'm' | 'f'; theme: string; hair: string; origin: string }[] = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  const use = new Map<string, number>();
  for (const r of removed) {
    if (FACE_PRESETS.some((f) => f.key === r.key)) continue;
    let best: (typeof FACE_PRESETS)[number] | undefined;
    let bestCost = Infinity;
    for (const f of FACE_PRESETS) {
      if (f.gender !== r.gender) continue;
      const cost = (f.theme === r.theme ? 0 : f.theme === 'daily' ? 3 : 6) + (f.hair === r.hair ? 0 : 2) + ((f.origin === 'fr') === (r.origin === 'fr') ? 0 : 5) + (use.get(f.key) ?? 0) * 4 + rnd();
      if (cost < bestCost) {
        best = f;
        bestCost = cost;
      }
    }
    if (!best) continue;
    alias[r.key] = best.key;
    use.set(best.key, (use.get(best.key) ?? 0) + 1);
    removedCount++;
  }
}

const lines = [
  '/**',
  ' * 얼굴 사진 대신 쓰기 표(자동 생성 — 직접 고치지 말고 scripts/gen_face_alias.ts 실행)',
  ' *  - 기본 세계관의 사람 계정은 여기 적힌 얼굴(data/facePresets)을 쓴다: 그 세계 분위기·성별 맞춤, 한 세계관 안에서 겹치지 않음.',
  ' *  - 키: <세계관ID>__<인물 key> 또는 예전 프리셋 키(preset__*) → 얼굴 풀의 사진 키. 예전 세이브에 저장된 키도 이 표를 거쳐 새 얼굴로 보인다.',
  ' */',
  'export const FACE_ALIAS: Record<string, string> = {',
  ...Object.entries(alias).map(([k, v]) => `  '${k}': '${v}',`),
  '};',
  '',
];
writeFileSync(join(__dirname, '..', 'src', 'data', 'faceAlias.ts'), lines.join('\n'), 'utf8');
console.log(report.join('\n'));
const reuse = [...globalUse.values()].filter((n) => n > 1).length;
console.log(`\n세계관 인물 ${castCount}명 배정 · 예전 프리셋 ${Object.keys(alias).length - castCount - removedCount}개 · 뺀 얼굴 ${removedCount}개 연결 · 두 세계관 이상에서 쓰인 얼굴 ${reuse}장`);
