/** 쪽지 목록(X DM 스타일) — 안 읽은 쪽지(파란 점)·입력 중·대화방 나감 표시 */
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { VerifiedBadge } from '../../components/Badge';
import { IconMailPlus, IconSearch, IconSettings } from '../../components/icons';
import { Screen } from '../../components/Screen';
import { TypingDots } from '../../components/TypingDots';
import { Button, EmptyState } from '../../components/ui';
import { relativeTime } from '../../game/clock';
import type { RootNav } from '../../navigation/types';
import { useActive } from '../../store/game';
import { font, noOutline, radius, space, useTheme } from '../../theme';

export function MessagesScreen() {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const sc = useActive();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  if (!sc) return null;
  const k = q.trim().toLowerCase();
  const convs = Object.values(sc.dms)
    .filter((cv) => sc.characters[cv.characterId] && !sc.characters[cv.characterId].inactive)
    .filter((cv) => !k || sc.characters[cv.characterId].name.toLowerCase().includes(k) || sc.characters[cv.characterId].handle.includes(k) || cv.messages.some((m) => m.text.toLowerCase().includes(k)))
    .sort((a, b) => b.updatedTs - a.updatedTs);

  return (
    <Screen>
      <View style={{ paddingTop: insets.top, backgroundColor: c.bg }}>
        <View style={styles.headRow}>
          <Text style={{ flex: 1, color: c.text, fontSize: font.h2, fontWeight: '800' }} accessibilityRole="header">
            쪽지
          </Text>
          <Pressable onPress={() => nav.navigate('Settings')} hitSlop={8} accessibilityLabel="설정">
            <IconSettings size={20} color={c.text} />
          </Pressable>
        </View>
        <View style={[styles.search, { borderColor: c.border }]}>
          <IconSearch size={16} color={c.subtext} />
          <TextInput value={q} onChangeText={setQ} placeholder="쪽지 검색" placeholderTextColor={c.subtext} style={[{ flex: 1, color: c.text, fontSize: font.body, paddingVertical: 8 }, noOutline]} />
        </View>
      </View>
      <FlatList
        data={convs}
        keyExtractor={(cv) => cv.characterId}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={
          <EmptyState title="받은 쪽지함에 오신 것을 환영합니다!" desc="사람들과 비공개 대화를 나눠보세요." action={<Button title="쪽지 쓰기" size="lg" onPress={() => nav.navigate('NewMessage')} style={{ alignSelf: 'flex-start', marginTop: 12 }} />} />
        }
        renderItem={({ item: cv }) => {
          const ch = sc.characters[cv.characterId];
          const last = cv.messages[cv.messages.length - 1];
          const left = cv.leftUntilDay !== null && cv.leftUntilDay > sc.clock.day;
          const badge = ch.badge === undefined ? (ch.isNews ? 'gold' : ch.verified ? 'blue' : null) : ch.badge;
          return (
            <Pressable onPress={() => nav.navigate('Chat', { characterId: cv.characterId })} accessibilityRole="button" accessibilityLabel={`${ch.name} 님과의 쪽지`} style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.hover }]}>
              <Avatar avatar={ch.avatar} size={48} square={badge === 'gold'} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: c.text, fontWeight: '800', fontSize: font.body, flexShrink: 1 }} numberOfLines={1}>
                    {ch.name}
                  </Text>
                  <VerifiedBadge kind={badge} />
                  <Text numberOfLines={1} style={{ color: c.subtext, fontSize: font.body, marginLeft: 4, flexShrink: 2 }}>
                    @{ch.handle} · {last ? relativeTime(last.at, sc.clock) : ''}
                  </Text>
                </View>
                {cv.typing ? (
                  <TypingDots color={c.subtext} />
                ) : (
                  <Text numberOfLines={1} style={{ color: cv.unread ? c.text : c.subtext, fontWeight: cv.unread ? '700' : '400', fontSize: font.body }}>
                    {left ? '대화방을 나갔습니다' : last ? `${last.from === 'me' ? '나: ' : ''}${last.text}` : '대화를 시작해보세요'}
                  </Text>
                )}
              </View>
              {cv.unread > 0 && <View style={[styles.dot, { backgroundColor: c.primary }]} />}
            </Pressable>
          );
        }}
      />
      <Pressable accessibilityRole="button" accessibilityLabel="새 쪽지" onPress={() => nav.navigate('NewMessage')} style={({ pressed }) => [styles.fab, { backgroundColor: c.primary, opacity: pressed ? 0.85 : 1 }]}>
        <IconMailPlus size={24} color="#fff" />
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: space.lg, height: 52 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: space.lg, marginBottom: 6, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 14, height: 38 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  fab: { position: 'absolute', right: 18, bottom: 18, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
});
