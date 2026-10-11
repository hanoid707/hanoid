/**
 * 시간 — 하루 정산(월드 틱), 시간 건너뛰기, 타임라인 새로고침
 * 하루 정산 = ① 규칙 정리(즉시: 평판 회복·떡상 종료·대화방 복귀·지난 미션 정리)
 *            ② AI 1회(뒤에서: 캐릭터 글·뉴스·트렌드·새 이벤트·먼저 오는 쪽지·오늘의 미션 + 글쓰기 제안·속마음·인물끼리의 사랑 변화)
 * (v3.1) 시간 건너뛰기는 ①만 기다리고 바로 끝난다 — ②는 뒤에서 돌고 시계 칩에 ⏳로 보인다.
 *        ②가 실패하면 그날 AI 몫을 비워 두지 않고 다음 새로고침·시간 이동 때 다시 시도한다(틀 문장으로 채우지 않음).
 * 이미지·영상 생성은 어디에서도 하지 않는다(글만 AI가 쓴다).
 * (AI 조절) ②에서 무엇을 얼마나 받을지는 AI 연결 화면의 조절값(ai/tune.ts)을 따른다 — 새 글 수·먼저 오는 쪽지 수·뉴스·트렌드·미션·이벤트.
 *   전부 0/끔 = ②를 부르지 않음(내장 이벤트만, 토큰 0) · 새 글만 켬 = 새 글만 받는 빠른 호출 1회 · 그 밖 = 하루 정산 1회.
 */
import { getActive } from '../store/game';
import type { ID, Scenario } from '../types';
import { DEFAULT_TUNE, dayPlan } from '../ai/tune';
import { rand, sleep, uid } from '../utils';
import { addNpcLines, activeChar, alive, beginFlow, ctxOf, deliverOpeners, engine, G, tune } from './core';
import { pickLocalEvent } from './localEvents';
import { saveIdeas } from './ideas';
import { heartEligible, setHeart } from './love';
import { addNewsPost, applyLove, dailyHousekeeping, logActivity, pushItemLog, pushNoti, tickClock } from './progress';
import { snapshot } from './undo';

/** 이미 쓴 이벤트 템플릿 키(후보 포함) */
export function usedEventKeys(sc: Scenario): string[] {
  const keys = new Set<string>();
  for (const e of sc.events) {
    if (e.templateKey) keys.add(e.templateKey);
    for (const v of e.variants ?? []) if (v.templateKey) keys.add(v.templateKey);
  }
  return [...keys];
}

/** 하루 정산이 밀려 있는지(규칙 정리 또는 AI 몫) */
export function tickDue(sc: Scenario | undefined | null): boolean {
  if (!sc) return false;
  return sc.lastTickDay < sc.clock.day || (sc.tickAIDay ?? sc.lastTickDay) < sc.clock.day;
}

/** 오늘 대화방에 돌아온 인물(시스템 안내 "…님이 대화방에 돌아왔습니다." 기준) */
function returnedToday(sc: Scenario, day: number): ID[] {
  return Object.values(sc.dms)
    .filter((cv) => {
      const m = cv.messages[cv.messages.length - 1];
      return !!m && m.from === 'system' && m.text.endsWith('대화방에 돌아왔습니다.') && m.at?.day === day && activeChar(sc, cv.characterId);
    })
    .map((cv) => cv.characterId);
}

/** 내장 이벤트 하나 붙이기(토큰 0): 기다리는 이벤트가 없고 마지막 이벤트가 이틀 넘게 지났을 때만 */
function addLocalEvent(d: Scenario) {
  if (d.events.some((e) => e.status === 'pending')) return;
  const last = d.events.reduce((m, e) => Math.max(m, e.at?.day ?? 0), 0);
  if (d.clock.day - last < 2) return;
  const v = pickLocalEvent(d, usedEventKeys(d));
  if (!v) return;
  const id = uid('ev');
  d.events.push({ id, ...v, at: { ...d.clock }, status: 'pending' });
  pushNoti(d, { type: 'event', eventId: id, text: `새 이벤트: ${v.title}` });
}

/** force: 조절값과 상관없이 기본값으로 AI 하루 정산(직접 만든 세계관의 첫날 — 타임라인이 비어 있어서) */
export async function runDayTick(sid: ID, opts: { force?: boolean } = {}) {
  const sc = G().scenarios[sid];
  if (!tickDue(sc)) return;
  const key = `tick:${sid}`;
  if (G().busy[key]) return;
  G().setBusy(key, true);
  const flow = beginFlow(sid);
  try {
    const day = sc!.clock.day;
    // ① 규칙 정리(한 번만)
    if (sc!.lastTickDay < day) {
      G().edit(sid, (d) => {
        if (d.tickAIDay === undefined) d.tickAIDay = d.lastTickDay;
        d.lastTickDay = day;
        dailyHousekeeping(d);
        logActivity(d, '🌅', `${day}일차가 시작됐어요`);
      });
    }
    // ② AI 몫(실패하면 tickAIDay를 그대로 둬서 다음에 다시)
    const base = ctxOf(sid);
    const cur = G().scenarios[sid];
    if (!base || !cur) return;
    // 무엇을 얼마나 받을지(AI 조절값). force면 기본값으로
    const t = opts.force ? DEFAULT_TUNE : tune();
    const ctx = { ...base, tune: t };
    const plan = dayPlan(t);
    if (plan !== 'full') {
      // 하루 정산 AI를 부르지 않는다. 새 글만 켜 둔 경우엔 새 글만 받는 빠른 호출 1회(실패하면 다음에 다시)
      const lines = plan === 'posts' ? await engine().ambientPosts(ctx, t.dayPosts) : [];
      if (!alive(flow) || !lines) return;
      G().edit(sid, (d) => {
        d.tickAIDay = day;
        addNpcLines(d, lines);
        addLocalEvent(d);
        d.events = d.events.slice(-30);
      });
      return;
    }
    const returned = returnedToday(cur, day);
    const r = await engine().worldTick(ctx, { day, usedEventKeys: usedEventKeys(cur), returned });
    if (!alive(flow) || !r) return;
    G().edit(sid, (d) => {
      d.tickAIDay = day;
      if (t.dayNews) for (const n of r.news) addNewsPost(d, n);
      if (t.dayPosts > 0) addNpcLines(d, r.npcPosts.slice(0, t.dayPosts));
      if (t.dayTrends && r.trends.length) d.trends = r.trends.slice(0, 8);
      const pending = d.events.filter((e) => e.status === 'pending').length;
      // AI 이벤트를 꺼 두었으면 세계관에 내장된 이벤트만(토큰 0)
      if (!t.dayEvent) addLocalEvent(d);
      if (t.dayEvent && r.event && pending < 2) {
        const id = uid('ev');
        const involved = r.event.involved.filter((x) => activeChar(d, x));
        d.events.push({ id, ...r.event, involved, at: { ...d.clock }, status: 'pending' });
        pushNoti(d, { type: 'event', eventId: id, text: `새 이벤트: ${r.event.title}` });
      }
      // 먼저 오는 쪽지: 돌아온 인물은 전부, 그 밖은 조절값(먼저 쪽지 보내는 인물 수)까지
      deliverOpeners(d, r.dmOpeners, t.dayDMs, returned);
      if (t.dayMission && r.mission) {
        d.quests.unshift({
          id: uid('q'),
          title: `오늘의 미션: ${r.mission.title}`,
          desc: r.mission.desc,
          goal: 'keyword',
          keyword: r.mission.keyword,
          target: 1,
          progress: 0,
          reward: { xp: 30 },
          done: false,
          claimed: false,
          day,
        });
      }
      // 글쓰기 제안(따로 부르지 않고 하루 정산에 얹어 받음)
      saveIdeas(d, r.ideas);
      // 오늘의 속마음(여성 + 호감도 기준 이상인 인물만 — 프로필에 보인다)
      for (const h of r.hearts ?? []) {
        const c = d.characters[h.id];
        if (c && heartEligible(d, c)) setHeart(d, h.id, h.text);
      }
      // 오늘 글에서 드러난 인물끼리의 사랑 변화
      applyLove(d, r.love);
      d.events = d.events.slice(-30);
    });
  } finally {
    G().setBusy(key, false);
  }
  // 정산하는 동안 시간을 또 건너뛰었으면(다음 날로) 그날 몫도 이어서
  const now = G().scenarios[sid];
  if (now && alive(flow) && now.clock.day > sc!.clock.day && tickDue(now)) void runDayTick(sid);
}

// ───────────────────────── 시간 건너뛰기(아이템)

/** 다음 날 오전 9시까지 남은 분(아이템 화면 "다음 날" 버튼용) */
export function nextMorningMinutes(): number {
  const sc = getActive();
  if (!sc) return 24 * 60;
  return 24 * 60 - (sc.clock.hour * 60 + sc.clock.minute) + 9 * 60;
}

function durationLabel(m: number): string {
  if (m % 1440 === 0) return `${m / 1440}일`;
  if (m >= 60) return `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}`;
  return `${m}분`;
}

/** 시간 건너뛰기(분). 날이 바뀌면 하루 정산까지 */
export async function skipTime(minutes: number): Promise<void> {
  const sc = getActive();
  if (!sc) return;
  const m = Math.max(1, Math.round(minutes || 0));
  snapshot(sc, '시간 건너뛰기');
  let days = 0;
  G().edit(sc.id, (d) => {
    days = tickClock(d, m);
    const label = durationLabel(m);
    pushItemLog(d, 'skip', days > 0 ? `⏩ ${label} 건너뛰어 ${d.clock.day}일차로` : `⏩ ${label} 건너뜀`);
    logActivity(d, '⏩', days > 0 ? `시간을 건너뛰어 ${d.clock.day}일차가 됐어요` : `시간을 ${label} 건너뛰었어요`);
  });
  // 하루 정산의 AI 몫은 뒤에서(화면은 바로 다음 날로) — 시계 칩에 ⏳
  if (days > 0) void runDayTick(sc.id);
}

/** 설정 화면(구버전): 하루 건너뛰기 = 다음 날 오전 9시로 */
export async function skipToNextDay() {
  await skipTime(nextMorningMinutes());
}

// ───────────────────────── 타임라인 새로고침(당겨서 새로고침)

let lastAmbient = 0;
/** 15초에 한 번까지만 AI에게 새 글을 받는다(개수는 AI 조절값, 그 사이엔 기다리는 척만) */
export async function refreshFeed(): Promise<void> {
  const sc = getActive();
  if (!sc) return;
  if (Date.now() - lastAmbient < 15_000) {
    await sleep(500);
    return;
  }
  lastAmbient = Date.now();
  const sid = sc.id;
  // 밀린 하루 정산이 있으면 먼저(앱을 껐다 켠 경우 등)
  if (tickDue(sc)) await runDayTick(sid);
  // AI 조절: 새로고침 새 글 0 = AI를 부르지 않는다
  const count = tune().refreshPosts;
  if (count <= 0) {
    await sleep(400);
    return;
  }
  const flow = beginFlow(sid);
  const ctx = ctxOf(sid);
  if (!ctx) return;
  // 불러오는 동안 화면에 표시(진행 중 칩 · 타임라인 뼈대)
  const key = `refresh:${sid}`;
  G().setBusy(key, true);
  let lines: Awaited<ReturnType<ReturnType<typeof engine>['ambientPosts']>>;
  try {
    lines = await engine().ambientPosts(ctx, count);
  } finally {
    G().setBusy(key, false);
  }
  if (!lines?.length || !alive(flow)) return;
  let days = 0;
  G().edit(sid, (d) => {
    days = tickClock(d, rand(10, 40));
    addNpcLines(d, lines);
  });
  if (days > 0) await runDayTick(sid);
}
