/**
 * 타임라인 게시물(X 스타일) — 일반 글 / 뉴스 / 이벤트 결과 / 시스템 안내를 한 컴포넌트로
 * 이름 없는 일반 유저(GHOST) 글도 post.ghost로 이름·사진을 보여 주고, 숫자는 growFrom이 있으면 자라면서 보인다.
 */
import { useNavigation } from '@react-navigation/native';
import { memo, useEffect, useRef, type ReactNode } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { toggleBookmark, toggleLike, toggleRepost } from '../game/actions';
import { relativeTime } from '../game/clock';
import type { RootNav } from '../navigation/types';
import { useGame } from '../store/game';
import { font, radius, space, useTheme } from '../theme';
import { GHOST, type Character, type Post, type QuoteRef, type Scenario } from '../types';
import { formatCount } from '../utils';
import { authorOf } from './author';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './Badge';
import { useGrowth } from './GrowingCount';
import { IconBookmark, IconComment, IconHeart, IconRepost, IconShare, IconSparkles, IconViews } from './icons';
import { Photo } from './Photo';
import { RichText } from './RichText';
import { TypingDots } from './TypingDots';

function Action({ icon, count, active, color, onPress, label, grow, pop }: { icon: (col: string) => ReactNode; count?: number; active?: boolean; color: string; onPress?: () => void; label: string; grow?: number; pop?: boolean }) {
  const { c } = useTheme();
  const col = active ? color : c.subtext;
  // 눌러서 켜질 때 아이콘이 톡 튄다(마음·재게시·북마크)
  const scale = useRef(new Animated.Value(1)).current;
  const was = useRef(active);
  useEffect(() => {
    if (pop && active && !was.current) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.38, duration: 110, useNativeDriver: Platform.OS !== 'web' }),
        Animated.spring(scale, { toValue: 1, friction: 4, tension: 160, useNativeDriver: Platform.OS !== 'web' }),
      ]).start();
    }
    was.current = active;
  }, [active]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.action, grow ? [styles.actionGrow, { flexGrow: grow }] : null, { opacity: pressed ? 0.6 : 1 }]}
    >
      {pop ? <Animated.View style={{ transform: [{ scale }] }}>{icon(col)}</Animated.View> : icon(col)}
      {count !== undefined ? (
        <Text numberOfLines={1} style={{ color: col, fontSize: count > 0 && formatCount(count).length >= 5 ? font.small - 1 : font.small, fontVariant: ['tabular-nums'], flexShrink: 1 }}>
          {count > 0 ? formatCount(count) : ''}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * 이어 쓴 글 위에 보이는 앞 글들(재게시해서 그 아래에 쓴 글) — 메일 답장처럼 위에서 아래로 이어진다.
 * 누르면 그 글로(남아 있으면). 글쓰기 화면에서도 같은 모양으로 보여 준다.
 */
export function QuoteChain({ chain, onOpen }: { chain: QuoteRef[]; onOpen?: (id: string) => void }) {
  const { c } = useTheme();
  if (!chain.length) return null;
  return (
    <View testID="quote-chain" style={[styles.quoteBox, { borderColor: c.border }]}>
      {chain.map((q, i) => (
        <Pressable
          key={`${q.id ?? i}:${i}`}
          disabled={!onOpen || !q.id}
          onPress={() => q.id && onOpen?.(q.id)}
          accessibilityRole="button"
          accessibilityLabel={`${q.name}님의 앞 글`}
          style={[styles.quoteRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}
        >
          <View style={{ alignItems: 'center' }}>
            <Avatar avatar={q.avatar} size={22} />
            <View style={[styles.quoteLine, { backgroundColor: c.border }]} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <Text numberOfLines={1} style={{ color: c.text, fontSize: font.small, fontWeight: '800' }}>
              {q.name} <Text style={{ color: c.subtext, fontWeight: '400' }}>@{q.handle}</Text>
            </Text>
            <Text numberOfLines={5} style={{ color: c.text, fontSize: font.small, lineHeight: 19 }}>
              {q.text || (q.hasMedia ? '(사진)' : '')}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

/** 이름 ✓ [계급·직함 · 나이] @아이디 · 시간 */
export function NameLine({ name, handle, badge, time, big, rank }: { name: string; handle: string; badge: AuthorBadge; time?: string; big?: boolean; rank?: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.head}>
      <Text numberOfLines={1} style={{ color: c.text, fontWeight: '800', fontSize: font.body, flexShrink: 1 }}>
        {name}
      </Text>
      <VerifiedBadge kind={badge} />
      {rank ? (
        <Text testID="rank" numberOfLines={1} style={[styles.rank, { color: c.subtext, borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
          {rank}
        </Text>
      ) : null}
      {!big && (
        <>
          <Text numberOfLines={1} style={{ color: c.subtext, fontSize: font.body, flexShrink: 8, minWidth: 0, marginLeft: 3 }}>
            @{handle}
          </Text>
          {time ? (
            <Text numberOfLines={1} style={{ color: c.subtext, fontSize: font.body, flexShrink: 0 }}>
              {` · ${time}`}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}
type AuthorBadge = ReturnType<typeof authorOf>['badge'];

/** 이름 옆 표시: 계급·직함 · 나이("맞선임 · 상병 · 22"). 둘 다 없으면 빈 글자 */
export function rankLabel(ch: Character | undefined): string {
  if (!ch || ch.isNews) return '';
  return [ch.title?.trim(), ch.age ? String(ch.age) : ''].filter(Boolean).join(' · ');
}

export function PostActions({ post, onReply }: { post: Post; onReply?: () => void }) {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  // 숫자가 자라는 동안만 1초에 4번 다시 그린다(이 줄만)
  const g = useGrowth(post);
  return (
    <View style={styles.actions}>
      {/* 숫자 칸 4개는 정해진 비율로 나눠 갖는다(글마다 아이콘 줄이 맞고, 숫자가 커져도 옆 아이콘과 겹치지 않게).
          답글 수는 짧고(보통 두 자리) 재게시·마음·조회수는 "21.9만"·"6209만"처럼 다섯 글자까지 길어져 칸을 더 준다 */}
      <Action grow={0.72} label="답글" icon={(col) => <IconComment size={18} color={col} />} count={post.replies.length} color={c.primary} onPress={onReply} />
      <Action pop grow={1.04} label="재게시해서 이어 쓰기" icon={(col) => <IconRepost size={18} color={col} />} count={g.reposts} active={post.reposted} color={c.repost} onPress={() => (post.kind === 'system' ? toggleRepost(post.id) : nav.navigate('Compose', { quoteId: post.id }))} />
      <Action pop grow={1.06} label="마음에 들어요" icon={(col) => <IconHeart size={18} color={col} fill={post.liked ? c.like : 'transparent'} />} count={g.likes} active={post.liked} color={c.like} onPress={() => toggleLike(post.id)} />
      <Action grow={1.18} label="조회수" icon={(col) => <IconViews size={18} color={col} />} count={g.views} color={c.primary} />
      <View style={{ flexDirection: 'row', gap: 10, flexShrink: 0 }}>
        <Action pop label="북마크" icon={(col) => <IconBookmark size={18} color={col} fill={post.bookmarked ? c.primary : 'transparent'} />} active={post.bookmarked} color={c.primary} onPress={() => toggleBookmark(post.id)} />
        <Action label="공유" icon={(col) => <IconShare size={18} color={col} />} color={c.primary} />
      </View>
    </View>
  );
}

export const PostCard = memo(function PostCard({
  post,
  sc,
  onPress,
  replyingTo,
  threadLine,
  showRank,
}: {
  post: Post;
  sc: Scenario;
  onPress?: () => void;
  replyingTo?: string;
  /** 스레드에서 다음 글과 이어지는 세로선 */
  threadLine?: boolean;
  /** 이름 옆에 계급·직함·나이를 보여 줄지(홈 타임라인만) */
  showRank?: boolean;
}) {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const busy = useGame((s) => !!s.busy[`post:${post.id}`] || !!s.busy[`reply:${post.id}`]);
  const a = authorOf(sc, post.authorId, post);

  if (post.kind === 'system') {
    return (
      <View style={[styles.system, { borderBottomColor: c.border }]}>
        <IconSparkles size={18} color={c.primary} />
        <Text style={{ color: c.text, fontSize: font.small, lineHeight: 19, flex: 1 }}>{post.text}</Text>
      </View>
    );
  }

  const goAuthor = () => {
    if (a.isMe) nav.navigate('MyProfile');
    else if (!a.isSystem && a.id !== GHOST && sc.characters[a.id]) nav.navigate('CharacterProfile', { characterId: a.id });
  };
  const isEvent = post.kind === 'event';
  const [firstLine, ...rest] = post.text.split('\n');
  const open = onPress ?? (() => nav.navigate('PostDetail', { postId: post.id }));

  return (
    <Pressable onPress={open} style={({ pressed }) => [styles.row, { borderBottomColor: threadLine ? 'transparent' : c.border, backgroundColor: pressed ? c.hover : 'transparent' }]}>
      <View style={{ alignItems: 'center' }}>
        <Avatar avatar={a.avatar} size={40} square={a.isOrg} onPress={goAuthor} />
        {threadLine ? <View style={[styles.threadLine, { backgroundColor: c.borderStrong }]} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <NameLine name={a.name} handle={a.handle} badge={a.badge} time={relativeTime(post.at, sc.clock)} rank={showRank ? rankLabel(sc.characters[post.authorId]) : undefined} />
        {replyingTo ? (
          <Text style={{ color: c.subtext, fontSize: font.body }}>
            <Text style={{ color: c.primary }}>@{replyingTo}</Text>님에게 보내는 답글
          </Text>
        ) : null}
        {post.badge === 'viral' || post.badge === 'controversy' || post.boosted ? (
          <View style={styles.badgeRow}>
            {post.badge === 'viral' && <Text style={[styles.badge, { color: c.repost }]}>🔥 지금 확산 중</Text>}
            {post.badge === 'controversy' && <Text style={[styles.badge, { color: c.warning }]}>⚠️ 논란 중</Text>}
            {post.boosted && <Text style={[styles.badge, { color: c.aura }]}>🚀 바이럴 모먼트</Text>}
          </View>
        ) : null}
        {post.quote?.length ? <QuoteChain chain={post.quote} onOpen={(id) => sc.posts[id] && nav.navigate('PostDetail', { postId: id })} /> : null}
        {isEvent ? (
          <View style={[styles.eventBox, { borderColor: c.border }]}>
            <Text style={{ color: c.text, fontWeight: '800', fontSize: font.body }}>{firstLine}</Text>
            {rest.length ? <Text style={{ color: c.text, fontSize: font.body, lineHeight: 21, marginTop: 4 }}>{rest.join('\n')}</Text> : null}
          </View>
        ) : post.text ? (
          <RichText text={post.text} />
        ) : null}
        {post.media ? <Photo photo={post.media} table="scene" ratio={16 / 10} style={[styles.media, { borderColor: c.border }]} /> : null}
        <PostActions post={post} onReply={open} />
        {busy && (
          <View style={styles.busy}>
            <TypingDots color={c.primary} />
            <Text style={{ color: c.subtext, fontSize: font.small }}>반응이 달리는 중…</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: 'row', alignItems: 'center', gap: 2, flexWrap: 'nowrap' },
  quoteBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, marginTop: 4, marginBottom: 6, overflow: 'hidden' },
  quoteRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingVertical: 8 },
  quoteLine: { width: 2, flex: 1, borderRadius: 1, marginTop: 3 },
  rank: { fontSize: font.tiny, fontWeight: '700', borderWidth: StyleSheet.hairlineWidth, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, marginLeft: 4, flexShrink: 0, overflow: 'hidden' },
  badge: { fontSize: font.small, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10 },
  eventBox: { borderWidth: 1, borderRadius: radius.lg, padding: space.md, marginTop: 4 },
  media: { marginTop: 8, borderRadius: radius.lg, borderWidth: 1, width: '100%' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingRight: 2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 34, height: 30 },
  actionGrow: { flexShrink: 1, flexBasis: 0, minWidth: 0, gap: 3 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, marginBottom: 4 },
  system: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  threadLine: { width: 2, flex: 1, marginTop: 4 },
});
