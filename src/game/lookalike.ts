/**
 * 플레이어와 헷갈리는 계정 막기 — "내가 안 쓴 글이 내 이름·내 프사로 올라온 것처럼 보이는" 일을 없앤다.
 *   플레이어와 이름이 같거나 비슷한 계정, 아이디가 겹치는 계정, 같은 프로필 사진(또는 같은 이모지 프사)을 쓰는 계정은 있으면 안 된다.
 *   ① 등장인물: 이름·아이디·사진이 겹치면 인물 쪽을 바꾼다(이름은 글·쪽지·기억에 적힌 것까지 같이 바꾼다)  → separateFromPlayer
 *   ② 이름 없는 일반 유저(임시 계정): 글이 만들어질 때 겹치면 다른 사람으로 다시 뽑는다                      → safeGhost
 *   ③ AI가 플레이어 이름으로 쓴 줄은 받지 않는다(ai/normalize.ts lines)                                   → isPlayerName
 * 플레이어 글은 플레이어가 직접 올릴 때만 생긴다(game/post.ts · game/thread.ts 두 곳뿐).
 */
import { ghostAuthor } from '../ai/local/ghost';
import { faceGender, pickFace, resolveFace, themeOfWorld, usedFaceKeys } from '../data/facePool';
import type { GhostAuthor, Scenario } from '../types';
import { hashStr } from '../utils';

const DECOR = /[☀-➿]|[\uD800-\uDBFF][\uDC00-\uDFFF]|️|‍/g;
/** 견줄 때 쓰는 이름: 이모지·공백·기호를 떼고 소문자로 */
export const nameKey = (s: string | undefined) => (s ?? '').replace(DECOR, '').replace(/[\s·._\-~!?,()[\]{}'"“”‘’]+/g, '').toLowerCase();

/** 플레이어 이름과 같거나, (두 글자 이상이면) 한쪽이 다른 쪽을 품고 있는 이름 */
export function similarName(player: string | undefined, other: string | undefined): boolean {
  const a = nameKey(player);
  const b = nameKey(other);
  if (!a || !b) return false;
  if (a === b) return true;
  // 한 글자 이름은 너무 많은 이름에 들어 있다(결 ⊂ 한결) → 같을 때만
  return a.length >= 2 && (b.includes(a) || (b.length >= 2 && a.includes(b)));
}

/** 플레이어 아이디와 같거나, (네 글자 이상이면) 한쪽이 다른 쪽을 품고 있는 아이디 */
export function similarHandle(player: string | undefined, other: string | undefined): boolean {
  const a = (player ?? '').replace(/^@/, '').toLowerCase();
  const b = (other ?? '').replace(/^@/, '').toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  return a.length >= 4 && b.length >= 4 && (b.includes(a) || a.includes(b));
}

/** AI가 작성자 칸에 플레이어를 적었는지(아이디·이름·"플레이어" 등) */
export function isPlayerName(persona: { name: string; handle: string }, h: string): boolean {
  const raw = h.replace(/^@/, '').trim();
  if (!raw) return false;
  if (raw.toLowerCase() === persona.handle.toLowerCase()) return true;
  const k = nameKey(raw.replace(/\(.*?\)/g, ''));
  if (!k) return false;
  return k === nameKey(persona.name) || k === '플레이어' || k === 'player' || k === 'me' || k === '나' || k === '주인공';
}

const EMOJI_POOL = ['🐱', '🐶', '🌙', '🍓', '☁️', '🍀', '🐰', '🍙', '🫧', '⭐', '🐻', '🥨', '🍑', '🌷', '🐧', '🍊', '🌻', '🧸', '🍒', '🐥', '🌈', '🍵'];
const samePhoto = (a?: string, b?: string) => !!a && !!b && resolveFace(a) === resolveFace(b);

/** 임시 계정이 플레이어와 헷갈리는지 */
function ghostLooksLikePlayer(d: Scenario, g: GhostAuthor): boolean {
  return similarName(d.persona.name, g.name) || similarHandle(d.persona.handle, g.handle);
}

/**
 * 임시 계정(이름 없는 일반 유저)을 플레이어와 헷갈리지 않게: 이름·아이디가 겹치면 다른 사람으로 다시 뽑고,
 * 프사(이모지·사진)가 플레이어와 같으면 다른 것으로 바꾼다. 겹치지 않으면 그대로 돌려준다.
 */
export function safeGhost(d: Scenario, g: GhostAuthor, seed: string): GhostAuthor {
  let out = g;
  for (let i = 0; i < 6 && ghostLooksLikePlayer(d, out); i++) out = { ...ghostAuthor(`${seed}:alt${i}`) };
  if (ghostLooksLikePlayer(d, out)) out = { ...out, name: '익명', handle: `user_${(hashStr(seed) % 9000) + 1000}` };
  const pa = d.persona.avatar;
  if (out.photo && samePhoto(out.photo, pa?.photo)) out = { ...out, photo: undefined };
  // 플레이어가 이모지 프사를 쓰는데 같은 이모지면 바꾼다
  if (!out.photo && pa && !pa.photo && !pa.mediaId && !pa.url && out.emoji === pa.emoji) {
    const pool = EMOJI_POOL.filter((e) => e !== pa.emoji);
    out = { ...out, emoji: pool[hashStr(`${seed}:e`) % pool.length] };
  }
  return out;
}

const ALT_NAMES: Record<'f' | 'm', string[]> = {
  f: ['서윤', '지안', '하린', '유나', '채원', '다은', '소율', '가은', '아린', '세아', '예린', '나연'],
  m: ['도윤', '시우', '준호', '하준', '현우', '은우', '태윤', '주원', '건우', '이준', '민재', '우진'],
};
const ALT_HANDLES: Record<'f' | 'm', string[]> = {
  f: ['seoyun', 'jian', 'harin', 'yuna', 'chaewon', 'daeun', 'soyul', 'gaeun', 'arin', 'sea', 'yerin', 'nayeon'],
  m: ['doyun', 'siwoo', 'junho', 'hajun', 'hyunwoo', 'eunwoo', 'taeyun', 'juwon', 'geonwoo', 'ijun', 'minjae', 'woojin'],
};

/** 시나리오 안의 글자 값을 전부 훑어 from → to (내 계정·제목은 건드리지 않는다) */
function replaceEverywhere(d: Scenario, pairs: [string, string][]): void {
  // "한결같이"처럼 이름이 아닌 낱말은 그대로 둔다
  const res = pairs.filter(([from]) => !!from).map(([from, to]) => [new RegExp(`${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!같)`, 'g'), to] as const);
  const fix = (s: string) => res.reduce((out, [re, to]) => out.replace(re, to), s);
  const walk = (v: unknown, depth: number): void => {
    if (!v || typeof v !== 'object' || depth > 8) return;
    const o = v as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      const x = o[k];
      if (typeof x === 'string') {
        if (k !== 'id' && k !== 'authorId' && k !== 'photo' && k !== 'mediaId' && k !== 'url' && k !== 'image') o[k] = fix(x);
      } else if (x && typeof x === 'object') walk(x, depth + 1);
    }
  };
  const root = d as unknown as Record<string, unknown>;
  for (const k of Object.keys(root)) {
    if (k === 'persona' || k === 'title' || k === 'id') continue;
    const x = root[k];
    if (typeof x === 'string') continue;
    walk(x, 0);
  }
}

/**
 * 등장인물이 플레이어와 헷갈리지 않게 정리한다(몇 명을 고쳤는지 돌려준다). 여러 번 불러도 결과가 같다.
 *   - 이름이 같거나 비슷함 → 인물 이름의 그 부분을 다른 이름으로(글·쪽지·기억에 적힌 이름도 같이)
 *   - 아이디가 같거나 겹침 → 인물 아이디를 바꾼다(@멘션도 같이)
 *   - 프로필 사진이 같음 → 인물에게 다른 얼굴을 준다 / 같은 이모지 프사 → 인물 이모지를 바꾼다
 * 공통 캐릭터(rosterId)와 사용자가 직접 만든 인물(custom)의 이름·아이디는 사용자가 정한 것이라 건드리지 않는다(사진만 겹치지 않게).
 */
export function separateFromPlayer(d: Scenario): number {
  const p = d.persona;
  if (!p || !d.characters) return 0;
  const chars = Object.values(d.characters);
  const pairs: [string, string][] = [];
  let changed = 0;
  const usedNames = new Set(chars.map((c) => nameKey(c.name)));
  const usedHandles = new Set(chars.map((c) => c.handle.toLowerCase()));
  const pKey = nameKey(p.name);
  for (const c of chars) {
    const own = !!c.rosterId || !!c.custom;
    // 성별: 인물 설정 → 쓰는 얼굴 사진의 성별 → (둘 다 없으면) 아이디로 고정
    const fg = c.gender ?? faceGender(c.avatar?.photo);
    const g: 'f' | 'm' = fg === 'm' ? 'm' : fg === 'f' ? 'f' : hashStr(c.id) % 2 ? 'm' : 'f';
    if (!own && similarName(p.name, c.name)) {
      const alt = ALT_NAMES[g].find((n) => !similarName(p.name, n) && !usedNames.has(nameKey(n))) ?? ALT_NAMES[g === 'f' ? 'm' : 'f'].find((n) => !similarName(p.name, n) && !usedNames.has(nameKey(n)));
      if (alt) {
        const old = c.name;
        // 플레이어 이름이 들어 있는 부분만 바꾼다(편집자 한결 → 편집자 도윤). 그 밖엔 통째로
        const part = p.name.trim();
        const next = pKey.length >= 2 && part && old.includes(part) && nameKey(old) !== pKey ? old.split(part).join(alt) : alt;
        if (next !== old) {
          c.name = next;
          usedNames.add(nameKey(next));
          // 글·쪽지에 적힌 이름도 같이 바꾼다. 단 인물 이름이 플레이어 이름과 똑같았다면 글 속 그 이름이 플레이어를 가리킬 수 있어 계정 이름만 바꾼다
          if (nameKey(old) !== pKey) pairs.push([old, next]);
          changed++;
        }
      }
    }
    if (!own && similarHandle(p.handle, c.handle)) {
      const base = ALT_HANDLES[g][hashStr(c.id) % ALT_HANDLES[g].length];
      let h = `${base}_${(hashStr(`${c.id}:h`) % 90) + 10}`;
      for (let i = 0; usedHandles.has(h) || similarHandle(p.handle, h); i++) h = `${base}_${(hashStr(`${c.id}:h${i}`) % 900) + 100}`;
      pairs.push([`@${c.handle}`, `@${h}`]);
      usedHandles.add(h);
      c.handle = h;
      changed++;
    }
    const a = c.avatar;
    const pa = p.avatar;
    if (a && pa) {
      if (samePhoto(a.photo, pa.photo) && !a.mediaId && !a.url) {
        const used = usedFaceKeys(chars);
        used.add(resolveFace(pa.photo!));
        const key = pickFace(g, used, `${c.id}:sep`, themeOfWorld(d.world?.templateId));
        if (key) {
          a.photo = key;
          changed++;
        }
      } else if (!a.photo && !a.mediaId && !a.url && !a.image && !pa.photo && !pa.mediaId && !pa.url && a.emoji === pa.emoji && !c.isNews) {
        const pool = EMOJI_POOL.filter((e) => e !== pa.emoji);
        a.emoji = pool[hashStr(`${c.id}:e`) % pool.length];
        changed++;
      }
    }
  }
  if (pairs.length) replaceEverywhere(d, pairs);
  // 이미 올라와 있는 임시 계정 글
  for (const post of Object.values(d.posts ?? {})) {
    if (!post.ghost) continue;
    const g = safeGhost(d, post.ghost, post.id);
    if (g !== post.ghost) {
      post.ghost = g;
      changed++;
    }
  }
  return changed;
}
