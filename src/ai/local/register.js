"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasBanmalAddress = hasBanmalAddress;
exports.textRegister = textRegister;
exports.toRegister = toRegister;
exports.registerHint = registerHint;
exports.peerRegisterHint = peerRegisterHint;
/** 문장 끝 꾸밈(ㅋㅋ·ㅠㅠ·이모지·부호·공백) */
const TAIL = /(?:[\sㅋㅎㅠㅜㄷ.!?~…,;:'"’”)\]\u2600-\u27BF\uFE0F\u200D]|[\uD800-\uDBFF][\uDC00-\uDFFF])*$/;
/** '요'로 끝나도 존댓말이 아닌 단어 */
const YO_NOUNS = ['필요', '중요', '수요', '소요', '강요', '월요', '화요', '목요', '금요', '토요', '일요', '동요', '요요', '주요', '노요'];
/** 상대를 반말로 부르는 말 */
const BANMAL_ADDRESS = /(^|[\s,])(야|얌마|너|니가|네가|너도|너는|넌|너를|널|너랑|너한테|너밖에|니|너네|니네)($|[\s,!?.~ㅋㅎ…])/;
/** 상대를 반말로 부르는 말(야·너·니가 …)이 있는지 */
function hasBanmalAddress(text) {
    return BANMAL_ADDRESS.test(text);
}
function splitTail(text) {
    const m = text.match(TAIL);
    const tail = m ? m[0] : '';
    return [text.slice(0, text.length - tail.length), tail];
}
/** 문장 단위로 자르기(부호 뒤, 또는 ㅋㅋ·ㅠㅠ 뒤 공백에서) */
function clauses(text) {
    const out = [];
    let cur = '';
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const next = text[i + 1] ?? '';
        cur += ch;
        const endPunct = /[.!?…~\n]/.test(ch) && !/[.!?…~]/.test(next);
        const endLaugh = /[ㅋㅎㅠㅜ]/.test(ch) && /[ㅋㅎㅠㅜ]/.test(text[i - 1] ?? '') && next === ' ';
        if (endPunct || endLaugh) {
            if (cur.trim())
                out.push(cur.trim());
            cur = '';
        }
    }
    if (cur.trim())
        out.push(cur.trim());
    return out;
}
function endingOf(clause) {
    return splitTail(clause)[0].trim();
}
function isYoEnding(core) {
    if (!/[요죠]$/.test(core))
        return false;
    return !YO_NOUNS.some((n) => core.endsWith(n));
}
const BANMAL_END = /(어|아|야|여|워|와|해|돼|줘|봐|래|게|지|냐|니|자|라|마|거든|잖아|걸|데|대|까|네|다고|냐고|자고|라고|그치)$/;
/** 한 문장(끝말)의 말투 */
function clauseRegister(clause) {
    const core = endingOf(clause);
    if (!core)
        return 'neutral';
    if (/(니다|[습입합됩십]니까|십시오)$/.test(core))
        return 'formal';
    if (isYoEnding(core))
        return 'haeyo';
    // 감탄사 한마디("네?"·"어…"·"응")는 말투 없음 — '~요'를 붙이면 "네요?"·"어요…"가 된다
    if (/^(네|넵|넹|어|아|응|웅|오|와|헐|엥|음|흠|에|예|앗|엇|어머)$/.test(core))
        return 'neutral';
    // 음슴체·명사·혼잣말 감탄(~다, ~구나, ~군)·조사로 끝난 말(~까지, ~어떻게)은 중립
    if (/(함|임|음|듯|중|각|다|구나|군|라니|까지|가지|어떻게|이렇게|그렇게|ㅇㅈ|ㄹㅇ|ㄱㄱ|ㄴㄴ|ㅇㅋ)$/.test(core))
        return 'neutral';
    if (/[가-힣]$/.test(core) && BANMAL_END.test(core))
        return 'banmal';
    return 'neutral';
}
/** 문장 중간에 있어도 거의 항상 반말 끝말인 단어 */
const STRONG_BANMAL = /^(뭐야|뭐냐|진짜야|그치|맞지|알지|봤지|있지|했지|미쳤어|대박이야|어때|어땠어|했어|됐어|있어|없어|맞아|그래|알았어|괜찮아|고마워|미안해|미안|좋겠다)$/;
/** 띄어쓰기 단위(끝 꾸밈 제거) */
function words(text) {
    return text
        .split(/\s+/)
        .map((w) => splitTail(w)[0])
        .filter(Boolean);
}
/** 글 전체의 말투(존댓말·해요체 끝말이 있으면 그쪽, 반말 끝말·반말 호칭이 있으면 반말) */
function textRegister(text) {
    const regs = clauses(text).map(clauseRegister);
    const ws = words(text);
    // 부호 없이 이어 쓴 문장 안쪽의 '~요'·'~니다'도 잡는다
    const innerYo = ws.slice(0, -1).some((w) => isYoEnding(w));
    const innerFormal = ws.slice(0, -1).some((w) => /니다$/.test(w));
    const innerBanmal = ws.slice(0, -1).some((w) => STRONG_BANMAL.test(w) || /냐$/.test(w));
    if ((regs.includes('formal') || innerFormal) && !regs.includes('banmal'))
        return 'formal';
    if (regs.includes('banmal') || innerBanmal || BANMAL_ADDRESS.test(text))
        return 'banmal';
    if (regs.includes('haeyo') || innerYo)
        return 'haeyo';
    return 'neutral';
}
// ───────────────────────── 끝말 바꾸기
const SAFE_STEM = '(잖아|거든|는데|던데|은데|데|대|걸|게|지|네|까|래|어|아|여|워|와|해|돼|줘|봐|군)';
/** 반말 끝말 → 해요체(안전한 것만). 못 바꾸면 null */
function clauseToHaeyo(clause) {
    if (clauseRegister(clause) !== 'banmal')
        return clause;
    const [body, tail] = splitTail(clause);
    const core = body.trimEnd();
    const rules = [
        [/이야$/, '이에요'],
        [/(뭐|나|거|누구|어디|언제|왜|이거|그거|저거|진짜|최고|대박)야$/, '$1예요'],
        [/그치$/, '그쵸'],
        [/(다고|냐고|자고|라고)$/, '$1요'],
        // 같이 하자는 말(~자) 중 흔한 것만
        [/(^|\s)가자$/, '$1가요'],
        [/하자$/, '해요'],
        [/(^|\s)보자$/, '$1봐요'],
        [/먹자$/, '먹어요'],
        [/놀자$/, '놀아요'],
        [/만나자$/, '만나요'],
        [/마시자$/, '마셔요'],
        [/찍자$/, '찍어요'],
        [/쉬자$/, '쉬어요'],
        [/돌자$/, '돌아요'],
        [new RegExp(`${SAFE_STEM}$`), '$1요'],
    ];
    for (const [re, to] of rules) {
        // '~지요'는 '~죠'로 줄이되, '~는지/~은지/~을지'(간접 질문)는 '~는지요' 그대로
        if (re.test(core))
            return core.replace(re, to).replace(/([^는은던을일])지요$/, '$1죠') + tail;
    }
    return null; // ~냐, ~니, ~자, ~라 같은 끝말은 바꾸지 않는다
}
/** 해요체 끝말 → 반말(안전한 것만). 못 바꾸면 null */
function clauseToBanmal(clause) {
    if (clauseRegister(clause) !== 'haeyo')
        return clause;
    const [body, tail] = splitTail(clause);
    const core = body.trimEnd();
    const rules = [
        [/(감사해요|고마워요)$/, '고마워'],
        [/이에요$/, '이야'],
        [/예요$/, '야'],
        [/힘내세요$/, '힘내'],
        [/하세요$/, '해'],
        [/주세요$/, '줘'],
        [/보세요$/, '봐'],
        [/오세요$/, '와'],
        [/드세요$/, '먹어'],
        [/계세요$/, '있어'],
        [/죠$/, '지'],
        [new RegExp(`${SAFE_STEM}요$`), '$1'],
        // 그 밖의 '~요'(이겨요·가져요·거요 …)는 '요'만 떼면 반말. 단 '~세요'(높임 명령·질문)는 바꾸지 않는다
        [/([가-힣])요$/, '$1'],
    ];
    if (/세요$/.test(core) && !/(힘내|하|주|보|오|드|계)세요$/.test(core))
        return null;
    for (const [re, to] of rules) {
        if (re.test(core))
            return core.replace(re, to) + tail;
    }
    return null;
}
/** 반말 호칭 → 해요체 호칭({me}님) */
const ME_HONOR = [
    [/(^|\s)(니가|네가)(?=\s|$)/g, '$1{me}님이'],
    [/(^|\s)(너는|넌)(?=\s|$)/g, '$1{me}님은'],
    [/(^|\s)(너를|널)(?=\s|$)/g, '$1{me}님을'],
    [/(^|\s)너한테(?=\s|$)/g, '$1{me}님한테'],
    [/(^|\s)너랑(?=\s|$)/g, '$1{me}님이랑'],
    [/(^|\s)너도(?=\s|$)/g, '$1{me}님도'],
    [/(^|\s)너밖에(?=\s|$)/g, '$1{me}님밖에'],
    [/(^|\s)너(?=\s|$)/g, '$1{me}님'],
];
/** 해요체 1인칭·호칭 → 반말 */
const ME_PLAIN = [
    [/(^|\s)저도(?=\s|$)/g, '$1나도'],
    [/(^|\s)저는(?=\s|$)/g, '$1나는'],
    [/(^|\s)제가(?=\s|$)/g, '$1내가'],
    [/(^|\s)저랑(?=\s|$)/g, '$1나랑'],
    [/(^|\s)저한테(?=\s|$)/g, '$1나한테'],
    [/(^|\s)저희(?=\s|$)/g, '$1우리'],
    [/(^|\s)제(?=\s)/g, '$1내'],
    [/\{me\}님/g, '{me}'],
];
/** 반말 1인칭 → 해요체 1인칭(반말 문장을 해요체로 바꿀 때만) */
const ME_POLITE = [
    [/(^|\s)내가(?=\s|$)/g, '$1제가'],
    [/(^|\s)나도(?=\s|$)/g, '$1저도'],
    [/(^|\s)(나는|난)(?=\s|$)/g, '$1저는'],
    [/(^|\s)나랑(?=\s|$)/g, '$1저랑'],
    [/(^|\s)나한테(?=\s|$)/g, '$1저한테'],
    [/(^|\s)내(?=\s)/g, '$1제'],
];
function honorAddress(text, politeSelf = false) {
    let out = text.replace(/(^|[\s,])(야|얌마)(\s+|,\s*)/, '$1').trim();
    for (const [re, to] of ME_HONOR)
        out = out.replace(re, to);
    if (politeSelf)
        for (const [re, to] of ME_POLITE)
            out = out.replace(re, to);
    if (BANMAL_ADDRESS.test(out))
        return null;
    return out || null;
}
function plainAddress(text) {
    let out = text;
    for (const [re, to] of ME_PLAIN)
        out = out.replace(re, to);
    return out;
}
/**
 * 문장을 원하는 말투로(안전하게 바꿀 수 있을 때만). 못 바꾸면 null.
 * formal(존댓말)은 바꾸지 않는다 — 이미 격식체이거나 기사 제목([속보] …)만 통과.
 */
function toRegister(text, reg) {
    const cur = textRegister(text);
    if (reg === 'formal')
        return cur === 'formal' || (cur === 'neutral' && /^\s*\[/.test(text)) ? text : null;
    if (reg === 'haeyo') {
        if (cur === 'haeyo' || cur === 'formal')
            return honorAddress(text);
        // 문장 끝이 아닌 곳의 강한 반말(뭐야·했어·~냐·~마라 …)은 안전하게 못 바꾼다
        if (words(text).slice(0, -1).some((w) => STRONG_BANMAL.test(w) || /(냐|마라|해라|줘라|와라|가라|봐라|어라|아라)$/.test(w)))
            return null;
        const conv = clauses(text).map(clauseToHaeyo);
        if (conv.some((c) => c === null))
            return null;
        return honorAddress(conv.join(' '), cur === 'banmal');
    }
    // banmal
    if (cur === 'formal')
        return null;
    // 띄어쓰기 단위로 '~요' 끝말을 반말로(문장 안쪽 포함 — 반말·해요체가 섞인 글도 고친다)
    const parts = text.split(/(\s+)/);
    for (let i = 0; i < parts.length; i++) {
        const w = parts[i];
        if (!w.trim())
            continue;
        const core = splitTail(w)[0];
        if (!core)
            continue;
        const r = clauseRegister(w);
        if (r === 'formal')
            return null;
        if (r !== 'haeyo')
            continue;
        const c = clauseToBanmal(w);
        if (c === null)
            return null;
        parts[i] = c;
    }
    return plainAddress(parts.join(''));
}
// ───────────────────────── 성격 설명 속 말투 힌트
/**
 * 성격 설명에서 "플레이어에게 쓰는 말투" 힌트(없거나 애매하면 null).
 * 기존 세계관 인물의 첫 말투를 정할 때 참고용(관계가 바뀌면 게임 규칙이 다시 정한다).
 *   "말투: 플레이어에게 100% 반말" → banmal / "플레이어에게는 늘 존댓말(~요)" → haeyo
 */
function registerHint(desc) {
    const t = (desc ?? '').replace(/\s+/g, ' ');
    const toPlayer = t.match(/플레이어(?:에게|한테)(?:는)?[^.]{0,25}?(?:100% |완전 |늘 |항상 )?(반말|존댓말|존대|해요체|합쇼체|평어)/);
    const general = t.match(/말투:\s*[^,.]{0,14}?(?:완전 |100% )?(반말|존댓말|해요체|합쇼체)/);
    const word = toPlayer?.[1] ?? general?.[1];
    if (!word)
        return null;
    if (word === '반말' || word === '평어')
        return 'banmal';
    if (word === '합쇼체')
        return 'formal';
    return 'haeyo';
}
/**
 * 사용자가 직접 쓴 특징에서 말투를 짐작(명시 표현이 없을 때만) — 동기·동갑·소꿉친구처럼 또래 관계면 반말.
 * 시드 캐릭터에는 쓰지 않는다(세계관 설정을 바꾸지 않게). 직접 만든 인물·첫 팔로워에만.
 */
function peerRegisterHint(traits) {
    const t = (traits ?? '').replace(/\s+/g, ' ');
    if (registerHint(t))
        return registerHint(t);
    if (/(입사|대학|학교|과|반|군대|동네)?\s?동기|동갑|소꿉친구|불알친구|십년지기|오랜 친구|절친/.test(t))
        return 'banmal';
    return null;
}
