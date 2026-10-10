/**
 * 수치 변화 칩 — 이벤트 답을 고르면 "호감도 +14 · 설렘 +8 · 친구 → 베프 · 팔로워 +120"이
 * 1~3개씩 불규칙하게(툭 투둑) 튀어나오고 숫자가 0부터 올라간다. 호감도 막대도 이전 값에서 지금 값으로 움직인다.
 * 이미 끝난 이벤트를 다시 열면 같은 칩을 움직임 없이 보여 준다. 전부 기기 안 계산(토큰 0).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { describeChange } from '../game/relationship';
import { font, radius, useTheme } from '../theme';
import { ME, type Avatar as AvatarData, type Character, type GameEvent, type ID, type Scenario } from '../types';
import { formatCount } from '../utils';
import { Avatar } from './Avatar';
import { RelationChip } from './RelationChip';
import { MeterBar } from './ui';

const ND = Platform.OS !== 'web';

export interface DeltaItem {
  key: string;
  /** 호감도·설렘·팔로워… (관계 변화면 비움) */
  label: string;
  /** 숫자 변화량(부호 포함) */
  value?: number;
  /** 글자 칩(관계 변화 "친구 → 베프") */
  text?: string;
  kind: 'stat' | 'relation';
}

export interface DeltaGroup {
  key: string;
  title: string;
  avatar?: AvatarData;
  square?: boolean;
  /** 인물이면(관계 칩 표시) */
  ch?: Character;
  /** 막대 연출(이전 → 지금) — 방금 결과가 나온 경우만 */
  affinity?: { from: number; to: number };
  romance?: { from: number; to: number };
  devotion?: { from: number; to: number };
  items: DeltaItem[];
}

const signedCount = (n: number) => (n > 0 ? `+${formatCount(n)}` : n < 0 ? `−${formatCount(-n)}` : '0');

/** 이벤트 결과 → 사람별 변화 묶음. live = 방금 나온 결과(막대 연출 포함) */
export function eventDeltaGroups(sc: Scenario, ev: GameEvent, live: boolean): DeltaGroup[] {
  const res = ev.result;
  if (!res) return [];
  const d = res.deltas ?? {};
  const aff = d.affinity ?? {};
  const rom = d.romance ?? {};
  const dev = d.devotion ?? {};
  const changes = res.changes ?? [];
  const ids: ID[] = [];
  const add = (id: ID) => {
    if (id && id !== ME && !ids.includes(id) && sc.characters[id]) ids.push(id);
  };
  ev.involved.forEach(add);
  Object.keys(aff).forEach(add);
  Object.keys(rom).forEach(add);
  Object.keys(dev).forEach(add);
  changes.forEach((ch) => add(ch.characterId));

  const groups: DeltaGroup[] = [];
  for (const id of ids) {
    const ch = sc.characters[id];
    const items: DeltaItem[] = [];
    const a = Math.round(aff[id] ?? 0);
    const r = Math.round(rom[id] ?? 0);
    const v = Math.round(dev[id] ?? 0);
    if (a) items.push({ key: `${id}:a`, label: '호감도', value: a, kind: 'stat' });
    if (r) items.push({ key: `${id}:r`, label: '설렘', value: r, kind: 'stat' });
    if (v) items.push({ key: `${id}:v`, label: '정복도', value: v, kind: 'stat' });
    for (const change of changes.filter((x) => x.characterId === id)) {
      const text = describeChange(change);
      if (text) items.push({ key: `${id}:rel:${text}`, label: '', text, kind: 'relation' });
    }
    if (!items.length) continue;
    const showRomance = !!r || (ch.romance ?? 0) > 0;
    groups.push({
      key: id,
      title: ch.name,
      avatar: ch.avatar,
      square: ch.badge === 'gold',
      ch,
      affinity: live && a ? { from: ch.affinity - a, to: ch.affinity } : undefined,
      romance: live && r && showRomance ? { from: (ch.romance ?? 0) - r, to: ch.romance ?? 0 } : undefined,
      devotion: live && v ? { from: (ch.devotion ?? 0) - v, to: ch.devotion ?? 0 } : undefined,
      items,
    });
  }

  const mine: DeltaItem[] = [];
  const stat = (key: string, label: string, v?: number) => {
    const n = Math.round(v ?? 0);
    if (n) mine.push({ key, label, value: n, kind: 'stat' });
  };
  stat('me:f', '팔로워', d.followers);
  stat('me:rep', '평판', d.reputation);
  stat('me:aura', '아우라', d.aura);
  stat('me:humor', '유머', d.humor);
  stat('me:xp', 'XP', d.xp);
  if (mine.length) groups.push({ key: 'me', title: '나', avatar: sc.persona.avatar, items: mine });
  return groups;
}

/** 칩 n개를 1~3개씩 묶어 불규칙한 간격으로(툭 투둑) */
function burstSchedule(n: number, start = 250): number[] {
  const out: number[] = [];
  let t = start;
  while (out.length < n) {
    const size = Math.min(n - out.length, 1 + Math.floor(Math.random() * 3));
    for (let k = 0; k < size; k++) out.push(t + k * (70 + Math.random() * 90));
    t += 420 + Math.random() * 520;
  }
  return out;
}

function Chip({ item, delay, animate }: { item: DeltaItem; delay: number; animate: boolean }) {
  const { c } = useTheme();
  const v = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const target = item.value ?? 0;
  const [shown, setShown] = useState(animate ? 0 : target);

  useEffect(() => {
    if (!animate) return;
    const a = Animated.sequence([Animated.delay(delay), Animated.spring(v, { toValue: 1, friction: 5, tension: 160, useNativeDriver: ND })]);
    a.start();
    let iv: ReturnType<typeof setInterval> | null = null;
    const to = setTimeout(() => {
      let step = 0;
      iv = setInterval(() => {
        step += 1;
        setShown(Math.round((target * step) / 10));
        if (step >= 10 && iv) clearInterval(iv);
      }, 45);
    }, delay);
    return () => {
      a.stop();
      clearTimeout(to);
      if (iv) clearInterval(iv);
    };
  }, []); // 처음 한 번만

  const rel = item.kind === 'relation';
  const neg = target < 0;
  const bg = rel ? c.primarySoft : neg ? c.dangerSoft : c.successSoft;
  const fg = rel ? c.aura : neg ? c.danger : c.success;
  const text = rel ? `💞 ${item.text}` : `${item.label} ${signedCount(shown)}`;
  return (
    <Animated.View
      accessibilityLabel={rel ? `관계 변화 ${item.text}` : `${item.label} ${signedCount(target)}`}
      style={[
        styles.chip,
        { backgroundColor: bg, borderColor: rel ? c.aura : 'transparent', borderWidth: rel ? 1 : 0 },
        { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }, { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] },
      ]}
    >
      <Text style={{ color: fg, fontSize: font.small, fontWeight: '900', fontVariant: ['tabular-nums'] }}>{text}</Text>
    </Animated.View>
  );
}

/** 사람별 변화 칩 묶음(이벤트 결과·선물 결과 등) */
export function DeltaChips({ groups, animate }: { groups: DeltaGroup[]; animate: boolean }) {
  const { c } = useTheme();
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  // 칩 순서대로 등장 시각(처음 그릴 때 한 번만 정한다)
  const delays = useMemo(() => burstSchedule(total), [total]);
  if (!groups.length) return null;
  let k = 0;
  return (
    <View style={{ gap: 12 }}>
      {groups.map((g) => {
        const first = k;
        k += g.items.length;
        const groupDelay = animate ? (delays[first] ?? 0) : 0;
        return (
          <View key={g.key} style={{ gap: 6 }}>
            <View style={styles.head}>
              {g.avatar ? <Avatar avatar={g.avatar} size={22} square={g.square} /> : null}
              <Text style={{ color: c.text, fontWeight: '800', fontSize: font.small }} numberOfLines={1}>
                {g.title}
              </Text>
              {g.ch ? <RelationChip ch={g.ch} size="xs" /> : null}
            </View>
            {g.affinity ? (
              <View style={styles.barRow}>
                <Text style={[styles.barLabel, { color: c.subtext }]}>호감도</Text>
                <View style={{ flex: 1 }}>
                  <MeterBar value={g.affinity.to} from={g.affinity.from} min={-100} max={100} color={c.success} delay={groupDelay} />
                </View>
                <Text style={[styles.barNum, { color: c.text }]}>{g.affinity.to}</Text>
              </View>
            ) : null}
            {g.romance ? (
              <View style={styles.barRow}>
                <Text style={[styles.barLabel, { color: c.subtext }]}>설렘</Text>
                <View style={{ flex: 1 }}>
                  <MeterBar value={g.romance.to} from={g.romance.from} min={0} max={100} color={c.like} delay={groupDelay} />
                </View>
                <Text style={[styles.barNum, { color: c.text }]}>{g.romance.to}</Text>
              </View>
            ) : null}
            {g.devotion ? (
              <View style={styles.barRow}>
                <Text style={[styles.barLabel, { color: c.subtext }]}>정복도</Text>
                <View style={{ flex: 1 }}>
                  <MeterBar value={g.devotion.to} from={g.devotion.from} min={0} max={100} color={c.aura} delay={groupDelay} />
                </View>
                <Text style={[styles.barNum, { color: c.text }]}>{g.devotion.to}</Text>
              </View>
            ) : null}
            <View style={styles.chips}>
              {g.items.map((it, i) => (
                <Chip key={it.key} item={it} delay={delays[first + i] ?? 0} animate={animate} />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { fontSize: font.tiny, fontWeight: '700', width: 36 },
  barNum: { fontSize: font.tiny, fontWeight: '800', width: 30, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
