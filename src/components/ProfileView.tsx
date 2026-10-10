/**
 * 프로필 화면 공용(X 스타일): 배너 · 겹친 프로필 사진 · 이름 ✓ · @아이디 · 소개 · 위치/가입일 · 팔로우 수 · 탭(게시물/답글/미디어/마음에 들어요)
 * 내 프로필과 캐릭터 프로필이 같은 틀을 쓴다.
 */
import { useNavigation } from '@react-navigation/native';
import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootNav } from '../navigation/types';
import { font, space, useTheme } from '../theme';
import type { Avatar as AvatarData, BadgeKind, ID, PhotoRef, Post, Scenario } from '../types';
import { formatCount } from '../utils';
import { authorOf } from './author';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './Badge';
import { IconBack, IconCalendar, IconPin } from './icons';
import { Photo } from './Photo';
import { PostCard } from './PostCard';
import { EmptyState, Tabs } from './ui';

type PTab = 'posts' | 'replies' | 'media' | 'likes';

export interface ProfileInfo {
  authorId: ID;
  name: string;
  handle: string;
  avatar: AvatarData;
  banner?: PhotoRef;
  bannerColor: string;
  badge: BadgeKind | null;
  bio: string;
  location?: string;
  joined?: string;
  following: number;
  followers: number;
  followsMe?: boolean;
  isOrg?: boolean;
}

export function ProfileView({ sc, info, actions, extra, showLikes }: { sc: Scenario; info: ProfileInfo; actions: ReactNode; extra?: ReactNode; showLikes?: boolean }) {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<PTab>('posts');

  const list = useMemo(() => {
    const all = Object.values(sc.posts).filter((p) => p.kind !== 'system');
    let out: Post[];
    if (tab === 'likes') out = all.filter((p) => p.liked);
    else {
      const mine = all.filter((p) => p.authorId === info.authorId);
      out = tab === 'posts' ? mine.filter((p) => p.kind !== 'reply') : tab === 'replies' ? mine.filter((p) => p.kind === 'reply') : mine.filter((p) => !!p.media);
    }
    return out.sort((a, b) => b.ts - a.ts).slice(0, 60);
  }, [sc.posts, tab, info.authorId]);

  const tabs: { key: PTab; label: string }[] = [
    { key: 'posts', label: '게시물' },
    { key: 'replies', label: '답글' },
    { key: 'media', label: '미디어' },
  ];
  if (showLikes) tabs.push({ key: 'likes', label: '마음에 들어요' });

  const header = (
    <View>
      <View>
        <Photo photo={info.banner} table="banner" fallback={info.bannerColor} style={{ width: '100%', height: 128 + insets.top * 0.4 }} />
        <Pressable onPress={() => nav.goBack()} style={[styles.back, { top: insets.top + 8 }]} accessibilityLabel="뒤로" hitSlop={8}>
          <IconBack size={20} color="#fff" />
        </Pressable>
      </View>
      <View style={styles.body}>
        <View style={styles.avatarRow}>
          <View style={{ marginTop: -38 }}>
            <Avatar avatar={info.avatar} size={78} ring={4} square={info.isOrg} />
          </View>
          <View style={styles.actions}>{actions}</View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          <Text style={{ color: c.text, fontSize: font.h2, fontWeight: '900', flexShrink: 1 }}>{info.name}</Text>
          <VerifiedBadge kind={info.badge} size={20} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: c.subtext, fontSize: font.body }}>@{info.handle}</Text>
          {info.followsMe ? <Text style={[styles.follows, { backgroundColor: c.surfaceAlt, color: c.subtext }]}>나를 팔로우합니다</Text> : null}
        </View>
        {info.bio ? <Text style={{ color: c.text, fontSize: font.body, lineHeight: 21, marginTop: 10 }}>{info.bio}</Text> : null}
        <View style={styles.meta}>
          {info.location ? (
            <View style={styles.metaItem}>
              <IconPin size={15} color={c.subtext} />
              <Text style={{ color: c.subtext, fontSize: font.body }}>{info.location}</Text>
            </View>
          ) : null}
          {info.joined ? (
            <View style={styles.metaItem}>
              <IconCalendar size={15} color={c.subtext} />
              <Text style={{ color: c.subtext, fontSize: font.body }}>가입일: {info.joined}</Text>
            </View>
          ) : null}
        </View>
        <Text style={{ color: c.subtext, fontSize: font.body, marginTop: 10 }}>
          <Text style={{ color: c.text, fontWeight: '800' }}>{formatCount(info.following)}</Text> 팔로우 중{'    '}
          <Text style={{ color: c.text, fontWeight: '800' }}>{formatCount(info.followers)}</Text> 팔로워
        </Text>
        {extra}
      </View>
      <Tabs<PTab> tabs={tabs} value={tab} onChange={setTab} />
    </View>
  );

  return (
    <FlatList
      data={list}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={header}
      renderItem={({ item }) => {
        const parent = item.parentId ? sc.posts[item.parentId] : undefined;
        const replyingTo = parent ? authorOf(sc, parent.authorId, parent).handle : undefined;
        return <PostCard post={item} sc={sc} replyingTo={replyingTo} onPress={() => nav.navigate('PostDetail', { postId: item.rootId ?? item.id })} />;
      }}
      ListEmptyComponent={<EmptyState title={tab === 'media' ? '아직 사진이 없어요' : tab === 'likes' ? '마음에 든 게시물이 없어요' : '아직 게시물이 없어요'} />}
      contentContainerStyle={{ paddingBottom: 60 }}
    />
  );
}

const styles = StyleSheet.create({
  back: { position: 'absolute', left: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(15,20,25,0.6)', alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: space.lg, paddingBottom: space.md },
  avatarRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  follows: { fontSize: 11, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, overflow: 'hidden' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
