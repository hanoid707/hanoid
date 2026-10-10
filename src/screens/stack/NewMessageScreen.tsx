/** 새 쪽지 — 받는 사람 고르기(이름·아이디·초성 검색, 가까운 사이 먼저) */
import { useNavigation } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import { IconSearch } from '../../components/icons';
import { personScore } from '../../components/MentionInput';
import { Screen, TopBar } from '../../components/Screen';
import { UserRow } from '../../components/UserRow';
import { EmptyState } from '../../components/ui';
import type { RootNav } from '../../navigation/types';
import { useActive } from '../../store/game';
import { font, noOutline, space, useTheme } from '../../theme';
import type { Character } from '../../types';

export function NewMessageScreen() {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const sc = useActive();
  const [q, setQ] = useState('');
  const list = useMemo<Character[]>(() => {
    if (!sc) return [];
    const people = sc.cast.map((id) => sc.characters[id]).filter((ch): ch is Character => !!ch && !ch.inactive);
    const k = q.trim().replace(/^@/, '');
    if (!k) {
      // 쪽지를 주고받은 사람 → 인증 캐릭터 → 호감도 순
      const dmTs = (ch: Character) => sc.dms[ch.id]?.updatedTs ?? 0;
      return [...people].sort((a, b) => dmTs(b) - dmTs(a) || (b.tier !== 'crowd' ? 1 : 0) - (a.tier !== 'crowd' ? 1 : 0) || b.affinity - a.affinity);
    }
    return people
      .map((ch) => ({ ch, s: personScore(ch, k) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => a.s - b.s || b.ch.affinity - a.ch.affinity)
      .map((x) => x.ch);
  }, [sc, q]);
  if (!sc) return null;
  return (
    <Screen>
      <TopBar title="새 쪽지" close />
      <View style={[styles.search, { borderBottomColor: c.border }]}>
        <IconSearch size={18} color={c.primary} />
        <TextInput
          value={q}
          onChangeText={setQ}
          autoFocus
          placeholder="사람 검색"
          accessibilityLabel="사람 검색"
          placeholderTextColor={c.subtext}
          style={[{ flex: 1, color: c.text, fontSize: font.body, paddingVertical: 12 }, noOutline]}
        />
      </View>
      <FlatList
        data={list}
        keyExtractor={(ch) => ch.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<EmptyState title="찾는 사람이 없어요" desc="이름·아이디·초성(예: ㅅㅇ)으로 찾아보세요." />}
        renderItem={({ item: ch }) => (
          <UserRow
            ch={ch}
            showBio={false}
            right={<View />}
            onPress={() => {
              nav.goBack();
              nav.navigate('Chat', { characterId: ch.id });
            }}
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.lg, borderBottomWidth: StyleSheet.hairlineWidth },
});
