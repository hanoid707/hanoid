/**
 * 사진 저장소 — 직접 고른 사진(프로필·배너·첨부)을 ID로 관리한다.
 *   저장: 메모리 → 기기 저장소 → (동기화 켜져 있으면) DB 업로드 대기열
 *   읽기: 메모리 → 기기 저장소 → DB에서 내려받기
 * 기본 사진(AI로 만든 가상 인물)은 src/data/photos.ts에 앱과 함께 들어 있어서 여기를 거치지 않는다.
 */
import { useEffect, useState } from 'react';
import { resolveFace } from '../data/facePool';
import { AVATARS, BANNERS, SCENES } from '../data/photos';
import type { PhotoRef } from '../types';
import { uid } from '../utils';
import { loadMediaLocal, saveMediaLocal } from './persistence';

const mem = new Map<string, string>();
const listeners = new Map<string, Set<(uri: string) => void>>();

/** DB에서 사진을 받아오는 함수(동기화 모듈이 연결해 준다) */
let remoteFetcher: ((id: string) => Promise<string | null>) | null = null;
/** 새 사진이 생기면 업로드 대기열에 넣는 함수(동기화 모듈이 연결해 준다) */
let uploadQueue: ((m: { id: string; kind: string; w?: number; h?: number }) => void) | null = null;

export function connectMediaSync(fetcher: typeof remoteFetcher, queue: typeof uploadQueue) {
  remoteFetcher = fetcher;
  uploadQueue = queue;
}

function emit(id: string, uri: string) {
  listeners.get(id)?.forEach((fn) => fn(uri));
}

export function getMediaNow(id: string): string | undefined {
  return mem.get(id);
}

const inflight = new Map<string, Promise<string | null>>();

export function loadMedia(id: string): Promise<string | null> {
  const hit = mem.get(id);
  if (hit) return Promise.resolve(hit);
  const running = inflight.get(id);
  if (running) return running;
  const p = (async () => {
    const local = await loadMediaLocal(id);
    if (local) {
      mem.set(id, local);
      emit(id, local);
      return local;
    }
    if (!remoteFetcher) return null;
    try {
      const remote = await remoteFetcher(id);
      if (remote) {
        mem.set(id, remote);
        void saveMediaLocal(id, remote);
        emit(id, remote);
      }
      return remote;
    } catch {
      return null;
    }
  })().finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

/** 새 사진 저장(data URI) → 사진 ID */
export async function putMedia(dataUri: string, kind: 'avatar' | 'banner' | 'post', size?: { w: number; h: number }): Promise<string> {
  const id = uid('md');
  mem.set(id, dataUri);
  await saveMediaLocal(id, dataUri);
  uploadQueue?.({ id, kind, w: size?.w, h: size?.h });
  return id;
}

/** DB에서 받은 사진을 캐시에 넣기 */
export function cacheMedia(id: string, dataUri: string) {
  mem.set(id, dataUri);
  void saveMediaLocal(id, dataUri);
  emit(id, dataUri);
}

/** 사진 ID → 화면에 쓸 주소(없으면 받아올 때까지 undefined) */
export function useMediaUri(id?: string): string | undefined {
  const [uri, setUri] = useState<string | undefined>(() => (id ? mem.get(id) : undefined));
  useEffect(() => {
    if (!id) {
      setUri(undefined);
      return;
    }
    const now = mem.get(id);
    setUri(now);
    const fn = (u: string) => setUri(u);
    let set = listeners.get(id);
    if (!set) listeners.set(id, (set = new Set()));
    set.add(fn);
    if (!now) void loadMedia(id);
    return () => {
      set?.delete(fn);
    };
  }, [id]);
  return uri;
}

type Table = 'avatar' | 'banner' | 'scene';
const TABLE: Record<Table, Record<string, string>> = { avatar: AVATARS, banner: BANNERS, scene: SCENES };
/** 기본 사진 찾기(프로필 사진은 '대신 쓰기 표'를 거친다 — data/faceAlias) */
const builtin = (table: Table, key: string): string | undefined => TABLE[table][table === 'avatar' ? resolveFace(key) : key];

/** 사진 참조(기본 사진·직접 고른 사진·옛 data URI) → 주소 */
export function usePhotoUri(ref: PhotoRef | undefined, table: Table): string | undefined {
  const media = useMediaUri(ref?.mediaId);
  if (!ref) return undefined;
  if (ref.mediaId) return media ?? (ref.photo ? builtin(table, ref.photo) : ref.url);
  if (ref.photo) return builtin(table, ref.photo) ?? ref.image ?? ref.url;
  return ref.image ?? ref.url;
}

export function hasPhoto(ref: PhotoRef | undefined, table: Table): boolean {
  if (!ref) return false;
  return !!(ref.mediaId || ref.image || ref.url || (ref.photo && builtin(table, ref.photo)));
}
