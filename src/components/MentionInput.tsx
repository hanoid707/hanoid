/**
 * @멘션·#해시태그 자동완성 입력창 — 토큰 0(전부 기기 안에서 계산)
 *
 *   커서 바로 앞 낱말이 '@'로 시작 → 이 세계 사람(아이디·표시 이름·초성, 앞부분 일치 먼저) 최대 6명
 *   '#'로 시작 → 트렌드·세계관 태그·최근 글 태그
 *   줄을 누르면 '@아이디 ' / '#태그 ' 가 들어가고 커서가 그 뒤로 간다.
 *
 * 글쓰기·답글·쪽지 입력창이 같이 쓴다. 커서 위치는 onSelectionChange로 따라간다(웹·폰 공통).
 * 웹에서는 ↑↓로 고르고 Enter/Tab으로 넣고 Esc로 닫는다.
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type StyleProp,
  type TextInputKeyPressEventData,
  type TextInputProps,
  type TextInputSelectionChangeEventData,
  type ViewStyle,
} from 'react-native';
import { useActive } from '../store/game';
import { font, noOutline, radius, useTheme } from '../theme';
import type { Avatar as AvatarData, BadgeKind, Character, Scenario } from '../types';
import { formatCount } from '../utils';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './Badge';
import { RelationChip } from './RelationChip';

// ───────────────────────── 찾기(순수 함수 — 다른 화면 검색에도 쓴다)

const WORD = 'A-Za-z0-9_\\u3131-\\u318E\\uAC00-\\uD7A3';
const TOKEN_RE = new RegExp(`(^|[\\s()\\[\\]{}"'“”‘’,.!?~·:;])([@#])([${WORD}]*)$`);
const TAIL_RE = new RegExp(`^[${WORD}]*`);

export interface Token {
  kind: '@' | '#';
  query: string;
  /** '@' 위치 */
  start: number;
  /** 토큰 끝(커서 뒤에 붙은 글자까지) */
  end: number;
}

/** 커서 앞의 @·# 낱말 */
export function findToken(text: string, caret: number): Token | null {
  const cur = Math.max(0, Math.min(caret, text.length));
  const m = text.slice(0, cur).match(TOKEN_RE);
  if (!m) return null;
  const start = cur - m[2].length - m[3].length;
  const tail = text.slice(cur).match(TAIL_RE)?.[0] ?? '';
  return { kind: m[2] as '@' | '#', query: m[3], start, end: cur + tail.length };
}

const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

function syl(ch: string | undefined): { cho: number; jung: number; jong: number } | null {
  if (!ch) return null;
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return null;
  return { cho: Math.floor(code / 588), jung: Math.floor((code % 588) / 28), jong: code % 28 };
}

/** 이름의 초성(서아 SEOA → ㅅㅇ seoa) */
export function chosung(s: string): string {
  let out = '';
  for (const ch of s) {
    const p = syl(ch);
    out += p ? CHO[p.cho] : ch.toLowerCase();
  }
  return out;
}

/** 한글 조합 중인 마지막 글자까지 고려한 앞부분 일치('서'→서아, '성'→서아·성민, 'ㅅ'→서아) */
export function hangulStartsWith(target: string, q: string): boolean {
  if (!q) return true;
  const head = q.slice(0, -1);
  if (!target.startsWith(head)) return false;
  const last = q[q.length - 1];
  const t = target[head.length];
  if (t === undefined) return false;
  if (t === last) return true;
  const tl = syl(t);
  const jamo = CHO.indexOf(last);
  if (jamo >= 0) return !!tl && tl.cho === jamo;
  const ql = syl(last);
  if (!ql || !tl || ql.cho !== tl.cho || ql.jung !== tl.jung) return false;
  if (ql.jong === 0) return true;
  // '성' = '서' + ㅇ(다음 글자의 초성이 될 수도 있음)
  const next = syl(target[head.length + 1]);
  const asCho = CHO.indexOf(JONG[ql.jong]);
  return tl.jong === 0 && !!next && asCho >= 0 && next.cho === asCho;
}

const isJamoOnly = (q: string) => /^[ㄱ-ㅎ]+$/.test(q);

/** 사람 검색 점수(낮을수록 먼저, -1 = 안 맞음) */
export function personScore(p: { name: string; handle: string }, q: string): number {
  if (!q) return 5;
  const ql = q.toLowerCase();
  const h = p.handle.toLowerCase();
  const n = p.name.toLowerCase();
  const words = n.split(/\s+/).filter(Boolean);
  if (h.startsWith(ql)) return 0;
  if (hangulStartsWith(n, ql) || words.some((w) => hangulStartsWith(w, ql))) return 1;
  if (isJamoOnly(q)) {
    const cs = chosung(p.name);
    if (cs.startsWith(q) || cs.split(/\s+/).some((w) => w.startsWith(q))) return 2;
    if (cs.replace(/\s/g, '').includes(q)) return 4;
  }
  if (h.includes(ql)) return 3;
  if (n.includes(ql)) return 4;
  return -1;
}

export interface PersonOption {
  key: string;
  name: string;
  handle: string;
  avatar: AvatarData;
  badge?: BadgeKind | null;
  /** 이 세계 캐릭터면(관계 칩 표시) */
  ch?: Character;
}

const badgeOf = (ch: Character): BadgeKind | null => (ch.badge === undefined ? (ch.isNews ? 'gold' : ch.verified ? 'blue' : null) : ch.badge);

export function personOf(ch: Character): PersonOption {
  return { key: ch.id, name: ch.name, handle: ch.handle, avatar: ch.avatar, badge: badgeOf(ch), ch };
}

/** 자주 멘션할 만한 사람(가까운 사이·최근 쪽지·맞팔 우선) */
export function frequentPeople(sc: Scenario, n = 6): Character[] {
  const score = (c: Character) => {
    let s = Math.abs(c.affinity) * 0.6 + (c.tier !== 'crowd' ? 35 : 0);
    const dm = sc.dms[c.id];
    if (dm?.messages.length) s += 25;
    if (c.iFollow) s += 10;
    if (c.followsMe) s += 10;
    if ((c.romance ?? 0) > 30) s += 10;
    return s;
  };
  return sc.cast
    .map((id) => sc.characters[id])
    .filter((c): c is Character => !!c && !c.isNews && !c.inactive)
    .sort((a, b) => score(b) - score(a))
    .slice(0, n);
}

/** 인증 캐릭터(core) 먼저 */
const coreRank = (p: PersonOption) => (p.ch && p.ch.tier !== 'crowd' ? 1 : 0);

/** 사람 찾기(@ 자동완성·새 쪽지 검색) */
export function searchPeople(sc: Scenario, q: string, limit = 6, extra: PersonOption[] = []): PersonOption[] {
  if (!q) {
    const top = frequentPeople(sc, limit).map(personOf);
    const seen = new Set(top.map((p) => p.handle));
    return [...top, ...extra.filter((p) => !seen.has(p.handle))].slice(0, limit);
  }
  const pool: PersonOption[] = [
    ...sc.cast
      .map((id) => sc.characters[id])
      .filter((c): c is Character => !!c && !c.inactive)
      .map(personOf),
    ...extra,
  ];
  const seen = new Set<string>();
  return pool
    .map((p) => ({ p, s: personScore(p, q) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || coreRank(b.p) - coreRank(a.p) || (b.p.ch?.affinity ?? 0) - (a.p.ch?.affinity ?? 0))
    .map((x) => x.p)
    .filter((p) => (seen.has(p.handle) ? false : (seen.add(p.handle), true)))
    .slice(0, limit);
}

export interface TagOption {
  tag: string;
  count?: number;
  note: string;
}

const TAG_IN_TEXT = /#[A-Za-z0-9_ㄱ-ㆎ가-힣]+/g;

/** 해시태그 찾기: 트렌드 → 세계관 태그 → 최근 글에 쓰인 태그 */
export function searchTags(sc: Scenario, q: string, limit = 6): TagOption[] {
  const list: TagOption[] = [];
  const seen = new Set<string>();
  const add = (raw: string, note: string, count?: number) => {
    const tag = raw.startsWith('#') ? raw : `#${raw}`;
    const k = tag.toLowerCase();
    if (seen.has(k) || tag.length < 2) return;
    seen.add(k);
    list.push({ tag, note, count });
  };
  for (const t of sc.trends) add(t.tag, t.hot ? '지금 뜨는 트렌드' : '트렌드', t.count);
  if (sc.world.tag) add(sc.world.tag, '이 세계 태그');
  for (const id of sc.feed.slice(0, 60)) for (const m of sc.posts[id]?.text.match(TAG_IN_TEXT) ?? []) add(m, '최근 글');
  if (!q) return list.slice(0, limit);
  const ql = q.toLowerCase();
  return list
    .map((t) => {
      const body = t.tag.slice(1).toLowerCase();
      return { t, s: hangulStartsWith(body, ql) ? 0 : body.includes(ql) ? 1 : -1 };
    })
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s)
    .map((x) => x.t)
    .slice(0, limit);
}

// ───────────────────────── 입력창

export interface MentionInputHandle {
  focus(): void;
  blur(): void;
  /** 커서 자리에 글자 넣기(앞뒤 띄어쓰기 자동) */
  insert(s: string): void;
}

export interface MentionInputProps extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  value: string;
  onChangeText: (t: string) => void;
  /** 추천 목록 위치: 'above' = 입력창 위(화면 아래 입력창) · 'below' = 입력창 아래(글쓰기) */
  placement?: 'above' | 'below';
  /** 입력창 왼쪽·오른쪽(아바타·보내기 버튼) — 추천 목록이 줄 전체 폭을 쓰도록 같이 넘긴다 */
  left?: ReactNode;
  right?: ReactNode;
  /** 입력 줄(왼쪽+입력창+오른쪽) 스타일 */
  rowStyle?: StyleProp<ViewStyle>;
  /** 바깥 묶음 스타일 */
  containerStyle?: StyleProp<ViewStyle>;
  listStyle?: StyleProp<ViewStyle>;
  /** 캐릭터 말고도 추천할 사람(스레드의 일반 유저 등) */
  extraPeople?: PersonOption[];
  /** 추천 최대 개수(기본 6) */
  limit?: number;
  /** 시나리오(기본: 지금 플레이 중) */
  sc?: Scenario | null;
}

type Sel = { start: number; end: number };

export const MentionInput = forwardRef<MentionInputHandle, MentionInputProps>(function MentionInput(
  { value, onChangeText, placement = 'below', left, right, rowStyle, containerStyle, listStyle, extraPeople, limit = 6, sc: scProp, style, onSelectionChange, onFocus, onBlur, onKeyPress, ...rest },
  ref,
) {
  const { c } = useTheme();
  const active = useActive();
  const sc = scProp === undefined ? active : scProp;
  const inputRef = useRef<TextInput>(null);
  const [caret, setCaret] = useState(value.length);
  const caretRef = useRef(value.length);
  const prevValue = useRef(value);
  const [forced, setForced] = useState<Sel | undefined>();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [hi, setHi] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 추천 줄을 누르고 있는 중(웹: 누르는 순간 입력창 blur가 먼저 와도 목록을 닫지 않는다) */
  const pressingList = useRef(false);

  // 바깥에서 값이 바뀌었을 때(제안 채우기·보낸 뒤 비우기): 커서가 끝에 있었으면 새 끝으로
  if (prevValue.current !== value) {
    const prevLen = prevValue.current.length;
    const next = caretRef.current >= prevLen ? value.length : Math.min(caretRef.current, value.length);
    prevValue.current = value;
    caretRef.current = next;
    if (next !== caret) setCaret(next);
  }

  useEffect(() => () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
  }, []);

  const token = useMemo(() => findToken(value, caret), [value, caret]);
  const open = !!sc && focused && !!token && token.start !== dismissed;
  const people = useMemo(() => (open && token?.kind === '@' && sc ? searchPeople(sc, token.query, limit, extraPeople) : []), [open, token, sc, limit, extraPeople]);
  const tags = useMemo(() => (open && token?.kind === '#' && sc ? searchTags(sc, token.query, limit) : []), [open, token, sc, limit]);
  const count = token?.kind === '@' ? people.length : tags.length;

  useEffect(() => {
    setHi(0);
  }, [token?.start, token?.query]);
  useEffect(() => {
    if (dismissed !== null && token?.start !== dismissed) setDismissed(null);
  }, [token?.start, dismissed]);

  const place = (next: string, cur: number) => {
    prevValue.current = next;
    caretRef.current = cur;
    setCaret(cur);
    setForced({ start: cur, end: cur });
    onChangeText(next);
  };

  const replaceToken = (ins: string) => {
    if (!token) return;
    const rest = value.slice(token.end);
    const glue = rest.startsWith(' ') || rest.startsWith('\n') ? '' : ' ';
    const next = value.slice(0, token.start) + ins + glue + rest;
    place(next, token.start + ins.length + 1);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const insertAtCaret = (s: string) => {
    const cur = Math.max(0, Math.min(caretRef.current, value.length));
    const before = value.slice(0, cur);
    const after = value.slice(cur);
    const lead = before && !/\s$/.test(before) ? ' ' : '';
    const trail = after.startsWith(' ') ? '' : ' ';
    const next = before + lead + s + trail + after;
    place(next, before.length + lead.length + s.length + 1);
  };

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur(),
    insert: insertAtCaret,
  }));

  const rowPressIn = () => {
    pressingList.current = true;
    if (blurTimer.current) clearTimeout(blurTimer.current);
  };
  const rowPressOut = () => {
    pressingList.current = false;
    // 누르다 밖으로 끌고 나간 경우: 입력창에 포커스가 없으면 닫는다
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => {
      if (!inputRef.current?.isFocused()) setFocused(false);
    }, 260);
  };

  const pickAt = (i: number) => {
    if (token?.kind === '@') {
      const p = people[i];
      if (p) replaceToken(`@${p.handle}`);
    } else {
      const t = tags[i];
      if (t) replaceToken(t.tag);
    }
  };

  const handleSelection = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    const s = e.nativeEvent.selection;
    caretRef.current = s.end;
    setCaret(s.end);
    if (forced) setForced(undefined);
    onSelectionChange?.(e);
  };

  const handleKey = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (Platform.OS === 'web' && open && count > 0) {
      const ne = e.nativeEvent as TextInputKeyPressEventData & { isComposing?: boolean; keyCode?: number };
      const composing = !!ne.isComposing || ne.keyCode === 229;
      const k = ne.key;
      if (!composing) {
        if (k === 'ArrowDown' || k === 'ArrowUp') {
          e.preventDefault();
          setHi((h) => (h + (k === 'ArrowDown' ? 1 : count - 1)) % count);
          return;
        }
        if (k === 'Enter' || k === 'Tab') {
          e.preventDefault();
          pickAt(hi);
          return;
        }
        if (k === 'Escape') {
          setDismissed(token?.start ?? null);
          return;
        }
      }
    }
    onKeyPress?.(e);
  };

  const list =
    open && count > 0 ? (
      <View style={[styles.list, { backgroundColor: c.bg, borderColor: c.borderStrong }, listStyle]}>
        {token?.kind === '@'
          ? people.map((p, i) => (
              <Pressable
                key={p.key}
                onPress={() => pickAt(i)}
                onPressIn={rowPressIn}
                onPressOut={rowPressOut}
                accessibilityRole="button"
                accessibilityLabel={`${p.name} @${p.handle} 멘션하기`}
                style={({ pressed }) => [styles.row, { backgroundColor: pressed || (Platform.OS === 'web' && i === hi) ? c.hover : 'transparent' }]}
              >
                <Avatar avatar={p.avatar} size={32} square={p.badge === 'gold'} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.nameLine}>
                    <Text numberOfLines={1} style={{ color: c.text, fontWeight: '800', fontSize: font.body, flexShrink: 1 }}>
                      {p.name}
                    </Text>
                    <VerifiedBadge kind={p.badge} size={15} />
                  </View>
                  <Text numberOfLines={1} style={{ color: c.subtext, fontSize: font.small }}>
                    @{p.handle}
                  </Text>
                </View>
                {p.ch ? <RelationChip ch={p.ch} /> : <Text style={{ color: c.faint, fontSize: font.tiny }}>일반</Text>}
              </Pressable>
            ))
          : tags.map((t, i) => (
              <Pressable
                key={t.tag}
                onPress={() => pickAt(i)}
                onPressIn={rowPressIn}
                onPressOut={rowPressOut}
                accessibilityRole="button"
                accessibilityLabel={`${t.tag} 넣기`}
                style={({ pressed }) => [styles.row, { backgroundColor: pressed || (Platform.OS === 'web' && i === hi) ? c.hover : 'transparent' }]}
              >
                <View style={[styles.hash, { backgroundColor: c.surfaceAlt }]}>
                  <Text style={{ color: c.primary, fontWeight: '900', fontSize: font.title }}>#</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: c.text, fontWeight: '800', fontSize: font.body }}>
                    {t.tag}
                  </Text>
                  <Text numberOfLines={1} style={{ color: c.subtext, fontSize: font.small }}>
                    {t.note}
                    {t.count ? ` · 게시물 ${formatCount(t.count)}개` : ''}
                  </Text>
                </View>
              </Pressable>
            ))}
      </View>
    ) : null;

  return (
    <View style={containerStyle}>
      {placement === 'above' ? list : null}
      <View style={[styles.inputRow, rowStyle]}>
        {left}
        <TextInput
          ref={inputRef}
          {...rest}
          value={value}
          onChangeText={(t) => {
            // 커서가 끝에 있었으면 새 끝으로(선택 이벤트가 뒤늦게 와도 바로 추천이 뜨게)
            const prevLen = prevValue.current.length;
            const next = caretRef.current >= prevLen ? t.length : Math.min(caretRef.current, t.length);
            prevValue.current = t;
            caretRef.current = next;
            setCaret(next);
            onChangeText(t);
          }}
          selection={forced}
          onSelectionChange={handleSelection}
          onKeyPress={handleKey}
          onFocus={(e) => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            // 추천 줄을 누르는 동안 먼저 blur가 오므로 잠깐 기다렸다 닫는다
            if (blurTimer.current) clearTimeout(blurTimer.current);
            if (!pressingList.current) blurTimer.current = setTimeout(() => setFocused(false), 220);
            onBlur?.(e);
          }}
          style={[{ flex: 1 }, noOutline, style]}
        />
        {right}
      </View>
      {placement === 'below' ? list : null}
    </View>
  );
});

const styles = StyleSheet.create({
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  list: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, overflow: 'hidden', marginVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, minHeight: 50 },
  nameLine: { flexDirection: 'row', alignItems: 'center' },
  hash: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
