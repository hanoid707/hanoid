/**
 * 공통 캐릭터 목록(세계관과 상관없이 사용자가 직접 추가해 두는 계정) — 기기 저장 + DB 동기화
 * - 내용(이름·사진·특징)은 전부 사용자가 입력하거나 붙여 넣는다(스프레드시트 표 / JSON). 앱은 사람 정보를 하나도 넣지 않는다.
 * - 각 시나리오에는 게임 규칙(src/game/roster.ts)이 켜기/끄기/골라 넣기에 따라 캐릭터로 넣고 뺀다.
 * - 저장: 기기 저장소 'mainchar:roster:v1'(persistence.ts가 시작할 때 연결해 준다). 동기화: rosterSnapshot / applyRemoteRoster
 */
import { create } from 'zustand';
import { CORE_TYPES, CROWD_TYPES, PERSONALITY_PRESETS, SPEECH_PRESETS, typeLabel } from '../game/relationship';
import type { AgeGroup, BadgeKind, CharacterType, Gender, ID, PhotoRef, RosterEntry } from '../types';
import { cutText, hashStr, sanitizeHandle, uid } from '../utils';
import type { KV } from './persistence';

export interface RosterState {
  hydrated: boolean;
  entries: Record<ID, RosterEntry>;
  /** 새 이야기를 시작할 때 기본 등장 방식 */
  defaultMode: 'on' | 'off';
  /** (동기화) 지운 항목 id → 지운 시각 */
  deleted: Record<ID, number>;
  /** (동기화) 마지막으로 바뀐 시각 */
  updatedTs: number;
}

export const useRoster = create<RosterState>()(() => ({ hydrated: false, entries: {}, defaultMode: 'off', deleted: {}, updatedTs: 0 }));

export interface ImportResult {
  added: number;
  updated: number;
  errors: string[];
}

const KEY = 'mainchar:roster:v1';
const ALL_TYPES: CharacterType[] = [...CORE_TYPES, ...CROWD_TYPES];
const EMOJIS = ['⭐', '🌙', '🎧', '📸', '🎤', '🎬', '💫', '🌸', '🔥', '🎨', '🕶️', '🍀'];
const COLORS = ['#6D4AFF', '#FF4F81', '#FFB020', '#12B5CB', '#16A34A', '#2E90FA', '#F97316', '#A855F7', '#0F172A', '#E11D48'];

// ───────────────────────── 저장(기기)

let kvRef: KV | null = null;
let hydrating: Promise<void> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let subscribed = false;

/** 기기 저장소 연결(persistence.ts가 불러질 때 자동으로 호출) */
export function attachRosterStorage(kv: KV): void {
  kvRef = kv;
}

interface Saved {
  v: 1;
  entries: Record<ID, RosterEntry>;
  defaultMode: 'on' | 'off';
  deleted: Record<ID, number>;
  updatedTs: number;
}

function persistSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const s = useRoster.getState();
    const data: Saved = { v: 1, entries: s.entries, defaultMode: s.defaultMode, deleted: s.deleted, updatedTs: s.updatedTs };
    kvRef?.setItem(KEY, JSON.stringify(data)).catch((e) => console.warn('[공통 캐릭터] 저장 실패', e));
  }, 400);
}

/** 앱 시작 때 불러오기(App.tsx에서 hydrateStore와 같이). 이후 바뀌면 자동 저장 */
export async function hydrateRoster(): Promise<void> {
  if (useRoster.getState().hydrated) return;
  if (hydrating) return hydrating;
  hydrating = (async () => {
    let saved: Partial<Saved> | null = null;
    try {
      const raw = kvRef ? await kvRef.getItem(KEY) : null;
      if (raw) saved = JSON.parse(raw) as Partial<Saved>;
    } catch (e) {
      console.warn('[공통 캐릭터] 불러오기 실패', e);
    }
    const cur = useRoster.getState();
    const entries: Record<ID, RosterEntry> = {};
    for (const [id, e] of Object.entries(saved?.entries ?? {})) {
      const n = normalizeEntry({ ...e, id }, null);
      if (n) entries[id] = n;
    }
    Object.assign(entries, cur.entries); // 불러오기 전에 만든 항목이 우선
    useRoster.setState({
      hydrated: true,
      entries,
      defaultMode: cur.updatedTs > (saved?.updatedTs ?? 0) ? cur.defaultMode : (saved?.defaultMode ?? cur.defaultMode),
      deleted: { ...(saved?.deleted ?? {}), ...cur.deleted },
      updatedTs: Math.max(cur.updatedTs, saved?.updatedTs ?? 0),
    });
    if (!subscribed) {
      subscribed = true;
      useRoster.subscribe((s, prev) => {
        if (s.entries === prev.entries && s.defaultMode === prev.defaultMode && s.deleted === prev.deleted) return;
        persistSoon();
      });
    }
    if (cur.updatedTs) persistSoon();
  })().finally(() => {
    hydrating = null;
  });
  return hydrating;
}

function ensureHydrated() {
  if (!useRoster.getState().hydrated) void hydrateRoster();
}

// ───────────────────────── 항목 정리

const isType = (t: unknown): t is CharacterType => typeof t === 'string' && (ALL_TYPES as string[]).includes(t);
const isGender = (g: unknown): g is Gender => g === 'f' || g === 'm';
const isAge = (a: unknown): a is AgeGroup => a === 10 || a === 20 || a === 30 || a === 40 || a === 50 || a === 60;
const isBadge = (b: unknown): b is BadgeKind => b === 'blue' || b === 'gold' || b === 'gray';

/** 다른 항목과 겹치지 않는 아이디 */
function uniqueHandle(base: string, selfId: ID | null): string {
  const taken = new Set(
    Object.values(useRoster.getState().entries)
      .filter((e) => e.id !== selfId)
      .map((e) => e.handle.toLowerCase()),
  );
  let h = base;
  for (let i = 2; taken.has(h.toLowerCase()) && i < 999; i++) h = `${base.slice(0, 15 - String(i).length)}${i}`;
  return h;
}

/** 아이디가 없을 때: 이름에서 만든 고정 값(user_xxxxx) */
export function handleFromName(name: string): string {
  return `user_${(hashStr(name || String(Date.now())) % 1_000_000).toString(36)}`.slice(0, 15);
}

function cleanPhoto(p: unknown): PhotoRef | undefined {
  if (!p || typeof p !== 'object') return undefined;
  const r = p as PhotoRef;
  const out: PhotoRef = {};
  if (typeof r.url === 'string' && /^(https?:\/\/|data:image\/)/i.test(r.url.trim())) out.url = r.url.trim();
  if (typeof r.mediaId === 'string' && r.mediaId) out.mediaId = r.mediaId;
  if (typeof r.photo === 'string' && r.photo) out.photo = r.photo;
  if (typeof r.image === 'string' && r.image) out.image = r.image;
  return Object.keys(out).length ? out : undefined;
}

/** 저장 전에 값 정리(이상한 값은 버리거나 기본값). uniqueOf = 아이디 겹침 검사 대상 id(null이면 검사 안 함) */
function normalizeEntry(e: Partial<RosterEntry> & { id: ID }, uniqueOf: ID | null | undefined): RosterEntry | null {
  const name = cutText(String(e.name ?? '').trim(), 50);
  let handle = sanitizeHandle(String(e.handle ?? ''));
  if (!name && !handle) return null;
  if (handle.length < 1) handle = handleFromName(name);
  if (uniqueOf !== undefined && uniqueOf !== null) handle = uniqueHandle(handle, uniqueOf);
  const h = hashStr(e.id);
  const out: RosterEntry = {
    id: e.id,
    name: name || handle,
    handle,
    type: isType(e.type) ? e.type : 'celeb',
    followers: Math.max(0, Math.round(Number(e.followers) || 0)),
    bio: cutText(String(e.bio ?? '').trim(), 160),
    traits: cutText(String(e.traits ?? '').trim(), 600),
    updatedTs: Number(e.updatedTs) || Date.now(),
  };
  if (isGender(e.gender)) out.gender = e.gender;
  if (isAge(e.ageGroup)) out.ageGroup = e.ageGroup;
  if (e.following !== undefined && Number.isFinite(Number(e.following))) out.following = Math.max(0, Math.round(Number(e.following)));
  if (e.personality) out.personality = String(e.personality).trim().slice(0, 30);
  if (e.speechStyle) out.speechStyle = String(e.speechStyle).trim().slice(0, 30);
  const photo = cleanPhoto(e.photo);
  if (photo) out.photo = photo;
  const banner = cleanPhoto(e.banner);
  if (banner) out.banner = banner;
  if (e.badge === null || isBadge(e.badge)) out.badge = e.badge;
  out.emoji = typeof e.emoji === 'string' && e.emoji.trim() ? e.emoji.trim().slice(0, 4) : EMOJIS[h % EMOJIS.length];
  out.color = typeof e.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(e.color) ? e.color : COLORS[(h >>> 4) % COLORS.length];
  if (e.memo) out.memo = String(e.memo).trim().slice(0, 300);
  return out;
}

// ───────────────────────── 추가·수정·삭제

/** 추가·수정(id가 같으면 덮어씀). 저장된 항목 id(이름·아이디가 둘 다 비면 '') */
export function saveRosterEntry(entry: Omit<RosterEntry, 'id' | 'updatedTs'> & { id?: ID }): ID {
  ensureHydrated();
  const id = entry.id || uid('rs');
  const clean = normalizeEntry({ ...entry, id, updatedTs: Date.now() }, id);
  if (!clean) return '';
  useRoster.setState((s) => {
    const { [id]: _gone, ...deleted } = s.deleted;
    return { entries: { ...s.entries, [id]: clean }, deleted, updatedTs: Date.now() };
  });
  return id;
}

export function deleteRosterEntry(id: ID): void {
  ensureHydrated();
  useRoster.setState((s) => {
    if (!s.entries[id]) return s;
    const { [id]: _gone, ...entries } = s.entries;
    return { entries, deleted: { ...s.deleted, [id]: Date.now() }, updatedTs: Date.now() };
  });
}

export function setRosterDefaultMode(mode: 'on' | 'off'): void {
  ensureHydrated();
  useRoster.setState({ defaultMode: mode, updatedTs: Date.now() });
}

// ───────────────────────── 붙여 넣어 가져오기

type Field = 'name' | 'handle' | 'gender' | 'age' | 'type' | 'followers' | 'following' | 'bio' | 'traits' | 'personality' | 'speechStyle' | 'photo' | 'banner' | 'badge' | 'memo' | 'emoji';

/** 머리글(공백·괄호 설명 뺀 소문자) → 항목 */
const HEADERS: Record<string, Field> = {};
const alias = (f: Field, ...names: string[]) => names.forEach((n) => (HEADERS[normHeader(n)] = f));
function normHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]|（.*?）/g, '')
    .replace(/[\s_\-·.:*/#@'"]/g, '');
}
alias('name', '이름', '닉네임', '표시이름', '표시 이름', '계정이름', 'name', 'displayname', 'display name', 'nickname', 'nick');
alias('handle', '아이디', '핸들', '계정', '계정아이디', '유저네임', '사용자이름', 'handle', 'username', 'user name', 'screenname', 'account', 'userid');
alias('gender', '성별', 'gender', 'sex');
alias('age', '나이', '나이대', '연령', '연령대', 'age', 'agegroup', 'age group');
alias('type', '유형', '타입', '관계', '분류', '종류', 'type', 'role', 'relation', 'category');
alias('followers', '팔로워', '팔로워수', '팔로워 수', 'followers', 'follower', 'followercount');
alias('following', '팔로잉', '팔로잉수', '팔로잉 수', 'following', 'followingcount');
alias('bio', '자기소개', '소개', '바이오', '프로필', '한줄소개', 'bio', 'intro', 'profile');
alias('traits', '특징', '특성', '설명', '성격특징', '상세특징', '캐릭터', 'traits', 'trait', 'description', 'desc', 'details');
alias('personality', '성격', '성격유형', 'mbti', 'personality');
alias('speechStyle', '말투', '말투프리셋', '어투', 'speech', 'speechstyle', 'tone', 'style');
alias('photo', '사진', '사진주소', '프사', '프로필사진', '프로필 사진', '이미지', '이미지주소', '사진url', 'photo', 'photourl', 'avatar', 'avatarurl', 'image', 'imageurl', 'picture', 'url');
alias('banner', '배너', '배너주소', '배너사진', '배너이미지', 'banner', 'bannerurl', 'header', 'headerurl', 'cover');
alias('badge', '배지', '인증', '인증마크', '인증배지', 'badge', 'verified', 'check');
alias('memo', '메모', '비고', '출처', 'memo', 'note', 'notes', 'source');
alias('emoji', '이모지', 'emoji');

/** "1.2만", "120만", "3,400", "1.5M", "12k", "1억 2천만" → 숫자 */
export function parseCount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : null;
  const s = String(raw ?? '')
    .replace(/[,\s명+약~]/g, '')
    .toLowerCase();
  if (!s) return null;
  const en = s.match(/^(\d+(?:\.\d+)?)([kmb])$/);
  if (en) return Math.round(parseFloat(en[1]) * { k: 1e3, m: 1e6, b: 1e9 }[en[2] as 'k' | 'm' | 'b']);
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s));
  let total = 0;
  let rest = s;
  for (const [unit, mul] of [['억', 1e8], ['만', 1e4]] as const) {
    const i = rest.indexOf(unit);
    if (i < 0) continue;
    const part = smallNum(rest.slice(0, i));
    if (part === null) return null;
    total += (part || 1) * mul;
    rest = rest.slice(i + 1);
  }
  if (rest) {
    const part = smallNum(rest);
    if (part === null) return null;
    total += part;
  }
  return Math.round(total);
}

/** 만 단위 아래: "1.2", "2천", "3천5백", "1200" */
function smallNum(s: string): number | null {
  if (!s) return 0;
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  let total = 0;
  let rest = s;
  for (const [unit, mul] of [['천', 1000], ['백', 100], ['십', 10]] as const) {
    const i = rest.indexOf(unit);
    if (i < 0) continue;
    const head = rest.slice(0, i);
    const n = head === '' ? 1 : /^\d+(\.\d+)?$/.test(head) ? parseFloat(head) : NaN;
    if (Number.isNaN(n)) return null;
    total += n * mul;
    rest = rest.slice(i + 1);
  }
  if (rest) {
    if (!/^\d+(\.\d+)?$/.test(rest)) return null;
    total += parseFloat(rest);
  }
  return total;
}

function parseGender(v: string): Gender | undefined {
  const s = v.trim().toLowerCase();
  if (/^(남|남자|남성|m|male|man|boy|♂)$/.test(s)) return 'm';
  if (/^(여|여자|여성|f|female|woman|girl|♀)$/.test(s)) return 'f';
  return undefined;
}

/** "27" → 20, "20대" → 20, "30대 초반" → 30, "10대" → 10 */
function parseAge(v: unknown): AgeGroup | undefined {
  const m = String(v ?? '').match(/\d+/);
  if (!m) return undefined;
  const n = parseInt(m[0], 10);
  const g = Math.min(60, Math.max(10, Math.floor(n / 10) * 10));
  return isAge(g) ? g : undefined;
}

const TYPE_SYNONYM: Record<string, CharacterType> = {
  베스트프렌드: 'bestie', 절친: 'bestie', 소울메이트: 'bestie', bff: 'bestie', bestfriend: 'bestie',
  썸: 'spicy', 밀당: 'spicy', crush: 'spicy',
  애인: 'lover', 여친: 'lover', 남친: 'lover', 여자친구: 'lover', 남자친구: 'lover', partner: 'lover', girlfriend: 'lover', boyfriend: 'lover',
  경쟁자: 'rival', 원수: 'enemy',
  스승: 'mentor', 선배: 'mentor', 사수: 'mentor',
  형제: 'family', 자매: 'family', 남매: 'family', 언니: 'family', 오빠: 'family', 누나: 'family', 형: 'family', 동생: 'family', 엄마: 'family', 아빠: 'family',
  지인: 'acquaintance', 동료: 'acquaintance', 아는사이: 'acquaintance',
  찐팬: 'superfan', 열성팬: 'superfan', 악플러: 'antifan', 안티: 'antifan',
  기자: 'news', 뉴스: 'news', 언론사: 'news', 잡지: 'magazine', 방송: 'broadcaster', 채널: 'broadcaster', 브랜드: 'sponsor', 광고주: 'sponsor', 스폰서: 'sponsor', 기업: 'sponsor',
  연예인: 'celeb', 스타: 'celeb', 인플루언서: 'celeb', 아이돌: 'celeb', 배우: 'celeb', 가수: 'celeb', 크리에이터: 'celeb', 유튜버: 'celeb', celebrity: 'celeb', star: 'celeb', influencer: 'celeb',
  일반인: 'public', 구경꾼: 'public',
};

function parseType(v: string): CharacterType | undefined {
  const s = v.trim().toLowerCase().replace(/\s/g, '');
  if (!s) return undefined;
  for (const t of ALL_TYPES) if (t === s || typeLabel(t).replace(/\s/g, '') === s) return t;
  return TYPE_SYNONYM[s];
}

function parseBadge(v: unknown): BadgeKind | null | undefined {
  if (v === true) return 'blue';
  if (v === false || v === null) return null;
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return undefined;
  if (/^(파랑|파란|파란색|blue|개인|o|yes|y|true|1|✔|✓|v|있음|인증)$/.test(s)) return 'blue';
  if (/^(금색|골드|금|노랑|gold|yellow|단체|기업)$/.test(s)) return 'gold';
  if (/^(회색|gray|grey|기관|정부)$/.test(s)) return 'gray';
  if (/^(없음|no|n|false|0|x|-|×)$/.test(s)) return null;
  return undefined;
}

function parsePersonality(v: string): string | undefined {
  const s = v.trim();
  if (!s) return undefined;
  const up = s.toUpperCase().match(/[EI][NS][TF][JP]/);
  if (up && PERSONALITY_PRESETS.some((p) => p.id === up[0])) return up[0];
  return s.slice(0, 30);
}

function parseSpeech(v: string): string | undefined {
  const s = v.trim();
  if (!s) return undefined;
  const hit = SPEECH_PRESETS.find((p) => p.id === s.toLowerCase() || p.label.replace(/\s/g, '') === s.replace(/\s/g, ''));
  return hit ? hit.id : s.slice(0, 30);
}

function urlRef(v: unknown): PhotoRef | undefined {
  const s = String(v ?? '').trim();
  return /^(https?:\/\/|data:image\/)/i.test(s) ? { url: s } : undefined;
}

/** 따옴표를 아는 표 읽기(구글 시트·엑셀에서 복사한 탭 구분, 또는 CSV) */
function parseTable(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

type Raw = Partial<Record<Field, unknown>>;

/** JSON 객체의 키도 같은 머리글 규칙으로 읽는다 */
function rawFromObject(o: Record<string, unknown>): Raw {
  const out: Raw = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === 'id' || k === 'updatedTs') continue;
    if (k === 'ageGroup') out.age = v;
    else if (k === 'photo' || k === 'banner') out[k] = v;
    else {
      const f = HEADERS[normHeader(k)];
      if (f && out[f] === undefined) out[f] = v;
    }
  }
  return out;
}

/** 한 줄 → 항목 일부(빈 칸은 빼서 "기존 값 유지") */
function toPartial(r: Raw, where: string, errors: string[]): (Partial<RosterEntry> & { name?: string; handle?: string }) | null {
  const str = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());
  const out: Partial<RosterEntry> = {};
  const name = str(r.name);
  const handle = sanitizeHandle(str(r.handle));
  if (/^\(.*\)$/.test(name) || /^\(.*\)$/.test(str(r.handle))) {
    errors.push(`${where}: 예시 줄이라 건너뛰었어요`);
    return null;
  }
  if (!name && !handle) {
    errors.push(`${where}: 이름이나 아이디가 없어서 건너뛰었어요`);
    return null;
  }
  if (name) out.name = name;
  if (handle) out.handle = handle;
  if (str(r.gender)) {
    const g = parseGender(str(r.gender));
    if (g) out.gender = g;
    else errors.push(`${where}: 성별 "${str(r.gender)}" → 남/여로 적어 주세요`);
  }
  if (str(r.age)) {
    const a = parseAge(r.age);
    if (a) out.ageGroup = a;
    else errors.push(`${where}: 나이 "${str(r.age)}" → 27이나 20대처럼 적어 주세요`);
  }
  if (str(r.type)) {
    const t = parseType(str(r.type));
    if (t) out.type = t;
    else errors.push(`${where}: 유형 "${str(r.type)}" → 몰라서 셀럽으로 넣었어요`);
  }
  if (str(r.followers)) {
    const n = parseCount(r.followers);
    if (n !== null) out.followers = n;
    else errors.push(`${where}: 팔로워 "${str(r.followers)}" → 1.2만, 3,400처럼 적어 주세요`);
  }
  if (str(r.following)) {
    const n = parseCount(r.following);
    if (n !== null) out.following = n;
  }
  if (str(r.bio)) out.bio = str(r.bio);
  if (str(r.traits)) out.traits = str(r.traits);
  if (str(r.personality)) out.personality = parsePersonality(str(r.personality));
  if (str(r.speechStyle)) out.speechStyle = parseSpeech(str(r.speechStyle));
  if (r.photo !== undefined && r.photo !== '') {
    const p = typeof r.photo === 'object' ? cleanPhoto(r.photo) : urlRef(r.photo);
    if (p) out.photo = p;
    else errors.push(`${where}: 사진은 https:// 로 시작하는 이미지 주소만 넣을 수 있어요`);
  }
  if (r.banner !== undefined && r.banner !== '') {
    const p = typeof r.banner === 'object' ? cleanPhoto(r.banner) : urlRef(r.banner);
    if (p) out.banner = p;
  }
  const b = parseBadge(r.badge);
  if (b !== undefined) out.badge = b;
  if (str(r.memo)) out.memo = str(r.memo);
  if (str(r.emoji)) out.emoji = str(r.emoji);
  return out;
}

/** 붙여 넣은 표(탭·쉼표 구분, 첫 줄 = 머리글) 또는 JSON 배열 → 목록에 추가(아이디가 같으면 고침) */
export function importRoster(text: string): ImportResult {
  ensureHydrated();
  const t = (text ?? '').replace(/^﻿/, '').trim();
  const errors: string[] = [];
  if (!t) return { added: 0, updated: 0, errors: ['붙여 넣은 내용이 없어요'] };

  let rows: { where: string; raw: Raw }[] = [];
  if (t.startsWith('[') || t.startsWith('{')) {
    try {
      const data = JSON.parse(t) as unknown;
      const list = Array.isArray(data) ? data : Array.isArray((data as { entries?: unknown[] }).entries) ? (data as { entries: unknown[] }).entries : [data];
      rows = list
        .map((o, i) => (o && typeof o === 'object' ? { where: `${i + 1}번째 항목`, raw: rawFromObject(o as Record<string, unknown>) } : null))
        .filter((x): x is { where: string; raw: Raw } => !!x);
    } catch (e) {
      return { added: 0, updated: 0, errors: [`JSON 형식이 올바르지 않아요 (${(e as Error).message.slice(0, 60)})`] };
    }
  } else {
    const lines = t.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
    const first = lines[0] ?? '';
    const delim = first.includes('\t') ? '\t' : first.includes(',') ? ',' : first.includes(';') ? ';' : '\t';
    const table = parseTable(lines.join('\n'), delim);
    if (table.length < 2) return { added: 0, updated: 0, errors: ['첫 줄은 머리글(이름, 아이디, 팔로워 …), 둘째 줄부터 계정을 넣어 주세요'] };
    const header = table[0].map((h) => HEADERS[normHeader(h)]);
    if (!header.includes('name') && !header.includes('handle')) {
      return { added: 0, updated: 0, errors: ['머리글에 "이름" 또는 "아이디" 칸이 필요해요 (양식 복사 버튼을 눌러 보세요)'] };
    }
    const unknown = table[0].filter((h, i) => h.trim() && !header[i]);
    if (unknown.length) errors.push(`모르는 칸은 건너뛰었어요: ${unknown.slice(0, 5).join(', ')}`);
    rows = table.slice(1).map((cells, i) => {
      const raw: Raw = {};
      header.forEach((f, k) => {
        if (f && raw[f] === undefined && cells[k] !== undefined) raw[f] = cells[k];
      });
      return { where: `${i + 2}번째 줄`, raw };
    });
  }

  let added = 0;
  let updated = 0;
  const now = Date.now();
  const entries = { ...useRoster.getState().entries };
  const byHandle = new Map(Object.values(entries).map((e) => [e.handle.toLowerCase(), e.id]));
  for (const { where, raw } of rows.slice(0, 500)) {
    const part = toPartial(raw, where, errors);
    if (!part) continue;
    const h = part.handle ?? handleFromName(part.name ?? '');
    const existingId = byHandle.get(h.toLowerCase());
    if (existingId) {
      const merged = normalizeEntry({ ...entries[existingId], ...part, handle: entries[existingId].handle, id: existingId, updatedTs: now + updated }, null);
      if (merged) {
        entries[existingId] = merged;
        updated += 1;
      }
    } else {
      const id = uid('rs');
      const fresh = normalizeEntry({ type: 'celeb', followers: 0, bio: '', traits: '', ...part, handle: h, id, updatedTs: now + added }, null);
      if (!fresh) continue;
      entries[id] = fresh;
      byHandle.set(fresh.handle.toLowerCase(), id);
      added += 1;
    }
  }
  if (rows.length > 500) errors.push('한 번에 500개까지만 가져왔어요');
  if (added || updated) {
    useRoster.setState((s) => {
      const deleted = { ...s.deleted };
      for (const id of Object.keys(entries)) delete deleted[id];
      return { entries, deleted, updatedTs: Date.now() };
    });
  }
  return { added, updated, errors: errors.slice(0, 30) };
}

/** 붙여 넣기 양식(스프레드시트 머리글 + 예시 한 줄 — 예시는 빈칸 안내만, 실제 사람 정보 없음) */
export function rosterTemplate(): string {
  return [
    ['이름', '아이디', '성별(남/여)', '나이대', '유형', '팔로워', '자기소개', '특징', '성격', '말투', '사진주소', '메모'].join('\t'),
    ['(이름)', '(영문_아이디)', '여', '20대', '셀럽', '1.2만', '(한 줄 소개)', '(성격·말버릇·좋아하는 것)', 'ENFP', '다정다감', '(https://로 시작하는 이미지 주소)', '(메모)'].join('\t'),
  ].join('\n');
}

// ───────────────────────── DB 동기화(통합 작업에서 연결)

export interface RosterSnapshot {
  entries: RosterEntry[];
  deleted: Record<ID, number>;
  defaultMode: 'on' | 'off';
  /** 목록 전체가 마지막으로 바뀐 시각 */
  ts: number;
}

/** 올릴 데이터(전체) */
export function rosterSnapshot(): RosterSnapshot {
  const s = useRoster.getState();
  return { entries: Object.values(s.entries), deleted: { ...s.deleted }, defaultMode: s.defaultMode, ts: s.updatedTs };
}

/**
 * 받은 데이터 합치기(항목마다 더 최신인 쪽이 이김, 지운 기록 반영). 바뀐 게 있으면 true
 * @param ts 받은 목록의 시각(defaultMode는 이게 더 최신일 때만 따른다)
 */
export function applyRemoteRoster(entries: RosterEntry[], ts: number, extra: { deleted?: Record<ID, number>; defaultMode?: 'on' | 'off' } = {}): boolean {
  const s = useRoster.getState();
  const next = { ...s.entries };
  const deleted = { ...s.deleted };
  let changed = false;
  for (const raw of entries ?? []) {
    if (!raw?.id) continue;
    const gone = deleted[raw.id];
    if (gone && gone >= (raw.updatedTs ?? 0)) continue;
    const mine = next[raw.id];
    if (mine && mine.updatedTs >= (raw.updatedTs ?? 0)) continue;
    const n = normalizeEntry(raw, null);
    if (!n) continue;
    next[raw.id] = n;
    delete deleted[raw.id];
    changed = true;
  }
  for (const [id, dts] of Object.entries(extra.deleted ?? {})) {
    if (next[id] && next[id].updatedTs <= dts) {
      delete next[id];
      changed = true;
    }
    if (!deleted[id] || deleted[id] < dts) deleted[id] = dts;
  }
  const mode = extra.defaultMode && ts > s.updatedTs ? extra.defaultMode : s.defaultMode;
  if (mode !== s.defaultMode) changed = true;
  if (changed) useRoster.setState({ entries: next, deleted, defaultMode: mode, updatedTs: Math.max(s.updatedTs, ts) });
  return changed;
}
