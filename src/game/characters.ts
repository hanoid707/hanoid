/**
 * 캐릭터 만들기·고치기·지우기(원본: 유저가 캐릭터 직접 추가·설정)
 *   createQuickCharacter: 유형·팔로워·성별·나이대·특징만 → 이름·아이디·소개·첫 글은 AI(짧은 호출 1회). 실패하면 이름·아이디만 로컬, 첫 글 없음
 *   regenerateBio:        자기소개만 AI로 다시(짧은 호출 1회)
 *   saveCharacter:        편집기 저장(유형을 바꾸면 관계·말투 즉시 다시 계산)
 *   onScenarioCreated:    새 이야기 직후 — 첫 팔로워의 첫 쪽지(AI) · 직접 추가한 첫 팔로워의 자기소개(AI) · 직접 만든 세계관의 첫 하루 정산(AI)
 * (v3.1) 미리 써 둔 첫 글·첫 쪽지 틀 문장은 없앴다 — 인물이 하는 말은 전부 AI가 맥락을 보고 쓴다.
 */
import { withCharAvoid } from '../ai/context';
import { peerRegisterHint } from '../ai/local/register';
import type { CharacterDraft, CharacterDraftArgs } from '../ai/types';
import { AVATAR_COLORS, AVATAR_EMOJIS } from '../data/avatars';
import { pickFace, themeOfWorld, usedFaceKeys } from '../data/facePool';
import { getActive } from '../store/game';
import type { AgeGroup, Archetype, BadgeKind, Character, CharacterType, Gender, ID, PhotoRef, Scenario, SpeechRegister } from '../types';
import { cutText, fill, pick, rand, sanitizeHandle, uid } from '../utils';
import { alive, beginFlow, charType, ctxOf, editIf, engine, ensureConversation, fail, G, OK, trimMessages, tune, type ActionResult } from './core';
import { npcEngagement } from './engagement';
import { koreanDisplayName, localBio, orgDisplayName } from './names';
import { addMemory, addPost, logActivity, noteRelationChange, pushNoti } from './progress';
import { computeRegister, initRelation, isRelationKind, setCharacterStats, setCharacterType, typeDefaults, typeLabel } from './relationship';
import { injectRoster, rosterNeedsUpdate, traitsWithPresets } from './roster';
import { CHARACTER_CAP } from './rules';
import { runDayTick, tickDue } from './tick';
import { snapshot } from './undo';

const ORG_TYPES: CharacterType[] = ['news', 'magazine', 'broadcaster', 'sponsor'];

/** 특징 끝에 붙여 둔 "성격 유형: … / 말투: …" 줄 떼기 */
function stripPresetLine(text: string): string {
  return text.replace(/\n?(성격 유형: [^\n]*|말투: [^\n]*)\s*$/, '').trim();
}

/** 시나리오 안에서 겹치지 않는 아이디 */
export function uniqueCharHandle(d: Scenario, base: string, selfId: ID): string {
  const taken = new Set([d.persona.handle.toLowerCase(), ...Object.values(d.characters).filter((c) => c.id !== selfId).map((c) => c.handle.toLowerCase())]);
  const b = sanitizeHandle(base) || `user_${rand(1000, 9999)}`;
  let h = b;
  for (let i = 2; taken.has(h) && i < 999; i++) h = `${b.slice(0, 15 - String(i).length - 1)}_${i}`;
  return h;
}

// ───────────────────────── 편집기 저장

export interface CharacterInput {
  name: string;
  handle: string;
  emoji: string;
  color: string;
  archetype: Archetype;
  bio: string;
  description: string;
  relations: string;
  badge: BadgeKind | null;
  followers: number;
  followsMe: boolean;
  avatar?: { photo?: string; mediaId?: string; url?: string };
  banner?: PhotoRef;
  /** (v3) 화면에서 더는 입력받지 않음 — 구버전 호환용(무시) */
  location?: string;
  // ── v3
  /** 유형(관계 또는 분류). 바꾸면 관계·말투가 즉시 다시 계산된다 */
  type?: CharacterType;
  gender?: Gender;
  ageGroup?: AgeGroup;
  personality?: string;
  speechStyle?: string;
  /** 말투 고정(null = 자동) */
  registerOverride?: SpeechRegister | null;
  /** 관계 고정 */
  relationLocked?: boolean;
  /** 이 인물이 꺼내지 않는 화제(없으면 건드리지 않음, 빈 배열 = 지우기) */
  avoid?: string[];
  /** 계급·직함·플레이어와의 사이(없으면 건드리지 않음, 빈 글자 = 지우기) */
  title?: string;
  /** 나이(없으면 건드리지 않음, 0 = 지우기) */
  age?: number;
  /** (v3.2) 호감도·설렘·정복도 직접 조절(편집기 슬라이더) */
  stats?: { affinity?: number; romance?: number; devotion?: number };
}

export function saveCharacter(input: CharacterInput, editId?: ID): ActionResult {
  const sc = getActive();
  if (!sc) return fail('none');
  if (editId && !sc.characters[editId]) return fail('none');
  if (!editId && sc.cast.length >= CHARACTER_CAP) return fail('limit');
  // 이름을 비우면: 고치는 중이면 원래 이름, 새로 만들면 로컬 이름 생성기(자리표시 이름을 쓰지 않음)
  const name =
    input.name.trim() ||
    (editId ? sc.characters[editId].name : koreanDisplayName(input.gender ?? 'f', input.ageGroup ?? 20, `${sc.id}:${Date.now()}`, { names: Object.values(sc.characters).map((x) => x.name), handles: Object.values(sc.characters).map((x) => x.handle) }).name);
  G().edit(sc.id, (d) => {
    const avatar = {
      emoji: input.emoji,
      color: input.color,
      ...(input.avatar?.photo ? { photo: input.avatar.photo } : {}),
      ...(input.avatar?.mediaId ? { mediaId: input.avatar.mediaId } : {}),
      ...(input.avatar?.url ? { url: input.avatar.url } : {}),
    };
    if (editId) {
      const c = d.characters[editId];
      if (c.followsMe !== input.followsMe) d.stats.followers = Math.max(0, d.stats.followers + (input.followsMe ? 1 : -1));
      const prevType = charType(c);
      const archetypeChanged = input.archetype !== c.archetype;
      Object.assign(c, {
        name,
        handle: uniqueCharHandle(d, input.handle || c.handle, c.id),
        avatar,
        banner: input.banner,
        archetype: input.archetype,
        bio: input.bio,
        description: input.description,
        relations: input.relations || undefined,
        badge: input.badge,
        followers: Math.max(0, Math.round(input.followers || 0)),
        followsMe: input.followsMe,
      });
      if (input.gender) c.gender = input.gender;
      if (input.ageGroup) c.ageGroup = input.ageGroup;
      if (input.avoid !== undefined) c.avoid = input.avoid.length ? input.avoid.slice(0, 12) : undefined;
      if (input.title !== undefined) c.title = cutText(input.title.trim(), 16) || undefined;
      if (input.age !== undefined) c.age = input.age >= 18 && input.age <= 99 ? Math.round(input.age) : undefined;
      if (input.personality !== undefined) c.personality = input.personality || undefined;
      if (input.speechStyle !== undefined) c.speechStyle = input.speechStyle || undefined;
      if (input.relationLocked !== undefined) c.relationLocked = input.relationLocked;
      if (input.type && input.type !== prevType) {
        // 유형 변경: 관계·분류·말투 즉시 다시 계산(하루 한 번 제한 없음)
        const def = typeDefaults(input.type);
        if (!archetypeChanged) c.archetype = def.archetype;
        if (!isRelationKind(input.type)) c.tier = c.rosterId ? 'core' : def.tier;
        c.isNews = def.isNews;
        setCharacterType(d, c.id, input.type, { lock: input.relationLocked ?? !!c.relationLocked });
        logActivity(d, '🔁', fill('{n}: 유형을 {t}(으)로 바꿨어요', { n: c.name, t: typeLabel(input.type) }));
        addMemory(d, fill('플레이어가 {n}와(과)의 관계를 {t}(으)로 정함', { n: c.name, t: typeLabel(input.type) }));
      } else if (!input.type && archetypeChanged) {
        c.isNews = input.archetype === 'news' && c.crowdRole !== 'sponsor';
      }
      // 특징 끝의 "성격 유형·말투" 줄은 지금 고른 값으로 다시 붙인다(옛 값이 남아 AI가 헷갈리지 않게)
      if (input.personality !== undefined || input.speechStyle !== undefined) {
        c.description = traitsWithPresets(stripPresetLine(input.description), c.personality, c.speechStyle);
      }
      // 말투 고정을 바꿨을 때만 말투 다시 계산(그 밖엔 관계가 바뀔 때만 — 말투가 오락가락하지 않게)
      if (input.registerOverride !== undefined && (input.registerOverride ?? null) !== (c.registerOverride ?? null)) {
        c.registerOverride = input.registerOverride ?? null;
        c.register = computeRegister(c);
      }
      if (input.stats) {
        const ch = setCharacterStats(d, c.id, input.stats);
        if (ch) noteRelationChange(d, ch);
      }
      logActivity(d, '✏️', `${c.name} 캐릭터 설정을 바꿨어요`);
      addMemory(d, `${c.name}(@${c.handle})의 설정이 바뀜: ${input.description.slice(0, 60)}`);
      return;
    }
    // 새로 만들기(편집기 "더 설정하기" 경로 — 간편 만들기는 createQuickCharacter)
    const type: CharacterType = input.type ?? (input.archetype === 'news' ? 'news' : input.archetype === 'fan' ? 'fan' : input.archetype === 'troll' ? 'antifan' : input.archetype === 'rival' ? 'rival' : input.archetype === 'mentor' ? 'mentor' : input.archetype === 'crush' ? 'spicy' : 'friend');
    const def = typeDefaults(type);
    const id = uid('ch');
    const c: Character = {
      id,
      name,
      handle: uniqueCharHandle(d, input.handle || `npc_${rand(100, 999)}`, id),
      avatar,
      banner: input.banner,
      bio: input.bio,
      description: input.description,
      relations: input.relations || undefined,
      archetype: input.archetype,
      badge: input.badge,
      isNews: def.isNews || input.archetype === 'news',
      tier: def.tier,
      followers: Math.max(0, Math.round(input.followers || 0)),
      following: rand(50, 600),
      joined: '2026년 10월',
      followsMe: input.followsMe,
      iFollow: false,
      affinity: input.followsMe ? Math.max(def.affinity, 15) : def.affinity,
      romance: def.romance,
      ...(def.relation ? { relation: def.relation } : {}),
      relationBase: def.relationBase ?? null,
      ...(def.crowdRole ? { crowdRole: def.crowdRole } : {}),
      relationLocked: !!input.relationLocked,
      registerOverride: input.registerOverride ?? null,
      ...(input.gender ? { gender: input.gender } : {}),
      ...(input.ageGroup ? { ageGroup: input.ageGroup } : {}),
      ...(input.personality ? { personality: input.personality } : {}),
      ...(input.speechStyle ? { speechStyle: input.speechStyle } : {}),
      ...(input.avoid?.length ? { avoid: input.avoid.slice(0, 12) } : {}),
      ...(input.title?.trim() ? { title: cutText(input.title.trim(), 16) } : {}),
      ...(input.age && input.age >= 18 && input.age <= 99 ? { age: Math.round(input.age) } : {}),
      custom: true,
      bioDay: d.clock.day,
    };
    initRelation(c, d.clock.day);
    d.characters[c.id] = c;
    d.cast.push(c.id);
    if (c.followsMe) d.stats.followers += 1;
    logActivity(d, '🧑‍🎨', fill('새 캐릭터 {n}을(를) 만들었어요', { n: c.name }));
  });
  return OK;
}

export function deleteCharacter(id: ID) {
  const sc = getActive();
  if (!sc?.characters[id]) return;
  snapshot(sc, '캐릭터 삭제');
  G().edit(sc.id, (d) => {
    const c = d.characters[id];
    if (c?.followsMe && !c.inactive) d.stats.followers = Math.max(0, d.stats.followers - 1);
    d.cast = d.cast.filter((x) => x !== id);
    if (c?.rosterId) {
      // 공통 캐릭터: 이 이야기에서만 빼기(목록에는 남김) — 다시 들어오지 않게 "골라 넣기"에서 제외
      const use = d.roster ?? { mode: 'off', ids: [] };
      if (use.mode === 'on') d.roster = { mode: 'select', ids: Object.values(d.characters).filter((x) => x.rosterId && x.id !== id && !x.inactive).map((x) => x.rosterId!) };
      else if (use.mode === 'select') d.roster = { mode: 'select', ids: use.ids.filter((x) => x !== c.rosterId) };
      c.inactive = true;
      logActivity(d, '🗑️', fill('{n}을(를) 이 이야기에서 뺐어요', { n: c.name }));
      return;
    }
    delete d.characters[id];
    delete d.dms[id];
    d.feed = d.feed.filter((pid) => d.posts[pid]?.authorId !== id);
    logActivity(d, '🗑️', fill('{n}을(를) 삭제했어요', { n: c?.name ?? '캐릭터' }));
  });
}

// ───────────────────────── 간편 만들기

export interface QuickCharacterInput {
  type: CharacterType;
  gender: Gender;
  ageGroup: AgeGroup;
  followers: number;
  /** 상세 특징(성격·말버릇·좋아하는 것 등) */
  traits: string;
  personality?: string;
  speechStyle?: string;
  /** 비우면 AI(또는 로컬)가 지어 준다 */
  name?: string;
  handle?: string;
  bio?: string;
  photo?: PhotoRef;
  banner?: PhotoRef;
  badge?: BadgeKind | null;
  relations?: string;
  registerOverride?: SpeechRegister | null;
  relationLocked?: boolean;
  /** 계급·직함·플레이어와의 사이 */
  title?: string;
  age?: number;
  /** 이 인물이 꺼내지 않는 화제 */
  avoid?: string[];
}

/** AI가 지은 이름·아이디·소개·첫 글(실패하면 null — 대신 지어낸 문장을 쓰지 않는다) */
function draftFor(sid: ID | null, args: CharacterDraftArgs): Promise<CharacterDraft | null> {
  return engine().draftCharacter(sid ? ctxOf(sid) : null, args);
}

/** 새 캐릭터 만들기(진행 중 busy['character:new']). 만든 캐릭터 ID(실패하면 null) */
export async function createQuickCharacter(input: QuickCharacterInput): Promise<ID | null> {
  const sc = getActive();
  if (!sc) return null;
  if (sc.cast.length >= CHARACTER_CAP) {
    G().showToast(`캐릭터는 ${CHARACTER_CAP}명까지 만들 수 있어요`, 'error');
    return null;
  }
  const sid = sc.id;
  const key = 'character:new';
  if (G().busy[key]) return null;
  G().setBusy(key, true);
  try {
    const type = input.type;
    const def = typeDefaults(type);
    const traits = cutText((input.traits ?? '').trim(), 600);
    const ageGroup = input.ageGroup ?? 20;
    const needDraft = !input.name?.trim() || !input.handle?.trim() || !input.bio?.trim();
    const draft = needDraft
      ? await draftFor(sid, { type, gender: input.gender, ageGroup, followers: input.followers, traits, personality: input.personality, speechStyle: input.speechStyle, name: input.name?.trim() || undefined, handle: input.handle?.trim() || undefined })
      : null;
    if (!G().scenarios[sid]) return null;
    const id = uid('ch');
    const cur = G().scenarios[sid]!;
    const local =
      orgDisplayName(type, cur.world.name, id) ??
      koreanDisplayName(input.gender, ageGroup, id, { names: [cur.persona.name, ...Object.values(cur.characters).map((x) => x.name)], handles: [cur.persona.handle, ...Object.values(cur.characters).map((x) => x.handle)] });
    // AI가 지은 이름이 이미 있는 인물과 같으면(헷갈림) 로컬 이름으로
    const norm = (x: string) => x.replace(/\s/g, '').toLowerCase();
    const existing = new Set([cur.persona.name, ...Object.values(cur.characters).map((x) => x.name)].map(norm));
    const aiName = draft?.name?.trim() && !existing.has(norm(draft.name)) ? draft.name.trim() : '';
    const name = cutText(input.name?.trim() || aiName || local.name, 50);
    let made = false;
    G().edit(sid, (d) => {
      if (d.cast.length >= CHARACTER_CAP) return;
      const org = ORG_TYPES.includes(type);
      const used = usedFaceKeys(Object.values(d.characters));
      const face = input.photo || org ? undefined : pickFace(input.gender, used, id, themeOfWorld(d.world.templateId));
      const avatar: Character['avatar'] = {
        emoji: draft?.emoji?.trim() || (org ? '📰' : pick(AVATAR_EMOJIS)),
        color: pick(AVATAR_COLORS),
        ...(input.photo ?? (face ? { photo: face } : {})),
      };
      const c: Character = {
        id,
        name,
        handle: uniqueCharHandle(d, input.handle?.trim() || draft?.handle || local.handle, id),
        avatar,
        ...(input.banner ? { banner: input.banner } : {}),
        bio: cutText(input.bio?.trim() || draft?.bio?.trim() || localBio(type, ageGroup, traits), 160),
        description: traitsWithPresets(traits, input.personality, input.speechStyle),
        ...(input.relations?.trim() ? { relations: input.relations.trim() } : {}),
        ...(input.avoid?.length ? { avoid: input.avoid.slice(0, 12) } : {}),
        ...(input.title?.trim() ? { title: cutText(input.title.trim(), 16) } : {}),
        ...(input.age && input.age >= 18 && input.age <= 99 ? { age: Math.round(input.age) } : {}),
        archetype: def.archetype,
        badge: input.badge !== undefined ? input.badge : def.badge,
        isNews: def.isNews,
        tier: def.tier,
        followers: Math.max(0, Math.round(input.followers || 0)),
        following: rand(50, 600),
        joined: '2026년 10월',
        followsMe: def.followsMe,
        iFollow: def.tier === 'core' && def.affinity >= 35,
        affinity: def.affinity,
        romance: def.romance,
        ...(def.relation ? { relation: def.relation } : {}),
        relationBase: def.relationBase ?? null,
        ...(def.crowdRole ? { crowdRole: def.crowdRole } : {}),
        relationLocked: !!input.relationLocked,
        registerOverride: input.registerOverride ?? null,
        gender: input.gender,
        ageGroup,
        ...(input.personality ? { personality: input.personality } : {}),
        ...(input.speechStyle ? { speechStyle: input.speechStyle } : {}),
        custom: true,
        bioDay: d.clock.day,
      };
      // 특징에 "동기·동갑"처럼 또래 관계가 적혀 있으면 처음부터 반말(명시한 말투·고정 말투가 우선)
      if (def.tier === 'core' && !def.isNews && !c.registerOverride) {
        const hint = peerRegisterHint(c.description);
        if (hint) c.register = hint;
      }
      initRelation(c, d.clock.day);
      d.characters[id] = c;
      d.cast.push(id);
      if (c.followsMe) {
        d.stats.followers += 1;
        pushNoti(d, { type: 'follow', actorId: id, text: '님이 나를 팔로우했습니다' });
      }
      // 첫 글: AI가 이 인물 말투로 쓴 것만(없으면 글 없이 시작 — 하루 정산·새로고침 때 자연스럽게 올라온다)
      const intro = draft?.post?.trim();
      if (intro) {
        const e = npcEngagement(c.followers);
        addPost(d, { authorId: id, text: cutText(intro, 280), kind: c.isNews ? 'news' : 'post', likes: e.likes, reposts: e.reposts, views: e.views }, true);
      }
      logActivity(d, '🧑‍🎨', fill('새 캐릭터 {n}을(를) 만들었어요', { n: c.name }));
      addMemory(d, `새 인물 등장: ${c.name}(@${c.handle}) — ${typeLabel(type)}${traits ? `, ${traits.slice(0, 60)}` : ''}`);
      made = true;
    });
    return made ? id : null;
  } finally {
    G().setBusy(key, false);
  }
}

/** 자기소개만 AI로 다시 쓰기(진행 중 busy['bio:<id>']). 새 소개(실패하면 null) */
export async function regenerateBioIn(sid: ID, characterId: ID): Promise<string | null> {
  const sc = G().scenarios[sid];
  const c = sc?.characters[characterId];
  if (!sc || !c) return null;
  const key = `bio:${characterId}`;
  if (G().busy[key]) return null;
  G().setBusy(key, true);
  try {
    const draft = await draftFor(sid, {
      type: charType(c),
      gender: c.gender ?? 'f',
      ageGroup: c.ageGroup ?? 20,
      followers: c.followers,
      traits: c.description || c.bio,
      personality: c.personality,
      speechStyle: c.speechStyle,
      name: c.name,
      handle: c.handle,
      currentBio: c.bio,
    });
    const bio = draft?.bio?.trim() ? cutText(draft.bio.trim(), 160) : undefined;
    if (!bio) return null;
    let ok = false;
    G().edit(sid, (d) => {
      const ch = d.characters[characterId];
      if (!ch) return;
      ch.bio = bio;
      ch.bioDay = d.clock.day;
      ok = true;
    });
    return ok ? bio : null;
  } finally {
    G().setBusy(key, false);
  }
}

/** 자기소개 다시 만들기(AI) — 새 소개(실패하면 null) */
export async function regenerateBio(characterId: ID): Promise<string | null> {
  const sc = getActive();
  return sc ? regenerateBioIn(sc.id, characterId) : null;
}

/**
 * 새 이야기를 만든 직후 한 번 호출(FirstFollowerScreen: putScenario → setActive → onScenarioCreated(sc.id)). 전부 뒤에서(기다리지 않음)
 * - 첫 팔로워의 첫 쪽지: AI가 그 인물 말투·관계로(입력 중… → 한 줄씩). 실패하면 쪽지 없이 시작
 * - 직접 추가한 첫 팔로워: 자기소개를 AI가 다듬음(짧은 호출 1회)
 * - 직접 만든 세계관: 첫 하루 정산(AI 1회: 오늘 글·뉴스·트렌드·이벤트·미션)
 * - 공통 캐릭터가 아직 안 들어갔으면 넣는다
 */
export function onScenarioCreated(sid: ID): void {
  const sc = G().scenarios[sid];
  if (!sc) return;
  if (sc.roster && sc.roster.mode !== 'off' && rosterNeedsUpdate(sc)) G().edit(sid, (d) => void injectRoster(d));
  const first = sc.firstFollowerId ? sc.characters[sc.firstFollowerId] : undefined;
  // 첫 쪽지는 AI 조절(새 이야기의 첫 쪽지)을 켰을 때만
  if (tune().firstDM && first && !first.inactive && !sc.dms[first.id]?.messages.length) void firstFollowerDM(sid, first.id);
  if (first?.id.startsWith('cf_')) void regenerateBioIn(sid, first.id);
  // 직접 만든 세계관의 첫 하루 정산은 타임라인을 채우는 일이라 설정과 상관없이 한다
  if (tickDue(sc)) void runDayTick(sid, { force: true });
}

/** 첫 팔로워의 첫 쪽지(AI 1회) — 입력 중… 표시 뒤 한 줄씩 */
async function firstFollowerDM(sid: ID, characterId: ID): Promise<void> {
  const flow = beginFlow(sid);
  const key = `dm:${characterId}`;
  if (G().busy[key]) return;
  G().setBusy(key, true);
  try {
    await new Promise((r) => setTimeout(r, rand(1200, 2400)));
    const ctx0 = ctxOf(sid);
    if (!ctx0 || !alive(flow)) return;
    const ctx = withCharAvoid(ctx0, characterId);
    editIf(flow, (d) => {
      const cv = ensureConversation(d, characterId);
      cv.typing = true;
    });
    const lines = await engine().firstDM(ctx, { characterId });
    for (const text of lines ?? []) {
      await new Promise((r) => setTimeout(r, Math.min(2200, 500 + text.length * 35)));
      const ok = editIf(flow, (d) => {
        const cv = ensureConversation(d, characterId);
        const firstMsg = !cv.messages.some((m) => m.from === 'them');
        cv.messages.push({ id: uid('m'), from: 'them', text, ts: Date.now(), at: { ...d.clock } });
        trimMessages(cv);
        cv.unread += 1;
        cv.updatedTs = Date.now();
        if (firstMsg) pushNoti(d, { type: 'dm', actorId: characterId, text: '님이 쪽지를 보냈습니다' });
      });
      if (!ok) return;
    }
  } finally {
    G().setBusy(key, false);
    if (G().scenarios[sid]?.dms[characterId]) {
      G().edit(sid, (d) => {
        const cv = d.dms[characterId];
        if (!cv) return;
        cv.typing = false;
        // AI가 답하지 못해 빈 대화방만 남았으면 지운다(빈 방이 목록에 뜨지 않게)
        if (!cv.messages.length) delete d.dms[characterId];
      });
    }
  }
}
