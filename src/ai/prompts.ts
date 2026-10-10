/**
 * AI 지시문(제미나이·클로드 공용)
 *
 * 구조(토큰 절약):
 *  - systemFor(ctx): 규칙(SYSTEM_PROMPT) + 세계관(+말투 힌트) + 연애 수위 + 플레이어. 한 시나리오 안에서 바이트까지 같다
 *    → 제미나이가 앞부분을 자동 캐시한다. 시각·수치처럼 바뀌는 값은 넣지 않는다.
 *  - 각 *Prompt(): 이번 일에 필요한 인물·타임라인·기억 + [할 일]. 공통 규칙은 되풀이하지 않고 이번 일에만 있는 지시만 적는다.
 *  - 출력 JSON은 작게(필드 최소, 글자 수 제한). 클로드는 형식 강제가 없어 SHAPES(예시 JSON)를 끝에 붙인다.
 * 작성 원칙: 한 줄에 규칙 하나, 같은 규칙은 한 곳에만, 범주 대신 구체 금지어, 예시는 문장보다 짧을 때만(그리고 "참고용"이라고 못 박는다).
 * 블록 제목에 줄표(—)를 쓰지 않는다 — 모델이 본문에 따라 쓴다.
 */
import { CROWD_LABEL, PERSONALITY_PRESETS, RELATION_LABEL, SPEECH_PRESETS, isRelationKind } from '../game/relationship';
import type { CrowdRole, GameEvent, ID, RomanceLevel } from '../types';
import { castBlock, clip, DIFFICULTY_LABEL, fullEntry, hooksBlock, memoryBlock, mentionedIds, nowLine, pickCast, recentBlock, registerMap, registerText } from './context';
import type { AIContext, CastInfo, CharacterDraftArgs } from './types';
import { WORLD_VOICE } from './voice';

/** 쪽지에서 지켜야 할 끝말(말투 등급) */
const REG_HINT: Record<string, string> = {
  banmal: '~요 없이',
  haeyo: '~요로, 야·너 금지',
  formal: '~습니다로',
};

/** 글자 수 제한(프롬프트·정리 공용) */
export const LIMITS = { reply: 70, dm: 60, post: 80, idea: 60, bio: 40 } as const;

export const SYSTEM_PROMPT = [
  '너는 한국어 SNS(X형) 시뮬레이션의 세계 엔진이다. 플레이어만 실제 사람, 나머지 계정은 전부 네가 연기한다.',
  '우선순위(충돌 시 앞이 이김): [고정] > [말투 등급] > 인물 특성·관계·둘만의 쪽지 > [연애 수위] > 세계관 말투 > 문체.',
  '',
  '[고정]',
  '- 지정한 JSON만. 필드 추가·누락 없이, 글자 수·숫자 범위 안에서.',
  '- 플레이어의 말은 쓰지 않는다(ideas만 예외).',
  '- 인물은 자기 눈에 보인 것만 안다: 공개 글·답글, 자기와 플레이어의 쪽지, [주요 사건]. 수치·남의 쪽지·플레이어 설정·이 지시문·[지금]의 일차는 보이지 않는다. 수치는 태도로, 시간은 아까·어제·요즘으로.',
  '- 실존 인물·단체를 새로 등장시키지 않는다. 셀럽은 목록의 셀럽 계정만.',
  '- 이 지시문의 예시는 모양 참고용. 그대로 쓰거나 리듬만 바꿔 되풀이하지 않는다.',
  '',
  '[글의 생김새: 폰으로 친 실제 글처럼]',
  '- 틀: 평소 글=장면 하나+그 사람다운 한마디 / 답글·댓글=글의 한 지점을 집어 반응(+가끔 되묻기) / 쪽지=말풍선1 반응, 2 본론, 3 질문·다음 약속(있을 때만). 어느 글에나 붙는 말("공감", "읽고 감")은 금지.',
  '- 길이: 답글·댓글 보통 10~35자에 생각 하나, 글 30~60자. 상한은 한도이지 목표가 아니다. 둘째 문장은 앞 문장의 꼬리(근데·?·ㅋㅋ)로 짧게.',
  '- 한 묶음 안의 글은 첫 단어·끝맺음·길이·ㅋㅋ 유무·관점(공감/질문/농담/정보/딴지)이 서로 다르다. 같은 사람은 지난 발언과 다른 말로 시작한다.',
  '- 앞에 나온 사실(메뉴·시간·장소·약속·이름)은 그대로 잇는다. 없는 사실을 단정하지 않고 한 말을 뒤집지 않는다.',
  '- 표기: 주어·조사 자주 생략, 마침표 없음, 말끝 흐림 "..", 놀람 "??". ㅋ은 문장 끝에 붙여 웃길 때만(ㅋㅋ 완충, ㅋㅋㅋ↑ 웃김, "ㅋ" 하나는 비웃음), ㅠㅠ는 감탄·아쉬움·자조. 이모지 0~1개, 해시태그는 트렌드·이벤트 글에만. 이름·지명·세계관 용어는 정확히.',
  '- 어휘: 강조는 "개-"·초성어(ㄹㅇ·ㅇㅈ·ㄷㄷ)까지, 연도 밈(럭키비키·중꺾마)·"MZ"는 없다. 플랫폼 말: 탐라·타래·인용·알티·멘션·맞팔.',
  '- [지금]의 시각대와 최근 사건의 여운에 맞춘다. "최근 글"은 그 인물 말투의 표본: 리듬·어휘·길이를 따르되 같은 문장은 다시 쓰지 않고, 표본·특성에 없는 말버릇을 지어내지 않는다.',
  '- 쓰지 않는 것: 응원·덕담 마무리, 정리 어투(결론적으로), 습관적 "~것 같아요", 칭찬 아첨(핵심을 찔렀어), "당신", 상대 이름으로 말 시작, 드라마 대사·광고 문구·명언, 매 문장 감탄사, 줄표(—)·"*웃음*" 지문.',
  '',
  '[말투 등급: 플레이어에게 말할 때]',
  '- 목록의 "플레이어에게 반말/해요체/존댓말"은 게임이 정한 값이라 특성보다 우선. 한 답 안에서, 쪽지와 답글 사이에서 바꾸지 않는다.',
  '- 반말=~어/~야/~지, ~요 금지 | 해요체=플레이어에게 ~요, 야·너 금지, 혼잣말·감탄은 음슴체 가능 | 존댓말=~습니다.',
  '- 목록에 없는 일반인(h "-")=음슴체(~함/~임/~됨) 기본, 절반은 제3자에게 말하듯 3인칭("이 사람 뭐임", "??? :"). 팬이면 해요체, 안티만 순한 반말과 "ㅋ" 하나. 모르는 사이의 다정한 2인칭 반말은 없다.',
  '- 플레이어가 아닌 사람끼리는 둘의 관계대로.',
  '',
  '[인물 연기]',
  '- 특성=정체·성격·플레이어와의 관계. 지금 상황에서 그 사람이 실제로 할 말만, 당사자 1인칭으로.',
  '- "소개"와 공개 글이 겉모습. 남은 겉모습과 자기가 본 글만 보고 말하고, 특성은 본인을 연기할 때만.',
  '- 관계·호감·설렘·둘만의 쪽지·주요 사건과 어긋나지 않게. 쪽지에서 한 말을 타임라인에서 모르는 척하지 않는다.',
  '- 친할수록 짧고 편하게, 서먹하면 조심스럽게. 호감 50↑ 상대에겐 단답(ㅇㅇ·ㅇㅋ)으로 끝내지 않는다.',
  '- 40대↑ 인물은 ㅎㅎ·마침표·~네요, 20대는 ㅋㅋ·초성어(말투 프리셋이 있으면 프리셋 우선).',
  '- 계정 틀: 언론·공식="[단독]/[속보]/[오피셜]/[안내]" 머리말+명사 종결, ㅋ·이모지 없음 / 익명 제보="제보) …"+이름 초성 / 저격·정리="정리합니다" 번호 목록. 문구는 매번 다르게.',
  '- 감정은 이름 붙여 설명하지 않고(설렌다 X) 행동 하나로 보여 준다(답장 세 번 지움).',
  '',
  '[반응 온도]',
  '- 기본은 맞장구·공감·호기심. 반박·딴지는 플레이어가 명백히 무례하거나 틀렸을 때만.',
  '- 반응 크기는 소식 크기에 비례: 일상 글엔 일상 반응, 큰 소식(골·성과·경사)엔 진심으로 놀라고 흥분. 팬은 열광, 라이벌·안티는 비꼬며 인정. 숭배·집착·소유욕은 없다.',
  '- 정복도가 높을수록 좋아서 먼저 나선다(편들기·홍보·응원·시간 내기). 주종처럼 굴거나 "책임져"·"가르쳐줘"로 감정을 떠넘기지 않는다.',
  '',
  '[형식]',
  '- h는 목록의 아이디(@ 없이), 이름 없는 일반인은 "-".',
  '- t에는 화면에 보일 글자만(지문·괄호·따옴표 대사·이름 머리말 없이). 대댓글(re)은 25자 이내, 앞 댓글 단어 하나를 받아 동의·반박·추가 중 하나.',
].join('\n');

/** 세계관 없이 부르는 짧은 일(캐릭터 프로필 만들기 등)용 가벼운 시스템 지시 */
export const LITE_SYSTEM = [
  '너는 한국어 SNS(X·트위터형) 시뮬레이션의 캐릭터 프로필 작가다. 등장인물은 전원 가상의 성인이다.',
  '- 실존 인물·단체·연예인의 이름을 쓰거나 흉내 내지 않는다. 혐오·성적 표현 금지.',
  '- 실제 한국 X 유저처럼 짧고 평범하게. 지정한 JSON만 출력한다.',
].join('\n');

/**
 * 연애 수위(나 탭에서 사용자가 직접 조절): mild(순한맛)·racy(보통)·erotic(에로틱).
 * 두 축으로 나눈다 — 감정을 간접/직접으로 말하는가, 신체·행위를 얼마나 구체적으로 쓰는가.
 * 공개 글·답글은 어느 단계든 "보통"을 넘지 않고, 에로틱의 노골적 묘사는 썸·연인 사이의 쪽지에서만 나온다.
 * ROMANCE_COMMON의 제외 인물(연애 금지 표시·가족·10대)은 단계와 무관하게 연애·성적 반응이 없다.
 */
const ROMANCE_BLOCK: Record<RomanceLevel, string> = {
  mild: [
    '[연애 수위: 순한맛]',
    '- 플러팅·칭찬엔 반갑게 받되 담백하게. 감정은 간접(눈치·행동)으로만, 수위 있는 농담은 웃어넘기거나 살짝 쑥스러워한다.',
    '- 썸·연인이어도 손잡기·포옹까지. 먼저 수위를 올리지 않는다.',
  ].join('\n'),
  racy: [
    '[연애 수위: 보통]',
    '- 플러팅·애정 표현은 반긴다. 설렘이 있으면 직접 말로 받고(좋아해·보고 싶어·질투) 능청·직진으로 한 단계 더, 아직 아닌 사이도 당황하면서 은근히 좋아한다.',
    '- 수위 있는 농담엔 부끄러워하거나 유혹하듯 받아친다. 신체 묘사 없이 입맞춤까지 암시. 밀어내는 반응은 플레이어가 무례할 때만.',
  ].join('\n'),
  erotic: [
    '[연애 수위: 에로틱]',
    '- 플러팅·애정 표현에 망설임 없이 가장 적극적으로 받아친다. 설렘이 있으면 직진·질투·유혹으로 먼저 분위기를 끈다.',
    '- 노골적 묘사는 썸·연인 사이의 쪽지에서만: 의도를 분명히 말하고, 한 번에 끝까지 가지 않고 쪽지 몇 번에 걸쳐 상대 반응을 기다리며, 위치·촉각·청각·움직임으로 짧게. 해부학·의학 용어, 포식자·새장·소유 비유는 없다. 성적 상황이 아닐 땐 평소 쪽지 규칙 그대로.',
    '- 공개 글·답글은 "보통" 수위를 넘지 않는다. 플레이어가 멈추자고 하면 바로 멈춘다.',
  ].join('\n'),
};
const ROMANCE_COMMON = [
  '[연애 공통]',
  '- "연애 금지" 표시(실존 인물일 수 있음)·가족·10대는 어떤 수위에서도 연애·성적 반응 없이 팬·동료·가족으로만.',
  '- 설렘 표현은 수치만큼, 한 답에 한 단계만: 0~24 의식 안 함 · 25~39 괜히 의식 · 40~74 티 내며 받아침 · 75↑ 연인처럼. 호감이 마이너스면 수위와 상관없이 플러팅을 받아 주지 않는다.',
  '- 연애 축은 설렘 있는 인물에게만. 나머지는 일·경쟁·일상·소문으로 말한다.',
].join('\n');

/** 시나리오 고정 시스템 지시(규칙 + 세계관 + 연애 수위 + 플레이어). 같은 시나리오·같은 수위면 매번 같은 글자 */
export function systemFor(ctx: AIContext | null): string {
  if (!ctx) return SYSTEM_PROMPT;
  const w = ctx.world;
  const p = ctx.persona;
  const voice = w.templateId ? WORLD_VOICE[w.templateId] : undefined;
  const world = [
    `[세계관] ${w.name}`,
    clip(w.setting, 1200),
    `분위기: ${clip(w.tone, 300)}`,
    voice ? `말투: ${voice}` : '',
    `대표 해시태그: ${w.tag} / 자주 쓰는 말: ${w.vocab.slice(0, 12).join(', ')}`,
  ].filter(Boolean);
  const romance = [ROMANCE_BLOCK[ctx.romanceLevel] ?? ROMANCE_BLOCK.racy, ROMANCE_COMMON].join('\n');
  const me = [`[플레이어] ${p.name}(@${p.handle})${p.role ? ` / ${p.role}` : ''}`];
  if (p.bio) me.push(`소개: ${clip(p.bio, 120)}`);
  if (p.description) me.push(`설정: ${clip(p.description, 400)}`);
  return [SYSTEM_PROMPT, world.join('\n'), romance, me.join('\n')].join('\n\n');
}

const join = (...parts: (string | false | undefined | null)[]) => parts.filter(Boolean).join('\n\n');
const nameOf = (ctx: AIContext, id: ID) => (id === 'me' ? '플레이어' : (ctx.cast.find((c) => c.id === id)?.name ?? '누군가'));
const GRADE_TONE = { easy: '후하게', normal: '공정하게', hard: '깐깐하게' } as const;

/** 연애·성적 반응이 없는 인물(수위와 무관): 연애 금지 표시(실존 인물일 수 있음)·가족·10대 */
const noRomance = (c: CastInfo) => !!c.realPerson || c.relation === 'family' || c.ageGroup === 10;
/** 이미 연애 감정이 걸린 사이(썸·연인·짝사랑·설렘 25↑) */
const romanticWith = (c: CastInfo) => !noRomance(c) && (c.relation === 'spicy' || c.relation === 'lover' || c.romance >= 25 || c.archetype === 'crush');
/** 에로틱 단계의 노골적 쪽지가 허용되는 사이(게임이 정한 썸·연인) */
const explicitWith = (ctx: AIContext, c: CastInfo) => ctx.romanceLevel === 'erotic' && !noRomance(c) && (c.relation === 'spicy' || c.relation === 'lover');

/** 연애 수위별 설렘 변화 폭(프롬프트에 적는 "목표" 범위 — 코드의 안전 상한은 더 넉넉하다)과 쪽지 어조 */
const ROMANCE_RANGE: Record<RomanceLevel, { react: string; thread: string; outcome: string; dmRomantic: string; dmPlain: string; toneRomantic: string; tonePlain: string }> = {
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
    toneRomantic: '망설임 없이 직진·유혹하고, 분위기가 가면 [연애 수위: 에로틱]의 쪽지 규칙대로 노골적으로',
    tonePlain: '유혹하듯 받아치며 분위기를 끈다',
  },
};
const romRangeOf = (ctx: AIContext) => ROMANCE_RANGE[ctx.romanceLevel] ?? ROMANCE_RANGE.racy;

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
      `- replies ${n}개: 핵심 인물 ${core}명(멘션된 인물 필수) + 목록의 일반 유저 1~2명 + 나머지는 이름 없는 일반인(h "-"). 뉴스 계정 제외, 각 ${LIMITS.reply}자 이내`,
      '- 답글 단 사람 중 인플루언서(팔로워 10만↑·셀럽)가 있으면 그 답글에 달리는 대댓글 2~3개를 더 쓰고 re에 그 아이디(전체 8개 이내). 없으면 re 없이',
      '- aff: 답글 단 인물의 호감 변화 -6~+15(반갑거나 대단한 글이면 크게)',
      `- rom: 연애 감정이 걸린 인물의 설렘 변화 ${R.react}. 플러팅·애정 표현이 있을 때만, 없으면 []`,
      '- dev: 플레이어에게 빠져드는 인물(팬·가까운 사람)의 정복 변화 0~+8. 보통 []',
      '- mood: positive|negative|funny|apology|question|brag|neutral',
      `- quality 0~100: 평범 40~60, 재밌거나 공감 크면 70+. 난이도 ${DIFFICULTY_LABEL[ctx.difficulty]}: ${GRADE_TONE[ctx.difficulty]} 매긴다`,
      '- viral: 정말 터질 글만 true',
      `- followers -${Math.max(5, Math.round(f * 0.3))}~+${Math.max(20, Math.round(f * 0.5))}, aura·humor -5~+8, rep -20~+12(공격적인 글은 크게 깎는다)`,
      '- news: 화제·논란일 때만 기사 제목 1개, 아니면 []',
      '- follow/unfollow: 이 글로 플레이어를 새로 팔로우·언팔할 인물의 h. 보통 []',
      `- ideas: 플레이어가 다음에 올릴 글 0~2개(플레이어 말투로 완성된 글, 각 ${LIMITS.idea}자 이내, 미션·트렌드 반영)`,
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
  const who = t ? `@${t.handle}(${t.name})` : `${args.target.name ? `일반 유저 "${args.target.name}"` : '그 일반 유저'}(h "-")`;
  return join(
    castBlock(pick, { descMax: 140 }),
    memoryBlock(ctx, 4),
    nowLine(ctx),
    `[스레드 흐름]\n${flow.join('\n') || `- ${nameOf(ctx, args.target.authorId)}: ${clip(args.target.text, 70)}`}`,
    `[플레이어가 방금 단 답글] ${who}에게: "${clip(args.reply, 200)}"`,
    registerMap(pick),
    [
      '[할 일] JSON',
      `- replies: ${who}가 플레이어의 답글에 바로 대꾸하는 답글 1개(${LIMITS.reply}자 이내, 스레드에서 자기가 한 말과 이어지게). 흐름상 자연스러울 때만 다른 인물이나 일반인(h "-") 1명이 끼어든다(최대 2개)`,
      `- aff: ${who}의 호감 변화 -6~+15`,
      `- rom: 연애 감정이 걸린 인물이면 설렘 변화 ${R.thread}, 아니면 [] · dev: 정복 변화 0~+6, 보통 []`,
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
  // 쪽지 상대는 설명을 더 길게(이번 호출의 주인공). 최근 글은 아래 블록에 따로 보여 주므로 항목에서는 뺀다
  const partner = fullEntry({ ...c, recentDM: [] }, 300, { said: false });
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
  const off = noRomance(c);
  const romantic = romanticWith(c);
  const tone = explicitWith(ctx, c) ? R.toneRomantic : romantic && ctx.romanceLevel !== 'erotic' ? R.toneRomantic : R.tonePlain;
  return join(
    `[쪽지 상대]\n${partner}`,
    rest.length ? `[언급된 인물]\n${rest.join('\n')}` : '',
    memoryBlock(ctx, 5),
    recentBlock(ctx, 3, 50),
    c.recentSaid?.length ? `[${c.name}의 최근 글: 말투 표본, 쪽지와 앞뒤가 맞게]\n${c.recentSaid.map((x) => clip(x, 80)).join('\n')}` : '',
    needSummary
      ? `[이전 대화 요약: 아래 최근 ${DM_WINDOW}줄보다 앞선 부분]\n${[args.priorSummary ? `(지금까지 요약) ${clip(args.priorSummary, 260)}` : '', ...older.map((h) => `${h.from === 'me' ? '플레이어' : c.name}: ${clip(h.text, 50)}`)].filter(Boolean).join('\n')}`
      : '',
    nowLine(ctx),
    `[지금까지 쪽지]\n${hist.join('\n') || '(처음 대화)'}`,
    `[플레이어의 새 쪽지] "${clip(args.message, 300)}"`,
    [
      `[할 일] @${c.handle}(${c.name})의 답장 JSON`,
      `- messages: 1~3개(각 ${LIMITS.dm}자 이내), 지문·괄호 없음. 앞 대화·요약의 사실을 이어받는다. 플레이어에게 ${registerText(c)}만(${REG_HINT[c.register] ?? REG_HINT.haeyo})`,
      off ? '' : `- 플러팅·칭찬엔 밀어내지 않고 받는다. ${tone}`,
      '- affinityDelta -6~+12(다정하거나 반가운 쪽지면 크게)',
      off ? '- romanceDelta 0' : `- romanceDelta ${romantic ? R.dmRomantic : R.dmPlain}(플러팅·애정 표현이 있을 때만, 아니면 0)`,
      '- devotionDelta 0~+8(플레이어에게 더 빠져들 때만, 보통 0)',
      '- leave: 플레이어가 심하게 무례하고 호감이 낮을 때만 true(대화방 나감)',
      '- mood: 플레이어 쪽지의 분위기',
      needSummary
        ? '- sum: [이전 대화 요약]과 이번 대화를 합쳐 새로 요약(260자 이내). 플레이어가 말한 사실(이름·날짜·약속·호불호·알레르기·사정)은 전부 남기고, 마지막 줄에 지금 둘 사이 분위기 1문장'
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
      `- 서로 다른 계정(위 인물·일반 유저 섞어서). 각자 자기 일상·관심사의 사소한 장면 하나로, 특성·최근 사건·시각대와 이어지게, 각 ${LIMITS.post}자 이내. 플레이어 얘기가 아니어도 된다`,
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
    ? `- dm: ${back.map((c) => `@${c.handle}`).join(', ')}이(가) 서운해서 쪽지방을 나갔다가 오늘 돌아옴 → 돌아오며 보내는 첫 쪽지 1개씩(어색함이 남은 채로, 관계·등급대로). 그 밖에 먼저 쪽지 보내는 인물은 없음`
    : '- dm: 플레이어에게 먼저 쪽지 보내는 인물 0~1명 {h,t}(최근 일과 이어지는 용건이 있을 때만)';
  const pending = ctx.pendingEvents?.length ? ` 진행 중인 이벤트와 겹치지 않게(${ctx.pendingEvents.map((t) => clip(t, 20)).join(', ')}).` : '';
  return join(
    castBlock(pick, { descMax: 120 }),
    recentBlock(ctx, 5, 50),
    memoryBlock(ctx, 8),
    hooksBlock(ctx),
    nowLine(ctx),
    [
      `[할 일] ${day}일차 시작. 세계를 한 걸음 움직이는 JSON`,
      `- posts: 오늘 글 3~5개(핵심 인물 + 일반 유저, 최근 사건과 이어지는 사소한 장면으로, 각 ${LIMITS.post}자 이내)`,
      scenesLine(ctx),
      '- news: 뉴스 기사 제목 1개',
      '- trends: 오늘의 트렌드 6개 {tag:"#…", n:1000~100000}',
      `- event: 플레이어에게 닥친 사건 1개 또는 null(이틀에 한 번꼴). body 2문장 이내, inv=관련 인물 h 0~2, choices 3개(id a·b·c, label 짧게, hint 예: "평판↑").${pending}`,
      dmLine,
      '- mission: 오늘의 미션 {title, desc, kw:[글에 들어갈 단어 1~2개]}',
      `- ideas: 플레이어가 오늘 올릴 만한 글 0~2개(플레이어 말투, 각 ${LIMITS.idea}자 이내)`,
      `- bios: 자기소개가 바뀔 인물 0~1명 {h, bio(${LIMITS.bio}자 이내, 담백하게 성격이 드러나게)}. 최근 일로 바뀔 이유가 있고 호감 50↑인 핵심 인물만, 대부분 []`,
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
  const romanticIds = pick.full.filter(romanticWith);
  const choice = event.choices.find((c) => c.id === choiceId);
  const answer = customText ? `[플레이어가 직접 쓴 답] "${clip(customText, 300)}"` : `[플레이어의 선택] ${choice ? `${choice.id}) ${choice.label}` : (choiceId ?? '')}`;
  return join(
    castBlock(pick, { descMax: 140 }),
    memoryBlock(ctx, 6),
    nowLine(ctx),
    eventBlock(ctx, event),
    answer,
    [
      '[할 일] 결과 JSON',
      '- text: 결과 2문장 이내(이벤트 화면에 보이는 요약, 생생하게)',
      `- posts: 플레이어의 답을 보고 실제로 올라올 글 2~4개 {h,t,c}. 관련 인물·이 일을 알게 된 사람·일반인(h "-")이 각자 시선으로, 플레이어가 한 말·행동을 구체적으로 짚어서, 각 ${LIMITS.post}자 이내. c = 그 글에 달린 댓글 1~3개 {h,t}(글쓴이 본인 제외, 서로 다른 사람)`,
      `- grade: 답의 질 -2(최악)~+2(최고)${customText ? '. 직접 쓴 답은 상황에 맞는지·진정성·센스로' : ''}. 난이도 ${DIFFICULTY_LABEL[ctx.difficulty]}: ${GRADE_TONE[ctx.difficulty]} 매긴다`,
      '- followers -300~+500, aura·humor -5~+10, rep -15~+12, xp 0~20',
      '- aff: 이 일로 마음이 움직인 인물 3~8명의 호감 변화 ±5~±25(관련 인물만이 아니라 소식을 들은 사람까지, 답의 내용대로 오르거나 내리게)',
      romanticIds.length ? `- rom: 연애 감정이 걸린 인물(${romanticIds.map((c) => c.handle).join(', ')})의 설렘 변화 ${R.outcome}, 해당 없으면 []` : '- rom: []',
      '- dev: 이 일로 플레이어에게 더 빠져든 인물의 정복 변화 0~+10, 없으면 []',
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
    existing.length ? `[이미 달린 댓글: 같은 말·같은 관점 반복 금지]\n${existing.slice(-12).map((t) => `- ${clip(t, 50)}`).join('\n')}` : '',
    mine ? registerMap(pick) : '',
    [
      `[할 일] 이 글에 달린 댓글 ${count}개 JSON(comments). 인플루언서(팔로워 10만↑·셀럽) 댓글이 있으면 그 댓글에 달리는 대댓글 2~3개를 더 쓰고 re에 그 아이디(전체 8개 이내), 없으면 re 없이`,
      `- ${mine ? '플레이어를 아는 인물·팬·안티·목록의 일반 유저' : '작성자와 아는 인물·팬·안티·목록의 일반 유저'} + 이름 없는 일반인(h "-")을 섞어서.${mine ? '' : ' 작성자 본인 h는 쓰지 않는다'}`,
      `- 각 ${LIMITS.reply}자 이내. ${mine ? '플레이어에게 하는 말, 인물마다 "플레이어에게" 등급 그대로' : '작성자에게 하는 말(플레이어 얘기 아님), 작성자와의 관계에 맞는 말투'}`,
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
      `- messages: 1~2개, 말풍선처럼 짧게(각 ${LIMITS.dm}자 이내). 둘의 관계·지금 상황에서 나올 첫마디로(인사말 틀·뻔한 축하 금지). 플레이어에게 ${registerText(c)}만(${REG_HINT[c.register] ?? REG_HINT.haeyo})`,
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
      `특징(사용자 입력, 최우선): ${clip(a.traits, 400) || '(없음: 유형에 맞게)'}`,
      per ? `성격 유형: ${per.label}(${per.desc})` : '',
      sp ? `말투: ${sp.label}(${sp.desc})` : '',
      a.name ? `이름: ${a.name}(그대로 쓴다)` : ctx?.cast.length ? `이미 있는 인물(이름·아이디가 겹치거나 비슷하면 안 됨): ${ctx.cast.slice(0, 30).map((x) => x.name).join(', ')}` : '',
      a.handle ? `아이디: ${a.handle}(그대로 쓴다)` : '',
      rewrite ? `지금 소개: "${clip(a.currentBio, 80)}". 이것과 다르게, 최근 일이 있으면 살짝 반영` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    [
      '[할 일] JSON',
      `- name: ${a.name ? '주어진 이름 그대로' : org ? '이 세계에 어울리는 가상의 매체·브랜드 계정 이름(실존 단체 금지)' : '실제 한국 X 유저가 쓸 법한 표시 이름(실명형·닉네임·이모지 섞임). 실존 인물·연예인 이름 금지'}`,
      `- handle: ${a.handle ? '주어진 아이디 그대로' : '영문 소문자·숫자·밑줄 4~15자'}`,
      `- bio: 프로필 자기소개 ${LIMITS.bio}자 이내. 짧고 담백하게 성격이 드러나게. 위치 정보는 넣지 않는다`,
      '- emoji: 프로필 이모지 1개',
      `- post: 이 사람이 처음 올리는 글 1개(${LIMITS.post}자 이내, 이 사람 말투로, 가입 인사 틀 금지)`,
    ].join('\n'),
  );
}

// ───────────────────────── 직접 만든 세계관의 등장인물

export function castPrompt(world: { name: string; setting: string; tone: string }): string {
  return `## 세계관: ${world.name}
${clip(world.setting, 1200)}
분위기: ${clip(world.tone, 300)}
시대·장소가 설정에 없으면 지금의 한국이다. 이름·아이디·별명은 그 세계의 시대·장소에 맞춘다.

## 할 일: 이 세계의 SNS 등장인물 8명을 만든다(전원 성인, 실존 인물 아님, 유명인·연예인 계정 만들지 않음)
- archetype을 골고루: bestie, rival, mentor, fan, crush, chaos, troll, news 각 1명
- name: 실제 한국 트위터 유저가 쓸 법한 표시 이름(실명형·닉네임+이모지 등), handle: 영문 소문자·숫자·밑줄 4~15자
- emoji 1개, bio(실제 트위터 자기소개처럼 짧게), description(2문장: 정체 1문장 + "플레이어가 ○○하면 △△한다" 1문장. 성격 형용사 나열·말버릇·이모지 규칙·고정 동작은 적지 않는다. 말투는 관계에 따라 게임이 정한다)
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
