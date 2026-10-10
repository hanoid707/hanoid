"use strict";
/** 공용 유틸: ID 생성, 난수, 숫자 표시 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.uid = uid;
exports.rand = rand;
exports.pick = pick;
exports.sample = sample;
exports.clamp = clamp;
exports.formatCount = formatCount;
exports.fill = fill;
exports.hashStr = hashStr;
exports.viewsOf = viewsOf;
exports.sleep = sleep;
exports.cutText = cutText;
exports.wellFormed = wellFormed;
exports.safeJson = safeJson;
exports.snippet = snippet;
exports.sanitizeHandle = sanitizeHandle;
let counter = 0;
function uid(prefix = 'id') {
    counter = (counter + 1) % 1000000;
    return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
/** 배열에서 n개를 중복 없이 고른다 */
function sample(arr, n) {
    const copy = [...arr];
    const out = [];
    while (copy.length && out.length < n) {
        out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    }
    return out;
}
function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}
/** 1234 → 1.2천, 56789 → 5.7만 */
function formatCount(n) {
    const abs = Math.abs(n);
    const trim = (v) => (v >= 100 ? Math.round(v).toString() : v.toFixed(1).replace(/\.0$/, ''));
    if (abs < 1000)
        return String(n);
    if (abs < 10000)
        return `${trim(n / 1000)}천`;
    if (abs < 100000000)
        return `${trim(n / 10000)}만`;
    return `${trim(n / 100000000)}억`;
}
// ───────── 한국어 조사 자동 맞춤: "{me}가" → 하늘이 / 태오가
const DIGIT_JONG = { '0': 21, '1': 8, '2': 0, '3': 16, '4': 0, '5': 0, '6': 1, '7': 8, '8': 8, '9': 0 };
/** 마지막 글자의 받침 번호(0 = 받침 없음, 8 = ㄹ) */
function jongOf(word) {
    const last = word.trim().slice(-1);
    if (last in DIGIT_JONG)
        return DIGIT_JONG[last];
    const code = last.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3)
        return 0;
    return (code - 0xac00) % 28;
}
const PARTICLE = /^(을\(를\)|를\(을\)|이\(가\)|가\(이\)|은\(는\)|는\(은\)|와\(과\)|과\(와\)|\(으\)로|\(이\)라면|으로|이랑|라면|은|는|이|가|을|를|과|와|로|랑|아|야|라|다)(?=[\s.,!?…~"'”)\]]|$)/;
function particleFor(word, p) {
    const j = jongOf(word);
    const has = j !== 0;
    const base = p.replace(/[()]/g, '');
    if (['은는', '는은', '은', '는'].includes(base))
        return has ? '은' : '는';
    if (['이가', '가이', '이', '가'].includes(base))
        return has ? '이' : '가';
    if (['을를', '를을', '을', '를'].includes(base))
        return has ? '을' : '를';
    if (['와과', '과와', '과', '와'].includes(base))
        return has ? '과' : '와';
    if (['으로', '로'].includes(base))
        return has && j !== 8 ? '으로' : '로';
    if (['이랑', '랑'].includes(base))
        return has ? '이랑' : '랑';
    if (['아', '야'].includes(base))
        return has ? '아' : '야';
    if (['이라면', '라면'].includes(base))
        return has ? '이라면' : '라면';
    if (base === '라')
        return has ? '이라' : '라';
    if (base === '다')
        return has ? '이다' : '다';
    return p;
}
/** 템플릿 문자열의 {키}를 값으로 바꾸고, 바로 뒤 조사를 받침에 맞게 고친다 */
function fill(template, vars) {
    const re = /\{(\w+)\}/g;
    let out = '';
    let i = 0;
    let m;
    while ((m = re.exec(template))) {
        out += template.slice(i, m.index);
        i = re.lastIndex;
        const key = m[1];
        if (!(key in vars)) {
            out += m[0];
            continue;
        }
        const val = String(vars[key]);
        const pm = template.slice(i).match(PARTICLE);
        if (pm) {
            out += val + particleFor(val, pm[1]);
            i += pm[1].length;
            re.lastIndex = i;
        }
        else {
            out += val;
        }
    }
    return out + template.slice(i);
}
/** 문자열 → 32비트 해시(항상 같은 값: 조회수 추정·기본 사진 고르기 등) */
function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
/** 조회수: 저장된 값이 없으면 좋아요·리포스트·답글로 그럴듯하게 추정(X처럼 좋아요의 20~60배) */
function viewsOf(p) {
    if (p.views && p.views > 0)
        return p.views;
    const k = 20 + (hashStr(p.id) % 40);
    return Math.max(p.likes * k + p.reposts * 90 + p.replies.length * 35, p.likes > 0 || p.replies.length ? 12 + (hashStr(p.id) % 60) : 0);
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
// ───────────────────────── 이모지가 반으로 잘리지 않게(짝 없는 서로게이트 방지)
// JS 문자열은 UTF-16이라 이모지(😀 등)는 두 칸을 쓴다. slice로 그 사이를 자르면 "짝 없는 반쪽"이 남고,
// 이게 JSON으로 나가면 DB(jsonb)·API가 "잘못된 JSON"(400)으로 거부한다 → 동기화가 계속 실패하던 원인.
/** 앞에서 n칸까지 자르되 이모지 반쪽이 남지 않게 */
function cutText(text, n) {
    if (text.length <= n)
        return text;
    let t = text.slice(0, Math.max(0, n));
    const last = t.charCodeAt(t.length - 1);
    if (last >= 0xd800 && last <= 0xdbff)
        t = t.slice(0, -1);
    return t;
}
/** 짝 없는 반쪽(서로게이트)을 �(U+FFFD)로 바꾼다 */
function wellFormed(s) {
    if (!/[\uD800-\uDFFF]/.test(s))
        return s;
    let out = '';
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdbff) {
            const n = s.charCodeAt(i + 1);
            if (n >= 0xdc00 && n <= 0xdfff) {
                out += s[i] + s[i + 1];
                i++;
            }
            else
                out += '\uFFFD';
        }
        else if (c >= 0xdc00 && c <= 0xdfff)
            out += '\uFFFD';
        else
            out += s[i];
    }
    return out;
}
/**
 * 밖으로 보낼 JSON(DB·AI API) — 짝 없는 반쪽이 섞여 있어도 항상 올바른 JSON.
 * 최신 JS의 JSON.stringify는 짝 없는 반쪽을 \udXXX 로 내보내는데, PostgREST·Postgres jsonb는 이걸 거부한다.
 */
function safeJson(value) {
    const t = wellFormed(JSON.stringify(value) ?? 'null');
    // JSON 이스케이프를 앞에서부터 하나씩 읽어(\\ 쌍도 하나로) 서로게이트 이스케이프(\uD800~\uDFFF)만 \ufffd 로
    return t.replace(/\\(?:u([0-9a-fA-F]{4})|[\s\S])/g, (m, hex) => (hex && /^d[89a-f]/i.test(hex) ? '\\ufffd' : m));
}
/** 글 앞부분 미리보기 */
function snippet(text, len = 18) {
    const t = text.replace(/\s+/g, ' ').trim();
    return t.length > len ? `${cutText(t, len)}…` : t;
}
/** X 규칙의 @아이디: 영문 소문자·숫자·밑줄, 15자까지 */
function sanitizeHandle(raw) {
    return raw
        .replace(/^@/, '')
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '')
        .slice(0, 15);
}
