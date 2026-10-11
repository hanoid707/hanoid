/**
 * 인물 정보 채우기 — 세이브마다 한 번, 뒤에서(AI 1회)
 *   AI가 인물 설정·관계 메모·지금까지의 일을 읽고 ① 빠진 계급·직함·나이 ② 인물끼리 누가 누구를 사랑하는지(사랑 스탯)
 *   ③ 사랑에 관심 없는 사람(1/3 이상) ④ 첫 속마음을 정한다. 이미 적혀 있는 값(사용자가 정한 직함·나이·사랑 수치)은 건드리지 않는다.
 *   언제: 이야기를 열 때(홈 화면) · 새 이야기를 만든 직후 · 하루 정산 전. 예전에 만든 세이브도 처음 열 때 한 번 채워진다.
 *   인물이 많으면 12명씩 나눠 여러 번 부른다(한 번에 다 넣으면 빠뜨리는 인물이 생긴다).
 *   AI가 답하지 못하면 다음에 다시(1분 쉬고), 세 번 실패하면 규칙으로 채운다(love.seedLove · 나이는 자리별 현실 나이표).
 * 진행 중 표시: busy['bonds:<시나리오ID>'] (화면 위 칩 "인물 관계를 정리하는 중")
 */
import { buildContext, createEngine } from '../ai';
import type { CastBonds } from '../ai/types';
import { ageForTitle, fitAge } from '../data/ageNorms';
import { cleanRank } from '../data/castMeta';
import type { ID, Scenario } from '../types';
import { clamp } from '../utils';
import { G, tune } from './core';
import { ensureLoveOff, heartEligible, lovable, lovables, seedLove, setHeart } from './love';
import { logActivity } from './progress';

/** 2: 인물이 많은 세이브를 12명씩 나눠 전원 채운다(1에서는 앞의 16명만 물어봐서 빠진 인물이 있었다) */
export const BOND_VERSION = 2;
const BATCH = 12;
const MAX_TRY = 3;
const lastTry = new Map<ID, number>();

export function bondsDue(sc: Scenario | undefined | null): sc is Scenario {
  return !!sc && (sc.bondV ?? 0) < BOND_VERSION && lovables(sc).length >= 2;
}

/** 자리(직함)는 있는데 나이가 없는 사람: 자리별 현실 나이로 채운다 */
function fillAges(d: Scenario): void {
  for (const c of Object.values(d.characters)) {
    if (c.age || c.isNews || c.badge === 'gold' || !c.title) continue;
    const age = ageForTitle(c.title, c.id);
    if (age) c.age = age;
  }
}

/** AI가 정한 값 적용(빠진 것만 채운다) */
function applyBonds(d: Scenario, r: CastBonds): void {
  for (const x of r.info) {
    const c = d.characters[x.id];
    if (!lovable(c)) continue;
    if (!c.title && x.title) c.title = cleanRank(x.title);
    if (!c.age) {
      const age = fitAge(c.title ?? x.title, x.age, c.id);
      if (age) c.age = age;
    }
    if (!c.loves && x.loves.length) {
      const m: Record<ID, number> = {};
      for (const l of x.loves) {
        const o = d.characters[l.to];
        if (lovable(o) && o.id !== c.id && o.relationBase !== 'family' && c.relationBase !== 'family') m[o.id] = clamp(Math.round(l.v), 10, 85);
      }
      if (Object.keys(m).length) c.loves = m;
    }
    if (x.off && !c.loves) c.loveOff = true;
  }
  for (const h of r.hearts) {
    const c = d.characters[h.id];
    if (c && heartEligible(d, c)) setHeart(d, h.id, h.text);
  }
}

export async function ensureBonds(sid: ID): Promise<void> {
  const sc = G().scenarios[sid];
  if (!bondsDue(sc)) return;
  const key = `bonds:${sid}`;
  if (G().busy[key]) return;
  if (Date.now() - (lastTry.get(sid) ?? 0) < 60_000) return;
  lastTry.set(sid, Date.now());
  G().setBusy(key, true);
  try {
    // 자리·나이가 빈 인물부터, 12명씩 나눠서(받는 대로 바로 적용 — 다음 묶음은 앞 묶음의 결과를 보고 쓴다)
    const todo = lovables(sc)
      .sort((a, b) => Number(!!a.age) - Number(!!b.age))
      .map((c) => c.id);
    const ai = createEngine(G().settings.ai, () => {});
    let ok = true;
    const batches: ID[][] = [];
    for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
    // 마지막에 한 번 더: AI가 빠뜨려서 자리·나이가 아직 빈 인물만 모아 다시 묻는다
    batches.push([]);
    for (let b = 0; b < batches.length && ok; b++) {
      const cur = G().scenarios[sid];
      if (!cur) return;
      const last = b === batches.length - 1;
      const ids = (last ? todo.filter((id) => !cur.characters[id]?.age).slice(0, BATCH) : batches[b]).filter((id) => cur.characters[id] && !cur.characters[id].inactive);
      if (!ids.length) continue;
      let r: CastBonds | null = null;
      try {
        // 뒤에서 하는 일이라 실패해도 알림을 띄우지 않는다
        r = await ai.castBonds({ ...buildContext(cur), tune: tune() }, ids);
      } catch {
        r = null;
      }
      if (!G().scenarios[sid]) return;
      if (!r) {
        // 다시 묻는 마지막 묶음은 실패해도 넘어간다(앞에서 받은 것으로 마무리)
        if (!last) ok = false;
        break;
      }
      const got = r;
      G().edit(sid, (d) => applyBonds(d, got));
    }
    G().edit(sid, (d) => {
      if ((d.bondV ?? 0) >= BOND_VERSION) return;
      if (ok) {
        // 사랑에 관심 없는 사람이 1/3 이상이 되게(모자라면 가장 약한 짝사랑부터 정리)
        ensureLoveOff(d, true);
        fillAges(d);
        d.bondV = BOND_VERSION;
        delete d.bondTry;
        logActivity(d, '🧭', '인물들의 자리·나이·서로를 향한 마음을 정리했어요');
        return;
      }
      d.bondTry = (d.bondTry ?? 0) + 1;
      if (d.bondTry >= MAX_TRY) {
        seedLove(d);
        fillAges(d);
        d.bondV = BOND_VERSION;
        delete d.bondTry;
      }
    });
  } finally {
    G().setBusy(key, false);
  }
}
