// @ts-nocheck — 노드에서 한 번 돌리는 생성 스크립트(앱 번들에 들어가지 않는다)
/**
 * 얼굴 사진 대신 쓰기 표(src/data/faceAlias.ts) 만들기 — 실행: npx tsx scripts/gen_face_alias.ts
 *
 * 기본 세계관 인물 가운데 "새 얼굴 사진이 없는 사람"(예전 품질 사진·얼굴 없는 사진을 쓰던 핵심 인물, 예전 품질 얼굴의 일반 유저)에게
 * 프리셋 얼굴(data/facePresets)을 성별·나이에 맞게, 한 세계관 안에서 겹치지 않게 골라 준다.
 *  - 결과는 고정 표(같은 입력이면 같은 결과). 사진·인물을 바꾼 뒤 다시 실행한다.
 *  - 뉴스·단체 계정(logo)과 얼굴 없는 일반 유저(반려동물·풍경 사진)는 그대로 둔다.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { FACE_PRESETS } from '../src/data/facePresets';
import { WORLDS } from '../src/data/worlds';

/** 얼굴 없는 사진을 쓰던 핵심 인물(익명 계정)의 성별·나이 */
const CORE_FACELESS: Record<string, { g: 'm' | 'f'; age: number }> = {
  cyberpunk__mute: { g: 'f', age: 24 },
  football__rater: { g: 'm', age: 29 },
  office__toesa: { g: 'f', age: 30 },
  military__bulchim: { g: 'f', age: 22 },
  influencer__adcheck: { g: 'f', age: 28 },
};
/** 자기 사진을 그대로 쓰는 사람(외국인 선수 — 프리셋에 어울리는 얼굴이 없다) */
const KEEP = new Set(['football__abel', 'football__rocha']);

// 고정 난수(같은 입력 → 같은 결과)
let seed = 20261011;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const PRESET = new Set(FACE_PRESETS.map((f) => f.key));
const globalUse = new Map<string, number>();
const alias: Record<string, string> = {};
const report: string[] = [];

for (const w of WORLDS) {
  const used = new Set<string>(w.cast.map((c) => `${w.id}__${c.key}`).filter((k) => PRESET.has(k)));
  const needs = w.cast
    .map((c) => {
      const key = `${w.id}__${c.key}`;
      if (PRESET.has(key) || KEEP.has(key) || c.isNews || c.org) return null;
      const manual = CORE_FACELESS[key];
      if (manual) return { key, name: c.name, tier: c.tier, ...manual };
      if (c.photo.kind !== 'face' || !c.photo.gender) return null;
      return { key, name: c.name, tier: c.tier, g: c.photo.gender, age: c.photo.age ?? 25 };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => (a.tier === b.tier ? 0 : a.tier === 'core' ? -1 : 1));
  for (const n of needs) {
    const cands = FACE_PRESETS.filter((f) => f.gender === n.g && !used.has(f.key));
    let best = cands[0];
    let bestCost = Infinity;
    for (const f of cands) {
      const cost = Math.abs(f.age - n.age) + (globalUse.get(f.key) ?? 0) * 6 + (f.key.startsWith('preset__') ? 0 : 5) + rnd() * 1.5;
      if (cost < bestCost) {
        best = f;
        bestCost = cost;
      }
    }
    if (!best) continue;
    alias[n.key] = best.key;
    used.add(best.key);
    globalUse.set(best.key, (globalUse.get(best.key) ?? 0) + 1);
    report.push(`${n.key} (${n.g}${n.age}, ${n.tier}) ${n.name} → ${best.key} (${best.age})`);
  }
}

const lines = [
  '/**',
  ' * 얼굴 사진 대신 쓰기 표(자동 생성 — 직접 고치지 말고 scripts/gen_face_alias.ts 실행)',
  ' *  - 기본 세계관 인물 중 자기 얼굴 사진이 없는 사람은 여기 적힌 프리셋 얼굴을 쓴다(성별·나이 맞춤, 한 세계관 안에서 겹치지 않음).',
  ' *  - 키: <세계관ID>__<인물 key> → data/facePresets 의 사진 키. 예전 세이브에 저장된 사진 키도 이 표를 거쳐 새 얼굴로 보인다.',
  ' */',
  'export const FACE_ALIAS: Record<string, string> = {',
  ...Object.entries(alias).map(([k, v]) => `  '${k}': '${v}',`),
  '};',
  '',
];
writeFileSync(join(__dirname, '..', 'src', 'data', 'faceAlias.ts'), lines.join('\n'), 'utf8');
console.log(report.join('\n'));
const reuse = [...globalUse.values()].filter((n) => n > 1).length;
console.log(`\n${Object.keys(alias).length}명 배정 · 두 번 이상 쓰인 얼굴 ${reuse}장`);
