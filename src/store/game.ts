/**
 * 앱 전체 상태(zustand) — 모든 화면이 여기서 데이터를 읽는다.
 * 데이터를 바꿀 때는 edit(시나리오ID, 수정함수)를 쓴다(immer: 복사본을 자동으로 만들어 줌).
 * 실제 "게임 규칙"은 src/game/actions.ts, DB 동기화는 src/sync 에 있다. 여기는 저장소 역할만 한다.
 */
import { produce } from 'immer';
import { create } from 'zustand';
import { CONFIG, isArtifactRuntime } from '../config';
import { migrateScenarioData } from '../game/migrate';
import type { AISettings, ID, Scenario, Settings, SyncSettings } from '../types';
import { loadAll, markLoaded, saveAll } from './persistence';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error' | 'success';
}

export interface GameState {
  hydrated: boolean;
  scenarios: Record<ID, Scenario>;
  activeId: ID | null;
  settings: Settings;
  /** 지운 시나리오 ID → 지운 시각(다른 기기에 삭제를 전하면 비운다) */
  deleted: Record<ID, number>;
  /** 진행 중인 AI 작업 표시('post:글ID', 'dm:캐릭터ID' 등) */
  busy: Record<string, boolean>;
  toast: Toast | null;

  setActive(id: ID | null): void;
  putScenario(sc: Scenario): void;
  /** (v3) 되돌리기 등으로 시나리오를 통째로 바꾼다(수정 시각은 계속 커지게 → 저장·동기화됨) */
  replaceScenario(sc: Scenario): void;
  removeScenario(id: ID): void;
  edit(id: ID, recipe: (d: Scenario) => void): void;
  setSettings(patch: Partial<Settings>): void;
  setAI(patch: Partial<AISettings>): void;
  setSync(patch: Partial<SyncSettings>): void;
  setBusy(key: string, value: boolean): void;
  showToast(text: string, tone?: Toast['tone']): void;
}

export const DEFAULT_SETTINGS: Settings = {
  ai: { provider: 'gemini', apiKey: CONFIG.geminiKey, model: CONFIG.geminiModel, claudeMode: 'balanced' },
  theme: 'system',
  haptics: true,
  sync: { enabled: true, key: CONFIG.syncKey },
};

let toastSeq = 0;

export const useGame = create<GameState>()((set, get) => ({
  hydrated: false,
  scenarios: {},
  activeId: null,
  settings: DEFAULT_SETTINGS,
  deleted: {},
  busy: {},
  toast: null,

  setActive: (id) => set({ activeId: id }),

  putScenario: (sc) =>
    set((s) => {
      const { [sc.id]: _gone, ...deleted } = s.deleted;
      return { scenarios: { ...s.scenarios, [sc.id]: sc }, deleted };
    }),

  replaceScenario: (sc) =>
    set((s) => {
      const cur = s.scenarios[sc.id];
      if (!cur) return s;
      const next = { ...sc, updatedTs: Math.max(Date.now(), cur.updatedTs + 1, sc.updatedTs + 1) };
      return { scenarios: { ...s.scenarios, [sc.id]: next } };
    }),

  removeScenario: (id) =>
    set((s) => {
      const { [id]: _removed, ...rest } = s.scenarios;
      const activeId = s.activeId === id ? (Object.keys(rest)[0] ?? null) : s.activeId;
      return { scenarios: rest, activeId, deleted: { ...s.deleted, [id]: Date.now() } };
    }),

  edit: (id, recipe) => {
    const sc = get().scenarios[id];
    if (!sc) return; // 그 사이 삭제된 시나리오면 무시
    const next = produce(sc, (d) => {
      recipe(d);
      d.updatedTs = Math.max(Date.now(), sc.updatedTs + 1);
    });
    set((s) => ({ scenarios: { ...s.scenarios, [id]: next } }));
  },

  setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  setAI: (patch) => set((s) => ({ settings: { ...s.settings, ai: { ...s.settings.ai, ...patch } } })),
  setSync: (patch) => set((s) => ({ settings: { ...s.settings, sync: { ...s.settings.sync, ...patch } } })),

  setBusy: (key, value) =>
    set((s) => {
      const busy = { ...s.busy };
      if (value) busy[key] = true;
      else delete busy[key];
      return { busy };
    }),

  showToast: (text, tone = 'info') => set({ toast: { id: ++toastSeq, text, tone } }),
}));

/** 예전 버전 세이브 고치기(에너지·커피 제거, 인증 배지 변환, v3 관계·난이도·아이템 기본값) — 실제 내용은 game/migrate.ts */
export function migrateScenario(raw: Scenario): Scenario {
  return migrateScenarioData(raw);
}

/** 앱 시작 시 저장된 데이터 불러오기 + 이후 자동 저장 시작 */
export async function hydrateStore() {
  const { meta, scenarios } = await loadAll();
  for (const id of Object.keys(scenarios)) scenarios[id] = migrateScenario(scenarios[id]);
  markLoaded(scenarios);
  const activeId = meta?.activeId && scenarios[meta.activeId] ? meta.activeId : (Object.keys(scenarios)[0] ?? null);
  const saved = meta?.settings;
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...(saved ?? {}),
    ai: { ...DEFAULT_SETTINGS.ai, ...(saved?.ai ?? {}) },
    sync: { ...DEFAULT_SETTINGS.sync, ...(saved?.sync ?? {}) },
  };
  // 빌드에 들어 있는 키가 바뀌었으면(새 .env.local) 빈 칸만 채운다
  if (!settings.ai.apiKey && CONFIG.geminiKey) settings.ai.apiKey = CONFIG.geminiKey;
  if (!settings.sync.key && CONFIG.syncKey) settings.sync.key = CONFIG.syncKey;
  // 실행 환경에 맞는 엔진: 아티팩트는 제미나이(DB 경유, 키는 서버 금고) → 실패하면 클로드(ai/index.ts 사슬), 그 밖은 제미나이(내 키)
  // (v3.1) 틀 문장으로 흉내 내던 '모의 엔진'은 없앴다 — 예전 설정의 'mock'은 제미나이로
  if ((settings.ai.provider as string) === 'mock') settings.ai.provider = 'gemini';
  if (isArtifactRuntime()) {
    if (!settings.ai.chosen) settings.ai.provider = 'gemini';
  } else if (settings.ai.provider === 'claude') {
    settings.ai.provider = 'gemini';
  }

  useGame.setState({ scenarios, activeId, settings, deleted: meta?.deleted ?? {}, hydrated: true });

  let timer: ReturnType<typeof setTimeout> | null = null;
  useGame.subscribe((s, prev) => {
    if (s.scenarios === prev.scenarios && s.activeId === prev.activeId && s.settings === prev.settings && s.deleted === prev.deleted) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const st = useGame.getState();
      saveAll({ activeId: st.activeId, settings: st.settings, scenarios: st.scenarios, deleted: st.deleted }).catch((e) => console.warn('[저장] 실패', e));
    }, 400);
  });
}

/** 현재 플레이 중인 시나리오 */
export function useActive(): Scenario | null {
  return useGame((s) => (s.activeId ? (s.scenarios[s.activeId] ?? null) : null));
}

export function getActive(): Scenario | null {
  const s = useGame.getState();
  return s.activeId ? (s.scenarios[s.activeId] ?? null) : null;
}
