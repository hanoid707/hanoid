/**
 * 캐릭터 프로필(X 스타일) — 관계 칩 · 지금 쓰는 말투 · 호감도(-100~100)·설렘 막대 · 성별·나이·성격 · 그 사람의 글
 * 버튼: 캐릭터 설정 · 선물(아이템 화면) · 쪽지 · 팔로우
 */
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { authorOf } from '../../components/author';
import { IconGift, IconMail, IconUserPen } from '../../components/icons';
import { ProfileView } from '../../components/ProfileView';
import { RelationChip } from '../../components/RelationChip';
import { Screen, TopBar } from '../../components/Screen';
import { FollowButton } from '../../components/UserRow';
import { EmptyState, MeterBar } from '../../components/ui';
import { PERSONALITY_PRESETS, REGISTER_LABEL, registerOf, SPEECH_PRESETS } from '../../game/relationship';
import type { RootNav, RootStackParamList } from '../../navigation/types';
import { useActive } from '../../store/game';
import { font, radius, space, useTheme } from '../../theme';
import type { Character } from '../../types';
/** "여성 · 20대 · ENFP · 담백·건조 말투" */
function personLine(ch: Character): string {
  const parts: string[] = [];
  if (ch.gender) parts.push(ch.gender === 'f' ? '여성' : '남성');
  if (ch.ageGroup) parts.push(`${ch.ageGroup}대`);
  return parts.join(' · ');
}

export function CharacterProfileScreen() {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'CharacterProfile'>>();
  const sc = useActive();
  const ch = sc?.characters[params.characterId];
  const [descOpen, setDescOpen] = useState(false);
  if (!sc || !ch) {
    return (
      <Screen>
        <TopBar title="프로필" />
        <EmptyState title="이 계정은 존재하지 않습니다" desc="다른 계정을 검색해 보세요." />
      </Screen>
    );
  }
  const a = authorOf(sc, ch.id);
  const reg = registerOf(ch);
  const personality = PERSONALITY_PRESETS.find((p) => p.id === ch.personality);
  const speech = SPEECH_PRESETS.find((p) => p.id === ch.speechStyle);
  const who = personLine(ch);
  const showRomance = ch.tier !== 'crowd' && !ch.isNews && ch.relationBase !== 'family';

  const circle = (label: string, icon: React.ReactNode, onPress: () => void, testID?: string) => (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.circle, { borderColor: c.borderStrong, backgroundColor: pressed ? c.hover : 'transparent' }]}
    >
      {icon}
    </Pressable>
  );

  return (
    <Screen>
      <ProfileView
        sc={sc}
        info={{
          authorId: ch.id,
          name: ch.name,
          handle: ch.handle,
          avatar: ch.avatar,
          banner: ch.banner,
          bannerColor: ch.avatar.color,
          badge: a.badge,
          bio: ch.bio,
          joined: ch.joined,
          following: ch.following ?? 0,
          followers: ch.followers,
          followsMe: ch.followsMe,
          isOrg: a.isOrg,
        }}
        actions={
          <>
            {circle('캐릭터 설정', <IconUserPen size={18} color={c.text} />, () => nav.navigate('CharacterEditor', { characterId: ch.id }), 'profile-settings')}
            {circle('선물', <IconGift size={18} color={c.text} />, () => nav.navigate('Items', { giftTo: ch.id }), 'profile-gift')}
            {circle('쪽지', <IconMail size={18} color={c.text} />, () => nav.navigate('Chat', { characterId: ch.id }), 'profile-dm')}
            <FollowButton c={ch} />
          </>
        }
        extra={
          <View style={[styles.rel, { borderColor: c.border }]}>
            <View style={styles.relHead}>
              <RelationChip ch={ch} size="md" />
              <Text style={{ color: c.text, fontSize: font.small, fontWeight: '700' }}>
                {REGISTER_LABEL[reg]} 사용 중{ch.registerOverride ? ' (고정)' : ''}
              </Text>
              {ch.relationLocked ? <Text style={{ color: c.subtext, fontSize: font.small }}>· 관계 고정</Text> : null}
              {ch.inactive ? <Text style={{ color: c.warning, fontSize: font.small, fontWeight: '700' }}>· 지금 이야기에서 빠짐</Text> : null}
            </View>
            <View style={styles.barRow}>
              <Text style={[styles.barLabel, { color: c.subtext }]}>호감도</Text>
              <View style={{ flex: 1 }}>
                <MeterBar value={ch.affinity} min={-100} max={100} color={c.success} />
              </View>
              <Text style={[styles.barNum, { color: c.text }]}>{ch.affinity}</Text>
            </View>
            {showRomance ? (
              <View style={styles.barRow}>
                <Text style={[styles.barLabel, { color: c.subtext }]}>설렘</Text>
                <View style={{ flex: 1 }}>
                  <MeterBar value={ch.romance ?? 0} min={0} max={100} color={c.like} />
                </View>
                <Text style={[styles.barNum, { color: c.text }]}>{ch.romance ?? 0}</Text>
              </View>
            ) : null}
            <View style={styles.barRow}>
              <Text style={[styles.barLabel, { color: c.subtext }]}>정복도</Text>
              <View style={{ flex: 1 }}>
                <MeterBar value={ch.devotion ?? 0} min={0} max={100} color={c.aura} />
              </View>
              <Text style={[styles.barNum, { color: c.text }]}>{ch.devotion ?? 0}</Text>
            </View>
            {who || personality || speech ? (
              <View style={styles.tags}>
                {who ? <Text style={{ color: c.subtext, fontSize: font.small }}>{who}</Text> : null}
                {personality ? (
                  <View style={[styles.tag, { borderColor: c.aura }]}>
                    <Text style={{ color: c.aura, fontSize: font.tiny, fontWeight: '800' }}>{personality.label}</Text>
                  </View>
                ) : null}
                {speech ? (
                  <View style={[styles.tag, { borderColor: c.borderStrong }]}>
                    <Text style={{ color: c.text, fontSize: font.tiny, fontWeight: '700' }}>{speech.label} 말투</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            {ch.description ? (
              <Pressable
                onPress={() => setDescOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={descOpen ? '특성 접기' : '특성 전체 보기'}
                style={[styles.desc, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}
              >
                <Text numberOfLines={descOpen ? undefined : 8} style={{ color: c.text, fontSize: font.small, lineHeight: 20 }}>
                  특성: {ch.description}
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  circle: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rel: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: 8, marginTop: 12 },
  desc: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, minHeight: 64 },
  relHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { fontSize: font.tiny, fontWeight: '700', width: 36 },
  barNum: { fontSize: font.tiny, fontWeight: '800', width: 30, textAlign: 'right', fontVariant: ['tabular-nums'] },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  tag: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
});
