/**
 * 내장 이벤트(세계관 파일에 미리 써 둔 것) — AI를 부르지 않는다(토큰 0)
 *   localVariant   : 템플릿 → 이벤트 후보
 *   pickLocalEvent : 아직 안 쓴 템플릿 중 하나를 골라 후보로
 * events.ts("다른 이벤트")와 tick.ts(절약 모드의 하루 정산)가 같이 쓴다.
 */
import { getWorldTemplate, type EventTemplate } from '../data/worlds';
import type { EventVariant, ID, Scenario } from '../types';
import { fill } from '../utils';
import { castChars } from './core';

/** 템플릿 → 후보(관련 인물은 지금 시나리오의 활동 중인 인물로) */
export function localVariant(sc: Scenario, t: EventTemplate): EventVariant | null {
  const cast = castChars(sc).filter((c) => !c.isNews);
  const out: ID[] = [];
  for (const key of t.involved ?? []) {
    const c = cast.find((x) => x.id === `ch_${key}`);
    if (c && !out.includes(c.id)) out.push(c.id);
  }
  for (const a of t.involvedArchetypes ?? []) {
    const c = cast.find((x) => x.archetype === a && x.tier !== 'crowd' && !out.includes(x.id)) ?? cast.find((x) => x.tier !== 'crowd' && !out.includes(x.id));
    if (c) out.push(c.id);
  }
  const need = (t.involved?.length ?? 0) + (t.involvedArchetypes?.length ?? 0);
  while (out.length < need) {
    const c = cast.find((x) => !out.includes(x.id));
    if (!c) break;
    out.push(c.id);
  }
  // 세계관 전용 인물이 하나도 없으면(직접 만든 세계관 등) 이 템플릿은 어색하다
  if (need > 0 && !out.length) return null;
  const name = (id?: ID) => (id ? sc.characters[id]?.name : undefined) ?? '누군가';
  const vars = { me: sc.persona.name, a: name(out[0]), b: name(out[1]) };
  return {
    emoji: t.emoji,
    title: fill(t.title, vars),
    body: fill(t.body, vars),
    // 선택지는 쓰지 않는다(플레이어가 직접 답한다)
    choices: [],
    involved: out,
    templateKey: t.key,
  };
}

/** 아직 안 쓴 내장 이벤트 하나(없으면 null). used = 이미 쓴 템플릿 키 */
export function pickLocalEvent(sc: Scenario, used: string[]): EventVariant | null {
  const titles = new Set(sc.events.map((e) => e.title));
  const pool = (getWorldTemplate(sc.world.templateId)?.events ?? []).filter((t) => !used.includes(t.key));
  for (const t of [...pool].sort(() => Math.random() - 0.5)) {
    const v = localVariant(sc, t);
    if (v && !titles.has(v.title)) return v;
  }
  return null;
}
