/** 북마크 — 저장한 게시물 */
import { FlatList } from 'react-native';
import { PostCard } from '../../components/PostCard';
import { Screen, TopBar } from '../../components/Screen';
import { EmptyState } from '../../components/ui';
import { useActive } from '../../store/game';

export function BookmarksScreen() {
  const sc = useActive();
  if (!sc) return null;
  const list = Object.values(sc.posts)
    .filter((p) => p.bookmarked)
    .sort((a, b) => b.ts - a.ts);
  return (
    <Screen>
      <TopBar title="북마크" subtitle={`@${sc.persona.handle}`} />
      <FlatList
        data={list}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PostCard post={item} sc={sc} />}
        ListEmptyComponent={<EmptyState title="나중에 볼 게시물 저장하기" desc="게시물의 북마크 아이콘을 누르면 여기에 모여요." />}
        contentContainerStyle={{ paddingBottom: 60 }}
      />
    </Screen>
  );
}
