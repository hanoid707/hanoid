/**
 * 인물끼리의 마음 · 속마음 · 플레이어와 한 스킨십 — 순수 함수만(스토어·AI를 부르지 않는다)
 *
 *   사랑 스탯  인물 A가 인물 B를 향한 사랑 0~100(Character.loves[B]). 플레이어를 향한 사랑은 설렘(romance).
 *             A→B 63인데 B→A 0일 수 있다(짝사랑). 여러 명을 좋아할 수 있고, 그럴 땐 수치가 가장 높은 쪽을 따라간다(topLove).
 *   오르는 폭  어울리는 사건 한 번에 +20~+38(빠르게). 77부터는 천천히(+2~+5). 실망·다툼은 그대로 내려간다.
 *   무관심     일·자기 생활이 먼저인 사람(loveOff)이 전체의 1/3 이상 — 특별한 사건(+30 이상)이 있을 때만 마음이 생긴다.
 *   질투       내가 좋아하는 사람이 플레이어에게 마음이 있으면 플레이어가 거슬린다(jealousOf).
 *   속마음     여성이고 호감도가 기준(세계관 설정, 기본 50) 이상일 때만 프로필에 보인다(heartVisible). 글은 AI가 쓴다.
 *   스킨십     플레이어가 괄호로 쓴 행동·쪽지에서 실제로 한 스킨십을 인물에 적어 둔다(touch) → 깊은 사이면 뒷날 그 수준의 새 일화를 글로 쓴다.
 */
import { faceGender } from '../data/facePool';
import type { Character, Gender, ID, LoveDelta, Scenario } from '../types';
import { clamp, hashStr } from '../utils';

export const HEART_MIN_DEFAULT = 50;
/** 여기부터는 사랑이 천천히 오른다 */
export const LOVE_SLOW = 77;
const LOVE_STEP: [number, number] = [20, 38];

export const genderOf = (c: Character): Gender | undefined => c.gender ?? faceGender(c.avatar?.photo);
export const heartMinOf = (sc: Pick<Scenario, 'heartMin'>): number => clamp(Math.round(sc.heartMin ?? HEART_MIN_DEFAULT), 0, 100);

/** 마음을 주고받는 사람: 이야기의 중심 인물(뉴스·단체·공통 캐릭터·10대·빠진 인물 제외) */
export function lovable(c: Character | undefined): c is Character {
  return !!c && !c.inactive && c.tier !== 'crowd' && !c.isNews && c.badge !== 'gold' && !c.rosterId && c.ageGroup !== 10;
}
/** lovable과 같지만 타입을 좁히지 않는다(아닌 쪽에서도 인물을 계속 쓸 때) */
export const canLove = (c: Character): boolean => lovable(c);
export const lovables = (sc: Scenario): Character[] => sc.cast.map((id) => sc.characters[id]).filter(lovable);

// ───────────────────────── 속마음

/** 속마음을 쓸 수 있는 인물(여성 + 호감도 기준 이상) */
export function heartEligible(sc: Scenario, c: Character): boolean {
  return !c.inactive && !c.isNews && c.badge !== 'gold' && genderOf(c) === 'f' && c.affinity >= heartMinOf(sc);
}
/** 프로필에 보일 속마음(조건이 안 맞거나 아직 없으면 빈 글자) */
export function heartShown(sc: Scenario, c: Character): string {
  return c.heart && heartEligible(sc, c) ? c.heart : '';
}
/** 오늘 속마음을 새로 받을 인물(없는 사람 먼저 → 오래된 사람, 최대 n명) */
export function heartTargets(sc: Scenario, n = 3): Character[] {
  const day = sc.clock.day;
  return sc.cast
    .map((id) => sc.characters[id])
    .filter((c): c is Character => !!c && heartEligible(sc, c) && (c.heartDay ?? -9) < day)
    // 아직 속마음이 없는 사람 → 이야기의 중심 인물 → 오래된 사람 → 호감도 높은 사람
    .sort((a, b) => (a.heart ? 1 : 0) - (b.heart ? 1 : 0) || (a.tier === 'crowd' ? 1 : 0) - (b.tier === 'crowd' ? 1 : 0) || (a.heartDay ?? -9) - (b.heartDay ?? -9) || b.affinity - a.affinity)
    .slice(0, n);
}
export function setHeart(d: Scenario, id: ID, text: string): void {
  const c = d.characters[id];
  const t = text.replace(/\s+/g, ' ').trim().slice(0, 44);
  if (!c || !t) return;
  c.heart = t;
  c.heartDay = d.clock.day;
}

// ───────────────────────── 사랑 스탯

export const loveOf = (c: Character | undefined, to: ID): number => clamp(Math.round(c?.loves?.[to] ?? 0), 0, 100);

/** 한 번의 사건으로 바뀐 뒤의 값: 오를 땐 +20~+38(77부터는 +2~+5), 내릴 땐 그대로(최대 -30) */
export function growLove(cur: number, delta: number): number {
  if (!delta) return cur;
  if (delta < 0) return clamp(cur + Math.max(-30, Math.round(delta)), 0, 100);
  if (cur >= LOVE_SLOW) return clamp(cur + clamp(Math.round(delta / 8), 2, 5), 0, 100);
  const next = cur + clamp(Math.round(delta), LOVE_STEP[0], LOVE_STEP[1]);
  return clamp(next > LOVE_SLOW ? LOVE_SLOW + Math.max(1, Math.round((next - LOVE_SLOW) / 8)) : next, 0, 100);
}

export interface LoveChange {
  from: ID;
  to: ID;
  before: number;
  after: number;
}

/** AI가 알려 준 인물끼리의 사랑 변화 적용(한 번에 3건까지). 바뀐 것만 돌려준다 */
export function applyLoveDeltas(d: Scenario, list: LoveDelta[] | undefined): LoveChange[] {
  const out: LoveChange[] = [];
  const seen = new Set<string>();
  for (const x of list ?? []) {
    if (out.length >= 3) break;
    const a = d.characters[x.from];
    const b = d.characters[x.to];
    if (!lovable(a) || !lovable(b) || a.id === b.id || !x.d || seen.has(`${a.id}>${b.id}`)) continue;
    seen.add(`${a.id}>${b.id}`);
    const before = loveOf(a, b.id);
    if (x.d < 0 && before <= 0) continue;
    // 사랑에 관심 없던 사람: 특별한 사건(+30 이상)일 때만 마음이 생긴다
    if (x.d > 0 && a.loveOff) {
      if (x.d < 30) continue;
      a.loveOff = false;
    }
    const after = growLove(before, x.d);
    if (after === before) continue;
    a.loves = { ...(a.loves ?? {}), [b.id]: after };
    if (after <= 0) delete a.loves[b.id];
    out.push({ from: a.id, to: b.id, before, after });
  }
  return out;
}

/** 편집기에서 직접 정한 값으로 바꾼다(0은 지운다) */
export function setLoves(d: Scenario, id: ID, loves: Record<ID, number>, loveOff?: boolean): void {
  const c = d.characters[id];
  if (!c) return;
  const next: Record<ID, number> = {};
  for (const [to, v] of Object.entries(loves)) {
    const n = clamp(Math.round(v), 0, 100);
    if (n > 0 && to !== id && d.characters[to]) next[to] = n;
  }
  c.loves = Object.keys(next).length ? next : undefined;
  if (loveOff !== undefined) c.loveOff = loveOff && !c.loves ? true : undefined;
}

export interface LoveRow {
  id: ID | 'me';
  name: string;
  v: number;
}

/** 프로필에 보일 줄: 내가 좋아하는 인물 + 나를 좋아하는 인물(그쪽은 내 수치가 0이어도 보인다 — "A 사랑: 0") */
export function loveRows(sc: Scenario, c: Character): LoveRow[] {
  const rows = new Map<ID, number>();
  for (const [to, v] of Object.entries(c.loves ?? {})) if (v > 0 && lovable(sc.characters[to])) rows.set(to, clamp(Math.round(v), 0, 100));
  for (const o of lovables(sc)) if (o.id !== c.id && loveOf(o, c.id) > 0 && !rows.has(o.id)) rows.set(o.id, 0);
  return [...rows.entries()]
    .map(([id, v]) => ({ id, name: sc.characters[id].name, v }))
    .sort((a, b) => b.v - a.v);
}

/** 이 인물이 지금 가장 사랑하는 대상(플레이어 포함, 20 미만이면 없음) — 여러 명을 좋아하면 가장 높은 쪽을 따라간다 */
export function topLove(sc: Scenario, c: Character): LoveRow | null {
  const all: LoveRow[] = [];
  const rom = lovable(c) && c.relationBase !== 'family' ? (c.romance ?? 0) : 0;
  if (rom > 0) all.push({ id: 'me', name: sc.persona.name, v: rom });
  for (const [to, v] of Object.entries(c.loves ?? {})) {
    const o = sc.characters[to];
    if (v > 0 && lovable(o)) all.push({ id: to, name: o.name, v });
  }
  all.sort((a, b) => b.v - a.v);
  return all[0] && all[0].v >= 20 ? all[0] : null;
}

/** 질투: 내가 좋아하는(30↑) 사람이 플레이어에게 마음(설렘 30↑)이 있고, 나는 플레이어보다 그 사람이 더 좋다 → 그 사람들 */
export function jealousOf(sc: Scenario, c: Character): Character[] {
  if (!lovable(c)) return [];
  const mine = c.romance ?? 0;
  return Object.entries(c.loves ?? {})
    .filter(([to, v]) => v >= 30 && v > mine && lovable(sc.characters[to]) && (sc.characters[to].romance ?? 0) >= 30)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([to]) => sc.characters[to]);
}

// ───────────────────────── 처음 값(AI가 채우지 못했을 때 · AI 값 다듬기)

const OFF_SCORE: Partial<Record<Character['archetype'], number>> = { mentor: 3, troll: 3, chaos: 2, celeb: 2, rival: 1, bestie: 1, fan: 0, crush: -9 };
const hasHeart = (c: Character) => Object.values(c.loves ?? {}).some((v) => v > 0) || (c.romance ?? 0) >= 25;

/**
 * 사랑에 관심 없는 사람이 1/3 이상이 되게 맞춘다.
 * 아무도 안 좋아하는 사람부터 loveOff로 두고, 그래도 모자라면(prune) 가장 약한 짝사랑부터 지운다.
 */
export function ensureLoveOff(d: Scenario, prune = false): void {
  const pool = lovables(d);
  if (pool.length < 3) return;
  const need = Math.ceil(pool.length / 3);
  for (const c of pool) if (c.loveOff && hasHeart(c)) c.loveOff = undefined;
  const count = () => pool.filter((c) => c.loveOff).length;
  const free = pool
    .filter((c) => !c.loveOff && !hasHeart(c))
    .sort((a, b) => (OFF_SCORE[b.archetype] ?? 0) - (OFF_SCORE[a.archetype] ?? 0) || (hashStr(a.id) % 97) - (hashStr(b.id) % 97));
  for (const c of free) {
    if (count() >= need) break;
    c.loveOff = true;
  }
  if (!prune) return;
  // 플레이어에게 마음이 없는데 남만 좋아하는 사람 중 가장 약한 마음부터 정리
  const weak = pool
    .filter((c) => !c.loveOff && (c.romance ?? 0) < 25 && c.loves)
    .sort((a, b) => Math.max(...Object.values(a.loves!)) - Math.max(...Object.values(b.loves!)));
  for (const c of weak) {
    if (count() >= need) break;
    c.loves = undefined;
    c.loveOff = true;
  }
}

/** AI 없이 규칙으로 채우는 처음 값(같은 세계면 늘 같은 결과): 1/3 이상은 무관심, 나머지 중 일부가 다른 인물을 좋아한다(대부분 짝사랑) */
export function seedLove(d: Scenario): void {
  const pool = lovables(d);
  if (pool.length < 3 || pool.some((c) => c.loves && Object.keys(c.loves).length)) return ensureLoveOff(d);
  ensureLoveOff(d);
  // 남을 좋아하는 쪽: 또래 친구·동기·팬 같은 사람만(멘토·셀럽·악플러는 제외). 상대도 악플러·셀럽이 아닌 사람, 나이 차 8살 이내
  const LOVER: Character['archetype'][] = ['bestie', 'rival', 'fan', 'crush', 'chaos'];
  const open = pool.filter((c) => !c.loveOff && LOVER.includes(c.archetype));
  for (const c of open) {
    const h = hashStr(`${d.id}:${c.id}:love`);
    const likesMe = c.archetype === 'crush' || (c.romance ?? 0) >= 25;
    // 플레이어를 좋아하는 사람은 가끔만(4명 중 1명) 다른 사람도 좋아한다. 그 밖은 절반
    if (likesMe ? h % 4 !== 0 : h % 2 !== 0) continue;
    const g = genderOf(c);
    const targets = pool.filter(
      (o) => o.id !== c.id && o.relationBase !== 'family' && o.archetype !== 'troll' && o.archetype !== 'celeb' && (!g || !genderOf(o) || genderOf(o) !== g) && (!c.age || !o.age || Math.abs(c.age - o.age) <= 8),
    );
    if (!targets.length) continue;
    const to = targets[(h >>> 3) % targets.length];
    c.loves = { [to.id]: 25 + ((h >>> 7) % 41) };
  }
}

// ───────────────────────── 플레이어와 한 스킨십

/** 낱말 → [적어 둘 이름, 수준(높을수록 깊다)] */
const TOUCH: [RegExp, string, number][] = [
  [/키스|입맞|입을 맞/, '키스', 5],
  [/뽀뽀/, '뽀뽀', 4],
  [/백허그/, '백허그', 3],
  [/포옹|껴안|끌어안|안아\s?[줬주준]|안았|안겼|안긴|품에 안|꼭 안/, '포옹', 3],
  [/무릎베개|무릎을 베/, '무릎베개', 3],
  [/업어|업었|업고|업힌|업혀/, '업어 주기', 3],
  [/손깍지|깍지/, '손깍지', 2],
  [/손을? ?잡/, '손잡기', 2],
  [/팔짱/, '팔짱', 2],
  [/어깨에 기대|기대어|기댔/, '어깨에 기대기', 2],
  [/어깨동무/, '어깨동무', 1],
  [/쓰다듬/, '머리 쓰다듬기', 1],
];
const levelOf = (act: string) => TOUCH.find((t) => t[1] === act)?.[2] ?? 3;

/** 글에서 스킨십 찾기(가장 깊은 것 하나). 하고 싶다·할까 같은 바람은 빼고 실제로 한 것만 */
export function detectTouch(text: string): string | null {
  if (!text || /싶|할까|줄까|볼까|해도 ?돼|해 ?줘|해 ?달|하자|하면 ?안|할래|줄래|[을를] ?원/.test(text)) return null;
  let best: [string, number] | null = null;
  for (const [re, name, lv] of TOUCH) if (re.test(text) && (!best || lv > best[1])) best = [name, lv];
  return best?.[0] ?? null;
}

/** 플레이어가 괄호로 쓴 행동 "(지수를 안아 준다)"에서 스킨십 찾기 */
export function detectTouchInParens(text: string): string | null {
  let best: string | null = null;
  for (const m of text.matchAll(/[(（]([^()（）]{2,80})[)）]/g)) {
    const t = detectTouch(m[1]);
    if (t && (!best || levelOf(t) > levelOf(best))) best = t;
  }
  return best;
}

/** 글에 이름·@아이디가 나온 인물(마음을 주고받는 인물만) */
export function mentionedLovables(d: Scenario, text: string): ID[] {
  const lower = text.toLowerCase();
  return lovables(d)
    .filter((c) => lower.includes(`@${c.handle.toLowerCase()}`) || (c.name.match(/[가-힣]{2,}/g) ?? []).some((w) => w !== d.persona.name && text.includes(w)))
    .map((c) => c.id);
}

/** 플레이어와 한 스킨십을 인물에 적어 둔다(같은 행위는 날짜만 고친다, 최근 3개) */
export function noteTouch(d: Scenario, id: ID, act: string | null | undefined): boolean {
  const c = d.characters[id];
  const a = (act ?? '').replace(/\s+/g, ' ').trim().slice(0, 14);
  if (!lovable(c) || c.relationBase === 'family' || a.length < 2) return false;
  const list = (c.touch ?? []).filter((t) => t.act !== a);
  list.push({ act: a, day: d.clock.day });
  c.touch = list.slice(-3);
  return true;
}

/** 오늘 "플레이어와 또 그만큼의 스킨십을 했다"는 새 글을 쓸 수 있는 인물(깊은 사이 + 전에 한 스킨십이 있음, 이틀에 한 번꼴, 최대 2명) */
export function touchCandidates(sc: Scenario): { c: Character; act: string }[] {
  const day = sc.clock.day;
  return lovables(sc)
    .filter((c) => {
      const last = c.touch?.[c.touch.length - 1];
      if (!last || last.day >= day) return false;
      const deep = c.relation === 'lover' || c.relation === 'spicy' || c.relation === 'bestie' || (c.romance ?? 0) >= 50 || c.affinity >= 70;
      return deep && hashStr(`${sc.id}:${c.id}:${day}:touch`) % 2 === 0;
    })
    .map((c) => {
      // 가장 깊었던 것(같으면 최근 것)
      const best = [...c.touch!].sort((a, b) => levelOf(b.act) - levelOf(a.act) || b.day - a.day)[0];
      return { c, act: best.act };
    })
    .sort((a, b) => (b.c.romance ?? 0) + b.c.affinity - ((a.c.romance ?? 0) + a.c.affinity))
    .slice(0, 2);
}
