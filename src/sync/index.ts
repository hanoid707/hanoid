/**
 * DB 자동 동기화 관리자
 *   - 바뀐 세이브는 2.5초 뒤 한꺼번에 올린다(마지막 수정 시각이 더 최신인 쪽이 이김)
 *   - 다른 기기에서 바뀐 세이브는 주기적으로(앱 15초 · 아티팩트 45초) + 앱으로 돌아올 때 받아온다
 *   - 직접 고른 사진은 업로드 대기열로 올리고, 필요할 때 내려받는다
 *   - 공통 캐릭터 목록은 공간 설정(aisns.settings)으로 올리고 받는다(항목마다 최신이 이김)
 *   - AI 키·모델·AI 조절값(답글·쪽지·새 글 수 …)도 공간 설정에 같이 둔다 → 한 기기에서 바꾸면 다른 기기에도 적용(더 최신인 쪽이 이김)
 * 서버: Supabase aisns 스키마(supabase/aisns.sql 참고)
 */
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';
import { CONFIG, getArtifactCapability, isArtifactRuntime } from '../config';
import { applyRemotePrompts, hydratePrompts } from '../ai/promptStore';
import { normTune, sameTune } from '../ai/tune';
import { migrateScenario, useGame } from '../store/game';
import { cacheMedia, connectMediaSync, getMediaNow } from '../store/media';
import { loadMediaLocal, loadSyncLocal, saveSyncLocal, type PendingMedia, type SyncLocal } from '../store/persistence';
import { applyRemoteRoster, rosterSnapshot, useRoster } from '../store/roster';
import type { AITune, ID, RosterEntry, Scenario } from '../types';
import { createMcpBackend, createRestBackend, SyncError, type PushItem, type SyncBackend } from './backend';

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error' | 'blocked';

interface SyncView {
  status: SyncStatus;
  via: 'rest' | 'mcp' | null;
  lastSync: number | null;
  message: string | null;
}

export const useSync = create<SyncView>()(() => ({ status: 'off', via: null, lastSync: null, message: null }));

let backend: SyncBackend | null = null;
let local: SyncLocal = { cursor: 0, pendingMedia: [] };
/** DB에서 받아 적용한 버전(이건 다시 올리지 않는다) */
const remoteTs = new Map<string, number>();
const dirty = new Set<string>();
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let running = false;
let rerun = false;
let started = false;
let unsubStore: (() => void) | null = null;
let unsubRoster: (() => void) | null = null;
let firstPullDone = false;
/** 공통 캐릭터 목록: 올릴 게 있는지 / DB에서 받아 적용한 시각(다시 올리지 않게) */
let rosterDirty = false;
let applyingRemoteRoster = false;
/** AI 키·모델: 기기 간 공유용(한 기기에서 넣으면 같은 동기화 코드를 쓰는 다른 기기에도 간다) */
let unsubAI: (() => void) | null = null;
let aiDirty = false;
let applyingRemoteAI = false;
let aiTs = 0;
/** DB에서 마지막으로 본 AI 키·모델 — 이 기기에 키가 없을 때(아티팩트 등) 올리면서 지우지 않게 */
let remoteAI: { apiKey?: string; model?: string } = {};
/** AI 지시문(aisns.prompts)을 마지막으로 받은 시각 — 5분마다 다시 받는다 */
let promptsAt = 0;
const PROMPTS_EVERY = 5 * 60_000;

async function createBackend(): Promise<SyncBackend | null> {
  const s = useGame.getState().settings.sync;
  if (!s.enabled) return null;
  if (isArtifactRuntime()) {
    if (!CONFIG.supabaseProject) return null;
    const mcp = await getArtifactCapability<Parameters<typeof createMcpBackend>[0]>('mcp');
    return mcp ? createMcpBackend(mcp, CONFIG.supabaseProject, CONFIG.spaceLabel) : null;
  }
  if (CONFIG.supabaseUrl && CONFIG.supabaseKey && s.key.length >= 24) return createRestBackend(CONFIG.supabaseUrl, CONFIG.supabaseKey, s.key);
  return null;
}

/** 동기화 시작(앱 시작 후 한 번). 설정을 바꾸면 restartSync() */
export async function startSync() {
  if (started) return;
  started = true;
  await hydratePrompts(); // 동기화를 안 쓰더라도 마지막으로 받아 둔 지시문은 쓴다
  backend = await createBackend();
  if (!backend) {
    useSync.setState({ status: 'off', via: null, message: null });
    return;
  }
  useSync.setState({ status: 'idle', via: backend.kind, message: null });
  local = await loadSyncLocal();
  connectMediaSync(fetchMedia, queueMedia);

  // 스토어 변화 감시: 내가 바꾼 세이브만 "올릴 것"으로 표시
  unsubStore = useGame.subscribe((s, prev) => {
    if (s.scenarios === prev.scenarios && s.deleted === prev.deleted) return;
    for (const [id, sc] of Object.entries(s.scenarios)) {
      if (prev.scenarios[id] === sc) continue;
      if (remoteTs.get(id) === sc.updatedTs) continue;
      dirty.add(id);
    }
    schedulePush();
  });

  // 공통 캐릭터 목록 변화 감시(받아서 적용한 변화는 다시 올리지 않는다)
  unsubRoster = useRoster.subscribe((s, prev) => {
    if (s.updatedTs === prev.updatedTs || applyingRemoteRoster) return;
    rosterDirty = true;
    schedulePush();
  });
  if (useRoster.getState().updatedTs > 0) rosterDirty = true;

  // AI 키·모델 변화 감시 — PC에서 한 번 넣으면 폰에서도 그대로 쓰게 된다
  unsubAI = useGame.subscribe((g, prevG) => {
    if (applyingRemoteAI || g.settings.ai === prevG.settings.ai) return;
    if (g.settings.ai.apiKey === prevG.settings.ai.apiKey && g.settings.ai.model === prevG.settings.ai.model && g.settings.ai.tuneTs === prevG.settings.ai.tuneTs) return;
    aiTs = Date.now();
    aiDirty = true;
    schedulePush();
  });
  if (useGame.getState().settings.ai.apiKey || useGame.getState().settings.ai.tuneTs) aiDirty = true;

  // 처음엔 기기에만 있던 세이브도 전부 올릴 후보
  for (const id of Object.keys(useGame.getState().scenarios)) dirty.add(id);
  await syncNow();

  const every = backend.kind === 'mcp' ? 45_000 : 15_000;
  pollTimer = setInterval(() => void syncNow(), every);
  if (Platform.OS === 'web') {
    globalThis.document?.addEventListener?.('visibilitychange', () => {
      if (globalThis.document?.visibilityState === 'visible') void syncNow();
    });
  } else {
    AppState.addEventListener('change', (st) => {
      if (st === 'active') void syncNow();
    });
  }
}

export async function restartSync() {
  if (pollTimer) clearInterval(pollTimer);
  unsubStore?.();
  unsubRoster?.();
  unsubAI?.();
  pollTimer = null;
  unsubStore = null;
  unsubRoster = null;
  unsubAI = null;
  started = false;
  firstPullDone = false;
  promptsAt = 0;
  local = { cursor: 0, pendingMedia: local.pendingMedia };
  await saveSyncLocal(local);
  await startSync();
}

function schedulePush() {
  if (!backend) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void syncNow(), backend.kind === 'mcp' ? 6000 : 2500);
}

/** 지금 바로 동기화(올리기 → 받기 → 사진 올리기) */
export async function syncNow(): Promise<void> {
  if (!backend) return;
  if (useSync.getState().status === 'blocked') return; // 사용자가 직접 풀어야 하는 상태
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  useSync.setState({ status: 'syncing' });
  try {
    if (firstPullDone) await pushDirty();
    await pull();
    if (!firstPullDone) {
      firstPullDone = true;
      await pushDirty();
    }
    await uploadMedia();
    await pullPrompts();
    useSync.setState({ status: 'idle', lastSync: Date.now(), message: null });
  } catch (e) {
    const err = e as SyncError;
    useSync.setState({ status: err.blocked ? 'blocked' : 'error', message: err.message ?? String(e) });
  } finally {
    running = false;
    if (rerun) {
      rerun = false;
      setTimeout(() => void syncNow(), 400);
    }
  }
}

/** 막힌 상태(승인 필요 등)를 사용자가 풀었을 때 다시 시도 */
export function retrySync() {
  if (useSync.getState().status === 'blocked') useSync.setState({ status: 'idle', message: null });
  void syncNow();
}

async function pushSettings() {
  if (!backend || (!rosterDirty && !aiDirty)) return;
  const snap = rosterSnapshot();
  const ai = useGame.getState().settings.ai;
  const hadRoster = rosterDirty;
  const hadAI = aiDirty;
  rosterDirty = false;
  aiDirty = false;
  try {
    // settingsPut 은 blob 을 통째로 덮어쓰므로 roster 와 ai 를 항상 같이 보낸다
    await backend.settingsPut(
      { roster: snap, ai: { apiKey: ai.apiKey || remoteAI.apiKey || '', model: ai.model || remoteAI.model || '', ts: aiTs, ...(ai.tuneTs ? { tune: normTune(ai.tune), tuneTs: ai.tuneTs } : {}) } },
      Math.max(1, snap.ts, aiTs, ai.tuneTs ?? 0),
    );
  } catch (e) {
    rosterDirty = hadRoster;
    aiDirty = hadAI;
    throw e;
  }
}

async function pushDirty() {
  if (!backend) return;
  await pushSettings();
  const st = useGame.getState();
  const items: PushItem[] = [];
  const ids = [...dirty];
  for (const id of ids) {
    const sc = st.scenarios[id];
    if (sc) items.push({ id, title: sc.title, data: sc, updatedTs: sc.updatedTs, deleted: false });
  }
  for (const [id, ts] of Object.entries(st.deleted)) items.push({ id, title: '', data: null, updatedTs: ts, deleted: true });
  if (!items.length) return;
  // 아티팩트(커넥터) 경로는 요청 크기 제한이 있어 하나씩 올린다
  const batches = backend.kind === 'mcp' ? items.map((i) => [i]) : [items];
  for (const batch of batches) {
    await backend.push(batch);
    for (const it of batch) {
      if (it.deleted) {
        useGame.setState((s) => {
          const { [it.id]: _x, ...rest } = s.deleted;
          return { deleted: rest };
        });
      } else {
        const cur = useGame.getState().scenarios[it.id];
        if (cur && cur.updatedTs === it.updatedTs) dirty.delete(it.id);
        remoteTs.set(it.id, it.updatedTs);
      }
    }
  }
}

/** AI 지시문 받기. 실패해도 동기화 상태를 망치지 않는다(기존 값·코드 기본 문구로 계속 동작) */
async function pullPrompts() {
  if (!backend || Date.now() - promptsAt < PROMPTS_EVERY) return;
  try {
    applyRemotePrompts(await backend.promptsGet());
    promptsAt = Date.now();
  } catch {
    promptsAt = Date.now() - PROMPTS_EVERY + 30_000; // 30초 뒤 다시 시도
  }
}

async function pull() {
  if (!backend) return;
  const r = await backend.pull(Math.max(0, local.cursor - 5000));
  // 공통 캐릭터 목록(다른 기기에서 바뀐 것)
  const roster = r.settings?.data?.roster as { entries?: RosterEntry[]; deleted?: Record<ID, number>; defaultMode?: 'on' | 'off'; ts?: number } | undefined;
  if (roster?.entries) {
    const ts = roster.ts ?? r.settings?.updatedTs ?? 0;
    const before = useRoster.getState().updatedTs;
    applyingRemoteRoster = true;
    try {
      applyRemoteRoster(roster.entries, ts, { deleted: roster.deleted, defaultMode: roster.defaultMode });
    } finally {
      applyingRemoteRoster = false;
    }
    // 내 기기에만 있던 변경이 남아 있으면(내 목록이 받은 것보다 새로우면) 다시 올린다
    if (before > ts) rosterDirty = true;
  }
  // AI 키·모델(다른 기기에서 넣은 것) — 더 최신인 쪽이 이긴다
  const rai = r.settings?.data?.ai as { apiKey?: string; model?: string; ts?: number; tune?: Partial<AITune>; tuneTs?: number } | undefined;
  if (rai) {
    remoteAI = { apiKey: rai.apiKey, model: rai.model };
    // AI 조절값: 더 최신인 쪽이 이긴다(이 기기에서 바꾼 값이 더 새로우면 다시 올린다)
    const mine = useGame.getState().settings.ai;
    const remoteTuneTs = rai.tuneTs ?? 0;
    if (rai.tune && remoteTuneTs > (mine.tuneTs ?? 0)) {
      applyingRemoteAI = true;
      try {
        if (sameTune(rai.tune, mine.tune)) useGame.getState().setAI({ tuneTs: remoteTuneTs });
        else useGame.getState().setAI({ tune: normTune(rai.tune), tuneTs: remoteTuneTs });
      } finally {
        applyingRemoteAI = false;
      }
    } else if ((mine.tuneTs ?? 0) > remoteTuneTs) {
      aiDirty = true;
    }
    const ts = rai.ts ?? r.settings?.updatedTs ?? 0;
    if (ts > aiTs) {
      const cur = useGame.getState().settings.ai;
      const patch: { apiKey?: string; model?: string } = {};
      if (rai.apiKey && rai.apiKey !== cur.apiKey) patch.apiKey = rai.apiKey;
      if (rai.model && rai.model !== cur.model) patch.model = rai.model;
      if (patch.apiKey || patch.model) {
        applyingRemoteAI = true;
        try {
          useGame.getState().setAI(patch);
        } finally {
          applyingRemoteAI = false;
        }
      }
      aiTs = ts;
    } else if (aiTs > ts) {
      aiDirty = true; // 이 기기 쪽이 더 최신 → 다시 올린다
    }
  }
  const st = useGame.getState();
  const toFetch: string[] = [];
  const toDelete: string[] = [];
  for (const x of r.scenarios) {
    const mine = st.scenarios[x.id];
    if (x.deleted) {
      if (mine && mine.updatedTs <= x.updatedTs) toDelete.push(x.id);
      continue;
    }
    if (st.deleted[x.id] && st.deleted[x.id] >= x.updatedTs) continue; // 내가 지운 게 더 최신
    if (!mine || mine.updatedTs < x.updatedTs) toFetch.push(x.id);
    else if (mine.updatedTs > x.updatedTs) dirty.add(x.id);
  }
  const fetched: Scenario[] = [];
  for (let i = 0; i < toFetch.length; i += 3) {
    const got = await backend.get(toFetch.slice(i, i + 3));
    for (const g of got) if (g.data && !g.deleted) fetched.push({ ...(g.data as Scenario), updatedTs: g.updatedTs });
  }
  if (fetched.length || toDelete.length) {
    useGame.setState((s) => {
      const scenarios = { ...s.scenarios };
      for (const sc of fetched) {
        const cur = scenarios[sc.id];
        if (cur && cur.updatedTs >= sc.updatedTs) continue; // 그 사이 내가 더 고쳤으면 내 것 유지
        remoteTs.set(sc.id, sc.updatedTs);
        scenarios[sc.id] = migrateScenario(sc);
      }
      for (const id of toDelete) delete scenarios[id];
      const activeId = s.activeId && scenarios[s.activeId] ? s.activeId : (Object.keys(scenarios)[0] ?? null);
      return { scenarios, activeId };
    });
  }
  local.cursor = r.now;
  await saveSyncLocal(local);
}

// ───────── 사진

function queueMedia(m: PendingMedia) {
  if (!local.pendingMedia.some((x) => x.id === m.id)) local.pendingMedia.push(m);
  void saveSyncLocal(local);
  schedulePush();
}

async function uploadMedia() {
  if (!backend || !local.pendingMedia.length) return;
  for (const m of [...local.pendingMedia]) {
    const uri = getMediaNow(m.id) ?? (await loadMediaLocal(m.id));
    if (uri) {
      const match = uri.match(/^data:([^;]+);base64,(.*)$/);
      if (match) await backend.mediaPut({ id: m.id, kind: m.kind, mime: match[1], data: match[2], w: m.w, h: m.h });
    }
    local.pendingMedia = local.pendingMedia.filter((x) => x.id !== m.id);
    await saveSyncLocal(local);
  }
}

async function fetchMedia(id: string): Promise<string | null> {
  if (!backend) return null;
  const got = await backend.mediaGet([id]);
  const m = got[0];
  if (!m) return null;
  const uri = `data:${m.mime};base64,${m.data}`;
  cacheMedia(id, uri);
  return uri;
}
