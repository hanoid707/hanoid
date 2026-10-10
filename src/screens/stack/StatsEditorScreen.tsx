/**
 * 스탯 조정 — 내 팔로워·아우라·유머·평판·레벨·경험치를 원할 때만 직접 바꾼다
 * 숫자 입력 + 빠른 버튼(×2 · ×10 · +1만 · 초기화) → 저장하면 게임 규칙(setMyStats)이 범위를 잘라 적용한다.
 */
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type KeyboardTypeOptions } from 'react-native';
import { Screen, TopBar } from '../../components/Screen';
import { Button, Chip, Field } from '../../components/ui';
import { setMyStats } from '../../game/actions';
import { REP, xpToNext } from '../../game/rules';
import type { RootNav } from '../../navigation/types';
import { useActive, useGame } from '../../store/game';
import { font, radius, space, useTheme } from '../../theme';
import type { Stats } from '../../types';
import { clamp, formatCount } from '../../utils';

type Key = 'followers' | 'aura' | 'humor' | 'reputation' | 'level' | 'xp';
type Patch = Partial<Pick<Stats, Key>>;

interface FieldDef {
  key: Key;
  label: string;
  min: number;
  max: number;
  keyboard: KeyboardTypeOptions;
  /** 빠른 버튼(지금 입력값 → 새 값) */
  quick: { label: string; a11y: string; fn: (v: number) => number }[];
}

const FIELDS: FieldDef[] = [
  {
    key: 'followers',
    label: '팔로워',
    min: 0,
    max: 1_000_000_000,
    keyboard: 'number-pad',
    quick: [
      { label: '×2', a11y: '팔로워 두 배', fn: (v) => v * 2 },
      { label: '×10', a11y: '팔로워 열 배', fn: (v) => v * 10 },
      { label: '+1만', a11y: '팔로워 1만 더하기', fn: (v) => v + 10_000 },
      { label: '+100만', a11y: '팔로워 100만 더하기', fn: (v) => v + 1_000_000 },
    ],
  },
  {
    key: 'aura',
    label: '아우라',
    min: 0,
    max: 999,
    keyboard: 'number-pad',
    quick: [
      { label: '×2', a11y: '아우라 두 배', fn: (v) => v * 2 },
      { label: '+10', a11y: '아우라 10 더하기', fn: (v) => v + 10 },
      { label: '-10', a11y: '아우라 10 빼기', fn: (v) => v - 10 },
    ],
  },
  {
    key: 'humor',
    label: '유머',
    min: 0,
    max: 999,
    keyboard: 'number-pad',
    quick: [
      { label: '×2', a11y: '유머 두 배', fn: (v) => v * 2 },
      { label: '+10', a11y: '유머 10 더하기', fn: (v) => v + 10 },
      { label: '-10', a11y: '유머 10 빼기', fn: (v) => v - 10 },
    ],
  },
  {
    key: 'reputation',
    label: '평판',
    min: -100,
    max: 100,
    keyboard: 'numeric',
    quick: [
      { label: '+10', a11y: '평판 10 올리기', fn: (v) => v + 10 },
      { label: '-10', a11y: '평판 10 내리기', fn: (v) => v - 10 },
      { label: '0', a11y: '평판 0으로', fn: () => 0 },
    ],
  },
  {
    key: 'level',
    label: '레벨',
    min: 1,
    max: 99,
    keyboard: 'number-pad',
    quick: [
      { label: '+1', a11y: '레벨 1 올리기', fn: (v) => v + 1 },
      { label: '-1', a11y: '레벨 1 내리기', fn: (v) => v - 1 },
      { label: '+10', a11y: '레벨 10 올리기', fn: (v) => v + 10 },
    ],
  },
  {
    key: 'xp',
    label: '경험치(XP)',
    min: 0,
    max: 10_000_000,
    keyboard: 'number-pad',
    quick: [
      { label: '+50', a11y: '경험치 50 더하기', fn: (v) => v + 50 },
      { label: '+500', a11y: '경험치 500 더하기', fn: (v) => v + 500 },
    ],
  },
];

/** 입력 글자 → 숫자(빈칸·'-'만 있으면 null) */
function parse(text: string): number | null {
  const t = text.replace(/[^0-9-]/g, '').replace(/(?!^)-/g, '');
  if (!t || t === '-') return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

export function StatsEditorScreen() {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const sc = useActive();
  const showToast = useGame((s) => s.showToast);
  const [vals, setVals] = useState<Record<Key, string>>(() => {
    const s = sc?.stats;
    return {
      followers: String(s?.followers ?? 0),
      aura: String(s?.aura ?? 0),
      humor: String(s?.humor ?? 0),
      reputation: String(s?.reputation ?? 0),
      level: String(s?.level ?? 1),
      xp: String(s?.xp ?? 0),
    };
  });
  if (!sc) return null;
  const s = sc.stats;

  const valueOf = (f: FieldDef): number => clamp(parse(vals[f.key]) ?? s[f.key], f.min, f.max);
  const set = (k: Key, v: string) => setVals((p) => ({ ...p, [k]: v }));
  const setNum = (f: FieldDef, n: number) => set(f.key, String(clamp(Math.round(n), f.min, f.max)));
  const resetOne = (f: FieldDef) => set(f.key, String(s[f.key]));
  const resetAll = () => {
    for (const f of FIELDS) resetOne(f);
  };

  const patch: Patch = {};
  for (const f of FIELDS) {
    const v = valueOf(f);
    if (v !== s[f.key]) patch[f.key] = v;
  }
  const changed = Object.keys(patch).length > 0;
  const rep = valueOf(FIELDS[3]);
  const level = valueOf(FIELDS[4]);

  const save = () => {
    if (!changed) return;
    setMyStats(patch);
    showToast('📊 스탯을 바꿨어요');
    nav.goBack();
  };

  return (
    <Screen>
      <TopBar title="스탯 조정" subtitle="원할 때만 바꾸세요" right={<Button title="저장" size="sm" variant="ink" disabled={!changed} onPress={save} />} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 56 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.warn, { backgroundColor: c.warningSoft, borderColor: c.warning }]} accessibilityRole="alert">
          <Text style={{ color: c.warning, fontWeight: '800', fontSize: font.body }}>⚠️ 원할 때만</Text>
          <Text style={{ color: c.text, fontSize: font.small, lineHeight: 19 }}>
            바꾼 숫자는 바로 게임에 반영돼요. 팔로워가 많을수록 글 반응(마음에 들어요·답글·조회수)이 폭발적으로 늘고, 평판은 논란·캔슬 판정에 쓰여요.
          </Text>
        </View>

        {FIELDS.map((f) => {
          const v = valueOf(f);
          const diff = v - s[f.key];
          return (
            <View key={f.key} style={{ gap: 8 }}>
              <Field
                label={f.label}
                value={vals[f.key]}
                onChangeText={(t) => set(f.key, t.replace(f.min < 0 ? /[^0-9-]/g : /[^0-9]/g, ''))}
                onBlur={() => setNum(f, v)}
                keyboardType={f.keyboard}
                maxLength={11}
                hint={
                  `지금 ${s[f.key].toLocaleString('ko-KR')}` +
                  (diff ? ` → ${v.toLocaleString('ko-KR')} (${diff > 0 ? '+' : ''}${diff.toLocaleString('ko-KR')})` : '') +
                  (f.key === 'followers' ? ` · ${formatCount(v)}명` : '') +
                  (f.key === 'reputation' ? (rep <= REP.cancelled ? ' · 캔슬 상태가 돼요' : rep <= REP.controversy ? ' · 논란 상태가 돼요' : ` · ${REP.controversy} 이하 논란, ${REP.cancelled} 이하 캔슬`) : '') +
                  (f.key === 'xp' ? ` · Lv.${level} 다음 레벨까지 ${xpToNext(level).toLocaleString('ko-KR')}` : '')
                }
              />
              <View style={styles.quick}>
                {f.quick.map((q) => (
                  <Chip key={q.label} label={q.label} accessibilityLabel={q.a11y} small onPress={() => setNum(f, q.fn(v))} />
                ))}
                <Chip label="초기화" accessibilityLabel={`${f.label} 초기화`} small disabled={!diff} onPress={() => resetOne(f)} />
              </View>
            </View>
          );
        })}

        <Button title="모두 원래대로" variant="outline" disabled={!changed} onPress={resetAll} style={{ alignSelf: 'flex-start' }} />
        <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 19 }}>숫자는 범위 안으로 맞춰져요: 팔로워 0~10억 · 아우라·유머 0~999 · 평판 -100~100 · 레벨 1~99</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  warn: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: 4 },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
