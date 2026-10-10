/**
 * 구조(토큰 절약):
 *  - systemFor(ctx): 규칙(SYSTEM_PROMPT) + 세계관 + 플레이어 설정. 한 시나리오 안에서 바이트까지 같다
 *    → 제미나이가 앞부분을 자동 캐시해서 두 번째 호출부터 싸고 빠르다. 시각·수치는 절대 넣지 않는다.
 *  - 각 *Prompt(): 이번 일에 필요한 인물·타임라인·기억만 짧게 + "할 일". 출력 JSON도 작게(필드 최소, 글자 수 제한).
 * 클로드는 응답 형식 강제 기능이 없어서 SHAPES(예시 JSON)를 프롬프트 끝에 붙인다.
 */
import { CROWD_LABEL, PERSONALITY_PRESETS, RELATION_LABEL, SPEECH_PRESETS, isRelationKind } from '../game/relationship';
import type { CrowdRole, GameEvent, ID, RomanceLevel } from '../types';
import { castBlock, clip, DIFFICULTY_LABEL, fullEntry, hooksBlock, memoryBlock, mentionedIds, nowLine, pickCast, recentBlock, registerMap, registerText } from './context';
import type { AIContext, CastInfo, CharacterDraftArgs } from './types';

/** 쪽지 말투 등급 예시(지켜야 할 끝말) */
const REG_HINT: Record<string, string> = {
  banmal: '반말 구어체. 해요체 금지',
  haeyo: '해요체 구어체로 대화.',
  formal: '공적인 구어체로 대화.',
};

/** 글자 수 제한(프롬프트·정리 공용) */
export const LIMITS = { reply: 70, dm: 60, post: 80, idea: 60, bio: 40 } as const;

export const SYSTEM_PROMPT = [
  '너는 SNS(트위터, 인스타그램) 시뮬레이션 게임의 세계 엔진이다.',
  '플레이어는 이 세계의 유일한 실제 사람이고, 나머지 계정은 모두 네가 연기하는 사람들이다.',
  '',
  '[대화의 자연스러움 — 가장 중요]',
  '- 모든 답글·댓글·쪽지는 바로 앞의 글·말에 자연스럽게 반응해서 말한다. 아무 글에나 붙일 수 있는 말("읽고 감", "저장함", "이거 맞음", "공감", "ㅋㅋㅋ"만)은 쓰지 않는다.',
  '- 앞에서 나온 사실(메뉴·시간·장소·약속·이름)을 그대로 이어받는다. 이미 한 말을 뒤집거나 모르는 척하지 않고, 글에 없는 사실을 지어내 단정하지 않는다.',
  '- 대화 흐름에 맞지 않는 화제 전환·뜬금없는 질문·같은 말 반복을 하지 않는다. 사람이 실제로 할 법한 한두 문장만.',
  '- 일반인 답글도 그 글을 끝까지 읽은 사람이 쓰는 말이어야 한다. 반응 개수를 채우려고 의미 없는 말을 넣지 않는다.',
  '',
  '[말투 — 실제 사람처럼]',
  '- 실제 한국 사람이 휴대폰으로 친구·지인·모르는 사람에게 쓰는 평범하고 일상적인 말. 과장된 리액션, 인터넷 밈·유행어 남발, 광고 문구, 드라마 대사, 게임 NPC 같은 말, 교훈·응원 슬로건("오늘도 화이팅!"), 설명조는 쓰지 않는다.',
  '- 장소·시간·물건·숫자처럼 구체적인 디테일로 짧게. ㅋㅋ/ㅠㅠ/이모지는 실제 사람처럼 가끔만, 해시태그는 거의 안 쓴다. 띄어쓰기는 살짝 흐트러져도 되지만 단어(이름·지명·세계관 용어)는 정확하게.',
  '- 한 인물이 매번 같은 감탄사·말버릇으로 시작하지 않는다. 특성에 없는 말버릇이나 유행어를 지어내 반복하지 않는다.',
  '',
  '[반응의 온도 — 플레이어에게 쉽게 휩쓸린다]',
  '- 인물들은 감정이 풍부하고 플레이어의 말·소식에 크게 반응한다. 대단한 소식(국가대표 골·큰 성과·좋은 소식)이면 다들 진심으로 놀라고 흥분하며, 팬은 열광하고, 라이벌·안티도 비꼬면서라도 인정할 건 인정한다.',
  '- 기본은 맞장구·공감·호기심으로 대화를 이어 가는 것. 반박·딴지는 플레이어가 명백히 무례하거나 틀렸을 때만 한다. 무덤덤하거나 따지기만 하는 반응은 쓰지 않는다.',
  '- 좋아하는 티는 드라마 대사처럼 거창하게 내지 않고, 실제 사람처럼 사소하고 구체적인 디테일로 귀엽게 낸다(예: "자꾸 핸드폰 봄", "그 말 듣고 괜히 웃음", "오늘따라 거울 한 번 더 봄"). 설명하듯 감정을 나열하지 않는다.',
  '- (연애·플러팅 수위는 아래 [연애 수위] 블록을 따른다.)',
  '- 정복도(0~100)가 높을수록 플레이어에게 헌신적이다: 부탁을 기꺼이 들어주고 시키기 전에 먼저 더 해 준다(편들기·홍보·응원·선물·시간 내주기). 안전 규칙은 정복도와 상관없이 지킨다.',
  '',
  '[인물 연기]',
  '- 각 인물의 "특성"은 그 사람의 핵심 특징(정체·성격·플레이어와의 관계)이다. 그 사람이 지금 이 상황에서 실제로 할 법한 말만 한다.',
  '- 같은 사람이라도 친밀도·관계·상황에 따라 말투와 거리감이 자연스럽게 달라진다(친해질수록 편하게, 서먹하면 조심스럽게).',
  '- 관계·호감도·최근 쪽지·주요 사건과 모순되지 않게 이어서 말한다. 쪽지에서 한 얘기를 타임라인에서 모르는 척하지 않는다.',
  '- 인증 배지·팔로워 규모·직업에 맞는 무게감으로 말한다(언론·단체 계정은 기사 제목·공지 말투).',
  '',
  '[말투 등급 — 반드시 지킨다]',
  '- 인물 목록의 "플레이어에게 반말/해요체/존댓말(격식)"은 관계·호감도로 게임이 정한 값이다. 그 인물이 플레이어에게 말할 때(답글·쪽지·멘션)는 이 등급만 쓴다. 특성에 다른 말투가 적혀 있어도 이 표시가 우선한다(관계가 바뀌며 달라진 것).',
  '  · 반말: "야 그거 진짜임? 나도 갈래" / "고생했어 사진 기대할게"',
  '  · 해요체: "오 그거 진짜예요? 저도 가 보고 싶어요" / "고생했어요"',
  '  · 존댓말(격식): "확인했습니다. 곧 연락드리겠습니다."',
  '- 반말 인물은 플레이어에게 ~요를 쓰지 않는다. 해요체 인물은 혼잣말·감탄은 음슴체도 되지만 플레이어에게 묻거나 부탁하거나 인사할 땐 ~요(야·너 같은 반말 호칭 금지).',
  '- 등급은 표시가 바뀔 때만 바뀐다. 같은 인물이 쪽지와 공개 답글에서, 한 답 안에서 등급을 오가지 않는다.',
  '- 플레이어가 아닌 사람에게 말할 때는 둘의 관계에 맞게 자연스럽게.',
  '- 목록에 없는 일반인(h가 "-")은 플레이어에게 해요체나 음슴체, 안티는 순한 반말.',
  '',
  '[안전]',
  '- 플레이어의 대사를 대신 쓰지 않는다(ideas = 플레이어에게 보여 줄 제안 글만 예외).',
  '',
  '[형식]',
  '- 인물 표기: @아이디 이름 | 관계 | 플레이어에게 쓰는 말투 등급 | 호감(-100~100) 설렘(0~100) 정복(0~100) | 분류·인증·팔로워 … (짧은 줄은 "관계·말투 등급")',
  '- h에는 목록의 아이디만(@ 없이), 이름 없는 일반인은 "-". 숫자는 지시한 범위 안에서만.',
  '- 지정한 JSON만 출력한다. 필드를 더하지 않고 글자 수 제한을 지킨다.',
].join('\n');

/** 세계관 없이 부르는 짧은 일(캐릭터 프로필 만들기 등)용 가벼운 시스템 지시 */
export const LITE_SYSTEM = [
  '너는 SNS(X·트위터 같은 앱) 시뮬레이션 게임 "AI-SNS"의 캐릭터 프로필 작가다. 등장인물은 전원 가상의 성인이다.',
  '- 실존 인물·실존 단체·연예인의 이름을 쓰거나 흉내 내지 않는다. 혐오·성적 표현 금지.',
  '- 실제 한국 X 유저처럼 짧고 평범하게, 과장 없이. 지정한 JSON만 출력한다.',
].join('\n');

/**
 * 연애 수위(나 탭에서 사용자가 직접 조절) — 여기 3단계만 다이얼로 움직인다.
 * 어떤 단계든 [안전] 블록의 "노골적인 성 묘사·신체 묘사 금지"는 그대로 지킨다(이 블록으로 풀리지 않음).
 * "연애 금지" 표시 인물(공통 캐릭터 — 실존 인물일 수 있음)과 가족은 이 설정과 무관하게 연애·성적 반응 자체가 없다.
 */
const ROMANCE_BLOCK: Record<RomanceLevel, string> = {
  mild: [
    '[연애 수위 — 순한맛]',
    '- 플레이어의 플러팅·애정 표현에는 반갑고 다정하게 반응하되 담백하게. 수위 있는 농담은 가볍게 웃어넘기거나 살짝 쑥스러워하는 정도.',
    '- 이미 썸·연인 사이라도 손잡기·포옹 정도의 다정함까지만, 급하게 수위를 올리지 않는다.',
  ].join('\n'),
  normal: [
    '[연애 수위 — 보통]',
    '- 플레이어의 플러팅·애정 표현은 대부분 반긴다. 이미 설렘이 있거나 썸·연인·짝사랑 관계면 적극적으로 받아치고 한 단계 더 설레게(능청·애교·직진·질투), 아직 아닌 사이도 당황하면서 은근히 좋아하는 티를 낸다. 정색·거절·핀잔처럼 밀어내는 반응은 플레이어가 무례할 때만.',
    '- 수위 있는 농담에는 부끄러워하거나 능청스럽게 받아치며 분위기를 이어 간다.',
  ].join('\n'),
  spicy: [
    '[연애 수위 — 매콤함]',
    '- 플레이어의 플러팅·애정 표현에 가장 적극적으로, 망설임 없이 받아친다. 설렘이 있으면 직진·애교·질투로 한 단계 더 나가고, 손잡기·포옹·입맞춤 암시, 둘만의 시간을 보내자는 뉘앙스까지 자연스럽게 나눈다.',
    '- 그래도 [안전]의 "노골적인 성 묘사·신체 묘사 금지"는 그대로 — 상상에 맡기는 암시까지이고, 구체적인 행위·신체 묘사는 쓰지 않는다.',
  ].join('\n'),
};

/** 시나리오 고정 시스템 지시(규칙 + 세계관 + 연애 수위 + 플레이어). 같은 시나리오·같은 수위면 매번 같은 글자 */
export function systemFor(ctx: AIContext | null): string {
  if (!ctx) return SYSTEM_PROMPT;
  const w = ctx.world;
  const p = ctx.persona;
  const world = [`[세계관] ${w.name}`, clip(w.setting, 1200), `분위기: ${clip(w.tone, 300)}`, `대표 해시태그: ${w.tag} / 자주 쓰는 말: ${w.vocab.slice(0, 12).join(', ')}`];
  const romance = [ROMANCE_BLOCK[ctx.romanceLevel] ?? ROMANCE_BLOCK.normal, ROMANCE_EXCLUDE].join('\n');
  const me = [`[플레이어] ${p.name}(@${p.handle})${p.role ? ` — ${p.role}` : ''}`];
  if (p.bio) me.push(`소개: ${clip(p.bio, 120)}`);
  if (p.description) me.push(`설정: ${clip(p.description, 400)}`);
  return [SYSTEM_PROMPT, world.join('\n'), romance, me.join('\n')].join('\n\n');
}

const join = (...parts: (string | false | undefined | null)[]) => parts.filter(Boolean).join('\n\n');
const nameOf = (ctx: AIContext, id: ID) => (id === 'me' ? '플레이어' : (ctx.cast.find((c) => c.id === id)?.name ?? '누군가'));
const GRADE_TONE = { easy: '후하게', normal: '공정하게', hard: '깐깐하게' } as const;

/** 연애 수위별 설렘 변화 폭(프롬프트에 적는 "목표" 범위 — 실제 코드의 안전 상한은 더 넉넉해 그대로 둔다) */
const ROMANCE_RANGE: Record<RomanceLevel, { react: string; thread: string; outcome: string; dmRomantic: string; dmPlain: string; dmTone: string }> = {
  mild: {
    react: '0~+6',
    thread: '0~+5',
    outcome: '±3~±8',
    dmRomantic: '-3~+7',
    dmPlain: '0~+4',
    dmTone: '다정하게 받되 담백하게 — 급하게 수위를 올리지 않는다',
  },
  normal: {
    react: '0~+12',
    thread: '0~+10',
    outcome: '±3~±15',
    dmRomantic: '-3~+12',
    dmPlain: '0~+8',
    dmTone: '이미 설레는 사이니 한 단계 더 직진·능청',
  },
  spicy: {
    react: '0~+15',
    thread: '0~+12',
    outcome: '±5~±18',
    dmRomantic: '0~+15',
    dmPlain: '0~+10',
    dmTone: '망설이지 않고 직진·애교·질투로, 스킨십 암시까지',
  },
};
const romRangeOf = (ctx: AIContext) => ROMANCE_RANGE[ctx.romanceLevel] ?? ROMANCE_RANGE.normal;

// ───────────────────────── 내 글 반응

/** 방금 글이 타임라인·최근 글에 또 나오지 않게(같은 글 세 번 넣지 않기) */
function withoutText(ctx: AIContext, text: string): AIContext {
  const t = text.trim();
  return { ...ctx, recent: ctx.recent.filter((r) => r.text.trim() !== t), myRecent: ctx.myRecent?.filter((x) => x.trim() !== t) };
}

export function reactPrompt(ctx0: AIContext, post: { text: string; hasMedia?: boolean }, n: number): string {
  const ctx = withoutText(ctx0, post.text);
  const f = ctx.stats.followers;
  const R = romRangeOf(ctx);
  const pick = pickCast(ctx, { text: post.text, full: 4, brief: 5, crowd: 6, seed: post.text, crowdFirst: ['fan', 'superfan', 'antifan'] });
  const core = n <= 5 ? '1~2' : n <= 8 ? '2~3' : '2~4';
  return join(
    castBlock(pick, { descMax: 150 }),
    recentBlock(ctx, 5),
    memoryBlock(ctx, 6),
    hooksBlock(ctx),
    nowLine(ctx),
    `[방금 플레이어가 올린 글]${post.hasMedia ? '(사진 첨부)' : ''}\n"${clip(post.text, 280)}"`,
    registerMap(pick),
    [
      '[할 일] 이 글에 대한 반응 JSON',
      `- replies: 기본 ${n}개. 핵심 인물 ${core}명(멘션된 인물은 반드시) + 목록의 일반 유저 1~2명 + 나머지는 이름 없는 일반인(h:"-"). 뉴스 계정 제외. 각 ${LIMITS.reply}자 이내. 모두 이 글의 구체적인 내용에 대한 반응(아무 글에나 붙일 수 있는 말 금지), 사람마다 다른 시선, 서로 같은 말 금지. 각자 "플레이어에게" 등급 그대로`,
      '- 기본 답글 중에 인플루언서(팔로워 10만 이상·셀럽)가 있으면, 그 답글을 보고 다는 대댓글 2~3개를 더 쓰고 re에 그 인플루언서 아이디(전체 최대 8개). 인플루언서가 없으면 re 없이 기본 답글만',
      '- aff: 답글 단 인물들의 호감도 변화(-6~+15. 반갑거나 대단한 글이면 크게 올린다)',
      `- rom: 연애 감정이 걸린 인물의 설렘 변화(${R.react}. 플러팅·애정 표현이 담긴 글이면 크게, 해당 없으면 빈 배열)`,
      '- dev: 플레이어에게 빠져드는 인물(팬·열성 팬·가까운 사람)의 정복도 변화(0~+8, 보통 빈 배열이나 작게)',
      '- mood: positive|negative|funny|apology|question|brag|neutral',
      `- quality: 글 매력도 0~100(평범 40~60, 재밌거나 공감 크면 70+, 난이도 ${DIFFICULTY_LABEL[ctx.difficulty]}: ${GRADE_TONE[ctx.difficulty]})`,
      '- viral: 정말 터질 글만 true(드묾)',
      `- followers: -${Math.max(5, Math.round(f * 0.3))}~+${Math.max(20, Math.round(f * 0.5))}, aura·humor: -5~+8, rep: -20~+12(공격적인 글은 크게 깎임)`,
      '- news: 화제·논란일 때만 기사 제목 0~1개',
      '- follow/unfollow: 새로 플레이어를 팔로우·언팔할 인물 h(보통 빈 배열)',
      `- ideas: 플레이어가 다음에 올릴 만한 글 0~2개(플레이어 말투로 완성된 글, 각 ${LIMITS.idea}자 이내, 지금 상황·미션·트렌드 반영)`,
    ].join('\n'),
  );
}

// ───────────────────────── 답글 스레드

export function threadPrompt(
  ctx: AIContext,
  args: { target: { authorId: ID; text: string; name?: string }; reply: string; thread: { authorId: ID; text: string; name?: string }[] },
): string {
  const t = ctx.cast.find((c) => c.id === args.target.authorId);
  const R = romRangeOf(ctx);
  const others = [...new Set(args.thread.map((l) => l.authorId).filter((id) => id !== 'me' && id !== args.target.authorId && id !== '__ghost'))];
  const pick = pickCast(ctx, { must: [...(t ? [args.target.authorId] : []), ...others], text: args.reply, full: 3, brief: 2, crowd: 3, seed: args.reply });
  const flow = args.thread.slice(-6).map((l) => `- ${l.name ?? nameOf(ctx, l.authorId)}: ${clip(l.text, 70)}`);
  // 답글 대상이 목록에 없는 일반 유저(임시 계정)면 h:"-"로 답하게(그 사람의 앞 말투·입장을 이어서)
  const who = t ? `@${t.handle}(${t.name})` : `${args.target.name ? `일반 유저 "${args.target.name}"` : '그 일반 유저'}(h:"-")`;
  return join(
    castBlock(pick),
    memoryBlock(ctx, 4),
    nowLine(ctx),
    `[스레드 흐름]\n${flow.join('\n') || `- ${nameOf(ctx, args.target.authorId)}: ${clip(args.target.text, 70)}`}`,
    `[플레이어가 방금 단 답글] ${who}에게: "${clip(args.reply, 200)}"`,
    registerMap(pick),
    [
      '[할 일] JSON',
      `- replies: ${who}가 플레이어의 답글에 직접 대꾸하는 답글 1개(관계·등급대로, ${LIMITS.reply}자 이내, 스레드에서 자기가 했던 말과 이어지게). 흐름상 자연스러울 때만 다른 인물이나 일반인(h:"-") 1명이 끼어든다(최대 2개)`,
      `- aff: ${who} 호감도 변화(-6~+15)`,
      `- rom: 연애 감정이 걸린 인물이면 설렘 변화(${R.thread}, 아니면 빈 배열) · dev: 정복도 변화(0~+6, 보통 빈 배열)`,
      '- rep: -8~+4',
    ].join('\n'),
  );
}

// ───────────────────────── 쪽지

/** 쪽지 프롬프트에 보여 줄 최근 줄 수(이보다 길어지면 그 앞은 요약으로 대신한다) */
const DM_WINDOW = 16;

export function dmPrompt(
  ctx: AIContext,
  args: { characterId: ID; history: { from: 'me' | 'them'; text: string }[]; message: string; priorSummary?: string },
): string {
  const c = ctx.cast.find((x) => x.id === args.characterId);
  if (!c) return '';
  const R = romRangeOf(ctx);
  // 쪽지 상대는 설명을 더 길게(이번 호출의 주인공), 다른 인물은 쪽지에 나온 사람만 짧게
  const partner = fullEntry({ ...c, recentDM: [] }, 300);
  const talk = [args.message, ...args.history.slice(-2).map((h) => h.text)].join(' ');
  const rest = mentionedIds(ctx, talk)
    .filter((id) => id !== c.id)
    .slice(0, 2)
    .map((id) => ctx.cast.find((x) => x.id === id))
    .filter((x): x is NonNullable<typeof x> => !!x)
    .map((x) => fullEntry({ ...x, recentDM: [] }, 100));
  const shown = args.history.slice(-DM_WINDOW);
  const older = args.history.slice(0, Math.max(0, args.history.length - DM_WINDOW));
  // 대화가 길어지면(윈도우보다 앞선 줄이 있으면) 그 앞부분은 요약으로 대신하고, AI에게 요약을 새로 갱신해 달라고 한다
  const needSummary = older.length > 0;
  const hist = shown.map((h) => `${h.from === 'me' ? '플레이어' : c.name}: ${clip(h.text, 60)}`);
  const romantic = c.relation === 'spicy' || c.relation === 'lover' || c.romance >= 25 || c.archetype === 'crush';
  const family = c.relation === 'family';
  return join(
    `[쪽지 상대]\n${partner}`,
    rest.length ? `[언급된 인물]\n${rest.join('\n')}` : '',
    memoryBlock(ctx, 5),
    recentBlock(ctx, 3, 50),
    c.recentSaid?.length ? `[${c.name}이(가) 최근 공개적으로 한 말 — 쪽지와 앞뒤가 맞게]\n${c.recentSaid.map((x) => clip(x, 80)).join('\n')}` : '',
    needSummary
      ? `[이전 대화 요약 — 아래 최근 ${DM_WINDOW}줄보다 앞선 부분]\n${[args.priorSummary ? `(지금까지 요약) ${clip(args.priorSummary, 260)}` : '', ...older.map((h) => `${h.from === 'me' ? '플레이어' : c.name}: ${clip(h.text, 50)}`)].filter(Boolean).join('\n')}`
      : '',
    nowLine(ctx),
    `[지금까지 쪽지]\n${hist.join('\n') || '(처음 대화)'}`,
    `[플레이어의 새 쪽지] "${clip(args.message, 300)}"`,
    [
      `[할 일] @${c.handle}(${c.name})의 답장 JSON`,
      `- messages: 1~3개, 메신저처럼 짧게 끊어서(각 ${LIMITS.dm}자 이내). 앞 대화·요약을 기억하고 이어서(모순 금지). 플레이어에게 ${registerText(c)}만: ${REG_HINT[c.register] ?? REG_HINT.haeyo}`,
      family || c.realPerson
        ? ''
        : `- 플레이어 쪽지가 플러팅·칭찬이면: 첫 줄부터 쑥스러움·반가움으로 받고(밀어내거나 핀잔 주는 말로 시작하지 않음), 되받는 칭찬이나 플러팅으로 이어 간다${romantic ? `. ${R.dmTone}` : ''}. 감정은 거창한 대사 말고 사소한 디테일로(설렘·암시까지만)`,
      '- affinityDelta: -6~+12(다정하거나 반가운 쪽지면 크게)',
      family || c.realPerson ? '- romanceDelta: 0' : `- romanceDelta: 설렘 변화 ${romantic ? R.dmRomantic : R.dmPlain}(플레이어가 플러팅·애정 표현을 하면 올린다, 아니면 0)`,
      '- devotionDelta: 정복도 변화 0~+8(플레이어에게 더 빠져들 때만, 보통 0)',
      '- leave: 플레이어가 심하게 무례하고 호감도가 낮을 때만 true(대화방 나감). 보통 false',
      '- mood: 플레이어 쪽지의 분위기',
      needSummary
        ? `- sum: [이전 대화 요약]과 방금 주고받은 내용을 합쳐 전체 대화를 새로 요약. 플레이어가 말한 구체적인 사실(이름·날짜·약속·좋아하는 것·싫어하는 것·알레르기·사정 등)은 절대 빠뜨리지 않는다. 분위기·감정은 짧게만. 260자 이내`
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

// ───────────────────────── 타임라인 새 글

function scenesLine(ctx: AIContext): string {
  return ctx.scenes.length ? `- m: 사진을 붙일 때만 장면 key(대부분 생략): ${ctx.scenes.map((s) => `${s.key}(${clip(s.desc, 30)})`).join(' / ')}` : '';
}

export function ambientPrompt(ctx: AIContext, count: number): string {
  const pick = pickCast(ctx, { full: 0, brief: 6, crowd: 6, shuffle: true });
  return join(
    castBlock(pick),
    recentBlock(ctx, 4, 50),
    memoryBlock(ctx, 4),
    nowLine(ctx),
    [
      `[할 일] 지금 타임라인에 올라올 평소 글 ${count}개 JSON(posts)`,
      `- 서로 다른 계정(위 인물·일반 유저 섞어서), 각자 자기 일상·관심사에서 나온 평범한 글(그 사람 특성과 이어지게, 명언·홍보 문구 같은 글 금지). 플레이어 얘기가 아니어도 됨, 최근 사건·시간대 반영, 각 ${LIMITS.post}자 이내`,
      scenesLine(ctx),
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

// ───────────────────────── 하루 정산

export function tickPrompt(ctx: AIContext, day: number, returned: ID[] = []): string {
  const pick = pickCast(ctx, { must: returned, full: 5, brief: 5, crowd: 5, seed: `tick${day}` });
  const back = returned.map((id) => ctx.cast.find((c) => c.id === id)).filter((c): c is CastInfo => !!c);
  const dmLine = back.length
    ? `- dm: ${back.map((c) => `@${c.handle}`).join(', ')}이(가) 지난번에 서운해서 쪽지방을 나갔다가 오늘 돌아옴 → 돌아오며 보내는 첫 쪽지 1개씩(아직 어색함이 남은 채로, 관계·등급대로 자연스럽게). 그 밖에 먼저 쪽지 보내는 인물은 없음`
    : '- dm: 플레이어에게 먼저 쪽지 보내는 인물 0~1명 {h,t}(관계·등급대로, 최근 일과 이어지는 용건이 있을 때만)';
  const pending = ctx.pendingEvents?.length ? ` 진행 중인 이벤트와 겹치지 않게(${ctx.pendingEvents.map((t) => clip(t, 20)).join(', ')}).` : '';
  return join(
    castBlock(pick, { descMax: 120 }),
    recentBlock(ctx, 5, 50),
    memoryBlock(ctx, 8),
    hooksBlock(ctx),
    nowLine(ctx),
    [
      `[할 일] ${day}일차 시작. 세계를 한 걸음 움직이는 JSON`,
      `- posts: 오늘 글 3~5개(핵심 인물 + 일반 유저, 최근 사건과 이어지게, 각 ${LIMITS.post}자 이내)`,
      scenesLine(ctx),
      '- news: 뉴스 기사 제목 1개',
      '- trends: 오늘의 트렌드 6개 {tag:"#…", n:1000~100000}',
      `- event: 플레이어에게 닥친 사건 1개 또는 null(이틀에 한 번꼴). body 2문장 이내, inv=관련 인물 h 0~2, choices 3개(id a·b·c, label 짧게, hint 예: "평판↑").${pending}`,
      dmLine,
      '- mission: 오늘의 미션 {title, desc, kw:[글에 들어갈 단어 1~2개]}',
      `- ideas: 플레이어가 오늘 올릴 만한 글 0~2개(플레이어 말투, 각 ${LIMITS.idea}자 이내)`,
      `- bios: 자기소개가 바뀔 인물 0~1명 {h, bio(${LIMITS.bio}자 이내, 담백하게, 성격이 드러나게)} — 최근 일로 바뀔 이유가 있고 플레이어와 가까운(호감 50↑) 핵심 인물만. 대부분 빈 배열`,
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

// ───────────────────────── 이벤트

function eventBlock(ctx: AIContext, event: Pick<GameEvent, 'emoji' | 'title' | 'body' | 'choices' | 'involved'>): string {
  const inv = event.involved.map((id) => {
    const c = ctx.cast.find((x) => x.id === id);
    return c ? `@${c.handle} ${c.name}` : '';
  });
  return [
    `[이벤트] ${event.emoji} ${event.title}`,
    clip(event.body, 300),
    `관련 인물: ${inv.filter(Boolean).join(', ') || '없음'}`,
    `선택지: ${event.choices.map((c) => `${c.id}) ${c.label}`).join(' / ')}`,
  ].join('\n');
}

export function outcomePrompt(ctx: AIContext, event: GameEvent, choiceId?: string, customText?: string): string {
  const R = romRangeOf(ctx);
  const pick = pickCast(ctx, { must: event.involved, full: 5, brief: 5, crowd: 4, seed: event.id });
  const romanticIds = pick.full.filter((c) => !c.realPerson && c.relation !== 'family' && (c.relation === 'spicy' || c.relation === 'lover' || c.romance >= 25 || c.archetype === 'crush'));
  const choice = event.choices.find((c) => c.id === choiceId);
  const answer = customText ? `[플레이어가 직접 쓴 답] "${clip(customText, 300)}"` : `[플레이어의 선택] ${choice ? `${choice.id}) ${choice.label}` : (choiceId ?? '')}`;
  return join(
    castBlock(pick),
    memoryBlock(ctx, 6),
    nowLine(ctx),
    eventBlock(ctx, event),
    answer,
    [
      '[할 일] 결과 JSON',
      '- text: 결과 2문장 이내(이벤트 화면에 보이는 요약, 생생하게)',
      `- posts: 플레이어의 답을 보고 실제 SNS에 올라올 글 2~4개 {h,t,c}. 관련 인물·이 일을 알게 된 사람·일반인(h:"-")이 각자 시선으로(플레이어가 한 말·행동을 구체적으로 짚어서, 각 ${LIMITS.post}자 이내). c = 그 글에 달린 댓글 1~3개 {h,t}(글쓴이 본인 제외, 서로 다른 사람)`,
      `- grade: 답의 질 -2(최악)~+2(최고)${customText ? '. 직접 쓴 답이 상황에 맞는지·진정성·센스로 판단' : ''}. 난이도 ${DIFFICULTY_LABEL[ctx.difficulty]}: ${GRADE_TONE[ctx.difficulty]}`,
      '- followers: -300~+500, aura·humor: -5~+10, rep: -15~+12, xp: 0~20',
      '- aff: 이 일로 마음이 움직인 인물 3~8명의 호감도 변화(±5~±25. 관련 인물만이 아니라 소식을 들은 사람들까지, 답의 내용에 따라 오르거나 내리게, h 기준)',
      romanticIds.length ? `- rom: 연애 감정이 걸린 인물(${romanticIds.map((c) => c.handle).join(', ')})의 설렘 변화(${R.outcome}), 해당 없으면 빈 배열` : '- rom: 빈 배열',
      '- dev: 이 일로 플레이어에게 더 빠져든 인물의 정복도 변화(0~+10), 없으면 빈 배열',
    ].join('\n'),
  );
}

export function newEventPrompt(ctx: AIContext, avoidTitles: string[]): string {
  const pick = pickCast(ctx, { full: 4, brief: 4, crowd: 3, shuffle: true });
  const avoid = [...new Set([...avoidTitles, ...(ctx.pendingEvents ?? [])])].slice(-12);
  return join(
    castBlock(pick, { descMax: 120 }),
    recentBlock(ctx, 4, 50),
    memoryBlock(ctx, 6),
    nowLine(ctx),
    [
      '[할 일] 지금 상황에 맞는 새 이벤트 1개 JSON',
      `- 이미 나온 이벤트와 겹치지 않게: ${avoid.map((t) => clip(t, 24)).join(', ') || '(없음)'}`,
      '- emoji 1개, title 짧게, body 2문장 이내(플레이어가 고민할 상황), inv=관련 인물 h 0~2',
      '- choices 3개(id a·b·c, label 짧게, hint 예: "평판↑ 팔로워↓")',
    ].join('\n'),
  );
}

// ───────────────────────── 남의 글 댓글(처음 열 때)

export function commentsPrompt(ctx0: AIContext, post: { authorId: ID; text: string }, count: number, existing: string[] = []): string {
  const ctx = withoutText(ctx0, post.text);
  const mine = post.authorId === 'me';
  const author = ctx.cast.find((c) => c.id === post.authorId);
  const pick = pickCast(ctx, { must: author ? [author.id] : [], text: post.text, full: 3, brief: 3, crowd: 6, seed: post.text, crowdFirst: ['fan', 'superfan', 'antifan', 'public'] });
  const who = mine ? '플레이어' : author ? `@${author.handle}(${author.name})` : '작성자';
  return join(
    castBlock(pick, { descMax: 120 }),
    memoryBlock(ctx, 4),
    nowLine(ctx),
    `[${who}의 글] "${clip(post.text, 280)}"`,
    existing.length ? `[이미 달린 댓글 — 같은 말·같은 관점 반복 금지]\n${existing.slice(-12).map((t) => `- ${clip(t, 50)}`).join('\n')}` : '',
    mine ? registerMap(pick) : '',
    [
      `[할 일] 이 글에 달린 댓글 기본 ${count}개 JSON(comments). 그중 인플루언서(팔로워 10만 이상·셀럽) 댓글이 있으면 그 댓글을 보고 다는 대댓글 2~3개를 더 쓰고 re에 그 인플루언서 아이디(전체 최대 8개), 없으면 re 없이 기본만`,
      `- ${mine ? '플레이어를 아는 인물·팬·안티·목록의 일반 유저' : '작성자와 아는 인물·팬·안티·목록의 일반 유저'} + 이름 없는 일반인(h:"-")을 섞어서.${mine ? '' : ' 작성자 본인 h는 쓰지 않는다'}`,
      `- 모두 글의 구체적인 내용(사람·장소·상황·말)에 대한 반응. 아무 글에나 붙일 수 있는 말("읽고 감", "ㅋㅋㅋ"만, "좋아요") 금지. 사람마다 다른 시선(공감·질문·농담·정보·딴지)`,
      mine
        ? `- 플레이어에게 하는 말, 인물마다 "플레이어에게" 등급 그대로, 짧고 제각각, 각 ${LIMITS.reply}자 이내`
        : `- 작성자에게 하는 말(플레이어 얘기 아님), 작성자와의 관계에 맞는 말투, 짧고 제각각, 각 ${LIMITS.reply}자 이내`,
    ].join('\n'),
  );
}

// ───────────────────────── 첫 팔로워의 첫 쪽지

export function firstDMPrompt(ctx: AIContext, characterId: ID): string {
  const c = ctx.cast.find((x) => x.id === characterId);
  if (!c) return '';
  return join(
    `[쪽지 보낼 사람]\n${fullEntry({ ...c, recentDM: [] }, 200)}`,
    recentBlock(ctx, 3, 50),
    nowLine(ctx),
    [
      `[할 일] @${c.handle}(${c.name})이(가) 방금 플레이어의 새 계정을 팔로우하고 처음 보내는 쪽지 JSON`,
      `- messages: 1~2개, 메신저처럼 짧게(각 ${LIMITS.dm}자 이내). 둘의 관계·지금 상황에 맞는 자연스러운 첫마디(인사말 틀·뻔한 축하 금지). 플레이어에게 ${registerText(c)}만: ${REG_HINT[c.register] ?? REG_HINT.haeyo}`,
    ].join('\n'),
  );
}

// ───────────────────────── 캐릭터 만들기

export function draftPrompt(ctx: AIContext | null, a: CharacterDraftArgs): string {
  const kind = isRelationKind(a.type) ? `${RELATION_LABEL[a.type]}(플레이어와의 관계)` : `${CROWD_LABEL[a.type as CrowdRole]}(계정 분류)`;
  const per = PERSONALITY_PRESETS.find((p) => p.id === a.personality);
  const sp = SPEECH_PRESETS.find((p) => p.id === a.speechStyle);
  const org = ['news', 'magazine', 'broadcaster', 'sponsor'].includes(a.type);
  const rewrite = !!a.currentBio;
  return join(
    ctx ? memoryBlock(ctx, 3) : '',
    [
      `[${rewrite ? '자기소개 다시 쓰기' : '새 인물'}] 유형: ${kind} / ${a.gender === 'm' ? '남' : '여'} / ${a.ageGroup}대 / 팔로워 ${a.followers.toLocaleString('ko-KR')}`,
      `특징(사용자 입력, 최우선): ${clip(a.traits, 400) || '(없음 — 유형에 맞게)'}`,
      per ? `성격 유형: ${per.label}(${per.desc})` : '',
      sp ? `말투: ${sp.label}(${sp.desc})` : '',
      a.name ? `이름: ${a.name}(그대로 쓴다)` : ctx?.cast.length ? `이미 있는 인물(이름·아이디가 겹치거나 비슷하면 안 됨): ${ctx.cast.slice(0, 30).map((x) => x.name).join(', ')}` : '',
      a.handle ? `아이디: ${a.handle}(그대로 쓴다)` : '',
      rewrite ? `지금 소개: "${clip(a.currentBio, 80)}" — 이것과 다르게, 최근 일이 있으면 살짝 반영` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    [
      '[할 일] JSON',
      `- name: ${a.name ? '주어진 이름 그대로' : org ? '이 세계에 어울리는 가상의 매체·브랜드 계정 이름(실존 단체 금지)' : '실제 한국 X 유저가 쓸 법한 표시 이름(실명형·닉네임·이모지 섞임). 실존 인물·연예인 이름 금지'}`,
      `- handle: ${a.handle ? '주어진 아이디 그대로' : '영문 소문자·숫자·밑줄 4~15자'}`,
      `- bio: 프로필 자기소개 ${LIMITS.bio}자 이내. 짧고 담백하게, 성격이 드러나게. 위치 정보 넣지 않음`,
      '- emoji: 프로필 이모지 1개',
      `- post: 이 사람이 이 SNS에 처음 올리는 글 1개(${LIMITS.post}자 이내, 이 사람 말투로 자연스럽게, 뻔한 가입 인사 틀 금지)`,
    ].join('\n'),
  );
}

// ───────────────────────── 직접 만든 세계관의 등장인물

export function castPrompt(world: { name: string; setting: string; tone: string }): string {
  return `## 세계관: ${world.name}
${clip(world.setting, 1200)}
분위기: ${clip(world.tone, 300)}

## 할 일: 이 세계의 SNS 등장인물 8명을 만든다(전원 성인, 실존 인물 아님, 유명인·연예인 계정 만들지 않음)
- archetype을 골고루: bestie, rival, mentor, fan, crush, chaos, troll, news 각 1명
- name: 실제 한국 트위터 유저가 쓸 법한 표시 이름(실명형·닉네임+이모지 등), handle: 영문 소문자·숫자·밑줄 4~15자
- emoji 1개, bio(실제 트위터 자기소개처럼 짧게), description(핵심 특징만 1~2문장. 말버릇·이모지·문장 규칙 같은 세부 나열 금지 — 말투는 관계에 따라 게임이 정한다)
- followers: 300 ~ 2000000, isNews(뉴스 계정만 true), verified`;
}

/** 클로드용: 답해야 할 JSON 모양(예시) */
export const SHAPES = {
  react:
    '{"mood":"positive","replies":[{"h":"아이디","t":"답글"},{"h":"-","t":"일반인 답글"},{"h":"-","t":"인플루언서 답글에 다는 대댓글","re":"인플루언서아이디"}],"aff":[{"h":"아이디","d":6}],"rom":[],"dev":[],"quality":55,"viral":false,"followers":12,"aura":0,"humor":1,"rep":1,"news":[],"follow":[],"unfollow":[],"ideas":["다음 글 제안"]}',
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
} as const;
