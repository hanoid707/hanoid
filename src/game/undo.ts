/**
 * 되돌리기(아이템) — 행동 직전의 세이브 상태를 메모리에 몇 개 보관했다가 되돌린다.
 * - 저장·동기화하지 않는다(앱을 다시 켜면 비어 있음).
 * - 되돌리면 epoch가 올라가고, "되돌린 구간"이 기록된다.
 *   비동기 AI 반응은 시작 번호(flowSeq)를 들고 있다가, 자기가 그 구간 안에서 시작됐으면(= 취소된 행동의 반응이면) 버려진다.
 *   되돌린 시점보다 먼저 시작한 반응(예: 앞서 올린 글의 답글)은 계속 도착한다.
 */
import type { ID, Scenario } from '../types';

const MAX = 5;
/** 번호: 보관·흐름 시작·되돌리기 순서를 비교하려고 쓰는 단조 증가 값 */
let seq = 0;
const stacks = new Map<ID, { label: string; sc: Scenario; ts: number; seq: number }[]>();
const epochs = new Map<ID, number>();
/** 되돌린 구간(from = 보관 번호, to = 되돌린 번호) */
const undone = new Map<ID, { from: number; to: number }[]>();

/** 행동 직전에 호출: 지금 상태를 보관 */
export function snapshot(sc: Scenario, label: string): void {
  const st = stacks.get(sc.id) ?? [];
  st.push({ label, sc, ts: Date.now(), seq: ++seq }); // immer 상태는 불변이라 그대로 보관해도 안전
  if (st.length > MAX) st.shift();
  stacks.set(sc.id, st);
}

/** 되돌릴 수 있는 마지막 행동 */
export function lastUndo(sid: ID): { label: string; ts: number } | null {
  const st = stacks.get(sid);
  const top = st?.[st.length - 1];
  return top ? { label: top.label, ts: top.ts } : null;
}

/** 마지막 보관 상태를 꺼낸다(적용은 호출하는 쪽에서) */
export function popUndo(sid: ID): Scenario | null {
  const st = stacks.get(sid);
  const top = st?.pop();
  if (!top) return null;
  epochs.set(sid, (epochs.get(sid) ?? 0) + 1);
  const list = undone.get(sid) ?? [];
  list.push({ from: top.seq, to: ++seq });
  if (list.length > 20) list.shift();
  undone.set(sid, list);
  return top.sc;
}/** 비동기 흐름 시작 번호(행동의 snapshot 다음에 받는다) */
export function flowSeq(): number {
  return ++seq;
}

/** 이 번호로 시작한 흐름이 되돌리기로 취소됐는지 */
export function isUndone(sid: ID, flow: number): boolean {
  return (undone.get(sid) ?? []).some((u) => u.from < flow && flow < u.to);
}
