/** 검색(X의 탐색 탭) — 검색창 · 추천 · 트렌드 · 뉴스 · 사람(관계·분류별 묶음 + 색 범례) */
import { useNavigation } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconClose, IconMore, IconSearch, IconSettings } from '../../components/icons';
import { PostCard } from '../../components/PostCard';
import { MENTION_STYLE, MentionLegend } from '../../components/RelationChip';
import { Screen } from '../../components/Screen';
import { UserRow } from '../../components/UserRow';
import { EmptyState, Tabs } from '../../components/ui';
import { MENTION_LABEL, mentionCategory, type MentionCategory } from '../../game/relationship';
import type { RootNav } from '../../navigation/types';
import { useActive } from '../../store/game';
import { font, noOutline, radius, space, useTheme } from '../../theme';
import type { Character, Post, Scenario, Trend } from '../../types';
import { formatCount } from '../../utils';

type ExTab = 'forYou' | 'trending' | 'news' | 'people';

/** 사람 탭 묶음 순서와 설명 */
const PEOPLE_ORDER: MentionCategory[] = ['friend', 'industry', 'celeb', 'business', 'fan', 'anti', 'public'];
const PEOPLE_DESC: Record<MentionCategory, string> = {
  friend: '친구·베프·썸·연인·가족 — 가까운 사이',
  industry: '같은 업계 — 라이벌·멘토·아는 사이',
  celeb: '이 세계에서 유명한 계정',
  business: '언론·매거진·방송사·협찬사',
  fan: '나를 응원하는 팬',
  anti: '나를 싫어하는 계정',
  public: '일반 계정',
};

interface PeopleSection {
  key: MentionCategory;
  data: Character[];
}

function TrendRow({ t, i, sc, onPress }: { t: Trend; i: number; sc: Scenario; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.trend, pressed && { backgroundColor: c.hover }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.subtext, fontSize: font.small }}>
          {i + 1} · {sc.world.name}에서 트렌드 중{t.hot ? ' · 🔥' : ''}
        </Text>
        <Text style={{ color: c.text, fontSize: font.body, fontWeight: '800', marginVertical: 1 }}>{t.tag}</Text>
        <Text style={{ color: c.subtext, fontSize: font.small }}>게시물 {formatCount(t.count)}개</Text>
      </View>
      <IconMore size={18} color={c.subtext} />
    </Pressable>
  );
}

/** 사람 탭 묶음 머리말: 분류 색 견본 · 이름 · 수 · 설명 */
function PeopleHeader({ section }: { section: PeopleSection }) {
  const { c } = useTheme();
  const s = MENTION_STYLE(section.key, c);
  return (
    <View style={[styles.peopleHead, { backgroundColor: c.bg, borderTopColor: c.border }]} accessibilityRole="header">
      <View style={[styles.swatch, { backgroundColor: s.bg === 'transparent' ? c.bg : s.bg, borderColor: s.border, borderWidth: s.borderWidth }]}>
        {s.bg === 'transparent' ? <Text style={{ color: s.fg, fontSize: 9, fontWeight: '900' }}>A</Text> : null}
      </View>
      <Text style={{ color: c.text, fontSize: font.title, fontWeight: '800' }}>{MENTION_LABEL[section.key]}</Text>
      <Text style={{ color: c.subtext, fontSize: font.small }}>{section.data.length}</Text>
      <Text style={{ color: c.subtext, fontSize: font.small, flex: 1, textAlign: 'right' }} numberOfLines={1}>
        {PEOPLE_DESC[section.key]}
      </Text>
    </View>
  );
}

export function ExploreScreen() {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const sc = useActive();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<ExTab>('forYou');

  // 시나리오에서 빠진(inactive) 계정은 목록에서 뺀다(지난 글은 남음)
  const people = useMemo(() => (sc ? sc.cast.map((id) => sc.characters[id]).filter((ch): ch is Character => !!ch && !ch.inactive) : []), [sc]);
  const peopleSections = useMemo<PeopleSection[]>(() => {
    const groups = new Map<MentionCategory, Character[]>();
    for (const ch of people) {
      const k = mentionCategory(ch);
      const list = groups.get(k);
      if (list) list.push(ch);
      else groups.set(k, [ch]);
    }
    return PEOPLE_ORDER.filter((k) => groups.get(k)?.length).map((k) => ({
      key: k,
      // 안티는 가장 적대적인 계정부터, 나머지는 호감도 높은 순
      data: [...(groups.get(k) ?? [])].sort((a, b) => (k === 'anti' ? a.affinity - b.affinity : b.affinity - a.affinity)),
    }));
  }, [people]);
  const results = useMemo(() => {
    if (!sc || !q.trim()) return null;
    const k = q.trim().toLowerCase().replace(/^@/, '');
    const users = people.filter((ch) => ch.name.toLowerCase().includes(k) || ch.handle.toLowerCase().includes(k) || ch.bio.toLowerCase().includes(k)).slice(0, 8);
    const posts = Object.values(sc.posts)
      .filter((p) => p.kind !== 'system' && p.text.toLowerCase().includes(k))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 30);
    return { users, posts };
  }, [sc, q, people]);

  if (!sc) return null;
  const trends = sc.trends;
  const suggest = people.filter((ch) => !ch.iFollow && ch.tier !== 'crowd').slice(0, 4);
  const newsPosts: Post[] = sc.feed.map((id) => sc.posts[id]).filter((p) => p && (p.kind === 'news' || sc.characters[p.authorId]?.isNews));
  const popular = sc.feed
    .map((id) => sc.posts[id])
    .filter((p) => p && p.kind === 'post')
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 6);

  const searchTag = (tag: string) => setQ(tag);

  const header = (
    <View style={{ paddingTop: insets.top, backgroundColor: c.bg }}>
      <View style={styles.headRow}>
        <View style={[styles.search, { backgroundColor: c.surfaceAlt }]}>
          <IconSearch size={16} color={c.subtext} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="검색"
            placeholderTextColor={c.subtext}
            style={[{ flex: 1, color: c.text, fontSize: font.body, paddingVertical: 8 }, noOutline]}
            returnKeyType="search"
          />
          {q ? (
            <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityLabel="검색어 지우기">
              <IconClose size={16} color={c.subtext} />
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={() => nav.navigate('Settings')} hitSlop={8} accessibilityLabel="설정">
          <IconSettings size={20} color={c.text} />
        </Pressable>
      </View>
      {!results && (
        <Tabs<ExTab>
          scroll
          tabs={[
            { key: 'forYou', label: '추천' },
            { key: 'trending', label: '트렌드' },
            { key: 'news', label: '뉴스' },
            { key: 'people', label: '사람' },
          ]}
          value={tab}
          onChange={setTab}
        />
      )}
    </View>
  );

  if (results) {
    return (
      <Screen>
        {header}
        <FlatList
          data={results.posts}
          keyExtractor={(p) => p.id}
          ListHeaderComponent={
            results.users.length ? (
              <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }}>
                {results.users.map((ch) => (
                  <UserRow key={ch.id} ch={ch} showBio={false} />
                ))}
              </View>
            ) : null
          }
          renderItem={({ item }) => <PostCard post={item} sc={sc} />}
          ListEmptyComponent={!results.users.length ? <EmptyState title={`"${q}" 검색 결과 없음`} desc="다른 단어로 검색해 보세요." /> : null}
          contentContainerStyle={{ paddingBottom: 80 }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      {tab === 'news' ? (
        <FlatList
          data={newsPosts}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <PostCard post={item} sc={sc} />}
          ListEmptyComponent={<EmptyState title="아직 뉴스가 없어요" />}
          contentContainerStyle={{ paddingBottom: 80 }}
        />
      ) : tab === 'people' ? (
        <SectionList<Character, PeopleSection>
          sections={peopleSections}
          keyExtractor={(ch) => ch.id}
          renderItem={({ item }) => <UserRow ch={item} />}
          renderSectionHeader={({ section }) => <PeopleHeader section={section} />}
          ListHeaderComponent={
            <View style={styles.legendWrap}>
              <MentionLegend title="색 분류" />
            </View>
          }
          ListEmptyComponent={<EmptyState title="아직 아는 사람이 없어요" desc="나 탭 → 캐릭터 만들기로 사람을 추가해 보세요." />}
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingBottom: 80 }}
          initialNumToRender={14}
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
          <Text style={[styles.section, { color: c.text }]}>{tab === 'trending' ? '트렌드' : '나를 위한 트렌드'}</Text>
          {(tab === 'trending' ? trends : trends.slice(0, 5)).map((t, i) => (
            <TrendRow key={t.tag + i} t={t} i={i} sc={sc} onPress={() => searchTag(t.tag)} />
          ))}
          {tab === 'forYou' && (
            <>
              <View style={[styles.sep, { backgroundColor: c.border }]} />
              <Text style={[styles.section, { color: c.text }]}>팔로우 추천</Text>
              {suggest.map((ch) => (
                <UserRow key={ch.id} ch={ch} />
              ))}
              <Pressable onPress={() => setTab('people')} style={({ pressed }) => [{ padding: space.lg }, pressed && { backgroundColor: c.hover }]}>
                <Text style={{ color: c.primary, fontSize: font.body }}>더 보기</Text>
              </Pressable>
              <View style={[styles.sep, { backgroundColor: c.border }]} />
              <Text style={[styles.section, { color: c.text }]}>인기 게시물</Text>
              {popular.map((p) => (
                <PostCard key={p.id} post={p} sc={sc} />
              ))}
            </>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.lg, height: 52 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.pill, paddingHorizontal: 14, height: 38 },
  trend: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: space.lg, paddingVertical: 12 },
  section: { fontSize: font.h2, fontWeight: '800', paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: 4 },
  sep: { height: StyleSheet.hairlineWidth, marginTop: 8 },
  legendWrap: { paddingHorizontal: space.lg, paddingVertical: 10 },
  peopleHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: space.lg, paddingTop: 14, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth },
  swatch: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
