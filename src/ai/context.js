"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerText = exports.DIFFICULTY_LABEL = void 0;
exports.buildContext = buildContext;
exports.clip = clip;
exports.alignRegister = alignRegister;
exports.digest = digest;
exports.kindLabel = kindLabel;
exports.fullEntry = fullEntry;
exports.briefEntry = briefEntry;
exports.mentionedIds = mentionedIds;
exports.pickCast = pickCast;
exports.castBlock = castBlock;
exports.registerMap = registerMap;
exports.recentBlock = recentBlock;
exports.memoryBlock = memoryBlock;
exports.nowLine = nowLine;
exports.hooksBlock = hooksBlock;
/**
 * 시나리오(세이브 데이터) → AI에게 넘길 요약본(AIContext) + 프롬프트 조각
 *
 * 토큰 절약 구조(제미나이·클로드 공용):
 *  ① 시스템 지시(prompts.ts systemFor) = 규칙 + 세계관 + 플레이어 설정. 한 시나리오 안에서 글자 하나 안 바뀐다
 *     → 제미나이 자동 캐시(같은 앞부분은 싸게 계산)가 걸린다. 시각·수치처럼 자주 바뀌는 건 넣지 않는다.
 *  ② 사용자 프롬프트(매번) = 이번 일에 필요한 인물만 자세히(≤6) + 나머지 한 줄 + 일반 유저(≤6) + 타임라인(≤6) + 기억(≤8) + 할 일
 * 캐릭터 설정·쪽지·관계를 같이 넘겨서 타임라인 답글과 쪽지 말투가 서로 이어지게 한다.
 */
const worlds_1 = require("../data/worlds");
const relationship_1 = require("../game/relationship");
const types_1 = require("../types");
const utils_1 = require("../utils");
// ───────────────────────── 시나리오 → AIContext
function buildContext(sc) {
    // 공통 캐릭터를 끈 경우 등: inactive 이거나 cast 에 없는 인물은 AI에게 보이지 않는다
    const chars = sc.cast.map((id) => sc.characters[id]).filter((c) => !!c && !c.inactive);
    const authorName = (p) => {
        if (p.authorId === types_1.ME)
            return `${sc.persona.name}(플레이어)`;
        if (p.authorId === types_1.SYSTEM)
            return '시스템';
        if (p.authorId === types_1.GHOST)
            return p.ghost?.name ?? '일반인';
        return sc.characters[p.authorId]?.name ?? '알 수 없음';
    };
    const feedPosts = sc.feed.map((id) => sc.posts[id]).filter((p) => !!p);
    const recent = feedPosts
        .slice(0, 10)
        .reverse()
        .map((p) => ({ author: authorName(p), text: p.text, authorId: p.authorId }));
    const t = (0, worlds_1.getWorldTemplate)(sc.world.templateId);
    // 인물별 최근 공개 발언(글·답글) 최신 3개 — 한 번 훑어서 모은다
    const castIds = new Set(chars.map((c) => c.id));
    const saidBy = new Map();
    for (const p of Object.values(sc.posts)) {
        if (!castIds.has(p.authorId) || !p.text)
            continue;
        const k = p.at.day * 1440 + p.at.hour * 60 + p.at.minute;
        const parent = p.parentId ? sc.posts[p.parentId] : undefined;
        const where = parent ? (parent.authorId === types_1.ME ? '플레이어 글에 답글' : '답글') : '글';
        const arr = saidBy.get(p.authorId) ?? [];
        arr.push({ k, line: `(${where}) ${p.text.replace(/\s+/g, ' ').slice(0, 70)}` });
        saidBy.set(p.authorId, arr);
    }
    const recentSaidOf = (id) => (saidBy.get(id) ?? [])
        .sort((a, b) => b.k - a.k)
        .slice(0, 3)
        .reverse()
        .map((x) => x.line);
    return {
        world: {
            templateId: sc.world.templateId,
            name: sc.world.name,
            setting: sc.world.setting,
            tone: sc.world.tone,
            vocab: sc.world.vocab,
            tag: sc.world.tag,
        },
        persona: {
            name: sc.persona.name,
            handle: sc.persona.handle,
            role: sc.persona.role,
            bio: sc.persona.bio,
            description: sc.persona.description,
        },
        stats: {
            followers: sc.stats.followers,
            level: sc.stats.level,
            aura: sc.stats.aura,
            humor: sc.stats.humor,
            reputation: sc.stats.reputation,
            status: sc.stats.status,
        },
        clock: sc.clock,
        cast: chars.map((c) => {
            const msgs = (sc.dms[c.id]?.messages ?? []).filter((m) => m.from !== 'system');
            return {
                id: c.id,
                name: c.name,
                handle: c.handle,
                archetype: c.archetype,
                bio: c.bio,
                description: c.description,
                relations: c.relations,
                affinity: c.affinity,
                followsMe: c.followsMe,
                iFollow: c.iFollow,
                isNews: !!c.isNews,
                tier: c.tier ?? 'core',
                badge: c.badge ?? null,
                followers: c.followers,
                recentDM: msgs.slice(-4).map((m) => `${m.from === 'me' ? '플레이어' : c.name}: ${m.text}`),
                relation: c.tier !== 'crowd' && !c.isNews ? c.relation : undefined,
                crowdRole: c.crowdRole,
                register: (0, relationship_1.registerOf)(c),
                romance: c.romance ?? 0,
                devotion: c.devotion ?? 0,
                ...(c.rosterId ? { realPerson: true } : {}),
                gender: c.gender,
                ageGroup: c.ageGroup,
                personality: c.personality,
                speechStyle: c.speechStyle,
                dmTs: msgs.length ? msgs[msgs.length - 1].ts : 0,
                recentSaid: recentSaidOf(c.id),
            };
        }),
        recent,
        memory: sc.memory.slice(-12),
        scenes: (t?.scenes ?? []).map((s) => ({ key: s.key, desc: s.prompt.split(',').slice(0, 2).join(',').slice(0, 60) })),
        difficulty: sc.difficulty ?? 'normal',
        romanceLevel: sc.romanceLevel ?? 'racy',
        trends: (sc.trends ?? []).slice(0, 6).map((x) => x.tag),
        quests: (sc.quests ?? [])
            .filter((q) => !q.done)
            .slice(0, 4)
            .map((q) => ({ title: q.title, keyword: q.keyword })),
        pendingEvents: (sc.events ?? []).filter((e) => e.status === 'pending').map((e) => e.title),
        myRecent: feedPosts
            .filter((p) => p.authorId === types_1.ME && p.kind === 'post' && p.text)
            .slice(0, 3)
            .reverse()
            .map((p) => p.text),
    };
}
// ───────────────────────── 글자 줄이기
/** 공백 정리 + 길이 제한(넘치면 …) */
function clip(text, max) {
    const t = (text ?? '').replace(/\s+/g, ' ').trim();
    return t.length > max ? `${(0, utils_1.cutText)(t, max - 1).trimEnd()}…` : t;
}
/** 문장 단위로 자르기(정규식 뒤돌아보기 없이) */
function sentences(text) {
    const out = [];
    let cur = '';
    for (let i = 0; i < text.length; i++) {
        cur += text[i];
        if (/[.!?。]/.test(text[i]) && (text[i + 1] === ' ' || i === text.length - 1)) {
            out.push(cur.trim());
            cur = '';
        }
    }
    if (cur.trim())
        out.push(cur.trim());
    return out;
}
/**
 * 성격 설명 안의 "존댓말/반말" 지시가 지금 말투 등급과 다르면 등급으로 바꿔 읽힌다(AI 혼동 방지).
 * 말투 등급은 관계·호감도로 게임이 정한 값이라 설명보다 우선한다(성격·말버릇·이모지 같은 스타일은 그대로).
 */
function alignRegister(desc, register) {
    if (!desc)
        return desc;
    if (register === 'banmal')
        return desc.replace(/(정중한 |정돈된 |깍듯한 |부드러운 )?(존댓말|존대|해요체|높임말|합쇼체)(\s*\([^)]*\))?/g, '$1반말');
    if (register === 'haeyo')
        return desc.replace(/(완전 |100% |늘 |항상 )?(반말|평어체|평어)(\s*\([^)]*\))?/g, '해요체').replace(/(합쇼체|다나까)/g, '해요체');
    return desc.replace(/(완전 |100% |늘 |항상 )?(반말|평어체|평어|해요체)(\s*\([^)]*\))?/g, '격식 존댓말');
}
const STYLE_KEYS = /말투|말버릇|이모지|문장|반말|존댓말|음슴체|플레이어/;
const TASTE_KEYS = /반응|싫어|좋아|절대|안 쓴|속으로|질투|태도/;
/**
 * 긴 성격 설명 → max자 요약: 첫 문장(누구인지) + 말투·플레이어 대하는 태도 문장을 우선 남긴다(원래 순서 유지).
 */
function digest(desc, max) {
    const t = desc.replace(/\s+/g, ' ').trim();
    if (t.length <= max)
        return t;
    const ss = sentences(t);
    if (ss.length <= 1)
        return clip(t, max);
    const rank = (s, i) => (i === 0 ? 3 : STYLE_KEYS.test(s) ? 2 : TASTE_KEYS.test(s) ? 1 : 0);
    const order = ss.map((s, i) => ({ s, i, r: rank(s, i) })).sort((a, b) => b.r - a.r || a.i - b.i);
    const keep = new Set();
    let len = 0;
    for (const o of order) {
        const add = Math.min(o.s.length, o.i === 0 ? 70 : o.s.length) + 1;
        if (len + add > max)
            continue;
        keep.add(o.i);
        len += add;
    }
    const out = ss
        .map((s, i) => (keep.has(i) ? (i === 0 ? clip(s, 70) : s) : null))
        .filter(Boolean)
        .join(' ');
    return out || clip(t, max);
}
// ───────────────────────── 인물 한 줄
const BADGE_SHORT = { blue: '파란인증', gold: '금색인증', gray: '회색인증' };
const STATUS_LABEL = { normal: '보통', rising: '상승세', viral: '떡상', controversy: '논란', cancelled: '캔슬' };
exports.DIFFICULTY_LABEL = { easy: '쉬움', normal: '보통', hard: '어려움' };
/** 관계(핵심 인물) 또는 분류(일반 계정) 이름 */
function kindLabel(c) {
    if (c.tier !== 'crowd' && !c.isNews && c.relation)
        return relationship_1.RELATION_LABEL[c.relation];
    if (c.crowdRole)
        return relationship_1.CROWD_LABEL[c.crowdRole];
    return c.isNews ? '언론' : '일반';
}
const registerText = (c) => relationship_1.REGISTER_LABEL[c.register] ?? '해요체';
exports.registerText = registerText;
function presetLabel(id, list, desc) {
    if (!id)
        return '';
    const p = list.find((x) => x.id === id);
    const label = p?.label ?? id;
    if (desc.includes(label))
        return ''; // 설명에 이미 들어 있음
    return p ? `${p.label}(${p.desc})` : id;
}
/** 자세한 인물 항목(이번 일의 중심 인물) */
function fullEntry(c, descMax = 160) {
    const head = [
        `@${c.handle} ${c.name}`,
        `${kindLabel(c)} | 플레이어에게 ${(0, exports.registerText)(c)}`,
        `호감${c.affinity}${c.romance > 0 && !c.realPerson ? ` 설렘${c.romance}` : ''}${c.devotion > 0 ? ` 정복${c.devotion}` : ''}`,
        c.realPerson ? '실존 인물일 수 있음(연애·성적 반응 금지)' : '',
        [c.tier !== 'crowd' && c.crowdRole && c.crowdRole !== 'public' ? relationship_1.CROWD_LABEL[c.crowdRole] : '', c.badge ? BADGE_SHORT[c.badge] : '', `팔로워${(0, utils_1.formatCount)(c.followers)}`]
            .filter(Boolean)
            .join('·'),
        [c.ageGroup ? `${c.ageGroup}대` : '', c.gender ? (c.gender === 'f' ? '여' : '남') : ''].filter(Boolean).join(' '),
        [presetLabel(c.personality, relationship_1.PERSONALITY_PRESETS, c.description), presetLabel(c.speechStyle, relationship_1.SPEECH_PRESETS, c.description)].filter(Boolean).join('·'),
        c.followsMe && c.iFollow ? '맞팔' : c.followsMe ? '플레이어를 팔로우' : c.iFollow ? '플레이어가 팔로우' : '',
    ].filter(Boolean);
    const lines = [`- ${head.join(' | ')}`];
    const desc = digest(alignRegister(c.description ?? '', c.register), descMax);
    if (desc)
        lines.push(`  특성: ${desc}`);
    if (c.bio && (c.description ?? '').length < 60)
        lines.push(`  소개: ${clip(c.bio, 50)}`);
    if (c.relations)
        lines.push(`  관계: ${clip(c.relations, 75)}`);
    if (c.recentDM.length)
        lines.push(`  최근쪽지: ${c.recentDM.slice(-2).map((m) => clip(m, 45)).join(' / ')}`);
    return lines.join('\n');
}
/** 짧은 인물 항목(곁다리) */
function briefEntry(c) {
    const first = sentences(alignRegister((c.description || c.bio || '').replace(/\s+/g, ' ').trim(), c.register))[0] ?? '';
    const trait = clip(first, 40);
    return `- @${c.handle} ${c.name} | ${kindLabel(c)}·${(0, exports.registerText)(c)} | 호감${c.affinity}${c.devotion >= 30 ? ` 정복${c.devotion}` : ''}${c.realPerson ? ' | 연애 금지' : ''}${trait ? ` | ${trait}` : ''}`;
}
const STRONG_REL = new Set(['lover', 'bestie', 'spicy', 'rival', 'enemy', 'family']);
/** 글에 나온 인물: @아이디 또는 이름(한글 2자 이상 부분) */
function mentionedIds(ctx, text) {
    if (!text)
        return [];
    const out = [];
    const lower = text.toLowerCase();
    for (const m of text.matchAll(/@([a-zA-Z0-9_]+)/g)) {
        const c = ctx.cast.find((x) => x.handle.toLowerCase() === m[1].toLowerCase());
        if (c && !out.includes(c.id))
            out.push(c.id);
    }
    // 이름으로 찾기는 핵심 인물만(일반 유저 닉네임은 흔한 단어라 헷갈림)
    for (const c of ctx.cast) {
        if (out.includes(c.id) || c.tier === 'crowd')
            continue;
        const ko = (c.name.match(/[가-힣]{2,}/g) ?? []).filter((w) => w !== ctx.persona.name && !['팀장', '선배', '공식', '소식'].includes(w));
        if (ko.some((w) => lower.includes(w)))
            out.push(c.id);
    }
    return out;
}
function pickCast(ctx, o = {}) {
    const nFull = o.full ?? 6;
    const nBrief = o.brief ?? 4;
    const nCrowd = o.crowd ?? 6;
    let h = (0, utils_1.hashStr)(o.seed ?? `${ctx.clock.day}:${ctx.clock.hour}:${ctx.clock.minute}`);
    const rnd = () => {
        h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
        return (h % 10000) / 10000;
    };
    const byId = new Map(ctx.cast.map((c) => [c.id, c]));
    const used = new Set();
    const full = [];
    const take = (c) => {
        if (!c || used.has(c.id))
            return;
        used.add(c.id);
        full.push(c);
    };
    for (const id of o.must ?? [])
        take(byId.get(id));
    for (const id of mentionedIds(ctx, o.text ?? ''))
        take(byId.get(id));
    // 핵심 인물 점수: 호감 크기 + 설렘 + 최근 쪽지 + 진한 관계
    const core = ctx.cast.filter((c) => c.tier !== 'crowd' && !c.isNews && !used.has(c.id));
    const dmOrder = [...ctx.cast].filter((c) => (c.dmTs ?? 0) > 0).sort((a, b) => (b.dmTs ?? 0) - (a.dmTs ?? 0));
    const dmBonus = new Map(dmOrder.slice(0, 3).map((c, i) => [c.id, [40, 28, 16][i]]));
    const score = (c) => Math.abs(c.affinity) + c.romance * 0.6 + (dmBonus.get(c.id) ?? 0) + (c.relation && STRONG_REL.has(c.relation) ? 15 : 0) + (c.followsMe ? 4 : 0) + (o.shuffle ? rnd() * 70 : 0);
    const ranked = core.map((c) => ({ c, s: score(c) })).sort((a, b) => b.s - a.s).map((x) => x.c);
    for (const c of ranked) {
        if (full.length >= nFull)
            break;
        take(c);
    }
    const brief = ranked.filter((c) => !used.has(c.id)).slice(0, nBrief);
    brief.forEach((c) => used.add(c.id));
    // 일반 유저: 팬·안티·셀럽·협찬 등을 골고루, 씨앗으로 섞기
    const first = new Set(o.crowdFirst ?? []);
    const crowdPool = ctx.cast
        .filter((c) => c.tier === 'crowd' && !c.isNews && !used.has(c.id))
        .map((c) => ({ c, s: (c.crowdRole && first.has(c.crowdRole) ? 1 : 0) + rnd() }))
        .sort((a, b) => b.s - a.s)
        .map((x) => x.c);
    return { full, brief, crowd: crowdPool.slice(0, nCrowd) };
}
/** 고른 인물 → 프롬프트 블록 */
function castBlock(p, opts = {}) {
    const out = [];
    if (p.full.length)
        out.push('[인물]', ...p.full.map((c, i) => fullEntry(c, i === 0 && opts.firstDescMax ? opts.firstDescMax : (opts.descMax ?? 160))));
    if (p.brief.length)
        out.push('[그 밖의 인물]', ...p.brief.map(briefEntry));
    if (p.crowd.length)
        out.push('[일반 유저]', ...p.crowd.map(briefEntry));
    return out.join('\n');
}
/** 말투 등급 요약 한 줄(할 일 바로 위에 다시 알려 주면 AI가 더 잘 지킨다) */
function registerMap(p) {
    const groups = { banmal: [], haeyo: [], formal: [] };
    for (const c of [...p.full, ...p.brief, ...p.crowd])
        groups[c.register]?.push(`@${c.handle}`);
    const parts = [
        groups.banmal.length ? `반말(~요 금지): ${groups.banmal.join(' ')}` : '',
        groups.haeyo.length ? `해요체(플레이어에게 ~요, 반말 금지): ${groups.haeyo.join(' ')}` : '',
        groups.formal.length ? `존댓말(격식): ${groups.formal.join(' ')}` : '',
    ].filter(Boolean);
    return parts.length ? `[말투 확인 — 플레이어에게] ${parts.join(' / ')}` : '';
}
// ───────────────────────── 타임라인·기억·지금 상태
function speaker(r) {
    if (r.authorId === types_1.ME)
        return '플레이어';
    return r.author.replace(/\(플레이어\)$/, '');
}
/** 최근 타임라인 n개(오래된 → 최신, 글은 len자까지) */
function recentBlock(ctx, n = 6, len = 60) {
    const list = ctx.recent.slice(-n);
    if (!list.length)
        return '';
    return ['[최근 타임라인]', ...list.map((r) => `- ${speaker(r)}: ${clip(r.text, len)}`)].join('\n');
}
function memoryBlock(ctx, n = 8, len = 80) {
    const list = ctx.memory.slice(-n);
    if (!list.length)
        return '';
    return ['[주요 사건]', ...list.map((m) => `- ${clip(m, len)}`)].join('\n');
}
/** 지금 시각·플레이어 수치·난이도 한 줄 */
function nowLine(ctx) {
    const s = ctx.stats;
    const hh = String(ctx.clock.hour).padStart(2, '0');
    const mm = String(ctx.clock.minute).padStart(2, '0');
    return `[지금] ${ctx.clock.day}일차 ${hh}:${mm} | 플레이어 팔로워 ${s.followers.toLocaleString('ko-KR')}·Lv${s.level}·평판 ${s.reputation}(${STATUS_LABEL[s.status]})·아우라 ${s.aura}·유머 ${s.humor} | 난이도 ${exports.DIFFICULTY_LABEL[ctx.difficulty] ?? '보통'}`;
}
/** 트렌드·진행 중 미션(제안 글 재료) */
function hooksBlock(ctx) {
    const out = [];
    if (ctx.trends?.length)
        out.push(`[트렌드] ${ctx.trends.slice(0, 5).join(' ')}`);
    const qs = (ctx.quests ?? []).filter((q) => q.keyword?.length).slice(0, 2);
    if (qs.length)
        out.push(`[미션] ${qs.map((q) => `${clip(q.title, 30)}(키워드: ${q.keyword.join(', ')})`).join(' / ')}`);
    if (ctx.myRecent?.length)
        out.push(`[플레이어 최근 글] ${ctx.myRecent.slice(-2).map((t) => `"${clip(t, 50)}"`).join(' / ')}`);
    return out.join('\n');
}
