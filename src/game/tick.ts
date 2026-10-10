/**
 * 시간 — 하루 정산(월드 틱), 시간 건너뛰기, 타임라인 새로고침
 * 하루 정산 = ① 규칙 정리(즉시: 평판 회복·떡상 종료·대화방 복귀·지난 미션 정리)
 *            ② AI 1회(뒤에서: 캐릭터 글·뉴스·트렌드·새 이벤트·먼저 오는 쪽지·오늘의 미션 + 글쓰기 제안·자기소개 변화)
 * (v3.1) 시간 건너뛰기는 ①만 기다리고 바로 끝난다 — ②는 뒤에서 돌고 시계 칩에 ⏳로 보인다.
 *        ②가 실패하면 그날 AI 몫을 비워 두지 않고 다음 새로고침·시간 이동 때 다시 시도한다(틀 문장으로 채우지 않음).
 * 이미지·영상 생성은 어디에서도 하지 않는다(글만 AI가 쓴다).
 */
import { getActive } from '../store/game';
import type { ID, Scenario } from '../types';
import { cutText, rand, sleep, uid } from '../utils';
import { addNpcLines, activeChar, alive, beginFlow, ctxOf, engine, ensureConversation, G } from './core';
import { saveIdeas } from './ideas';
import { addNewsPost, dailyHousekeeping, logActivity, pushItemLog, pushNoti, tickClock } from './progress';
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

/** 자기소개가 바뀌어도 되는 사이(가까운 핵심 인물, 3일에 한 번까지) */
function canRewriteBio(c: Scenario['characters'][string], day: number): boolean {
  if (c.inactive || c.tier === 'crowd' || c.isNews) return false;
  const close = c.affinity >= 50 || c.relation === 'friend' || c.relation === 'bestie' || c.relation === 'lover' || c.relation === 'family';
  return close && (c.bioDay === undefined || day - c.bioDay >= 3);
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

export async function runDayTick(sid: ID) {
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
    const ctx = ctxOf(sid);
    const cur = G().scenarios[sid];
    if (!ctx || !cur) return;
    const returned = returnedToday(cur, day);
    const r = await engine().worldTick(ctx, { day, usedEventKeys: usedEventKeys(cur), returned });
    if (!alive(flow) || !r) return;
    G().edit(sid, (d) => {
      d.tickAIDay = day;
      for (const n of r.news) addNewsPost(d, n);
      addNpcLines(d, r.npcPosts);
      if (r.trends.length) d.trends = r.trends.slice(0, 8);
      const pending = d.events.filter((e) => e.status === 'pending').length;
      if (r.event && pending < 2) {
        const id = uid('ev');
        const involved = r.event.involved.filter((x) => activeChar(d, x));
        d.events.push({ id, ...r.event, involved, at: { ...d.clock }, status: 'pending' });
        pushNoti(d, { type: 'event', eventId: id, text: `새 이벤트: ${r.event.title}` });
      }
      for (const o of r.dmOpeners) {
        if (!activeChar(d, o.authorId)) continue;
        if (d.dms[o.authorId]?.typing) continue;
        const cv = ensureConversation(d, o.authorId);
        if (cv.leftUntilDay !== null) continue;
        cv.messages.push({ id: uid('m'), from: 'them', text: o.text, ts: Date.now(), at: { ...d.clock } });
        cv.unread += 1;
        cv.updatedTs = Date.now();
        pushNoti(d, { type: 'dm', actorId: o.authorId, text: '님이 쪽지를 보냈습니다' });
      }
      if (r.mission) {
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
      // 최근 일로 자기소개가 바뀐 인물(가까운 사람만, 3일에 한 번)
      for (const b of r.bios ?? []) {
        const c = d.characters[b.id];
        if (!c || !b.bio.trim() || !canRewriteBio(c, d.clock.day)) continue;
        c.bio = cutText(b.bio.trim(), 80);
        c.bioDay = d.clock.day;
        logActivity(d, '📝', `${c.name}님이 자기소개를 바꿨어요`);
      }
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
/** 15초에 한 번까지만 AI에게 새 글 3~4개를 받는다(그 사이엔 기다리는 척만) */
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
  const flow = beginFlow(sid);
  const ctx = ctxOf(sid);
  if (!ctx) return;
  const lines = await engine().ambientPosts(ctx, rand(3, 4));
  if (!lines?.length || !alive(flow)) return;
  let days = 0;
  G().edit(sid, (d) => {
    days = tickClock(d, rand(10, 40));
    addNpcLines(d, lines);
  });
  if (days > 0) await runDayTick(sid);
}
