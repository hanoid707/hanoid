/**
 * 3단계: 첫 팔로워 고르기 (원본 온보딩의 첫 단계와 같은 개념) → 시나리오 생성
 *   ① 직접 추가하기: 성별 · 나이대(기본 20대) · 팔로워 수 · 유형(기본 친구) · 이름·특징(선택) → 새 사람을 첫 팔로워로
 *   ② 이 세계 사람 중에서 고르기(라디오 목록)
 * 직접 추가한 사람도 나중에 캐릭터 설정에서 성별·나이·팔로워를 고칠 수 있다. 자기소개는 시작 뒤 AI가 조용히 써 준다.
 */
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { VerifiedBadge } from '../../components/Badge';
import { IconCheck, IconUserPlus } from '../../components/icons';
import { Screen, TopBar } from '../../components/Screen';
import { Button, Chip, Field, FormLabel, Segmented } from '../../components/ui';
import { ARCHETYPE_LABEL } from '../../data/avatars';
import { onScenarioCreated } from '../../game/actions';
import { castPreview, createScenario, type CustomFirstFollower } from '../../game/factory';
import { AGE_GROUPS, CORE_TYPES, FOLLOWER_PRESETS, typeLabel } from '../../game/relationship';
import type { RootNav } from '../../navigation/types';
import { useDraft } from '../../store/draft';
import { useGame } from '../../store/game';
import { font, radius, space, useTheme } from '../../theme';
import type { AgeGroup, Difficulty, Gender, RelationKind } from '../../types';
import { formatCount } from '../../utils';

interface CustomForm {
  gender: Gender;
  ageGroup: AgeGroup;
  followers: string;
  type: RelationKind;
  name: string;
  traits: string;
}

const DEFAULT_FORM: CustomForm = { gender: 'f', ageGroup: 20, followers: '1000', type: 'friend', name: '', traits: '' };

const toCustom = (f: CustomForm): CustomFirstFollower => ({
  gender: f.gender,
  ageGroup: f.ageGroup,
  followers: Math.max(0, Math.min(1_000_000_000, Number(f.followers.replace(/[^0-9]/g, '')) || 0)),
  type: f.type,
  name: f.name.trim() || undefined,
  traits: f.traits.trim() || undefined,
});

const fromCustom = (c: CustomFirstFollower | null): CustomForm =>
  c
    ? { gender: c.gender, ageGroup: c.ageGroup, followers: String(c.followers), type: (c.type && CORE_TYPES.includes(c.type as RelationKind) ? c.type : 'friend') as RelationKind, name: c.name ?? '', traits: c.traits ?? '' }
    : DEFAULT_FORM;

const DIFF_OPTIONS: { key: Difficulty; label: string }[] = [
  { key: 'easy', label: '쉬움' },
  { key: 'normal', label: '보통' },
  { key: 'hard', label: '어려움' },
];
const DIFF_DESC: Record<Difficulty, string> = {
  easy: '호감도·평판이 잘 오르고 잘 안 떨어져요',
  normal: '오르내림이 적당해요',
  hard: '좋은 답은 덜 오르고, 실수하면 크게 떨어져요',
};

export function FirstFollowerScreen() {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const draft = useDraft();
  const { putScenario, setActive, showToast } = useGame.getState();
  const cast = castPreview(draft.templateId, draft.customCast).filter((x) => !x.isNews && x.tier === 'core');
  const [selected, setSelected] = useState<string | null>(draft.firstFollowerKey);
  const [customOn, setCustomOn] = useState(!!draft.customFirst);
  const [form, setForm] = useState<CustomForm>(() => fromCustom(draft.customFirst));
  const difficulty: Difficulty = draft.difficulty ?? 'normal';
  const insets = useSafeAreaInsets();

  const update = (patch: Partial<CustomForm>) => {
    const next = { ...form, ...patch };
    setForm(next);
    if (customOn) draft.set({ customFirst: toCustom(next), firstFollowerKey: null });
  };

  const pickCustom = () => {
    setCustomOn(true);
    setSelected(null);
    draft.set({ customFirst: toCustom(form), firstFollowerKey: null });
  };

  const pickTemplate = (key: string) => {
    setCustomOn(false);
    setSelected(key);
    draft.set({ firstFollowerKey: key, customFirst: null });
  };

  const ready = !!draft.persona && (customOn || !!selected);

  const start = () => {
    if (!draft.persona || !ready) return;
    const customFirst = customOn ? toCustom(form) : null;
    const sc = createScenario({
      templateId: draft.templateId,
      custom: draft.custom,
      customCast: draft.customCast,
      persona: draft.persona,
      firstFollowerKey: selected ?? '',
      customFirst,
      difficulty,
    });
    putScenario(sc);
    setActive(sc.id);
    draft.reset();
    nav.reset({ index: 0, routes: [{ name: 'Main' }] });
    showToast(`${sc.world.emoji} ${sc.world.name}에 입장했어요!`, 'success');
    // 첫 팔로워의 첫 쪽지·(직접 추가했으면) 자기소개·(직접 만든 세계관이면) 첫 타임라인을 AI가 뒤에서 쓴다
    onScenarioCreated(sc.id);
  };

  const followersNum = Number(form.followers.replace(/[^0-9]/g, '')) || 0;

  return (
    <Screen>
      <TopBar title="첫 팔로워 고르기" subtitle="3 / 3" />
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <View style={{ padding: space.lg, gap: 6 }}>
          <Text style={{ color: c.text, fontSize: font.h1, fontWeight: '900' }}>누가 먼저 팔로우할까요?</Text>
          <Text style={{ color: c.subtext, fontSize: font.body }}>이 사람과는 맞팔로 시작하고, 첫 쪽지가 와요.</Text>
        </View>

        {/* ① 직접 추가하기 */}
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
          <View style={[styles.customCard, { borderColor: customOn ? c.primary : c.borderStrong, backgroundColor: customOn ? c.primarySoft : c.bg }]}>
            <Pressable
              testID="first-custom"
              onPress={pickCustom}
              accessibilityRole="button"
              accessibilityLabel="직접 추가하기"
              accessibilityState={{ selected: customOn }}
              style={styles.customHead}
            >
              <View style={[styles.customIcon, { backgroundColor: customOn ? c.primary : c.surfaceAlt }]}>
                <IconUserPlus size={20} color={customOn ? '#fff' : c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontWeight: '900', fontSize: font.title }}>직접 추가하기</Text>
                <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 18 }}>성별·나이·팔로워 수를 골라 새 사람을 첫 팔로워로 만들어요. 나중에 캐릭터 설정에서 고칠 수 있어요.</Text>
              </View>
              <View style={[styles.radio, { borderColor: customOn ? c.primary : c.borderStrong, backgroundColor: customOn ? c.primary : 'transparent' }]}>{customOn && <IconCheck size={14} color="#fff" />}</View>
            </Pressable>
            {customOn ? (
              <View style={{ gap: space.md, marginTop: space.md }}>
                <View style={{ gap: 8 }}>
                  <FormLabel>성별</FormLabel>
                  <View style={styles.wrap}>
                    <Chip small label="여" selected={form.gender === 'f'} onPress={() => update({ gender: 'f' })} accessibilityLabel="성별 여" />
                    <Chip small label="남" selected={form.gender === 'm'} onPress={() => update({ gender: 'm' })} accessibilityLabel="성별 남" />
                  </View>
                </View>
                <View style={{ gap: 8 }}>
                  <FormLabel>나이대</FormLabel>
                  <View style={styles.wrap}>
                    {AGE_GROUPS.map((a) => (
                      <Chip key={a} small label={`${a}대`} selected={form.ageGroup === a} onPress={() => update({ ageGroup: a })} />
                    ))}
                  </View>
                </View>
                <View style={{ gap: 8 }}>
                  <FormLabel hint={followersNum ? `${formatCount(followersNum)}명` : undefined}>팔로워 수</FormLabel>
                  <View style={styles.wrap}>
                    {FOLLOWER_PRESETS.map((n) => (
                      <Chip key={n} small label={formatCount(n)} selected={followersNum === n} onPress={() => update({ followers: String(n) })} accessibilityLabel={`팔로워 ${formatCount(n)}`} />
                    ))}
                  </View>
                  <Field label="팔로워 수(직접 입력)" value={form.followers} onChangeText={(t) => update({ followers: t.replace(/[^0-9]/g, '') })} keyboardType="number-pad" maxLength={10} />
                </View>
                <View style={{ gap: 8 }}>
                  <FormLabel hint="나와의 관계">유형</FormLabel>
                  <View style={styles.wrap}>
                    {CORE_TYPES.map((t) => (
                      <Chip key={t} small label={typeLabel(t)} selected={form.type === t} onPress={() => update({ type: t })} />
                    ))}
                  </View>
                </View>
                <Field label="이름(선택)" value={form.name} onChangeText={(t) => update({ name: t })} maxLength={30} placeholder="비우면 자동으로 지어 줘요" />
                <Field label="특징(선택)" value={form.traits} onChangeText={(t) => update({ traits: t })} maxLength={160} multiline numberOfLines={6} style={{ minHeight: 140 }} placeholder="예) 대학 동기. 무심한 척 은근 잘 챙겨 줌" />
              </View>
            ) : null}
          </View>
        </View>

        {/* ② 이 세계 사람 중에서 */}
        <Text style={[styles.section, { color: c.subtext }]}>이 세계 사람 중에서</Text>
        {cast.map((p) => {
          const on = !customOn && selected === p.key;
          return (
            <Pressable
              key={p.key}
              onPress={() => pickTemplate(p.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, checked: on }}
              style={({ pressed }) => [styles.row, { borderBottomColor: c.border, backgroundColor: on ? c.primarySoft : pressed ? c.hover : 'transparent' }]}
            >
              <Avatar avatar={{ emoji: p.emoji, color: p.color, photo: p.photo }} size={48} square={p.badge === 'gold'} />
              <View style={{ flex: 1, gap: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: c.text, fontWeight: '800', fontSize: font.body, flexShrink: 1 }} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <VerifiedBadge kind={p.badge} />
                </View>
                <Text style={{ color: c.subtext, fontSize: font.body }}>
                  @{p.handle} · {ARCHETYPE_LABEL[p.archetype]} · 팔로워 {formatCount(p.followers)}
                </Text>
                {p.title || p.age ? (
                  <Text style={{ color: c.subtext, fontSize: font.body, lineHeight: 20, marginTop: 4 }}>{[p.title, p.age ? `${p.age}살` : ''].filter(Boolean).join(' · ')}</Text>
                ) : null}
              </View>
              <View style={[styles.radio, { borderColor: on ? c.primary : c.borderStrong, backgroundColor: on ? c.primary : 'transparent' }]}>{on && <IconCheck size={14} color="#fff" />}</View>
            </Pressable>
          );
        })}

        <View style={{ padding: space.lg, gap: 8 }}>
          <FormLabel hint="나 탭에서 언제든 바꿀 수 있어요">난이도</FormLabel>
          <Segmented<Difficulty> options={DIFF_OPTIONS} value={difficulty} onChange={(k) => draft.set({ difficulty: k })} />
          <Text style={{ color: c.subtext, fontSize: font.small }}>{DIFF_DESC[difficulty]}</Text>
        </View>
      </ScrollView>
      <View style={[styles.footer, { backgroundColor: c.bg, borderTopColor: c.border, paddingBottom: space.lg + insets.bottom }]}>
        <Button title="시작하기" size="lg" variant="ink" full disabled={!ready} onPress={start} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  customCard: { borderWidth: 1.5, borderRadius: radius.lg, padding: space.md },
  customHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  customIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  section: { fontSize: font.small, fontWeight: '800', paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: 6 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  row: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'flex-start' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, borderTopWidth: StyleSheet.hairlineWidth },
});
