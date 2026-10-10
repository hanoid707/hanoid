/**
 * 게시물 상세(X 스타일) — 큰 본문 · 시간·조회수 · 반응 수(자라는 숫자) · 답글 목록 · 답글 쓰기(@ 자동완성)
 * 남의 글을 열면 게임 규칙이 작성자 팔로워에 비례한 댓글을 한 번만 만든다(이미 만든 글은 다시 만들지 않음).
 * 만드는 동안은 회색 뼈대 줄 "댓글 불러오는 중", 새로 달린 답글은 살짝 떠오르며 나타난다.
 */
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authorOf } from '../../components/author';
import { Avatar } from '../../components/Avatar';
import { VerifiedBadge } from '../../components/Badge';
import { useGrowth } from '../../components/GrowingCount';
import { IconClose } from '../../components/icons';
import { MentionInput, type PersonOption } from '../../components/MentionInput';
import { Photo } from '../../components/Photo';
import { PostActions, PostCard } from '../../components/PostCard';
import { RelationChip } from '../../components/RelationChip';
import { RichText } from '../../components/RichText';
import { Screen, TopBar } from '../../components/Screen';
import { TypingDots } from '../../components/TypingDots';
import { FollowButton } from '../../components/UserRow';
import { AppearIn, Button, EmptyState, Skeleton } from '../../components/ui';
import { ensureThreadComments, replyToPost } from '../../game/actions';
import { dayLabel } from '../../game/clock';
import { POST_MAX_LEN } from '../../game/rules';
import type { RootNav, RootStackParamList } from '../../navigation/types';
import { useActive, useGame } from '../../store/game';
import { font, space, useTheme } from '../../theme';
import { GHOST, ME, SYSTEM, type Post, type Scenario } from '../../types';
import { formatCount } from '../../utils';

function flatten(sc: Scenario, root: Post): { post: Post; parentHandle: string }[] {
  const out: { post: Post; parentHandle: string }[] = [];
  const walk = (p: Post) => {
    for (const id of p.replies) {
      const r = sc.posts[id];
      if (!r) continue;
      out.push({ post: r, parentHandle: authorOf(sc, p.authorId, p).handle });
      walk(r);
    }
  };
  walk(root);
  return out;
}

const timeLine = (p: Post) => `${p.at.hour < 12 ? '오전' : '오후'} ${p.at.hour % 12 === 0 ? 12 : p.at.hour % 12}:${String(p.at.minute).padStart(2, '0')} · ${dayLabel(p.at.day)}`;

/** 댓글을 만드는 동안 보이는 회색 뼈대 줄 */
function CommentSkeleton({ rows }: { rows: number }) {
  const { c } = useTheme();
  const widths = ['82%', '64%', '74%'] as const;
  return (
    <View accessibilityLabel="댓글 불러오는 중" style={{ paddingBottom: space.sm }}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={[styles.skelRow, { borderBottomColor: c.border }]}>
          <Skeleton width={40} height={40} round={20} />
          <View style={{ flex: 1, gap: 8, paddingTop: 2 }}>
            <Skeleton width={i % 2 ? '34%' : '46%'} height={11} />
            <Skeleton width={widths[i % widths.length]} height={11} />
            {i === 0 ? <Skeleton width="38%" height={11} /> : null}
          </View>
        </View>
      ))}
      <View style={styles.busy}>
        <TypingDots color={c.subtext} />
        <Text style={{ color: c.subtext, fontSize: font.small }}>댓글 불러오는 중…</Text>
      </View>
    </View>
  );
}

/** 맨 위 큰 본문(숫자가 자라는 동안 이 부분만 다시 그린다) */
function MainPost({ sc, root, onReply }: { sc: Scenario; root: Post; onReply: () => void }) {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const g = useGrowth(root);
  const a = authorOf(sc, root.authorId, root);
  const ch = root.authorId !== GHOST ? sc.characters[root.authorId] : undefined;
  const goAuthor = () => (a.isMe ? nav.navigate('MyProfile') : ch ? nav.navigate('CharacterProfile', { characterId: ch.id }) : undefined);
  const stat = (n: number, label: string) =>
    n > 0 ? (
      <Text style={{ color: c.subtext, fontSize: font.body }}>
        <Text style={{ color: c.text, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{formatCount(n)}</Text> {label}
      </Text>
    ) : null;

  return (
    <View style={[styles.main, { borderBottomColor: c.border }]}>
      <View style={styles.authorRow}>
        <Avatar avatar={a.avatar} size={40} square={a.isOrg} onPress={goAuthor} label={`${a.name} 프로필`} />
        <Pressable style={{ flex: 1, minWidth: 0 }} onPress={goAuthor} disabled={!a.isMe && !ch}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text numberOfLines={1} style={{ color: c.text, fontWeight: '800', fontSize: font.body, flexShrink: 1 }}>
              {a.name}
            </Text>
            <VerifiedBadge kind={a.badge} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: c.subtext, fontSize: font.body, flexShrink: 1 }} numberOfLines={1}>
              @{a.handle}
            </Text>
            {ch ? <RelationChip ch={ch} size="xs" /> : null}
          </View>
        </Pressable>
        {ch && !ch.iFollow ? <FollowButton c={ch} /> : null}
      </View>
      {root.badge === 'viral' || root.boosted ? (
        <Text style={{ color: root.boosted ? c.aura : c.repost, fontSize: font.small, fontWeight: '700', marginTop: 8 }}>
          {[root.badge === 'viral' ? '🔥 지금 확산 중' : '', root.boosted ? '🚀 바이럴 모먼트' : ''].filter(Boolean).join('  ')}
        </Text>
      ) : null}
      {root.kind === 'event' ? (
        <View style={[styles.eventBox, { borderColor: c.border }]}>
          <Text style={{ color: c.text, fontSize: 17, lineHeight: 24 }}>{root.text}</Text>
        </View>
      ) : root.text ? (
        <RichText text={root.text} style={{ fontSize: 17, lineHeight: 25, marginTop: 10 }} />
      ) : null}
      {root.media ? <Photo photo={root.media} table="scene" ratio={16 / 10} style={[styles.media, { borderColor: c.border }]} /> : null}
      <Text style={{ color: c.subtext, fontSize: font.body, marginTop: 14 }}>
        {timeLine(root)} · <Text style={{ color: c.text, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{formatCount(g.views)}</Text> 조회수
      </Text>
      {g.reposts + g.likes + (root.bookmarked ? 1 : 0) > 0 && (
        <View style={[styles.stats, { borderTopColor: c.border }]}>
          {stat(g.reposts, '재게시')}
          {stat(g.likes, '마음에 들어요')}
          {stat(root.bookmarked ? 1 : 0, '북마크')}
        </View>
      )}
      <View style={[styles.actionRow, { borderTopColor: c.border }]}>
        <PostActions post={root} onReply={onReply} />
      </View>
    </View>
  );
}

export function PostDetailScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { params } = useRoute<RouteProp<RootStackParamList, 'PostDetail'>>();
  const sc = useActive();
  const [text, setText] = useState('');
  const [targetId, setTargetId] = useState<string | null>(null);
  const replyBusy = useGame((s) => Object.keys(s.busy).some((k) => k.startsWith('reply:') || k === `post:${params.postId}`));
  const threadBusy = useGame((s) => !!s.busy[`thread:${params.postId}`]);

  const root = sc?.posts[params.postId];
  const thread = useMemo(() => (sc && root ? flatten(sc, root) : []), [sc, root]);
  const parents = useMemo(() => {
    const out: Post[] = [];
    let p = root?.parentId ? sc?.posts[root.parentId] : undefined;
    while (p && out.length < 6) {
      out.unshift(p);
      p = p.parentId ? sc?.posts[p.parentId] : undefined;
    }
    return out;
  }, [sc, root]);

  // 남의 글: 화면에 들어올 때마다 한 번 요청(처음이면 댓글 생성, 팔로워가 크게 늘었으면 추가 — 판단·중복 방지는 게임 규칙)
  const othersPost = !!root && root.authorId !== ME && root.authorId !== SYSTEM && root.kind !== 'system';
  useFocusEffect(
    useCallback(() => {
      if (othersPost) void ensureThreadComments(params.postId);
    }, [othersPost, params.postId]),
  );

  // 처음부터 있던 답글은 그대로, 보는 동안 새로 달린 답글만 떠오르게
  const seen = useRef<Set<string>>(new Set());
  const ready = useRef(false);
  useEffect(() => {
    for (const t of thread) seen.current.add(t.post.id);
    ready.current = true;
  }, [thread]);

  // 답글 칸 @ 자동완성: 이 스레드의 이름 없는 일반 유저도 부를 수 있게
  const ghostPeople = useMemo<PersonOption[]>(() => {
    const m = new Map<string, PersonOption>();
    for (const p of [root, ...thread.map((t) => t.post)]) {
      if (!p || p.authorId !== GHOST || !p.ghost) continue;
      const g = p.ghost;
      if (!m.has(g.handle)) m.set(g.handle, { key: `g:${g.handle}`, name: g.name, handle: g.handle, avatar: { emoji: g.emoji, color: g.color, photo: g.photo }, badge: null });
    }
    return [...m.values()];
  }, [root, thread]);

  if (!sc || !root) {
    return (
      <Screen>
        <TopBar title="게시물" />
        <EmptyState title="이 게시물은 삭제되었어요" desc="오래된 글은 저장 공간을 위해 정리돼요." />
      </Screen>
    );
  }

  const target = targetId ? sc.posts[targetId] : root;
  const targetAuthor = target ? authorOf(sc, target.authorId, target) : null;
  const canReply = root.kind !== 'system';

  const send = () => {
    const r = replyToPost(target?.id ?? root.id, text);
    if (r.ok) {
      setText('');
      setTargetId(null);
    }
  };

  const header = (
    <View>
      {parents.map((p) => (
        <PostCard key={p.id} post={p} sc={sc} threadLine />
      ))}
      <MainPost sc={sc} root={root} onReply={() => setTargetId(null)} />
    </View>
  );

  return (
    <Screen>
      <TopBar title="게시물" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'web' ? undefined : 'padding'} keyboardVerticalOffset={0}>
        <FlatList
          data={thread}
          keyExtractor={(t) => t.post.id}
          ListHeaderComponent={header}
          renderItem={({ item }) => (
            <AppearIn animate={ready.current && !seen.current.has(item.post.id)}>
              <PostCard post={item.post} sc={sc} replyingTo={item.parentHandle} onPress={canReply ? () => setTargetId(item.post.id) : undefined} />
            </AppearIn>
          )}
          ListFooterComponent={
            threadBusy ? (
              <CommentSkeleton rows={thread.length ? 2 : 3} />
            ) : replyBusy ? (
              <View style={styles.busy}>
                <TypingDots color={c.primary} />
                <Text style={{ color: c.subtext, fontSize: font.small }}>답글이 달리는 중…</Text>
              </View>
            ) : null
          }
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        />
        {canReply && (
          <View style={[styles.composer, { backgroundColor: c.bg, borderTopColor: c.border, paddingBottom: space.sm + insets.bottom }]}>
            {targetAuthor && (
              <View style={styles.targetRow}>
                <Text style={{ color: c.subtext, fontSize: font.small, flex: 1 }} numberOfLines={1}>
                  <Text style={{ color: c.primary }}>@{targetAuthor.handle}</Text>님에게 보내는 답글{targetId ? '' : ' · 다른 답글을 누르면 그 답글에 답해요'}
                </Text>
                {targetId && (
                  <Pressable onPress={() => setTargetId(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="답글 대상 지우기">
                    <IconClose size={14} color={c.subtext} />
                  </Pressable>
                )}
              </View>
            )}
            <MentionInput
              value={text}
              onChangeText={setText}
              placeholder="답글 게시하기"
              placeholderTextColor={c.subtext}
              maxLength={POST_MAX_LEN}
              multiline
              placement="above"
              extraPeople={ghostPeople}
              rowStyle={{ gap: space.sm }}
              left={<Avatar avatar={sc.persona.avatar} size={32} />}
              right={<Button title="답글" size="sm" disabled={!text.trim()} onPress={send} />}
              style={[styles.input, { color: c.text }]}
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  main: { paddingHorizontal: space.lg, paddingTop: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  eventBox: { borderWidth: 1, borderRadius: 16, padding: space.md, marginTop: 10 },
  media: { marginTop: 12, borderRadius: 16, borderWidth: 1, width: '100%' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, paddingVertical: 14, marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  actionRow: { paddingVertical: 4, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: space.lg },
  skelRow: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md, paddingTop: space.sm, gap: 6 },
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  input: { minHeight: 40, maxHeight: 120, paddingVertical: 10, fontSize: font.body },
});
