/**
 * 이벤트 — 상황을 보고 내 말로 답하면, 결과와 수치 변화(호감도·설렘·관계·팔로워…)가 툭 투둑 튀어나온다.
 *   (v3.3) 미리 써 주던 추천 행동(선택지·힌트)은 없앴다 — 답은 항상 직접 쓴다(AI가 선택지를 쓰는 토큰도 아낀다).
 *   ◀ 1/2 ▶ : "다른 이벤트"로 바꿔 본 후보를 오가며 고를 수 있다(로컬 후보 우선, 바닥나면 AI)
 *   수정     : 이모지·제목·내용을 직접 고친다
 *   난이도   : 나 탭에서 바꾼다(쉬움 = 잘 오르고 덜 떨어짐, 어려움 = 쉽게 떨어짐)
 * 이미 끝난 이벤트는 결과와 칩을 움직임 없이 보여 준다.
 */
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { DeltaChips, eventDeltaGroups } from '../../components/DeltaChips';
import { IconChevronLeft, IconChevronRight, IconPen, IconRefresh } from '../../components/icons';
import { RelationChip } from '../../components/RelationChip';
import { Screen, TopBar } from '../../components/Screen';
import { TypingDots } from '../../components/TypingDots';
import { AppearIn, Button, Card, EmptyState, Field } from '../../components/ui';
import { answerEventCustom, editEvent, refreshEventVariant, setEventVariant } from '../../game/actions';
import type { RootNav, RootStackParamList } from '../../navigation/types';
import { useActive, useGame } from '../../store/game';
import { font, noOutline, radius, space, useTheme } from '../../theme';
import type { Difficulty, GameEvent } from '../../types';

const DIFF: Record<Difficulty, { emoji: string; label: string; desc: string }> = {
  easy: { emoji: '🌱', label: '쉬움', desc: '잘 오르고 잘 안 떨어져요' },
  normal: { emoji: '⚖️', label: '보통', desc: '오르내림이 적당해요' },
  hard: { emoji: '🔥', label: '어려움', desc: '자칫하면 크게 떨어져요' },
};

const CUSTOM_MAX = 140;

interface EditDraft {
  emoji: string;
  title: string;
  body: string;
}

const draftOf = (ev: GameEvent): EditDraft => ({ emoji: ev.emoji, title: ev.title, body: ev.body });

export function EventScreen() {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Event'>>();
  const sc = useActive();
  const busy = useGame((s) => !!s.busy[`event:${params.eventId}`]);
  const showToast = useGame((s) => s.showToast);
  const ev = sc?.events.find((e) => e.id === params.eventId);

  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [custom, setCustom] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // 이 화면에서 답을 기다린 이벤트면 결과를 움직여 보여 준다(이미 끝난 이벤트를 다시 열면 정지 화면)
  const live = useRef(ev?.status === 'pending');

  // 답이 실패해서(연결 오류 등) 다시 고를 수 있게 되면 보낸 답 표시를 지운다
  useEffect(() => {
    if (!busy && ev?.status === 'pending' && submitted) setSubmitted(null);
    // busy가 끝날 때만 확인
  }, [busy]);

  if (!sc || !ev) {
    return (
      <Screen>
        <TopBar title="이벤트" close />
        <EmptyState emoji="⌛" title="지나간 이벤트예요" />
      </Screen>
    );
  }

  const pending = ev.status === 'pending';
  const waiting = busy && pending;
  const locked = !pending || waiting || !!submitted;
  const variants = ev.variants?.length ? ev.variants : [ev];
  const total = Math.max(1, variants.length);
  const idx = Math.min(Math.max(0, ev.vIndex ?? 0), total - 1);
  const difficulty = DIFF[sc.difficulty ?? 'normal'];
  const people = ev.involved.map((id) => sc.characters[id]).filter(Boolean);
  const res = ev.result;

  const answer = () => {
    const t = custom.trim();
    if (!t || locked || refreshing) return;
    const r = answerEventCustom(ev.id, t);
    if (r.ok) {
      setSubmitted(t);
      setCustom('');
    } else if (r.reason === 'busy') showToast('결과를 계산하는 중이에요', 'info');
    else showToast('지금은 직접 답할 수 없어요', 'error');
  };

  const other = async () => {
    if (refreshing || locked) return;
    setRefreshing(true);
    try {
      const ok = await refreshEventVariant(ev.id);
      if (!ok) showToast('지금은 다른 이벤트를 찾지 못했어요', 'info');
    } finally {
      setRefreshing(false);
    }
  };

  const go = (i: number) => {
    if (locked || i < 0 || i >= total || i === idx) return;
    setEventVariant(ev.id, i);
  };

  const saveEdit = () => {
    if (!editing) return;
    editEvent(ev.id, {
      emoji: editing.emoji.trim() || ev.emoji,
      title: editing.title.trim() || ev.title,
      body: editing.body.trim() || ev.body,
    });
    setEditing(null);
    showToast('이벤트를 고쳤어요', 'success');
  };

  const myAnswer = res ? (res.choiceId === 'custom' || res.custom ? `내 답: “${res.custom ?? ''}”` : `내 선택: ${ev.choices.find((x) => x.id === res.choiceId)?.label ?? ''}`) : '';
  // 게임 규칙이 결과에 남기는 덤 정보(있으면): 바이럴 모먼트 적용 · 적용된 난이도
  const resExtra = (res ?? {}) as { boosted?: boolean; difficulty?: Difficulty };

  return (
    <Screen>
      <TopBar
        title="이벤트"
        close
        right={
          pending && !locked && !editing ? (
            <Pressable
              testID="event-edit"
              onPress={() => setEditing(draftOf(ev))}
              accessibilityRole="button"
              accessibilityLabel="이벤트 수정"
              hitSlop={8}
              style={({ pressed }) => [styles.editBtn, { borderColor: c.borderStrong, backgroundColor: pressed ? c.hover : 'transparent' }]}
            >
              <IconPen size={14} color={c.text} />
              <Text style={{ color: c.text, fontWeight: '700', fontSize: font.small }}>수정</Text>
            </Pressable>
          ) : null
        }
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          {/* 난이도 · 후보 이동 */}
          <View style={styles.topRow}>
            <Pressable
              testID="event-difficulty"
              onPress={() => nav.navigate('Main', { screen: 'Me' })}
              accessibilityRole="button"
              accessibilityLabel={`난이도 ${difficulty.label} — 나 탭에서 바꾸기`}
              style={({ pressed }) => [styles.diff, { borderColor: c.border, backgroundColor: pressed ? c.hover : c.surfaceAlt }]}
            >
              <Text style={{ color: c.text, fontWeight: '800', fontSize: font.small }}>
                {difficulty.emoji} 난이도 {difficulty.label}
              </Text>
              <Text style={{ color: c.subtext, fontSize: font.tiny }}>나 탭에서 바꾸기</Text>
            </Pressable>
            {pending && !editing ? (
              <View style={styles.nav}>
                <Pressable
                  testID="event-prev"
                  onPress={() => go(idx - 1)}
                  disabled={locked || idx <= 0}
                  accessibilityRole="button"
                  accessibilityLabel="이전 이벤트"
                  accessibilityState={{ disabled: locked || idx <= 0 }}
                  hitSlop={6}
                  style={[styles.navBtn, { borderColor: c.border, opacity: locked || idx <= 0 ? 0.35 : 1 }]}
                >
                  <IconChevronLeft size={18} color={c.text} />
                </Pressable>
                <Text testID="event-variant-index" style={{ color: c.text, fontWeight: '800', fontSize: font.small, minWidth: 30, textAlign: 'center', fontVariant: ['tabular-nums'] }} accessibilityLabel={`후보 ${idx + 1} / ${total}`}>
                  {idx + 1}/{total}
                </Text>
                <Pressable
                  testID="event-next"
                  onPress={() => go(idx + 1)}
                  disabled={locked || idx >= total - 1}
                  accessibilityRole="button"
                  accessibilityLabel="다음 이벤트"
                  accessibilityState={{ disabled: locked || idx >= total - 1 }}
                  hitSlop={6}
                  style={[styles.navBtn, { borderColor: c.border, opacity: locked || idx >= total - 1 ? 0.35 : 1 }]}
                >
                  <IconChevronRight size={18} color={c.text} />
                </Pressable>
              </View>
            ) : null}
          </View>
          {pending && !editing ? (
            <Pressable
              testID="event-refresh"
              onPress={other}
              disabled={locked || refreshing}
              accessibilityRole="button"
              accessibilityLabel="다른 이벤트"
              accessibilityState={{ disabled: locked || refreshing, busy: refreshing }}
              style={({ pressed }) => [styles.refresh, { borderColor: c.borderStrong, opacity: locked ? 0.4 : pressed ? 0.7 : 1 }]}
            >
              <IconRefresh size={14} color={c.primary} />
              <Text style={{ color: c.primary, fontWeight: '800', fontSize: font.small }}>{refreshing ? '다른 이벤트 찾는 중…' : '다른 이벤트'}</Text>
            </Pressable>
          ) : null}

          {editing ? (
            <View style={{ gap: space.md }}>
              <Text style={{ color: c.text, fontSize: font.title, fontWeight: '900' }}>이벤트 고치기</Text>
              <Field label="이모지" value={editing.emoji} onChangeText={(t) => setEditing({ ...editing, emoji: t })} maxLength={4} />
              <Field label="제목" value={editing.title} onChangeText={(t) => setEditing({ ...editing, title: t })} maxLength={40} counter />
              <Field label="내용" value={editing.body} onChangeText={(t) => setEditing({ ...editing, body: t })} maxLength={300} counter multiline />
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button title="그만두기" variant="outline" style={{ flex: 1 }} onPress={() => setEditing(null)} />
                <Button title="저장" variant="ink" style={{ flex: 1 }} onPress={saveEdit} accessibilityLabel="이벤트 저장" />
              </View>
            </View>
          ) : (
            <>
              <Text style={{ fontSize: 64, textAlign: 'center' }}>{ev.emoji}</Text>
              <Text style={{ color: c.text, fontSize: font.h1, fontWeight: '900', textAlign: 'center' }}>{ev.title}</Text>
              <Text style={{ color: c.text, fontSize: font.body, lineHeight: 23, textAlign: 'center' }}>{ev.body}</Text>
              {ev.edited ? <Text style={{ color: c.faint, fontSize: font.tiny, textAlign: 'center', marginTop: -8 }}>직접 고친 이벤트</Text> : null}
              {people.length > 0 && (
                <View style={styles.people}>
                  {people.map((p) => (
                    <Pressable key={p.id} onPress={() => nav.navigate('CharacterProfile', { characterId: p.id })} style={{ alignItems: 'center', gap: 4, maxWidth: 96 }} accessibilityRole="button" accessibilityLabel={`${p.name} 프로필`}>
                      <Avatar avatar={p.avatar} size={44} square={p.badge === 'gold'} />
                      <Text style={{ color: c.text, fontSize: font.small, fontWeight: '700' }} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <RelationChip ch={p} size="xs" />
                    </Pressable>
                  ))}
                </View>
              )}

              {pending && !waiting && !submitted && (
                <View style={{ gap: space.sm }}>
                  <View style={[styles.customBox, { borderColor: c.borderStrong, backgroundColor: c.surfaceAlt }]}>
                    <Text style={{ color: c.subtext, fontSize: font.small, fontWeight: '700' }}>어떻게 할까요?</Text>
                    <TextInput
                      testID="event-custom-input"
                      value={custom}
                      onChangeText={setCustom}
                      placeholder="내 말로 답해 보세요 (예: 일단 웃으면서 넘긴다)"
                      placeholderTextColor={c.faint}
                      accessibilityLabel="이벤트에 답하기"
                      multiline
                      maxLength={CUSTOM_MAX}
                      style={[styles.customInput, noOutline, { color: c.text }]}
                    />
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ color: c.faint, fontSize: font.tiny, flex: 1 }}>
                        {custom.length}/{CUSTOM_MAX} · 답하면 하루가 지나요
                      </Text>
                      <Button title="답하기" size="sm" variant="ink" disabled={!custom.trim() || refreshing} onPress={answer} />
                    </View>
                  </View>
                </View>
              )}

              {(waiting || (submitted && pending)) && (
                <Card style={{ alignItems: 'center', gap: 10 }}>
                  {submitted ? (
                    <Text style={{ color: c.primary, fontWeight: '800', fontSize: font.small, textAlign: 'center' }}>
                      {`내 답: “${submitted}”`}
                    </Text>
                  ) : null}
                  <TypingDots color={c.primary} size={8} />
                  <Text style={{ color: c.subtext }}>반응 중…</Text>
                </Card>
              )}

              {res && (
                <AppearIn animate={live.current}>
                  <Card style={{ gap: space.md, borderColor: c.primary, borderWidth: 1 }}>
                    <Text style={{ color: c.primary, fontWeight: '800', fontSize: font.small }}>{myAnswer}</Text>
                    <Text style={{ color: c.text, fontSize: font.body, lineHeight: 23 }}>{res.text}</Text>
                    {resExtra.boosted || resExtra.difficulty ? (
                      <Text style={{ color: c.subtext, fontSize: font.tiny }}>
                        {[resExtra.boosted ? '🚀 바이럴 모먼트로 강화됨' : '', resExtra.difficulty ? `${DIFF[resExtra.difficulty].emoji} 난이도 ${DIFF[resExtra.difficulty].label} 기준` : ''].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                    <DeltaChips groups={eventDeltaGroups(sc, ev, live.current)} animate={live.current} />
                    <Button title="타임라인으로" variant="ink" onPress={() => nav.goBack()} />
                  </Card>
                </AppearIn>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  diff: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6, gap: 1 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  refresh: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: radius.pill, height: 36, alignSelf: 'center', paddingHorizontal: 16 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, height: 32, marginRight: 6 },
  people: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: space.lg },
  customBox: { borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: 6 },
  customInput: { minHeight: 56, maxHeight: 140, fontSize: font.body, lineHeight: 21, textAlignVertical: 'top', paddingVertical: 4 },
});
