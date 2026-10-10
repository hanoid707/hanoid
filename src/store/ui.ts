/**
 * 화면 상태(저장 안 함) — 앱을 다시 켜면 비어 있다.
 * (v3) 사이드 메뉴는 없어졌다(내 프사 = 다섯 번째 탭 '나').
 */
import { create } from 'zustand';

interface UIState {
  /** 아이템 화면: 마지막으로 고른 선물(다음에 같은 선물을 바로 고르게) */
  lastGiftId: string | null;
  setLastGift(id: string | null): void;
}

export const useUI = create<UIState>()((set) => ({
  lastGiftId: null,
  setLastGift: (lastGiftId) => set({ lastGiftId }),
}));
