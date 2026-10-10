/**
 * 새 시나리오(세이브 슬롯) 만들기 — 온보딩에서 고른 세계관·페르소나·첫 팔로워로 초기 상태 구성
 * (v3.1) 미리 써 둔 틀 문장(첫 쪽지·신규 유저 뉴스·직접 만든 세계관의 첫 글)은 없앴다.
 *        첫 팔로워의 첫 쪽지와 직접 만든 세계관의 첫 타임라인은 시작 직후 AI가 쓴다(characters.ts onScenarioCreated).
 *        기본 세계관의 지난 글·첫 이벤트는 세계관 파일에 인물별로 직접 쓴 설정 그대로(맥락이 정해져 있음).
 */
import { peerRegisterHint } from '../ai/local/register';
import type { CastDraft } from '../ai/types';
import { ARCHETYPE_DEFAULTS, AVATAR_COLORS, AVATAR_EMOJIS } from '../data/avatars';
import { pickFace, usedFaceKeys } from '../data/facePool';
import { getWorldTemplate, sceneKey, WORLDS, type CharacterSeed, type WorldTemplate } from '../data/worlds';
import type { CustomWorldInput } from '../store/draft';
import { useRoster } from '../store/roster';
import { SYSTEM, type AgeGroup, type BadgeKind, type Character, type CharacterType, type Difficulty, type GameTime, type Gender, type Persona, type Quest, type Scenario, type World } from '../types';
import { cutText, fill, hashStr, pick, rand, sanitizeHandle, uid } from '../utils';
import { minutesBetween } from './clock';
import { localVariant } from './localEvents';
import { koreanDisplayName, localBio, orgDisplayName, romanizeName } from './names';
import { addPost, logActivity, pushNoti } from './progress';
import { initRelation, typeDefaults } from './relationship';
import { injectRoster, traitsWithPresets } from './roster';
import { START_FOLLOWERS, START_TIME } from './rules';

/** 첫 팔로워를 직접 추가할 때(온보딩) — 나중에 캐릭터 설정에서 고칠 수 있다 */
export interface CustomFirstFollower {
  /** 비우면 자동으로 지어 준다 */
  name?: string;
  gender: Gender;
  /** 기본 20대 */
  ageGroup: AgeGroup;
  followers: number;
  /** 기본 'friend' */
  type?: CharacterType;
  traits?: string;
  /** (선택) 성격 유형·말투 프리셋 id */
  personality?: string;
  speechStyle?: string;
}

export interface NewScenarioInput {
  templateId: string | null;
  custom: CustomWorldInput | null;
  customCast: CastDraft[] | null;
  persona: Persona;
  firstFollowerKey: string;
  /** (v3) 있으면 firstFollowerKey 대신 이 사람을 새로 만들어 첫 팔로워로 */
  customFirst?: CustomFirstFollower | null;
  /** (v3) 난이도(기본 normal) */
  difficulty?: Difficulty;
}

export interface CastPreview {
  key: string;
  name: string;
  handle: string;
  emoji: string;
  color: string;
  archetype: CharacterSeed['archetype'];
  bio: string;
  isNews: boolean;
  badge: BadgeKind | null;
  photo?: string;
  tier: 'core' | 'crowd';
  followers: number;
}

const badgeOf = (s: { org?: boolean; verified?: boolean; isNews?: boolean }): BadgeKind | null => (s.org ? 'gold' : s.verified ? 'blue' : null);

/** 온보딩 화면에서 보여줄 등장인물 미리보기(키 포함) */
export function castPreview(templateId: string | null, customCast: CastDraft[] | null): CastPreview[] {
  const t = getWorldTemplate(templateId);
  if (t) {
    return t.cast.map((c) => ({
      key: c.key, name: c.name, handle: c.handle, emoji: c.emoji, color: c.color, archetype: c.archetype, bio: c.bio,
      isNews: !!c.isNews, badge: badgeOf(c), photo: `${t.id}__${c.key}`, tier: c.tier, followers: c.followers,
    }));
  }
  const faces = customFaces(customCast ?? []);
  return (customCast ?? []).map((c, i) => ({
    key: `custom${i}`, name: c.name, handle: c.handle, emoji: c.emoji, color: AVATAR_COLORS[i % AVATAR_COLORS.length], archetype: c.archetype, bio: c.bio,
    isNews: !!c.isNews, badge: c.isNews ? 'gold' : c.verified ? 'blue' : null, ...(faces[i] ? { photo: faces[i] } : {}), tier: 'core', followers: c.followers,
  }));
}

/** 직접 만든 세계관 인물의 기본 사진: 성별·나이대에 맞게, 서로 겹치지 않게(같은 인물 목록이면 늘 같은 결과). 뉴스 계정만 사진 없이 이모지 — 사람은 반드시 얼굴 사진 */
function customFaces(cast: CastDraft[]): (string | undefined)[] {
  const used = new Set<string>();
  return cast.map((c) => {
    if (c.isNews) return undefined;
    const ageGroup = (Math.min(60, Math.max(20, Math.floor((c.age ?? 25) / 10) * 10)) as AgeGroup);
    // AI가 성별을 빠뜨렸으면 아이디로 정한다(같은 인물이면 늘 같은 쪽)
    const gender: Gender = c.gender ?? (hashStr(c.handle) % 2 ? 'm' : 'f');
    const key = pickFace(gender, ageGroup, used, `${c.handle}:${c.name}`);
    if (key) used.add(key);
    return key;
  });
}

function buildWorld(input: NewScenarioInput): World {
  const t = getWorldTemplate(input.templateId);
  if (t) {
    return { templateId: t.id, name: t.name, emoji: t.emoji, color: t.color, tagline: t.tagline, setting: t.setting, tone: t.tone, vocab: t.vocab, roles: t.roles, tag: t.tag };
  }
  const c = input.custom!;
  const vocab = c.setting
    .split(/[\s,.!?·]+/)
    .map((w) => w.replace(/(에서|으로|[을를이가은는에의도로와과들])$/, ''))
    .filter((w) => w.length >= 2 && w.length <= 6 && !/[다요고며서죠네]$/.test(w))
    .slice(0, 10);
  return {
    templateId: null,
    name: c.name,
    emoji: c.emoji || '🌍',
    color: pick(AVATAR_COLORS),
    tagline: c.tone,
    setting: c.setting,
    tone: c.tone,
    vocab: vocab.length ? vocab : ['오늘', '사건', '소문'],
    roles: ['주인공'],
    tag: `#${c.name.replace(/\s/g, '')}`,
  };
}

/** 세계관 원본 → 시나리오 안의 캐릭터 */
export function characterFromSeed(t: WorldTemplate, s: CharacterSeed): Character {
  const banner = s.tier === 'core' && t.banners.length ? { photo: sceneKey(t.id, t.banners[hashStr(s.key) % t.banners.length].key) } : undefined;
  return {
    id: `ch_${s.key}`,
    name: s.name,
    handle: s.handle,
    avatar: { emoji: s.emoji, color: s.color, photo: `${t.id}__${s.key}` },
    banner,
    bio: s.bio,
    description: s.description,
    ...(s.register && s.tier === 'core' && !s.isNews ? { register: s.register } : {}),
    relations: s.relations,
    archetype: s.archetype,
    badge: badgeOf(s),
    isNews: !!s.isNews,
    tier: s.tier,
    followers: s.followers,
    following: s.following,
    location: s.location,
    joined: s.joined,
    followsMe: s.archetype === 'fan' && s.tier === 'core',
    iFollow: false,
    affinity: ARCHETYPE_DEFAULTS[s.archetype].affinity + (s.tier === 'crowd' ? -5 : 0),
  };
}

function buildCharacters(input: NewScenarioInput): Character[] {
  const t = getWorldTemplate(input.templateId);
  if (t) return t.cast.map((s) => characterFromSeed(t, s));
  const faces = customFaces(input.customCast ?? []);
  return (input.customCast ?? []).map((c, i) => ({
    id: `ch_custom${i}`,
    name: c.name,
    handle: c.handle,
    avatar: { emoji: c.emoji, color: AVATAR_COLORS[i % AVATAR_COLORS.length], ...(faces[i] ? { photo: faces[i] } : {}) },
    ...(c.gender ? { gender: c.gender } : {}),
    ...(c.age ? { ageGroup: (Math.min(60, Math.max(20, Math.floor(c.age / 10) * 10)) as AgeGroup) } : {}),
    bio: c.bio,
    description: c.description,
    archetype: c.archetype,
    badge: c.isNews ? 'gold' : c.verified ? 'blue' : null,
    isNews: c.isNews,
    tier: 'core',
    followers: c.followers,
    following: rand(80, 900),
    joined: `20${rand(18, 25)}년 ${rand(1, 12)}월`,
    followsMe: c.archetype === 'fan',
    iFollow: false,
    affinity: ARCHETYPE_DEFAULTS[c.archetype].affinity,
  }));
}

const ORG_TYPES: CharacterType[] = ['news', 'magazine', 'broadcaster', 'sponsor'];
const FRIENDLY: CharacterType[] = ['friend', 'bestie', 'spicy', 'lover', 'mentor', 'family'];

/**
 * 직접 추가한 첫 팔로워(온보딩) — 성별·나이대·팔로워·유형(기본 친구)·이름(비우면 자동)·특징
 * 이름이 비면 실제 X 계정 같은 한국어 표시 이름을 로컬로 짓는다. 자기소개는 로컬 임시값 → 시작 뒤 AI가 다듬음(onScenarioCreated).
 */
export function buildCustomFirst(cf: CustomFirstFollower, ctx: { templateId: string | null; worldName: string; taken: Set<string>; takenNames?: string[]; usedFaces: Set<string>; seed: string }): Character {
  const type: CharacterType = cf.type ?? 'friend';
  const def = typeDefaults(type);
  const ageGroup: AgeGroup = cf.ageGroup ?? 20;
  const local = orgDisplayName(type, ctx.worldName, ctx.seed) ?? koreanDisplayName(cf.gender, ageGroup, ctx.seed, { names: ctx.takenNames ?? [], handles: ctx.taken });
  const name = (cf.name?.trim() ? cutText(cf.name.trim(), 50) : '') || local.name;
  let handle = cf.name?.trim() ? sanitizeHandle(romanizeName(name)) : local.handle;
  if (handle.length < 4) handle = `${handle || 'user'}_${hashStr(ctx.seed) % 1000}`.slice(0, 15);
  for (let i = 2; ctx.taken.has(handle.toLowerCase()) && i < 999; i++) handle = `${handle.slice(0, 15 - String(i).length - 1)}_${i}`;
  const org = ORG_TYPES.includes(type);
  const face = org ? undefined : pickFace(cf.gender, ageGroup, ctx.usedFaces, ctx.seed);
  const t = getWorldTemplate(ctx.templateId);
  const banner = !org && t?.banners.length ? { photo: sceneKey(t.id, t.banners[hashStr(ctx.seed) % t.banners.length].key) } : undefined;
  const traits = cutText((cf.traits ?? '').trim(), 600);
  const affinity = FRIENDLY.includes(type) ? Math.max(def.affinity, 35) : type === 'acquaintance' ? Math.max(def.affinity, 20) : def.affinity;
  const c: Character = {
    id: uid('cf'),
    name,
    handle,
    avatar: { emoji: org ? '📰' : AVATAR_EMOJIS[hashStr(ctx.seed) % AVATAR_EMOJIS.length], color: AVATAR_COLORS[hashStr(`${ctx.seed}:c`) % AVATAR_COLORS.length], ...(face ? { photo: face } : {}) },
    ...(banner ? { banner } : {}),
    bio: localBio(type, ageGroup, traits),
    description: traitsWithPresets(traits, cf.personality, cf.speechStyle) || ARCHETYPE_DEFAULTS[def.archetype].description,
    archetype: def.archetype,
    badge: def.badge,
    isNews: def.isNews,
    tier: def.tier,
    followers: Math.max(0, Math.round(cf.followers || 0)),
    following: 80 + (hashStr(ctx.seed) % 800),
    joined: `20${18 + (hashStr(ctx.seed) % 8)}년 ${1 + (hashStr(`${ctx.seed}:m`) % 12)}월`,
    followsMe: true,
    iFollow: true,
    affinity,
    romance: def.romance,
    ...(def.relation ? { relation: def.relation } : {}),
    relationBase: def.relationBase ?? null,
    ...(def.crowdRole ? { crowdRole: def.crowdRole } : {}),
    gender: cf.gender,
    ageGroup,
    ...(cf.personality ? { personality: cf.personality } : {}),
    ...(cf.speechStyle ? { speechStyle: cf.speechStyle } : {}),
    custom: true,
    bioDay: START_TIME.day,
  };
  // 특징에 "동기·동갑"처럼 또래 관계가 적혀 있으면 처음부터 반말(명시한 말투가 있으면 그게 우선)
  if (def.tier === 'core' && !def.isNews) {
    const hint = peerRegisterHint(c.description);
    if (hint) c.register = hint;
  }
  initRelation(c, START_TIME.day);
  return c;
}

function starterQuests(input: NewScenarioInput, firstFollowerName: string): Quest[] {
  const t = getWorldTemplate(input.templateId);
  const mission = t?.missions[0];
  const q = (title: string, desc: string, goal: Quest['goal'], target: number, reward: Quest['reward'], extra: Partial<Quest> = {}): Quest => ({
    id: uid('q'), title, desc, goal, target, progress: 0, reward, done: false, claimed: false, ...extra,
  });
  return [
    mission
      ? q(`오늘의 미션: ${mission.title}`, mission.desc, 'keyword', 1, { xp: 30 }, { keyword: mission.keyword, day: 1 })
      : q('오늘의 미션: 첫인사', `"안녕"이 들어간 첫 글을 올리세요.`, 'keyword', 1, { xp: 30 }, { keyword: ['안녕'], day: 1 }),
    q('첫 게시물 올리기', '타임라인에 첫 글을 올려보세요.', 'post', 1, { xp: 15 }),
    q(`${firstFollowerName}에게 쪽지 보내기`, '첫 팔로워에게 쪽지를 보내보세요.', 'dm', 1, { xp: 20 }),
    q('답글 3개 달기', '다른 사람 글에 답글을 달아보세요.', 'reply', 3, { xp: 20 }),
    q('이벤트 해결하기', '타임라인에 뜬 이벤트에 내 말로 답해 보세요.', 'event', 1, { xp: 25 }),
    q('팔로워 100명 달성', '화제가 될 글을 올려 팔로워를 모으세요.', 'followers', 100, { xp: 40 }),
    q('레벨 3 달성', '활동해서 경험치를 쌓으세요.', 'level', 3, { xp: 40, followers: 30 }),
  ];
}

/** 시작 전 몇 시간 동안 올라온 것처럼 보이게: 1일차 새벽~오전 9시 사이 시각 */
function earlierToday(minutesAgo: number): GameTime {
  const total = Math.max(0, START_TIME.hour * 60 + START_TIME.minute - minutesAgo);
  return { day: START_TIME.day, hour: Math.floor(total / 60), minute: total % 60 };
}

export function createScenario(input: NewScenarioInput): Scenario {
  const now = Date.now();
  const world = buildWorld(input);
  const chars = buildCharacters(input);
  const t = getWorldTemplate(input.templateId);
  // 핵심 인물은 몇 명 미리 팔로우해 둔다(팔로잉 탭이 비지 않게)
  for (const c of chars) {
    if (c.tier !== 'crowd' && (c.archetype === 'bestie' || c.archetype === 'celeb' || c.isNews)) c.iFollow = true;
  }
  let first: Character | undefined;
  if (input.customFirst) {
    // (v3) 첫 팔로워를 직접 추가: 새 인물을 만들어 맨 앞에
    first = buildCustomFirst(input.customFirst, {
      templateId: input.templateId,
      worldName: world.name,
      taken: new Set([input.persona.handle.toLowerCase(), ...chars.map((c) => c.handle.toLowerCase())]),
      takenNames: [input.persona.name, ...chars.map((c) => c.name)],
      usedFaces: usedFaceKeys(chars),
      seed: `${now}:${input.persona.handle}`,
    });
    chars.unshift(first);
  } else {
    // 기본 세계관 캐릭터 ID = 'ch_키', 직접 만든 세계관 = 'ch_custom번호'
    const firstId = `ch_${input.firstFollowerKey}`;
    first = chars.find((c) => c.id === firstId) ?? chars.find((c) => !c.isNews && c.tier !== 'crowd') ?? chars[0];
    if (first) {
      first.followsMe = true;
      first.iFollow = true;
      first.affinity = Math.max(first.affinity, 35);
    }
  }
  // 관계·말투 초기값(호감도 → 친구·라이벌… / 반말·해요체·격식)
  for (const c of chars) initRelation(c, START_TIME.day);
  const persona: Persona = {
    ...input.persona,
    banner: input.persona.banner ?? (t?.banners[0] ? { photo: sceneKey(t.id, t.banners[0].key) } : undefined),
  };

  const sc: Scenario = {
    id: uid('sc'),
    title: `${world.name} · ${persona.name}`,
    createdTs: now,
    updatedTs: now,
    world,
    persona,
    characters: Object.fromEntries(chars.map((c) => [c.id, c])),
    cast: chars.map((c) => c.id),
    posts: {},
    feed: [],
    dms: {},
    notis: [],
    stats: { followers: START_FOLLOWERS + chars.filter((c) => c.followsMe).length, aura: 10, humor: 10, xp: 0, level: 1, reputation: 0, status: 'normal', posts: 0 },
    clock: { ...START_TIME },
    events: [],
    quests: starterQuests(input, first?.name ?? '첫 팔로워'),
    activity: [],
    trends: (t?.trends ?? [world.tag]).slice(0, 6).map((tag, i) => ({ tag, count: rand(2000, 60000) * (i === 0 ? 2 : 1), hot: i === 0 })),
    memory: [`${persona.name}(${persona.role})이(가) ${world.name}에 처음 등장했다.`],
    lastTickDay: 1,
    // 직접 만든 세계관은 미리 쓴 글이 없으니 시작하자마자 하루 정산 AI(오늘 글·뉴스·트렌드·이벤트·미션)를 한 번 돌린다
    ...(t ? {} : { tickAIDay: 0 }),
    ...(first ? { firstFollowerId: first.id } : {}),
    difficulty: input.difficulty ?? 'normal',
    romanceLevel: 'racy',
    boost: null,
    itemLog: [],
    roster: { mode: useRoster.getState().defaultMode, ids: [] },
  };
  // 공통 캐릭터(사용자가 직접 추가해 둔 계정 목록) — 기본값이 켜기면 넣는다
  injectRoster(sc);

  // 초기 타임라인: 지난 밤~아침에 올라온 글들(오래된 것부터 넣으면 최신이 위로 쌓인다)
  const d = sc;
  if (t) {
    // 1) 시작 전 며칠 동안의 글 — 프로필을 열었을 때 비어 보이지 않게(핵심 인물 2개, 일반 유저 1개)
    const textOf = (raw: CharacterSeed['posts'][number]) => (typeof raw === 'string' ? raw : raw.text);
    const history: { s: CharacterSeed; raw: CharacterSeed['posts'][number]; at: GameTime }[] = [];
    for (const s of t.cast) {
      if (!s.posts.length) continue;
      const used = hashStr(s.key) % s.posts.length; // 아침 타임라인 글과 겹치지 않게
      const cands = s.posts.map((_, i) => i).filter((i) => i !== used && !textOf(s.posts[i]).includes('{me}'));
      cands.slice(0, s.tier === 'core' ? 2 : 1).forEach((i, k) => {
        const h = hashStr(`${s.key}:${k}`);
        history.push({ s, raw: s.posts[i], at: { day: START_TIME.day - 1 - (h % 5), hour: 8 + (h % 15), minute: h % 60 } });
      });
    }
    history.sort((a, b) => minutesBetween(b.at, a.at));
    for (const { s, raw, at } of history) {
      const media = typeof raw === 'string' ? undefined : { photo: sceneKey(t.id, raw.media) };
      const big = s.tier === 'core' ? s.followers : s.followers * 3;
      const likes = Math.max(1, Math.round(Math.sqrt(big) * (2 + Math.random() * 7)));
      addPost(d, { authorId: `ch_${s.key}`, text: fill(textOf(raw), { me: persona.name, kw: world.tag }), kind: 'post', likes, reposts: Math.round(likes * rand(3, 14) / 100), media, at }, true);
    }
    // 2) 오늘 새벽~아침 글
    const pool = t.cast.filter((s) => !s.isNews && s.posts.length);
    const picks = [...pool].sort((a, b) => hashStr(a.key + now) - hashStr(b.key + now)).slice(0, 12);
    picks.forEach((s, i) => {
      const raw = s.posts[hashStr(s.key) % s.posts.length];
      const text = typeof raw === 'string' ? raw : raw.text;
      const media = typeof raw === 'string' ? undefined : { photo: sceneKey(t.id, raw.media) };
      const big = s.tier === 'core' ? s.followers : s.followers * 3;
      const likes = Math.max(2, Math.round(Math.sqrt(big) * (2 + Math.random() * 7)));
      addPost(d, { authorId: `ch_${s.key}`, text: fill(text, { me: persona.name, kw: world.tag }), kind: 'post', likes, reposts: Math.round(likes * rand(3, 14) / 100), media, at: earlierToday(470 - i * 36) }, true);
    });
  }
  if (first) pushNoti(d, { type: 'follow', actorId: first.id, text: '님이 나를 팔로우했습니다' });
  addPost(d, { authorId: SYSTEM, text: t?.welcome ?? `${world.emoji} ${world.name}에 오신 걸 환영해요!`, kind: 'system' }, true);

  // 첫 이벤트(게임 메커닉을 바로 보여주기 위해): 기본 세계관은 그 세계 첫 이벤트, 직접 만든 세계관은 시작 직후 AI가
  const firstEvent = t?.events[0] ? localVariant(sc, t.events[0]) : null;
  if (firstEvent) {
    const { emoji, title, body, choices, involved, templateKey } = firstEvent;
    d.events.push({ id: uid('ev'), emoji, title, body, choices, involved, ...(templateKey ? { templateKey } : {}), at: { ...d.clock }, status: 'pending' });
    pushNoti(d, { type: 'event', eventId: d.events[0].id, text: `새 이벤트: ${title}` });
  }
  logActivity(d, '🎬', `${world.name}에서 새 이야기를 시작했어요`);
  return sc;
}

export { WORLDS };
