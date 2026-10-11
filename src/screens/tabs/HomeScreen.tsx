/** 홈 타임라인(X 스타일) — 왼쪽 위 세계관(누르면 세계관·세이브 창) · 오른쪽 위 날짜(누르면 아이템) · 오른쪽 아래 글쓰기 버튼 */
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClockChip, EventCard, FeedSkeleton, StatusBanner } from '../../components/Hud';
import { IconChevronRight, IconPlus } from '../../components/icons';
import { PostCard } from '../../components/PostCard';
import { SaveSwitcher } from '../../components/SaveList';
import { Screen } from '../../components/Screen';
import { AppearIn, EmptyState } from '../../components/ui';
import { refreshFeed } from '../../game/actions';
import { ensureBonds } from '../../game/bonds';
import type { RootNav } from '../../navigation/types';
import { useActive } from '../../store/game';
import { font, space, useTheme } from '../../theme';
import type { Post } from '../../types';

export function HomeScreen() {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const sc = useActive();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [savesOpen, setSavesOpen] = useState(false);
  const listRef = useRef<FlatList<Post>>(null);
  // 홈 탭을 한 번 더 누르면 맨 위로(X와 같음)
  useScrollToTop(listRef);
  // 이 이야기의 인물 정보(자리·나이·서로를 향한 마음)를 아직 안 채웠으면 뒤에서 한 번 채운다
  const sid = sc?.id;
  useEffect(() => {
    if (sid) void ensureBonds(sid);
  }, [sid]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshFeed();
    } finally {
      setRefreshing(false);
    }
  }, []);

  const posts = useMemo(() => (sc ? sc.feed.map((id) => sc.posts[id]).filter(Boolean) : []), [sc]);

  if (!sc) return null;
  const pending = sc.events.filter((e) => e.status === 'pending');

  return (
    <Screen>
      <View style={[styles.header, { paddingTop: insets.top, backgroundColor: c.bg, borderBottomColor: c.border }]}>
        <View style={styles.headRow}>
          <View style={styles.worldWrap}>
            <Pressable
              onPress={() => setSavesOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`${sc.world.name} — 세계관·세이브 바꾸기`}
              style={({ pressed }) => [styles.world, pressed && { opacity: 0.6 }]}
              hitSlop={6}
            >
              <Text style={{ fontSize: 22 }}>{sc.world.emoji}</Text>
              <Text style={{ color: c.text, fontSize: font.title, fontWeight: '900', flexShrink: 1 }} numberOfLines={1}>
                {sc.world.name}
              </Text>
              <View style={{ transform: [{ rotate: '90deg' }] }}>
                <IconChevronRight size={16} color={c.subtext} />
              </View>
            </Pressable>
          </View>
          <ClockChip sc={sc} />
        </View>
      </View>
      <FlatList
        ref={listRef}
        data={posts}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          // 방금 올라온 글은 살짝 떠오르며 나타난다(처음부터 있던 글은 그대로)
          <AppearIn animate={Date.now() - (item.ts ?? 0) < 2500} from={14}>
            <PostCard post={item} sc={sc} />
          </AppearIn>
        )}
        ListHeaderComponent={
          <View>
            <StatusBanner sc={sc} />
            {pending.map((ev) => (
              <EventCard key={ev.id} ev={ev} />
            ))}
            <FeedSkeleton sid={sc.id} />
          </View>
        }
        ListEmptyComponent={<EmptyState title="아직 조용하네요" desc="첫 글을 올려서 세계를 깨워보세요." />}
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
      <SaveSwitcher open={savesOpen} onClose={() => setSavesOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { zIndex: 2, borderBottomWidth: StyleSheet.hairlineWidth },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.lg, height: 52 },
  worldWrap: { flex: 1, minWidth: 0, flexDirection: 'row' },
  world: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0, flexShrink: 1 },
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
