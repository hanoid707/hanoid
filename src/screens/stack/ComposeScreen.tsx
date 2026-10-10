/**
 * 게시물 작성(X 스타일) — "무슨 일이 일어나고 있나요?" · 사진 첨부(크롭) · 글자 수 원
 * 입력창 아래에는 딱 두 가지만: 사이드 퀘스트(누르면 키워드 넣기) · 제안(누르면 그 글로 채우기)
 * @·# 자동완성은 기기 안에서만 계산(토큰 0). 제안은 받아 둔 것 + 로컬 문장, "다른 제안"을 누를 때만 짧은 AI 호출.
 */
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { IconCheck, IconClose, IconGlobe, IconImage, IconRefresh, IconSparkles, IconTarget } from '../../components/icons';
import { frequentPeople, MentionInput, type MentionInputHandle } from '../../components/MentionInput';
import { Photo } from '../../components/Photo';
import { usePhotoPicker } from '../../components/PhotoCropper';
import { MentionLegend, NameChip } from '../../components/RelationChip';
import { Button, ProgressBar } from '../../components/ui';
import { claimQuest, getIdeas, hasMoreIdeas, publishPost, refreshIdeas } from '../../game/actions';
import { POST_MAX_LEN } from '../../game/rules';
import type { RootNav, RootStackParamList } from '../../navigation/types';
import { useActive, useGame } from '../../store/game';
import { font, radius, space, useTheme } from '../../theme';
import type { PhotoRef, Quest } from '../../types';

/** X의 글자 수 원(남은 글자 20자 이하면 숫자) */
function CharRing({ len }: { len: number }) {
  const { c } = useTheme();
  const left = POST_MAX_LEN - len;
  const pct = Math.min(1, len / POST_MAX_LEN);
  const color = left < 0 ? c.danger : left <= 20 ? c.warning : c.primary;
  return (
    <View style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`남은 글자 ${left}자`}>
      <View style={{ position: 'absolute', width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.border }} />
      <View
        style={{
          position: 'absolute',
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 2,
          borderColor: 'transparent',
          borderTopColor: pct > 0 ? color : 'transparent',
          borderRightColor: pct > 0.25 ? color : 'transparent',
          borderBottomColor: pct > 0.5 ? color : 'transparent',
          borderLeftColor: pct > 0.75 ? color : 'transparent',
          transform: [{ rotate: '45deg' }],
        }}
      />
      {left <= 20 ? <Text style={{ color, fontSize: 10, fontWeight: '700' }}>{left}</Text> : null}
    </View>
  );
}

/** 글과 관련 깊은 미션 순서: 오늘의 미션(키워드) → 재기하기 → 글 올리기 → 팔로워·레벨 → 나머지 */
const GOAL_RANK: Record<Quest['goal'], number> = { keyword: 0, recover: 1, post: 2, followers: 3, level: 4, reply: 5, dm: 6, event: 7 };

/** 글쓰기 화면에 보일 미션(최대 3개): 보상 안 받은 것 중 안 끝난 것 먼저 */
function sideQuests(quests: Quest[]): Quest[] {
  const rank = (q: Quest) => (q.done ? 10 : 0) + (GOAL_RANK[q.goal] ?? 9);
  return quests
    .filter((q) => !q.claimed)
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 3);
}

/** 겹치지 않게 최대 3개 */
const top3 = (list: string[]) => Array.from(new Set(list.map((x) => x.trim()).filter(Boolean))).slice(0, 3);

/** 이 섹션 제목(작은 회색 굵은 글자) */
function SectionHead({ icon, title, right }: { icon: React.ReactNode; title: string; right?: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.sectionHead}>
      {icon}
      <Text style={{ color: c.text, fontWeight: '800', fontSize: font.body, flex: 1 }}>{title}</Text>
      {right}
    </View>
  );
}

export function ComposeScreen() {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<RootStackParamList, 'Compose'>>();
  const sc = useActive();
  const showToast = useGame((s) => s.showToast);
  const picker = usePhotoPicker();
  const inputRef = useRef<MentionInputHandle>(null);
  const [text, setText] = useState(route.params?.text ?? '');
  const [media, setMedia] = useState<PhotoRef | undefined>();
  const [ideas, setIdeas] = useState<string[]>(() => top3(getIdeas()));
  const [loadingIdeas, setLoadingIdeas] = useState(false);

  // 다른 반응에 얹혀 새 제안이 도착하면(받아 둔 제안 갱신) 다시 읽는다 — 처음 한 번은 위에서 읽었으니 건너뜀
  const ideasTs = sc?.ideas?.ts;
  const firstIdeas = useRef(true);
  useEffect(() => {
    if (firstIdeas.current) {
      firstIdeas.current = false;
      return;
    }
    setIdeas(top3(getIdeas()));
  }, [ideasTs]);

  const frequent = useMemo(() => (sc ? frequentPeople(sc, 6) : []), [sc]);
  if (!sc) return null;

  const quests = sideQuests(sc.quests);
  const armed = sc.boost?.kind === 'viral';

  const submit = () => {
    const r = publishPost(text, media);
    if (r.ok) nav.goBack();
  };

  // 모아 둔 AI 제안 중 지금 안 보이는 것으로(AI 호출 없음)
  const more = hasMoreIdeas(ideas);
  const moreIdeas = async () => {
    if (loadingIdeas) return;
    setLoadingIdeas(true);
    try {
      const fresh = await refreshIdeas(ideas);
      if (fresh.length) setIdeas(top3(fresh));
      else showToast('새 제안은 글을 올리거나 하루가 지나면 AI가 보내 줘요', 'info');
    } finally {
      setLoadingIdeas(false);
    }
  };

  const addPhoto = async () => {
    const id = await picker.pick('post');
    if (id) setMedia({ mediaId: id });
  };

  const insertKeyword = (q: Quest) => {
    const k = q.keyword?.[0];
    if (!k) return;
    inputRef.current?.insert(k);
    inputRef.current?.focus();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => nav.goBack()} hitSlop={10} accessibilityRole="button" accessibilityLabel="취소">
          <Text style={{ color: c.text, fontSize: font.body }}>취소</Text>
        </Pressable>
        <Button title="게시하기" size="sm" disabled={!text.trim() && !media} onPress={submit} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.md }} keyboardShouldPersistTaps="handled">
          <View style={styles.row}>
            <Avatar avatar={sc.persona.avatar} size={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <MentionInput
                ref={inputRef}
                autoFocus
                value={text}
                onChangeText={setText}
                placeholder="무슨 일이 일어나고 있나요?"
                placeholderTextColor={c.subtext}
                multiline
                maxLength={POST_MAX_LEN + 20}
                placement="below"
                style={[styles.input, { color: c.text }]}
              />
              {media ? (
                <View>
                  <Photo photo={media} table="scene" ratio={16 / 10} style={[styles.media, { borderColor: c.border }]} />
                  <Pressable onPress={() => setMedia(undefined)} style={styles.removeMedia} accessibilityRole="button" accessibilityLabel="사진 빼기">
                    <IconClose size={16} color="#fff" />
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>
          <View style={[styles.reply, { borderBottomColor: c.border }]}>
            <IconGlobe size={15} color={c.primary} />
            <Text style={{ color: c.primary, fontSize: font.small, fontWeight: '700', flex: 1 }} numberOfLines={1}>
              모든 사람이 답글을 달 수 있습니다
            </Text>
            {armed ? <Text style={{ color: c.aura, fontSize: font.small, fontWeight: '800' }}>🚀 바이럴 모먼트 켜짐</Text> : null}
          </View>

          {frequent.length > 0 && (
            <View style={{ gap: 6 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.mentionRow}>
                <Text style={{ color: c.subtext, fontSize: font.small, fontWeight: '700' }}>자주 멘션</Text>
                {frequent.map((ch) => (
                  <NameChip key={ch.id} ch={ch} size="sm" onPress={() => inputRef.current?.insert(`@${ch.handle}`)} />
                ))}
              </ScrollView>
              <MentionLegend />
            </View>
          )}

          {quests.length > 0 && (
            <View style={{ gap: 2 }}>
              <SectionHead icon={<IconTarget size={16} color={c.aura} />} title="사이드 퀘스트" />
              {quests.map((q) => {
                const kw = q.goal === 'keyword' && !q.done ? q.keyword?.[0] : undefined;
                const hit = !!kw && q.keyword!.some((k) => text.includes(k));
                const body = (
                  <>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={{ color: c.text, fontWeight: '800', fontSize: font.small }} numberOfLines={1}>
                        {q.title}
                      </Text>
                      <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 17 }} numberOfLines={2}>
                        {q.desc}
                      </Text>
                      <View style={styles.progressRow}>
                        <View style={{ flex: 1 }}>
                          <ProgressBar value={q.progress} max={q.target} color={q.done ? c.repost : c.aura} height={4} />
                        </View>
                        <Text style={{ color: c.subtext, fontSize: font.tiny, fontVariant: ['tabular-nums'] }}>
                          {Math.min(q.progress, q.target)}/{q.target}
                        </Text>
                      </View>
                    </View>
                    {q.done ? (
                      <Button title="보상 받기" size="sm" variant="secondary" onPress={() => claimQuest(q.id)} />
                    ) : kw ? (
                      hit ? (
                        <View style={[styles.kw, { borderColor: c.repost, backgroundColor: c.repostSoft }]}>
                          <IconCheck size={13} color={c.repost} />
                          <Text style={{ color: c.repost, fontSize: font.tiny, fontWeight: '800' }}>들어감</Text>
                        </View>
                      ) : (
                        <View style={[styles.kw, { borderColor: c.aura }]}>
                          <Text style={{ color: c.aura, fontSize: font.tiny, fontWeight: '800' }} numberOfLines={1}>
                            ‘{kw}’ 넣기
                          </Text>
                        </View>
                      )
                    ) : null}
                  </>
                );
                return kw ? (
                  <Pressable
                    key={q.id}
                    onPress={() => insertKeyword(q)}
                    accessibilityRole="button"
                    accessibilityLabel={`미션 키워드 넣기: ${kw}`}
                    style={({ pressed }) => [styles.quest, { borderColor: c.border, backgroundColor: pressed ? c.hover : 'transparent' }]}
                  >
                    {body}
                  </Pressable>
                ) : (
                  <View key={q.id} style={[styles.quest, { borderColor: c.border }]}>
                    {body}
                  </View>
                );
              })}
            </View>
          )}

          <View style={{ gap: 6 }}>
            <SectionHead
              icon={<IconSparkles size={16} color={c.primary} />}
              title="제안"
              right={
                !more ? undefined : (
                <Pressable
                  onPress={moreIdeas}
                  disabled={loadingIdeas}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="다른 제안"
                  accessibilityState={{ busy: loadingIdeas }}
                  style={({ pressed }) => [styles.more, { borderColor: c.borderStrong, opacity: loadingIdeas ? 0.6 : pressed ? 0.7 : 1 }]}
                >
                  <IconRefresh size={13} color={c.primary} />
                  <Text style={{ color: c.primary, fontSize: font.small, fontWeight: '700' }}>{loadingIdeas ? '고르는 중…' : '다른 제안'}</Text>
                </Pressable>
                )
              }
            />
            {ideas.length > 0 ? (
              ideas.map((idea) => (
                <Pressable
                  key={idea}
                  onPress={() => setText(idea.slice(0, POST_MAX_LEN))}
                  accessibilityRole="button"
                  accessibilityLabel={`제안 쓰기: ${idea}`}
                  style={({ pressed }) => [styles.idea, { borderColor: c.border, backgroundColor: pressed ? c.hover : c.surfaceAlt }]}
                >
                  <Text style={{ color: c.text, fontSize: font.body, lineHeight: 21 }}>{idea}</Text>
                </Pressable>
              ))
            ) : (
              <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 18 }}>
                아직 제안이 없어요. 글을 올리거나 하루가 지나면 AI가 지금 상황에 맞는 글감을 보내 줘요.
              </Text>
            )}
          </View>
        </ScrollView>
        <View style={[styles.toolbar, { borderTopColor: c.border, paddingBottom: insets.bottom + 8 }]}>
          <Pressable onPress={addPhoto} hitSlop={8} accessibilityRole="button" accessibilityLabel="사진 첨부">
            <IconImage size={22} color={c.primary} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <CharRing len={text.length} />
        </View>
      </KeyboardAvoidingView>
      {picker.modal}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingBottom: 8 },
  row: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', marginTop: 4 },
  input: { minHeight: 110, fontSize: font.title + 1, lineHeight: 25, textAlignVertical: 'top', paddingTop: 6 },
  media: { borderRadius: radius.lg, borderWidth: 1, width: '100%', marginTop: 8 },
  removeMedia: { position: 'absolute', top: 14, left: 6, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(15,20,25,0.75)', alignItems: 'center', justifyContent: 'center' },
  reply: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  mentionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  quest: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10, marginTop: 6 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  kw: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 9, height: 26, maxWidth: 120 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, height: 28 },
  idea: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 11 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: space.lg, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
