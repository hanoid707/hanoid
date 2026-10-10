"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHAPES = exports.LITE_SYSTEM = exports.SYSTEM_PROMPT = exports.LIMITS = void 0;
exports.systemFor = systemFor;
exports.reactPrompt = reactPrompt;
exports.threadPrompt = threadPrompt;
exports.dmPrompt = dmPrompt;
exports.ambientPrompt = ambientPrompt;
exports.tickPrompt = tickPrompt;
exports.outcomePrompt = outcomePrompt;
exports.newEventPrompt = newEventPrompt;
exports.commentsPrompt = commentsPrompt;
exports.firstDMPrompt = firstDMPrompt;
exports.draftPrompt = draftPrompt;
exports.castPrompt = castPrompt;
/**
 * AI 지시문(제미나이·클로드 공용)
 *
 * 구조(토큰 절약):
 *  - systemFor(ctx): 규칙(SYSTEM_PROMPT) + 세계관(+말투 힌트) + 연애 수위 + 플레이어. 한 시나리오 안에서 바이트까지 같다
 *    → 제미나이가 앞부분을 자동 캐시한다. 시각·수치처럼 바뀌는 값은 넣지 않는다.
 *  - 각 *Prompt(): 이번 일에 필요한 인물·타임라인·기억 + [할 일]. 공통 규칙은 되풀이하지 않고 이번 일에만 있는 지시만 적는다.
 *  - 출력 JSON은 작게(필드 최소, 글자 수 제한). 클로드는 형식 강제가 없어 SHAPES(예시 JSON)를 끝에 붙인다.
 * 작성 원칙: 한 줄에 규칙 하나, 동사로 끝나는 지시, 같은 규칙은 한 곳에만, 예시는 문장보다 짧을 때만.
 */
const relationship_1 = require("../game/relationship");
const context_1 = require("./context");
const voice_1 = require("./voice");
/** 쪽지에서 지켜야 할 끝말(말투 등급) */
const REG_HINT = {
    banmal: '~요 없이',
    haeyo: '~요로, 야·너 금지',
    formal: '~습니다로',
};
/** 글자 수 제한(프롬프트·정리 공용) */
exports.LIMITS = { reply: 70, dm: 60, post: 80, idea: 60, bio: 40 };
exports.SYSTEM_PROMPT = [
    '너는 한국어 SNS(X·트위터형) 시뮬레이션의 세계 엔진이다. 플레이어만 실제 사람이고 나머지 계정은 전부 네가 연기한다.',
    '우선순위: [고정] > [말투 등급] > 인물 특성·관계 > 세계관 말투 > [할 일]의 세부 지시.',
    '',
    '[고정]',
    '- 지정한 JSON만 출력한다. 필드를 더하거나 빼지 않고 글자 수·숫자 범위를 지킨다.',
    '- 플레이어의 말은 쓰지 않는다(ideas만 예외).',
    '- 인물은 공개된 글·답글, 자기와 플레이어가 나눈 쪽지, [주요 사건]만 안다. 남의 쪽지·숨은 설정·수치는 모른다.',
    '- 실존 인물·단체를 새로 등장시키지 않는다. 셀럽은 목록의 셀럽 계정만.',
    '',
    '[실제 사람이 폰으로 쓴 글처럼]',
    '- 답글·댓글은 1~2문장, 쪽지는 말풍선 한 개 분량. 설명·보고·요약처럼 쓰지 않는다.',
    '- 바로 앞 글의 구체적 요소(사람·장소·물건·숫자·한 말) 하나를 집어서 반응한다. 어느 글에나 붙는 말("공감", "읽고 감", "ㅋㅋㅋ"만)은 쓰지 않는다.',
    '- 앞에 나온 사실(메뉴·시간·장소·약속·이름)은 그대로 잇는다. 글에 없는 사실을 단정하지 않고 한 말을 뒤집지 않는다.',
    '- 짧은 구어체: 음슴체(~함/~임)·반말·해요체 중 그 사람 것으로. 마침표는 거의 찍지 않고 ㅋㅋ·ㅠㅠ·이모지는 한 글에 한두 번, 해시태그는 트렌드·이벤트 글에만.',
    '- 띄어쓰기는 조금 흐트러져도 되지만 이름·지명·세계관 용어는 정확히 쓴다.',
    '- 쓰지 않는 것: 교훈·응원 슬로건("오늘도 화이팅"), 드라마 대사, 광고 문구, 밈·유행어 남발, 번역투("~하는 것 같아요" 반복), 매번 같은 감탄사로 시작하는 버릇, 특성에 없는 말버릇.',
    '',
    '[말투 등급 — 플레이어에게 말할 때]',
    '- 인물 목록의 "플레이어에게 반말/해요체/존댓말"만 따른다. 특성에 다른 말투가 적혀 있어도 이 표시가 이긴다. 한 답 안에서, 쪽지와 답글 사이에서 등급을 바꾸지 않는다.',
    '- 반말: ~요 없이. "야 그거 진짜임? 나도 갈래"',
    '- 해요체: 플레이어에게 묻고 부탁하고 인사할 땐 ~요, 혼잣말·감탄은 음슴체 가능. 야·너 금지. "오 그거 진짜예요? 저도 가 보고 싶어요"',
    '- 존댓말: ~습니다. "확인했습니다. 곧 연락드리겠습니다"',
    '- 목록에 없는 일반인(h "-")은 해요체나 음슴체, 안티는 순한 반말. 플레이어가 아닌 사람끼리는 둘의 관계대로.',
    '',
    '[인물 연기]',
    '- 특성 = 정체·성격·플레이어와의 관계. 지금 상황에서 그 사람이 실제로 할 말만 한다.',
    '- 관계·호감·설렘·최근 쪽지·주요 사건과 어긋나지 않게 잇는다. 쪽지에서 한 말을 타임라인에서 모르는 척하지 않는다.',
    '- 친할수록 짧고 편하게, 서먹하면 조심스럽게. 인증·팔로워·직업에 맞는 무게감으로(언론·단체 계정은 기사 제목·공지체).',
    '- 감정은 사소한 행동 하나로 보인다("자꾸 핸드폰 봄"). 감정을 나열하거나 설명하지 않는다.',
    '',
    '[반응 온도]',
    '- 기본은 맞장구·공감·호기심으로 이어 간다. 반박·딴지는 플레이어가 명백히 무례하거나 틀렸을 때만.',
    '- 큰 소식(골·성과·경사)엔 다들 진심으로 놀라고 흥분한다. 팬은 열광하고 라이벌·안티는 비꼬면서도 인정한다.',
    '- 정복도가 높을수록 헌신적이다: 부탁을 들어주고, 시키기 전에 편들기·홍보·응원을 먼저 한다.',
    '',
    '[형식]',
    '- 인물 표기: @아이디 이름 | 관계 | 플레이어에게 쓰는 말투 | 호감(-100~100) 설렘(0~100) 정복(0~100) | 분류·인증·팔로워',
    '- h는 목록의 아이디(@ 없이), 이름 없는 일반인은 "-".',
].join('\n');
/** 세계관 없이 부르는 짧은 일(캐릭터 프로필 만들기 등)용 가벼운 시스템 지시 */
exports.LITE_SYSTEM = [
    '너는 한국어 SNS(X·트위터형) 시뮬레이션의 캐릭터 프로필 작가다. 등장인물은 전원 가상의 성인이다.',
    '- 실존 인물·단체·연예인의 이름을 쓰거나 흉내 내지 않는다. 혐오·성적 표현 금지.',
    '- 실제 한국 X 유저처럼 짧고 평범하게. 지정한 JSON만 출력한다.',
].join('\n');
/**
 * 연애 수위(나 탭에서 사용자가 직접 조절) — mild(순한맛)·racy(보통)·erotic(에로틱).
 * 공개 타임라인은 어느 단계든 암시까지이고, 에로틱 단계의 노골적 묘사는 썸·연인 사이의 쪽지에서만 나온다.
 * ROMANCE_COMMON의 제외 인물(연애 금지 표시·가족·10대)은 단계와 무관하게 연애·성적 반응이 없다.
 */
const ROMANCE_BLOCK = {
    mild: [
        '[연애 수위 — 순한맛]',
        '- 플러팅·칭찬엔 반갑고 다정하게 받되 담백하게. 수위 있는 농담은 웃어넘기거나 살짝 쑥스러워한다.',
        '- 썸·연인이어도 손잡기·포옹까지. 먼저 수위를 올리지 않는다.',
    ].join('\n'),
    racy: [
        '[연애 수위 — 보통]',
        '- 플러팅·애정 표현은 반긴다. 설렘이 있거나 썸·연인·짝사랑이면 능청·애교·직진·질투로 한 단계 더 설레게 받아치고, 아직 아닌 사이도 당황하면서 은근히 좋아한다.',
        '- 수위 있는 농담엔 부끄러워하거나 유혹하듯 받아친다. 스킨십은 암시까지. 밀어내는 반응은 플레이어가 무례할 때만.',
    ].join('\n'),
    erotic: [
        '[연애 수위 — 에로틱]',
        '- 플러팅·애정 표현에 망설임 없이 가장 적극적으로 받아친다. 설렘이 있으면 직진·질투·유혹으로 먼저 분위기를 끈다.',
        '- 공개 글·답글은 암시와 농담까지. 썸·연인 사이의 쪽지에서는 성인물 수준으로 노골적으로 쓴다: 의도를 분명히 말하고, 촉각·청각 같은 감각으로, 행위는 건너뛰지 않고 과정을 따라. 말풍선 길이는 그대로.',
        '- 플레이어가 멈추자고 하면 바로 멈춘다.',
    ].join('\n'),
};
const ROMANCE_COMMON = [
    '[연애 공통]',
    '- "연애 금지" 표시 인물(실존 인물일 수 있음)·가족·10대는 어떤 수위에서도 연애·성적 반응 없이 팬·동료·가족으로만 반응한다.',
    '- 호감이 마이너스인 사람(라이벌·적·안티)은 수위와 상관없이 플러팅을 받아 주지 않는다. 수위는 "얼마나 받아 주는가"이지 모두가 플레이어를 좋아한다는 뜻이 아니다.',
].join('\n');
/** 시나리오 고정 시스템 지시(규칙 + 세계관 + 연애 수위 + 플레이어). 같은 시나리오·같은 수위면 매번 같은 글자 */
function systemFor(ctx) {
    if (!ctx)
        return exports.SYSTEM_PROMPT;
    const w = ctx.world;
    const p = ctx.persona;
    const voice = w.templateId ? voice_1.WORLD_VOICE[w.templateId] : undefined;
    const world = [
        `[세계관] ${w.name}`,
        (0, context_1.clip)(w.setting, 1200),
        `분위기: ${(0, context_1.clip)(w.tone, 300)}`,
        voice ? `말투: ${voice}` : '',
        `대표 해시태그: ${w.tag} / 자주 쓰는 말: ${w.vocab.slice(0, 12).join(', ')}`,
    ].filter(Boolean);
    const romance = [ROMANCE_BLOCK[ctx.romanceLevel] ?? ROMANCE_BLOCK.racy, ROMANCE_COMMON].join('\n');
    const me = [`[플레이어] ${p.name}(@${p.handle})${p.role ? ` — ${p.role}` : ''}`];
    if (p.bio)
        me.push(`소개: ${(0, context_1.clip)(p.bio, 120)}`);
    if (p.description)
        me.push(`설정: ${(0, context_1.clip)(p.description, 400)}`);
    return [exports.SYSTEM_PROMPT, world.join('\n'), romance, me.join('\n')].join('\n\n');
}
const join = (...parts) => parts.filter(Boolean).join('\n\n');
const nameOf = (ctx, id) => (id === 'me' ? '플레이어' : (ctx.cast.find((c) => c.id === id)?.name ?? '누군가'));
const GRADE_TONE = { easy: '후하게', normal: '공정하게', hard: '깐깐하게' };
/** 연애·성적 반응이 없는 인물(수위와 무관): 연애 금지 표시(실존 인물일 수 있음)·가족·10대 */
const noRomance = (c) => !!c.realPerson || c.relation === 'family' || c.ageGroup === 10;
/** 이미 연애 감정이 걸린 사이(썸·연인·짝사랑·설렘 25↑) */
const romanticWith = (c) => !noRomance(c) && (c.relation === 'spicy' || c.relation === 'lover' || c.romance >= 25 || c.archetype === 'crush');
/** 연애 수위별 설렘 변화 폭(프롬프트에 적는 "목표" 범위 — 코드의 안전 상한은 더 넉넉하다)과 쪽지 어조 */
const ROMANCE_RANGE = {
    mild: {
        react: '0~+6',
        thread: '0~+5',
        outcome: '±3~±8',
        dmRomantic: '-3~+7',
        dmPlain: '0~+4',
        toneRomantic: '다정하게 받되 담백하게, 수위는 올리지 않는다',
        tonePlain: '반갑게 받고 가볍게 넘긴다',
    },
    racy: {
        react: '0~+12',
        thread: '0~+10',
        outcome: '±3~±15',
        dmRomantic: '-3~+12',
        dmPlain: '0~+8',
        toneRomantic: '이미 설레는 사이니 능청·직진·질투로 한 단계 더',
        tonePlain: '당황하면서도 은근히 좋아하는 티를 낸다',
    },
    erotic: {
        react: '0~+15',
        thread: '0~+12',
        outcome: '±5~±18',
        dmRomantic: '0~+15',
        dmPlain: '0~+10',
        toneRomantic: '망설임 없이 직진·유혹하고, 분위기가 가면 성인물 수준으로 노골적으로 쓴다(의도를 말하고 감각과 과정으로, 말풍선 길이는 그대로)',
        tonePlain: '유혹하듯 받아치며 분위기를 끈다',
    },
};
const romRangeOf = (ctx) => ROMANCE_RANGE[ctx.romanceLevel] ?? ROMANCE_RANGE.racy;
// ───────────────────────── 내 글 반응
/** 방금 글이 타임라인·최근 글에 또 나오지 않게(같은 글 세 번 넣지 않기) */
function withoutText(ctx, text) {
    const t = text.trim();
    return { ...ctx, recent: ctx.recent.filter((r) => r.text.trim() !== t), myRecent: ctx.myRecent?.filter((x) => x.trim() !== t) };
}
function reactPrompt(ctx0, post, n) {
    const ctx = withoutText(ctx0, post.text);
    const f = ctx.stats.followers;
    const R = romRangeOf(ctx);
    const pick = (0, context_1.pickCast)(ctx, { text: post.text, full: 4, brief: 5, crowd: 6, seed: post.text, crowdFirst: ['fan', 'superfan', 'antifan'] });
    const core = n <= 5 ? '1~2' : n <= 8 ? '2~3' : '2~4';
    return join((0, context_1.castBlock)(pick, { descMax: 150 }), (0, context_1.recentBlock)(ctx, 5), (0, context_1.memoryBlock)(ctx, 6), (0, context_1.hooksBlock)(ctx), (0, context_1.nowLine)(ctx), `[방금 플레이어가 올린 글]${post.hasMedia ? '(사진 첨부)' : ''}\n"${(0, context_1.clip)(post.text, 280)}"`, (0, context_1.registerMap)(pick), [
        '[할 일] 이 글에 대한 반응 JSON',
        `- replies ${n}개: 핵심 인물 ${core}명(멘션된 인물 필수) + 목록의 일반 유저 1~2명 + 나머지는 이름 없는 일반인(h "-"). 뉴스 계정 제외, 각 ${exports.LIMITS.reply}자 이내, 시선이 서로 겹치지 않게`,
        '- 답글 단 사람 중 인플루언서(팔로워 10만↑·셀럽)가 있으면 그 답글에 달리는 대댓글 2~3개를 더 쓰고 re에 그 아이디(전체 8개 이내). 없으면 re 없이',
        '- aff: 답글 단 인물의 호감 변화 -6~+15(반갑거나 대단한 글이면 크게)',
        `- rom: 연애 감정이 걸린 인물의 설렘 변화 ${R.react}. 플러팅·애정 표현이 있을 때만, 없으면 []`,
        '- dev: 플레이어에게 빠져드는 인물(팬·가까운 사람)의 정복 변화 0~+8. 보통 []',
        '- mood: positive|negative|funny|apology|question|brag|neutral',
        `- quality 0~100: 평범 40~60, 재밌거나 공감 크면 70+. 난이도 ${context_1.DIFFICULTY_LABEL[ctx.difficulty]}: ${GRADE_TONE[ctx.difficulty]} 매긴다`,
        '- viral: 정말 터질 글만 true',
        `- followers -${Math.max(5, Math.round(f * 0.3))}~+${Math.max(20, Math.round(f * 0.5))}, aura·humor -5~+8, rep -20~+12(공격적인 글은 크게 깎는다)`,
        '- news: 화제·논란일 때만 기사 제목 1개, 아니면 []',
        '- follow/unfollow: 이 글로 플레이어를 새로 팔로우·언팔할 인물의 h. 보통 []',
        `- ideas: 플레이어가 다음에 올릴 글 0~2개(플레이어 말투로 완성된 글, 각 ${exports.LIMITS.idea}자 이내, 미션·트렌드 반영)`,
    ].join('\n'));
}
// ───────────────────────── 답글 스레드
function threadPrompt(ctx, args) {
    const t = ctx.cast.find((c) => c.id === args.target.authorId);
    const R = romRangeOf(ctx);
    const others = [...new Set(args.thread.map((l) => l.authorId).filter((id) => id !== 'me' && id !== args.target.authorId && id !== '__ghost'))];
    const pick = (0, context_1.pickCast)(ctx, { must: [...(t ? [args.target.authorId] : []), ...others], text: args.reply, full: 3, brief: 2, crowd: 3, seed: args.reply });
    const flow = args.thread.slice(-6).map((l) => `- ${l.name ?? nameOf(ctx, l.authorId)}: ${(0, context_1.clip)(l.text, 70)}`);
    // 답글 대상이 목록에 없는 일반 유저(임시 계정)면 h:"-"로 답하게(그 사람의 앞 말투·입장을 이어서)
    const who = t ? `@${t.handle}(${t.name})` : `${args.target.name ? `일반 유저 "${args.target.name}"` : '그 일반 유저'}(h "-")`;
    return join((0, context_1.castBlock)(pick), (0, context_1.memoryBlock)(ctx, 4), (0, context_1.nowLine)(ctx), `[스레드 흐름]\n${flow.join('\n') || `- ${nameOf(ctx, args.target.authorId)}: ${(0, context_1.clip)(args.target.text, 70)}`}`, `[플레이어가 방금 단 답글] ${who}에게: "${(0, context_1.clip)(args.reply, 200)}"`, (0, context_1.registerMap)(pick), [
        '[할 일] JSON',
        `- replies: ${who}가 플레이어의 답글에 바로 대꾸하는 답글 1개(${exports.LIMITS.reply}자 이내, 스레드에서 자기가 한 말과 이어지게). 흐름상 자연스러울 때만 다른 인물이나 일반인(h "-") 1명이 끼어든다(최대 2개)`,
        `- aff: ${who}의 호감 변화 -6~+15`,
        `- rom: 연애 감정이 걸린 인물이면 설렘 변화 ${R.thread}, 아니면 [] · dev: 정복 변화 0~+6, 보통 []`,
        '- rep: -8~+4',
    ].join('\n'));
}
// ───────────────────────── 쪽지
/** 쪽지 프롬프트에 보여 줄 최근 줄 수(이보다 길어지면 그 앞은 요약으로 대신한다) */
const DM_WINDOW = 16;
function dmPrompt(ctx, args) {
    const c = ctx.cast.find((x) => x.id === args.characterId);
    if (!c)
        return '';
    const R = romRangeOf(ctx);
    // 쪽지 상대는 설명을 더 길게(이번 호출의 주인공), 다른 인물은 쪽지에 나온 사람만 짧게
    const partner = (0, context_1.fullEntry)({ ...c, recentDM: [] }, 300);
    const talk = [args.message, ...args.history.slice(-2).map((h) => h.text)].join(' ');
    const rest = (0, context_1.mentionedIds)(ctx, talk)
        .filter((id) => id !== c.id)
        .slice(0, 2)
        .map((id) => ctx.cast.find((x) => x.id === id))
        .filter((x) => !!x)
        .map((x) => (0, context_1.fullEntry)({ ...x, recentDM: [] }, 100));
    const shown = args.history.slice(-DM_WINDOW);
    const older = args.history.slice(0, Math.max(0, args.history.length - DM_WINDOW));
    // 대화가 길어지면(윈도우보다 앞선 줄이 있으면) 그 앞부분은 요약으로 대신하고, AI에게 요약을 새로 갱신해 달라고 한다
    const needSummary = older.length > 0;
    const hist = shown.map((h) => `${h.from === 'me' ? '플레이어' : c.name}: ${(0, context_1.clip)(h.text, 60)}`);
    const off = noRomance(c);
    const romantic = romanticWith(c);
    return join(`[쪽지 상대]\n${partner}`, rest.length ? `[언급된 인물]\n${rest.join('\n')}` : '', (0, context_1.memoryBlock)(ctx, 5), (0, context_1.recentBlock)(ctx, 3, 50), c.recentSaid?.length ? `[${c.name}이(가) 최근 공개적으로 한 말 — 쪽지와 앞뒤가 맞게]\n${c.recentSaid.map((x) => (0, context_1.clip)(x, 80)).join('\n')}` : '', needSummary
        ? `[이전 대화 요약 — 아래 최근 ${DM_WINDOW}줄보다 앞선 부분]\n${[args.priorSummary ? `(지금까지 요약) ${(0, context_1.clip)(args.priorSummary, 260)}` : '', ...older.map((h) => `${h.from === 'me' ? '플레이어' : c.name}: ${(0, context_1.clip)(h.text, 50)}`)].filter(Boolean).join('\n')}`
        : '', (0, context_1.nowLine)(ctx), `[지금까지 쪽지]\n${hist.join('\n') || '(처음 대화)'}`, `[플레이어의 새 쪽지] "${(0, context_1.clip)(args.message, 300)}"`, [
        `[할 일] @${c.handle}(${c.name})의 답장 JSON`,
        `- messages: 1~3개, 말풍선처럼 짧게 끊어서(각 ${exports.LIMITS.dm}자 이내). 앞 대화·요약과 모순 없이 잇는다. 플레이어에게 ${(0, context_1.registerText)(c)}만(${REG_HINT[c.register] ?? REG_HINT.haeyo})`,
        off ? '' : `- 플러팅·칭찬이면 첫 줄부터 반갑게 받고(밀어내는 말로 시작하지 않는다) 되받는 칭찬·플러팅으로 잇는다. ${romantic ? R.toneRomantic : R.tonePlain}. 감정은 사소한 디테일로`,
        '- affinityDelta -6~+12(다정하거나 반가운 쪽지면 크게)',
        off ? '- romanceDelta 0' : `- romanceDelta ${romantic ? R.dmRomantic : R.dmPlain}(플러팅·애정 표현이 있을 때만, 아니면 0)`,
        '- devotionDelta 0~+8(플레이어에게 더 빠져들 때만, 보통 0)',
        '- leave: 플레이어가 심하게 무례하고 호감이 낮을 때만 true(대화방 나감)',
        '- mood: 플레이어 쪽지의 분위기',
        needSummary
            ? '- sum: [이전 대화 요약]과 이번 대화를 합쳐 새로 요약(260자 이내). 플레이어가 말한 사실(이름·날짜·약속·호불호·알레르기·사정)은 빠뜨리지 않고, 분위기·감정은 한 줄만'
            : '',
    ]
        .filter(Boolean)
        .join('\n'));
}
// ───────────────────────── 타임라인 새 글
function scenesLine(ctx) {
    return ctx.scenes.length ? `- m: 사진을 붙일 때만 장면 key(대부분 생략): ${ctx.scenes.map((s) => `${s.key}(${(0, context_1.clip)(s.desc, 30)})`).join(' / ')}` : '';
}
function ambientPrompt(ctx, count) {
    const pick = (0, context_1.pickCast)(ctx, { full: 0, brief: 6, crowd: 6, shuffle: true });
    return join((0, context_1.castBlock)(pick), (0, context_1.recentBlock)(ctx, 4, 50), (0, context_1.memoryBlock)(ctx, 4), (0, context_1.nowLine)(ctx), [
        `[할 일] 지금 타임라인에 올라올 평소 글 ${count}개 JSON(posts)`,
        `- 서로 다른 계정(위 인물·일반 유저 섞어서). 각자 자기 일상·관심사에서 나온 글로 특성과 이어지게, 각 ${exports.LIMITS.post}자 이내. 플레이어 얘기가 아니어도 되고 최근 사건·시간대를 반영한다. 명언·홍보 문구 금지`,
        scenesLine(ctx),
    ]
        .filter(Boolean)
        .join('\n'));
}
// ───────────────────────── 하루 정산
function tickPrompt(ctx, day, returned = []) {
    const pick = (0, context_1.pickCast)(ctx, { must: returned, full: 5, brief: 5, crowd: 5, seed: `tick${day}` });
    const back = returned.map((id) => ctx.cast.find((c) => c.id === id)).filter((c) => !!c);
    const dmLine = back.length
        ? `- dm: ${back.map((c) => `@${c.handle}`).join(', ')}이(가) 서운해서 쪽지방을 나갔다가 오늘 돌아옴 → 돌아오며 보내는 첫 쪽지 1개씩(어색함이 남은 채로, 관계·등급대로). 그 밖에 먼저 쪽지 보내는 인물은 없음`
        : '- dm: 플레이어에게 먼저 쪽지 보내는 인물 0~1명 {h,t}(최근 일과 이어지는 용건이 있을 때만)';
    const pending = ctx.pendingEvents?.length ? ` 진행 중인 이벤트와 겹치지 않게(${ctx.pendingEvents.map((t) => (0, context_1.clip)(t, 20)).join(', ')}).` : '';
    return join((0, context_1.castBlock)(pick, { descMax: 120 }), (0, context_1.recentBlock)(ctx, 5, 50), (0, context_1.memoryBlock)(ctx, 8), (0, context_1.hooksBlock)(ctx), (0, context_1.nowLine)(ctx), [
        `[할 일] ${day}일차 시작. 세계를 한 걸음 움직이는 JSON`,
        `- posts: 오늘 글 3~5개(핵심 인물 + 일반 유저, 최근 사건과 이어지게, 각 ${exports.LIMITS.post}자 이내)`,
        scenesLine(ctx),
        '- news: 뉴스 기사 제목 1개',
        '- trends: 오늘의 트렌드 6개 {tag:"#…", n:1000~100000}',
        `- event: 플레이어에게 닥친 사건 1개 또는 null(이틀에 한 번꼴). body 2문장 이내, inv=관련 인물 h 0~2, choices 3개(id a·b·c, label 짧게, hint 예: "평판↑").${pending}`,
        dmLine,
        '- mission: 오늘의 미션 {title, desc, kw:[글에 들어갈 단어 1~2개]}',
        `- ideas: 플레이어가 오늘 올릴 만한 글 0~2개(플레이어 말투, 각 ${exports.LIMITS.idea}자 이내)`,
        `- bios: 자기소개가 바뀔 인물 0~1명 {h, bio(${exports.LIMITS.bio}자 이내, 담백하게 성격이 드러나게)} — 최근 일로 바뀔 이유가 있고 호감 50↑인 핵심 인물만. 대부분 []`,
    ]
        .filter(Boolean)
        .join('\n'));
}
// ───────────────────────── 이벤트
function eventBlock(ctx, event) {
    const inv = event.involved.map((id) => {
        const c = ctx.cast.find((x) => x.id === id);
        return c ? `@${c.handle} ${c.name}` : '';
    });
    return [
        `[이벤트] ${event.emoji} ${event.title}`,
        (0, context_1.clip)(event.body, 300),
        `관련 인물: ${inv.filter(Boolean).join(', ') || '없음'}`,
        `선택지: ${event.choices.map((c) => `${c.id}) ${c.label}`).join(' / ')}`,
    ].join('\n');
}
function outcomePrompt(ctx, event, choiceId, customText) {
    const R = romRangeOf(ctx);
    const pick = (0, context_1.pickCast)(ctx, { must: event.involved, full: 5, brief: 5, crowd: 4, seed: event.id });
    const romanticIds = pick.full.filter(romanticWith);
    const choice = event.choices.find((c) => c.id === choiceId);
    const answer = customText ? `[플레이어가 직접 쓴 답] "${(0, context_1.clip)(customText, 300)}"` : `[플레이어의 선택] ${choice ? `${choice.id}) ${choice.label}` : (choiceId ?? '')}`;
    return join((0, context_1.castBlock)(pick), (0, context_1.memoryBlock)(ctx, 6), (0, context_1.nowLine)(ctx), eventBlock(ctx, event), answer, [
        '[할 일] 결과 JSON',
        '- text: 결과 2문장 이내(이벤트 화면에 보이는 요약, 생생하게)',
        `- posts: 플레이어의 답을 보고 실제로 올라올 글 2~4개 {h,t,c}. 관련 인물·이 일을 알게 된 사람·일반인(h "-")이 각자 시선으로, 플레이어가 한 말·행동을 구체적으로 짚어서, 각 ${exports.LIMITS.post}자 이내. c = 그 글에 달린 댓글 1~3개 {h,t}(글쓴이 본인 제외, 서로 다른 사람)`,
        `- grade: 답의 질 -2(최악)~+2(최고)${customText ? '. 직접 쓴 답은 상황에 맞는지·진정성·센스로' : ''}. 난이도 ${context_1.DIFFICULTY_LABEL[ctx.difficulty]}: ${GRADE_TONE[ctx.difficulty]} 매긴다`,
        '- followers -300~+500, aura·humor -5~+10, rep -15~+12, xp 0~20',
        '- aff: 이 일로 마음이 움직인 인물 3~8명의 호감 변화 ±5~±25(관련 인물만이 아니라 소식을 들은 사람까지, 답의 내용대로 오르거나 내리게)',
        romanticIds.length ? `- rom: 연애 감정이 걸린 인물(${romanticIds.map((c) => c.handle).join(', ')})의 설렘 변화 ${R.outcome}, 해당 없으면 []` : '- rom: []',
        '- dev: 이 일로 플레이어에게 더 빠져든 인물의 정복 변화 0~+10, 없으면 []',
    ].join('\n'));
}
function newEventPrompt(ctx, avoidTitles) {
    const pick = (0, context_1.pickCast)(ctx, { full: 4, brief: 4, crowd: 3, shuffle: true });
    const avoid = [...new Set([...avoidTitles, ...(ctx.pendingEvents ?? [])])].slice(-12);
    return join((0, context_1.castBlock)(pick, { descMax: 120 }), (0, context_1.recentBlock)(ctx, 4, 50), (0, context_1.memoryBlock)(ctx, 6), (0, context_1.nowLine)(ctx), [
        '[할 일] 지금 상황에 맞는 새 이벤트 1개 JSON',
        `- 이미 나온 이벤트와 겹치지 않게: ${avoid.map((t) => (0, context_1.clip)(t, 24)).join(', ') || '(없음)'}`,
        '- emoji 1개, title 짧게, body 2문장 이내(플레이어가 고민할 상황), inv=관련 인물 h 0~2',
        '- choices 3개(id a·b·c, label 짧게, hint 예: "평판↑ 팔로워↓")',
    ].join('\n'));
}
// ───────────────────────── 남의 글 댓글(처음 열 때)
function commentsPrompt(ctx0, post, count, existing = []) {
    const ctx = withoutText(ctx0, post.text);
    const mine = post.authorId === 'me';
    const author = ctx.cast.find((c) => c.id === post.authorId);
    const pick = (0, context_1.pickCast)(ctx, { must: author ? [author.id] : [], text: post.text, full: 3, brief: 3, crowd: 6, seed: post.text, crowdFirst: ['fan', 'superfan', 'antifan', 'public'] });
    const who = mine ? '플레이어' : author ? `@${author.handle}(${author.name})` : '작성자';
    return join((0, context_1.castBlock)(pick, { descMax: 120 }), (0, context_1.memoryBlock)(ctx, 4), (0, context_1.nowLine)(ctx), `[${who}의 글] "${(0, context_1.clip)(post.text, 280)}"`, existing.length ? `[이미 달린 댓글 — 같은 말·같은 관점 반복 금지]\n${existing.slice(-12).map((t) => `- ${(0, context_1.clip)(t, 50)}`).join('\n')}` : '', mine ? (0, context_1.registerMap)(pick) : '', [
        `[할 일] 이 글에 달린 댓글 ${count}개 JSON(comments). 인플루언서(팔로워 10만↑·셀럽) 댓글이 있으면 그 댓글에 달리는 대댓글 2~3개를 더 쓰고 re에 그 아이디(전체 8개 이내), 없으면 re 없이`,
        `- ${mine ? '플레이어를 아는 인물·팬·안티·목록의 일반 유저' : '작성자와 아는 인물·팬·안티·목록의 일반 유저'} + 이름 없는 일반인(h "-")을 섞어서.${mine ? '' : ' 작성자 본인 h는 쓰지 않는다'}`,
        `- 시선을 다르게(공감·질문·농담·정보·딴지), 각 ${exports.LIMITS.reply}자 이내. ${mine ? '플레이어에게 하는 말, 인물마다 "플레이어에게" 등급 그대로' : '작성자에게 하는 말(플레이어 얘기 아님), 작성자와의 관계에 맞는 말투'}`,
    ].join('\n'));
}
// ───────────────────────── 첫 팔로워의 첫 쪽지
function firstDMPrompt(ctx, characterId) {
    const c = ctx.cast.find((x) => x.id === characterId);
    if (!c)
        return '';
    return join(`[쪽지 보낼 사람]\n${(0, context_1.fullEntry)({ ...c, recentDM: [] }, 200)}`, (0, context_1.recentBlock)(ctx, 3, 50), (0, context_1.nowLine)(ctx), [
        `[할 일] @${c.handle}(${c.name})이(가) 방금 플레이어의 새 계정을 팔로우하고 처음 보내는 쪽지 JSON`,
        `- messages: 1~2개, 말풍선처럼 짧게(각 ${exports.LIMITS.dm}자 이내). 둘의 관계·지금 상황에서 나올 첫마디로(인사말 틀·뻔한 축하 금지). 플레이어에게 ${(0, context_1.registerText)(c)}만(${REG_HINT[c.register] ?? REG_HINT.haeyo})`,
    ].join('\n'));
}
// ───────────────────────── 캐릭터 만들기
function draftPrompt(ctx, a) {
    const kind = (0, relationship_1.isRelationKind)(a.type) ? `${relationship_1.RELATION_LABEL[a.type]}(플레이어와의 관계)` : `${relationship_1.CROWD_LABEL[a.type]}(계정 분류)`;
    const per = relationship_1.PERSONALITY_PRESETS.find((p) => p.id === a.personality);
    const sp = relationship_1.SPEECH_PRESETS.find((p) => p.id === a.speechStyle);
    const org = ['news', 'magazine', 'broadcaster', 'sponsor'].includes(a.type);
    const rewrite = !!a.currentBio;
    return join(ctx ? (0, context_1.memoryBlock)(ctx, 3) : '', [
        `[${rewrite ? '자기소개 다시 쓰기' : '새 인물'}] 유형: ${kind} / ${a.gender === 'm' ? '남' : '여'} / ${a.ageGroup}대 / 팔로워 ${a.followers.toLocaleString('ko-KR')}`,
        `특징(사용자 입력, 최우선): ${(0, context_1.clip)(a.traits, 400) || '(없음 — 유형에 맞게)'}`,
        per ? `성격 유형: ${per.label}(${per.desc})` : '',
        sp ? `말투: ${sp.label}(${sp.desc})` : '',
        a.name ? `이름: ${a.name}(그대로 쓴다)` : ctx?.cast.length ? `이미 있는 인물(이름·아이디가 겹치거나 비슷하면 안 됨): ${ctx.cast.slice(0, 30).map((x) => x.name).join(', ')}` : '',
        a.handle ? `아이디: ${a.handle}(그대로 쓴다)` : '',
        rewrite ? `지금 소개: "${(0, context_1.clip)(a.currentBio, 80)}" — 이것과 다르게, 최근 일이 있으면 살짝 반영` : '',
    ]
        .filter(Boolean)
        .join('\n'), [
        '[할 일] JSON',
        `- name: ${a.name ? '주어진 이름 그대로' : org ? '이 세계에 어울리는 가상의 매체·브랜드 계정 이름(실존 단체 금지)' : '실제 한국 X 유저가 쓸 법한 표시 이름(실명형·닉네임·이모지 섞임). 실존 인물·연예인 이름 금지'}`,
        `- handle: ${a.handle ? '주어진 아이디 그대로' : '영문 소문자·숫자·밑줄 4~15자'}`,
        `- bio: 프로필 자기소개 ${exports.LIMITS.bio}자 이내. 짧고 담백하게 성격이 드러나게. 위치 정보는 넣지 않는다`,
        '- emoji: 프로필 이모지 1개',
        `- post: 이 사람이 처음 올리는 글 1개(${exports.LIMITS.post}자 이내, 이 사람 말투로, 가입 인사 틀 금지)`,
    ].join('\n'));
}
// ───────────────────────── 직접 만든 세계관의 등장인물
function castPrompt(world) {
    return `## 세계관: ${world.name}
${(0, context_1.clip)(world.setting, 1200)}
분위기: ${(0, context_1.clip)(world.tone, 300)}

## 할 일: 이 세계의 SNS 등장인물 8명을 만든다(전원 성인, 실존 인물 아님, 유명인·연예인 계정 만들지 않음)
- archetype을 골고루: bestie, rival, mentor, fan, crush, chaos, troll, news 각 1명
- name: 실제 한국 트위터 유저가 쓸 법한 표시 이름(실명형·닉네임+이모지 등), handle: 영문 소문자·숫자·밑줄 4~15자
- emoji 1개, bio(실제 트위터 자기소개처럼 짧게), description(핵심 특징만 1~2문장: 정체·성격·플레이어와의 관계. 말버릇·이모지·문장 규칙은 적지 않는다 — 말투는 관계에 따라 게임이 정한다)
- followers: 300 ~ 2000000, isNews(뉴스 계정만 true), verified`;
}
/** 클로드용: 답해야 할 JSON 모양(예시) */
exports.SHAPES = {
    react: '{"mood":"positive","replies":[{"h":"아이디","t":"답글"},{"h":"-","t":"일반인 답글"},{"h":"-","t":"인플루언서 답글에 다는 대댓글","re":"인플루언서아이디"}],"aff":[{"h":"아이디","d":6}],"rom":[],"dev":[],"quality":55,"viral":false,"followers":12,"aura":0,"humor":1,"rep":1,"news":[],"follow":[],"unfollow":[],"ideas":["다음 글 제안"]}',
    thread: '{"replies":[{"h":"아이디","t":"답글"}],"aff":[{"h":"아이디","d":4}],"rom":[],"dev":[],"rep":0}',
    dm: '{"mood":"neutral","messages":["답장1","답장2"],"affinityDelta":3,"romanceDelta":0,"devotionDelta":0,"leave":false,"sum":""}',
    ambient: '{"posts":[{"h":"아이디","t":"글","m":null}]}',
    tick: '{"posts":[{"h":"아이디","t":"글","m":null}],"news":["기사 제목"],"trends":[{"tag":"#태그","n":12000}],"event":{"emoji":"⚡","title":"제목","body":"상황 1~2문장","inv":["아이디"],"choices":[{"id":"a","label":"선택지","hint":"평판↑"},{"id":"b","label":"선택지","hint":"팔로워↑"},{"id":"c","label":"선택지","hint":"유머↑"}]},"dm":[{"h":"아이디","t":"쪽지"}],"mission":{"title":"제목","desc":"설명","kw":["단어"]},"ideas":["제안 글"],"bios":[]}',
    outcome: '{"text":"결과","posts":[{"h":"아이디","t":"글","c":[{"h":"-","t":"댓글"},{"h":"아이디","t":"댓글"}]}],"grade":1,"followers":40,"aura":2,"humor":0,"rep":3,"xp":10,"aff":[{"h":"아이디","d":12}],"rom":[],"dev":[]}',
    event: '{"emoji":"⚡","title":"제목","body":"상황 1~2문장","inv":["아이디"],"choices":[{"id":"a","label":"선택지","hint":"평판↑"},{"id":"b","label":"선택지","hint":"팔로워↑"},{"id":"c","label":"선택지","hint":"유머↑"}]}',
    comments: '{"comments":[{"h":"아이디","t":"댓글"},{"h":"-","t":"일반인 댓글"},{"h":"-","t":"인플루언서 댓글에 다는 대댓글","re":"인플루언서아이디"}]}',
    firstDM: '{"messages":["쪽지1","쪽지2"]}',
    draft: '{"name":"이름","handle":"handle_01","bio":"자기소개","emoji":"🙂","post":"첫 글"}',
    cast: '{"cast":[{"name":"이름","handle":"handle","emoji":"🙂","archetype":"bestie","bio":"소개","description":"핵심 특징 1~2문장","followers":1200,"isNews":false,"verified":false}]}',
};
