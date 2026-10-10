/**
 * 쪽지 대화(X DM 스타일) — 메신저처럼: 같은 사람이 연달아 보낸 줄은 한 묶음, 묶음 끝에 프사·시각, 내 마지막 쪽지에 읽음 표시
 * 상대 답장은 한 줄씩 도착하고(게임이 시차를 둠) 그 사이에 "입력 중…" 말풍선이 보인다.
 * 머리말: 관계 칩 + 지금 쓰는 말투(예: 친구 · 반말) · 🎁 선물(아이템 화면으로)
 */
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { VerifiedBadge } from '../../components/Badge';
import { IconGift, IconSend } from '../../components/icons';
import { MentionInput } from '../../components/MentionInput';
import { RelationChip } from '../../components/RelationChip';
import { Screen, TopBar } from '../../components/Screen';
import { TypingDots } from '../../components/TypingDots';
import { AppearIn } from '../../components/ui';
import { markConversationRead, sendDM } from '../../game/actions';
import { dayLabel, minutesBetween } from '../../game/clock';
import { GIFTS } from '../../game/items';
import { DM_MAX_LEN } from '../../game/rules';
import type { RootNav, RootStackParamList } from '../../navigation/types';
import { useActive, useGame } from '../../store/game';
import { font, noOutline, radius, space, useTheme } from '../../theme';
import type { DMMessage, GameTime } from '../../types';
import { formatCount } from '../../utils';

const clockText = (t: GameTime) => `${t.hour < 12 ? '오전' : '오후'} ${t.hour % 12 === 0 ? 12 : t.hour % 12}:${String(t.minute).padStart(2, '0')}`;
const AVATAR = 30;

/** 같은 사람이 10분 안에 연달아 보낸 줄 = 한 묶음 */
const sameGroup = (a?: DMMessage, b?: DMMessage) => !!a && !!b && a.from === b.from && a.from !== 'system' && Math.abs(minutesBetween(a.at, b.at)) < 10;

/** 선물 쪽지(아이템)면 선물 정보 */
const giftOf = (m: DMMessage) => (m.from === 'me' ? GIFTS.find((g) => m.text.startsWith(g.message) || m.text.startsWith(`${g.emoji} ${g.name}`)) : undefined);

export function ChatScreen() {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Chat'>>();
  const sc = useActive();
  const showToast = useGame((s) => s.showToast);
  const busy = useGame((s) => !!s.busy[`dm:${params.characterId}`]);
  const [text, setText] = useState('');
  const listRef = useRef<FlatList<DMMessage>>(null);

  const ch = sc?.characters[params.characterId];
  const conv = sc?.dms[params.characterId];
  const messages = conv?.messages ?? [];
  const left = !!conv && conv.leftUntilDay !== null && !!sc && conv.leftUntilDay > sc.clock.day;

  // 보는 동안 새로 도착한 줄만 살짝 떠오르게
  const seen = useRef<Set<string>>(new Set());
  const ready = useRef(false);
  useEffect(() => {
    for (const m of messages) seen.current.add(m.id);
    ready.current = true;
  }, [messages]);

  // 대화 화면을 보고 있는 동안 도착한 쪽지는 바로 읽음 처리
  useEffect(() => {
    if (conv?.unread) markConversationRead(params.characterId);
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages.length, conv?.unread, conv?.typing, params.characterId]);

  if (!sc || !ch) return null;
  const badge = ch.badge === undefined ? (ch.isNews ? 'gold' : ch.verified ? 'blue' : null) : ch.badge;
  const lastMineIdx = messages.map((m) => m.from).lastIndexOf('me');
  const goProfile = () => nav.navigate('CharacterProfile', { characterId: ch.id });

  const send = () => {
    const r = sendDM(ch.id, text);
    if (r.ok) setText('');
    else if (r.reason === 'busy') showToast('상대가 답장하는 중이에요', 'info');
  };
  const canSend = !!text.trim() && !busy;

  return (
    <Screen>
      <TopBar
        title={
          <Pressable onPress={goProfile} accessibilityRole="button" accessibilityLabel={`${ch.name} 프로필`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar avatar={ch.avatar} size={32} square={badge === 'gold'} />
            <View style={{ flexShrink: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: c.text, fontWeight: '800', fontSize: font.title, flexShrink: 1 }} numberOfLines={1}>
                  {ch.name}
                </Text>
                <VerifiedBadge kind={badge} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <RelationChip ch={ch} size="xs" showRegister />
                <Text style={{ color: c.subtext, fontSize: font.small, flexShrink: 1 }} numberOfLines={1}>
                  @{ch.handle}
                </Text>
              </View>
            </View>
          </Pressable>
        }
        right={
          <Pressable
            onPress={() => nav.navigate('Items', { giftTo: ch.id })}
            accessibilityRole="button"
            accessibilityLabel="선물하기"
            hitSlop={8}
            style={({ pressed }) => [styles.giftBtn, { backgroundColor: pressed ? c.hover : 'transparent' }]}
          >
            <IconGift size={21} color={c.text} />
          </Pressable>
        }
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListHeaderComponent={
            <Pressable onPress={goProfile} style={[styles.intro, { borderBottomColor: c.border }]}>
              <Avatar avatar={ch.avatar} size={64} square={badge === 'gold'} />
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                <Text style={{ color: c.text, fontWeight: '800', fontSize: font.title }}>{ch.name}</Text>
                <VerifiedBadge kind={badge} />
              </View>
              <Text style={{ color: c.subtext, fontSize: font.body }}>@{ch.handle}</Text>
              {ch.bio ? <Text style={{ color: c.text, fontSize: font.body, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>{ch.bio}</Text> : null}
              <Text style={{ color: c.subtext, fontSize: font.small, marginTop: 6 }}>
                {ch.joined ? `가입일: ${ch.joined} · ` : ''}팔로워 {formatCount(ch.followers)}명{ch.followsMe ? ' · 나를 팔로우합니다' : ''}
              </Text>
            </Pressable>
          }
          renderItem={({ item: m, index }) => {
            const prev = messages[index - 1];
            const next = messages[index + 1];
            const newDay = !prev || prev.at.day !== m.at.day;
            const dayLine = newDay ? <Text style={[styles.day, { color: c.subtext }]}>{dayLabel(m.at.day)}</Text> : null;
            const animate = ready.current && !seen.current.has(m.id);
            if (m.from === 'system') {
              return (
                <AppearIn animate={animate}>
                  {dayLine}
                  <Text style={[styles.system, { color: c.subtext }]}>{m.text}</Text>
                </AppearIn>
              );
            }
            const mine = m.from === 'me';
            const firstOfGroup = newDay || !sameGroup(prev, m);
            const lastOfGroup = !sameGroup(m, next) || (!!next && next.at.day !== m.at.day);
            const gift = giftOf(m);
            const r = 20;
            const corner = mine
              ? { borderTopRightRadius: firstOfGroup ? r : 6, borderBottomRightRadius: lastOfGroup ? 4 : 6 }
              : { borderTopLeftRadius: firstOfGroup ? r : 6, borderBottomLeftRadius: lastOfGroup ? 4 : 6 };
            return (
              <AppearIn animate={animate} from={8}>
                {dayLine}
                <View style={[styles.line, { justifyContent: mine ? 'flex-end' : 'flex-start', marginTop: firstOfGroup ? 10 : 2 }]}>
                  {!mine ? <View style={{ width: AVATAR }}>{lastOfGroup ? <Avatar avatar={ch.avatar} size={AVATAR} square={badge === 'gold'} onPress={goProfile} /> : null}</View> : null}
                  {gift ? (
                    <View style={[styles.gift, { borderColor: c.borderStrong, backgroundColor: c.surfaceAlt }]}>
                      <Text style={{ fontSize: 34 }}>{gift.emoji}</Text>
                      <Text style={{ color: c.text, fontWeight: '800', fontSize: font.body }}>{gift.name}</Text>
                      <Text style={{ color: c.subtext, fontSize: font.small }}>선물을 보냈어요</Text>
                    </View>
                  ) : (
                    <View style={[styles.bubble, corner, mine ? { backgroundColor: c.bubbleMe } : { backgroundColor: c.bubbleThem }]}>
                      <Text style={{ color: mine ? '#fff' : c.onBubbleThem, fontSize: font.body, lineHeight: 21 }}>{m.text}</Text>
                    </View>
                  )}
                </View>
                {lastOfGroup && (
                  <Text style={[styles.meta, { color: c.subtext, textAlign: mine ? 'right' : 'left', marginLeft: mine ? 0 : AVATAR + 8 }]}>
                    {clockText(m.at)}
                    {mine && index === lastMineIdx ? ` · ${m.read ? '읽음' : '전송됨'}` : ''}
                  </Text>
                )}
              </AppearIn>
            );
          }}
          ListFooterComponent={
            conv?.typing ? (
              <AppearIn style={[styles.line, { marginTop: 10 }]} from={6}>
                <Avatar avatar={ch.avatar} size={AVATAR} square={badge === 'gold'} />
                <View style={[styles.bubble, styles.typing, { backgroundColor: c.bubbleThem }]} accessibilityLabel={`${ch.name}님이 입력 중`}>
                  <TypingDots color={c.subtext} />
                </View>
              </AppearIn>
            ) : null
          }
        />
        {left ? (
          <View style={[styles.leftBox, { borderTopColor: c.border, paddingBottom: insets.bottom + space.md }]}>
            <Text style={{ color: c.subtext, textAlign: 'center', fontSize: font.body }}>{ch.name}님이 대화방을 나갔습니다. 내일쯤 돌아올지도 몰라요.</Text>
          </View>
        ) : (
          <View style={[styles.composer, { backgroundColor: c.bg, borderTopColor: c.border, paddingBottom: space.sm + insets.bottom }]}>
            <MentionInput
              value={text}
              onChangeText={setText}
              placeholder="새 쪽지 작성"
              placeholderTextColor={c.subtext}
              maxLength={DM_MAX_LEN}
              multiline
              placement="above"
              // 웹: 엔터로 전송, 줄바꿈은 Shift+엔터. 한글 조합 중 엔터는 글자 확정이므로 보내지 않는다
              onKeyPress={(e) => {
                if (Platform.OS !== 'web') return;
                const ne = e.nativeEvent as { key?: string; shiftKey?: boolean; isComposing?: boolean; keyCode?: number };
                if (ne.key !== 'Enter' || ne.shiftKey) return;
                if (ne.isComposing || ne.keyCode === 229) return;
                (e as unknown as { preventDefault?: () => void }).preventDefault?.();
                if (canSend) send();
              }}
              rowStyle={[styles.inputWrap, { backgroundColor: c.surfaceAlt }]}
              style={[styles.input, noOutline, { color: c.text }]}
              right={
                <Pressable accessibilityRole="button" accessibilityLabel="보내기" onPress={send} disabled={!canSend} hitSlop={8} style={{ opacity: canSend ? 1 : 0.35, padding: 6, marginBottom: 3 }}>
                  <IconSend size={20} color={c.primary} />
                </Pressable>
              }
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { alignItems: 'center', paddingVertical: space.xl, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: space.sm },
  giftBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  day: { alignSelf: 'center', fontSize: font.small, fontWeight: '700', marginTop: 14, marginBottom: 2 },
  line: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubble: { maxWidth: '78%', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 20 },
  gift: { alignItems: 'center', gap: 2, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 22, paddingVertical: 14, maxWidth: '78%' },
  typing: { paddingVertical: 14 },
  meta: { fontSize: font.tiny + 1, marginTop: 3 },
  system: { alignSelf: 'center', fontSize: font.small, paddingVertical: 8 },
  composer: { paddingHorizontal: space.md, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  inputWrap: { alignItems: 'flex-end', borderRadius: radius.lg, paddingLeft: 14, paddingRight: 6, minHeight: 42 },
  input: { maxHeight: 120, paddingTop: 11, paddingBottom: 11, fontSize: font.body },
  leftBox: { padding: space.lg, borderTopWidth: StyleSheet.hairlineWidth },
});
