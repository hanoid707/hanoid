/** 알림(X 스타일) — 전체 · 인증됨 · 멘션. 답글·멘션은 게시물 모양으로 보여준다. (v3) 관계 변화 💞 · 아이템 ✨ */
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authorOf } from '../../components/author';
import { Avatar } from '../../components/Avatar';
import { IconBell, IconFlame, IconHeart, IconMail, IconRepost, IconSettings, IconSparkles, IconTarget, IconUser } from '../../components/icons';
import { PostCard } from '../../components/PostCard';
import { Screen } from '../../components/Screen';
import { EmptyState, Tabs } from '../../components/ui';
import { markAllNotisRead } from '../../game/actions';
import type { RootNav } from '../../navigation/types';
import { useActive } from '../../store/game';
import { font, space, useTheme } from '../../theme';
import type { Noti, Post } from '../../types';
import { snippet } from '../../utils';

type NTab = 'all' | 'verified' | 'mention';

/** 이모지 아이콘(관계·아이템 알림) */
function EmojiIcon({ e }: { e: string }) {
  return <Text style={{ fontSize: 22, lineHeight: 28 }}>{e}</Text>;
}

export function NotificationsScreen() {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const sc = useActive();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<NTab>('all');

  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(markAllNotisRead, 1500);
      return () => clearTimeout(t);
    }, []),
  );

  // 답글·멘션 알림 → 실제 답글 글 찾기(작성자+원글로 묶어 두고 찾는다: 글이 많아도 가볍게)
  const repliesBy = useMemo(() => {
    const m = new Map<string, Post[]>();
    if (!sc) return m;
    for (const p of Object.values(sc.posts)) {
      if (p.kind !== 'reply' || !p.rootId) continue;
      const k = `${p.authorId}|${p.rootId}`;
      const list = m.get(k);
      if (list) list.push(p);
      else m.set(k, [p]);
    }
    return m;
  }, [sc?.posts]);

  if (!sc) return null;
  const list = sc.notis.filter((n) => {
    if (tab === 'mention') return n.type === 'reply' || n.type === 'mention';
    if (tab === 'verified') return !!n.actorId && !!sc.characters[n.actorId] && !!authorOf(sc, n.actorId).badge;
    return true;
  });

  const open = (n: Noti) => {
    if (n.type === 'dm' && n.actorId) return nav.navigate('Chat', { characterId: n.actorId });
    if (n.type === 'item') return nav.navigate('Items');
    if (n.eventId) return nav.navigate('Event', { eventId: n.eventId });
    if (n.postId && sc.posts[n.postId]) return nav.navigate('PostDetail', { postId: sc.posts[n.postId].rootId ?? n.postId });
    if ((n.type === 'follow' || n.type === 'unfollow' || n.type === 'relation') && n.actorId && sc.characters[n.actorId]) return nav.navigate('CharacterProfile', { characterId: n.actorId });
    if (n.type === 'quest' || n.type === 'cancel' || n.type === 'recover') return nav.navigate('Quests');
    if (n.type === 'level') return nav.navigate('MyProfile');
  };

  const iconFor = (n: Noti): ReactNode => {
    switch (n.type) {
      case 'like':
        return <IconHeart size={26} color={c.like} fill={c.like} />;
      case 'repost':
        return <IconRepost size={26} color={c.repost} />;
      case 'follow':
        return <IconUser size={26} color={c.primary} fill={c.primary} />;
      case 'unfollow':
        return <IconUser size={26} color={c.subtext} />;
      case 'dm':
        return <IconMail size={26} color={c.primary} />;
      case 'viral':
        return <IconFlame size={26} color={c.like} fill={c.like} />;
      case 'quest':
      case 'level':
        return <IconTarget size={26} color={c.aura} />;
      case 'relation':
        return <EmojiIcon e="💞" />;
      case 'item':
        return <EmojiIcon e="✨" />;
      case 'event':
      case 'news':
        return <IconSparkles size={26} color={c.primary} fill={c.primary} />;
      default:
        return <IconBell size={26} color={c.primary} fill={c.primary} />;
    }
  };

  const findReply = (n: Noti): Post | undefined => {
    if ((n.type !== 'reply' && n.type !== 'mention') || !n.actorId || !n.postId) return undefined;
    const head = n.text.replace(/…$/, '');
    return repliesBy.get(`${n.actorId}|${n.postId}`)?.find((p) => p.text.startsWith(head));
  };

  return (
    <Screen>
      <View style={{ paddingTop: insets.top, backgroundColor: c.bg }}>
        <View style={styles.headRow}>
          <Text style={{ flex: 1, color: c.text, fontSize: font.h2, fontWeight: '800' }} accessibilityRole="header">
            알림
          </Text>
          <Pressable onPress={() => nav.navigate('Settings')} hitSlop={8} accessibilityLabel="설정">
            <IconSettings size={20} color={c.text} />
          </Pressable>
        </View>
        <Tabs<NTab>
          tabs={[
            { key: 'all', label: '전체' },
            { key: 'verified', label: '인증됨' },
            { key: 'mention', label: '멘션' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      <FlatList
        data={list}
        keyExtractor={(n) => n.id}
        ListEmptyComponent={<EmptyState title="아직 아무것도 없어요" desc="마음에 들어요, 재게시, 팔로우 소식이 여기에 표시돼요." />}
        contentContainerStyle={{ paddingBottom: 60 }}
        renderItem={({ item: n }) => {
          const reply = findReply(n);
          if (reply) return <PostCard post={reply} sc={sc} onPress={() => open(n)} replyingTo={sc.persona.handle} />;
          const actor = n.actorId ? authorOf(sc, n.actorId) : null;
          const post = n.postId ? sc.posts[n.postId] : undefined;
          // 문장 안에 이름이 이미 있으면(관계 변화 알림 등) 앞에 또 붙이지 않는다. "님이 …"면 붙여 쓰고, 아니면 한 칸 띄운다
          const showName = !!actor && !n.text.includes(actor.name);
          const glue = n.text.startsWith('님') ? '' : ' ';
          return (
            <Pressable onPress={() => open(n)} style={({ pressed }) => [styles.row, { borderBottomColor: c.border, backgroundColor: pressed ? c.hover : !n.read ? c.primarySoft : 'transparent' }]}>
              <View style={{ width: 40, alignItems: 'flex-end' }}>{iconFor(n)}</View>
              <View style={{ flex: 1, gap: 6 }}>
                {actor ? <Avatar avatar={actor.avatar} size={32} square={actor.isOrg} /> : null}
                <Text style={{ color: c.text, fontSize: font.body, lineHeight: 21 }}>
                  {showName ? <Text style={{ fontWeight: '800' }}>{actor?.name}</Text> : null}
                  {showName ? glue : ''}
                  {n.text}
                </Text>
                {post && n.type !== 'reply' ? (
                  <Text numberOfLines={3} style={{ color: c.subtext, fontSize: font.body, lineHeight: 20 }}>
                    {snippet(post.text, 120)}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: space.lg, height: 52 },
  row: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
});
