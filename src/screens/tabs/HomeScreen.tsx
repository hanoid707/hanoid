/** 홈 타임라인(X 스타일) — 왼쪽 위 세계관 · 오른쪽 위 날짜(누르면 아이템) · 추천/팔로잉 탭 · 오른쪽 아래 글쓰기 버튼 */
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClockChip, EventCard, StatusBanner } from '../../components/Hud';
import { IconPlus } from '../../components/icons';
import { PostCard } from '../../components/PostCard';
import { Screen } from '../../components/Screen';
import { EmptyState, Tabs } from '../../components/ui';
import { refreshFeed } from '../../game/actions';
import type { RootNav } from '../../navigation/types';
import { useActive } from '../../store/game';
import { font, space, useTheme } from '../../theme';
import { ME, SYSTEM, type Post } from '../../types';

type FeedTab = 'forYou' | 'following';

export function HomeScreen() {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const sc = useActive();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<FeedTab>('forYou');
  const listRef = useRef<FlatList<Post>>(null);
  // 홈 탭을 한 번 더 누르면 맨 위로(X와 같음)
  useScrollToTop(listRef);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshFeed();
    } finally {
      setRefreshing(false);
    }
  }, []);

  const posts = useMemo(() => {
    if (!sc) return [];
    const all = sc.feed.map((id) => sc.posts[id]).filter(Boolean);
    if (tab === 'forYou') return all;
    return all.filter((p) => p.authorId === ME || p.authorId === SYSTEM || sc.characters[p.authorId]?.iFollow);
  }, [sc, tab]);

  if (!sc) return null;
  const pending = sc.events.filter((e) => e.status === 'pending');
  const toTop = () => listRef.current?.scrollToOffset({ offset: 0, animated: true });

  return (
    <Screen>
      <View style={[styles.header, { paddingTop: insets.top, backgroundColor: c.bg }]}>
        <View style={styles.headRow}>
          <Pressable onPress={toTop} accessibilityRole="button" accessibilityLabel="맨 위로" style={styles.world} hitSlop={6}>
            <Text style={{ fontSize: 22 }}>{sc.world.emoji}</Text>
            <Text style={{ color: c.text, fontSize: font.title, fontWeight: '900', flexShrink: 1 }} numberOfLines={1}>
              {sc.world.name}
            </Text>
          </Pressable>
          <ClockChip sc={sc} />
        </View>
        <Tabs<FeedTab>
          tabs={[
            { key: 'forYou', label: '추천' },
            { key: 'following', label: '팔로잉' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      <FlatList
        ref={listRef}
        data={posts}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PostCard post={item} sc={sc} />}
        ListHeaderComponent={
          <View>
            <StatusBanner sc={sc} />
            {pending.map((ev) => (
              <EventCard key={ev.id} ev={ev} />
            ))}
          </View>
        }
        ListEmptyComponent={
          tab === 'following' ? (
            <EmptyState title="아직 팔로우한 계정의 글이 없어요" desc="검색 탭에서 마음에 드는 계정을 팔로우해 보세요." />
          ) : (
            <EmptyState title="아직 조용하네요" desc="첫 글을 올려서 세계를 깨워보세요." />
          )
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} colors={[c.primary]} />}
        contentContainerStyle={{ paddingBottom: 120 }}
        initialNumToRender={8}
        windowSize={9}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="게시하기"
        onPress={() => nav.navigate('Compose')}
        style={({ pressed }) => [styles.fab, { backgroundColor: c.primary, opacity: pressed ? 0.85 : 1 }]}
      >
        <IconPlus size={28} color="#fff" strokeWidth={2.4} />
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { zIndex: 2 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.lg, height: 52 },
  world: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
});
