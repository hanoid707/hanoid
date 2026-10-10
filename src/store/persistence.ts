/**
 * 기기 내부 저장 — 시나리오(세이브 슬롯)마다 따로 저장한다.
 * 한 덩어리로 저장하면 안드로이드 저장소의 항목당 용량 제한(약 2MB)에 걸릴 수 있어서 나눴다.
 * 웹에서는 브라우저 저장소(localStorage)를 쓰고, 막혀 있으면 메모리에만 둔다.
 * (DB 동기화는 src/sync — 기기 저장은 오프라인에서도 바로 열리게 하는 1차 저장소)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { Scenario, Settings } from '../types';
import { attachRosterStorage } from './roster';

export interface KV {
  getItem(k: string): Promise<string | null>;
  setItem(k: string, v: string): Promise<void>;
  removeItem(k: string): Promise<void>;
}

const memory = new Map<string, string>();

const webKV: KV = {
  async getItem(k) {
    try {
      return globalThis.localStorage?.getItem(k) ?? memory.get(k) ?? null;
    } catch {
      return memory.get(k) ?? null;
    }
  },
  async setItem(k, v) {
    memory.set(k, v);
    try {
      globalThis.localStorage?.setItem(k, v);
    } catch (e) {
      console.warn('[저장] 브라우저 저장 실패, 메모리에만 보관', e);
    }
  },
  async removeItem(k) {
    memory.delete(k);
    try {
      globalThis.localStorage?.removeItem(k);
    } catch {
      /* 무시 */
    }
  },
};

const nativeKV: KV = {
  getItem: (k) => AsyncStorage.getItem(k),
  setItem: (k, v) => AsyncStorage.setItem(k, v),
  removeItem: (k) => AsyncStorage.removeItem(k),
};

export const kv: KV = Platform.OS === 'web' ? webKV : nativeKV;

// 공통 캐릭터 목록도 같은 저장소를 쓴다(roster.ts는 react-native를 직접 부르지 않게 여기서 연결)
attachRosterStorage(kv);

// 내부 저장 키(앱 이름이 AI-SNS로 바뀌어도 기존 기기 데이터를 그대로 읽도록 예전 접두어 유지)
const META_KEY = 'mainchar:meta:v1';
const scenarioKey = (id: string) => `mainchar:scenario:v1:${id}`;

export interface Meta {
  activeId: string | null;
  settings: Settings;
  scenarioIds: string[];
  /** 지운 시나리오(다른 기기에도 삭제를 전하기 위해 잠시 기억) */
  deleted?: Record<string, number>;
}

export async function loadAll(): Promise<{ meta: Meta | null; scenarios: Record<string, Scenario> }> {
  try {
    const raw = await kv.getItem(META_KEY);
    if (!raw) return { meta: null, scenarios: {} };
    const meta = JSON.parse(raw) as Meta;
    const scenarios: Record<string, Scenario> = {};
    for (const id of meta.scenarioIds ?? []) {
      try {
        const s = await kv.getItem(scenarioKey(id));
        if (s) scenarios[id] = JSON.parse(s) as Scenario;
      } catch (e) {
        console.warn('[저장] 시나리오 불러오기 실패', id, e);
      }
    }
    return { meta, scenarios };
  } catch (e) {
    console.warn('[저장] 불러오기 실패', e);
    return { meta: null, scenarios: {} };
  }
}

/** 바뀐 시나리오만 골라 저장(마지막 저장 시각 비교) */
const savedTs = new Map<string, number>();

export async function saveAll(state: { activeId: string | null; settings: Settings; scenarios: Record<string, Scenario>; deleted: Record<string, number> }) {
  const ids = Object.keys(state.scenarios);
  const meta: Meta = { activeId: state.activeId, settings: state.settings, scenarioIds: ids, deleted: state.deleted };
  await kv.setItem(META_KEY, JSON.stringify(meta));
  for (const id of ids) {
    const sc = state.scenarios[id];
    if (savedTs.get(id) === sc.updatedTs) continue;
    await kv.setItem(scenarioKey(id), JSON.stringify(sc));
    savedTs.set(id, sc.updatedTs);
  }
  for (const id of [...savedTs.keys()]) {
    if (!state.scenarios[id]) {
      await kv.removeItem(scenarioKey(id));
      savedTs.delete(id);
    }
  }
}

export function markLoaded(scenarios: Record<string, Scenario>) {
  for (const [id, sc] of Object.entries(scenarios)) savedTs.set(id, sc.updatedTs);
}

// ───────── 사진(직접 고른 사진) 캐시
const mediaKey = (id: string) => `mainchar:media:v1:${id}`;

export async function loadMediaLocal(id: string): Promise<string | null> {
  try {
    return await kv.getItem(mediaKey(id));
  } catch {
    return null;
  }
}

export async function saveMediaLocal(id: string, dataUri: string): Promise<void> {
  try {
    await kv.setItem(mediaKey(id), dataUri);
  } catch {
    /* 용량 부족 등: 메모리·DB에는 남아 있으니 무시 */
  }
}

// ───────── 동기화 상태(마지막으로 받은 서버 시각, 아직 못 올린 사진)
const SYNC_KEY = 'mainchar:sync:v1';

export interface PendingMedia {
  id: string;
  kind: string;
  w?: number;
  h?: number;
}

export interface SyncLocal {
  cursor: number;
  pendingMedia: PendingMedia[];
}

export async function loadSyncLocal(): Promise<SyncLocal> {
  try {
    const raw = await kv.getItem(SYNC_KEY);
    if (raw) return { cursor: 0, pendingMedia: [], ...(JSON.parse(raw) as Partial<SyncLocal>) };
  } catch {
    /* 무시 */
  }
  return { cursor: 0, pendingMedia: [] };
}

export async function saveSyncLocal(s: SyncLocal): Promise<void> {
  try {
    await kv.setItem(SYNC_KEY, JSON.stringify(s));
  } catch {
    /* 무시 */
  }
}

// ───────── 프롬프트 캐시(DB에서 받은 지시문 — 오프라인에서도 마지막 값을 쓰게)
const PROMPTS_KEY = 'mainchar:prompts:v1';

export async function loadPromptsLocal(): Promise<Record<string, string>> {
  try {
    const raw = await kv.getItem(PROMPTS_KEY);
    if (raw) return JSON.parse(raw) as Record<string, string>;
  } catch {
    /* 무시 */
  }
  return {};
}

export async function savePromptsLocal(p: Record<string, string>): Promise<void> {
  try {
    await kv.setItem(PROMPTS_KEY, JSON.stringify(p));
  } catch {
    /* 무시 */
  }
}
