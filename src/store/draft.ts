/** 온보딩(새 시나리오 만들기) 중간 입력값 — 저장하지 않는 임시 상태 */
import { create } from 'zustand';
import type { CastDraft } from '../ai/types';
import type { CustomFirstFollower } from '../game/factory';
import type { Difficulty, Persona } from '../types';

export interface CustomWorldInput {
  name: string;
  emoji: string;
  setting: string;
  tone: string;
}

interface DraftState {
  templateId: string | null;
  custom: CustomWorldInput | null;
  customCast: CastDraft[] | null;
  persona: Persona | null;
  firstFollowerKey: string | null;
  /** (v3) 첫 팔로워를 직접 추가한 경우 */
  customFirst: CustomFirstFollower | null;
  /** (v3) 시작 난이도(없으면 보통) */
  difficulty: Difficulty | null;
  set(patch: Partial<Omit<DraftState, 'set' | 'reset'>>): void;
  reset(): void;
}

const EMPTY = { templateId: null, custom: null, customCast: null, persona: null, firstFollowerKey: null, customFirst: null, difficulty: null };

export const useDraft = create<DraftState>()((set) => ({
  ...EMPTY,
  set: (patch) => set(patch),
  reset: () => set(EMPTY),
}));
