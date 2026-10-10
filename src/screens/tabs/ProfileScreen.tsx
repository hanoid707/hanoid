/** 내 프로필(X 스타일) + 내 스탯(레벨·평판·아우라·유머) · (v3) 스탯 조정 버튼 */
import { useNavigation } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import { ProfileView } from '../../components/ProfileView';
import { Screen } from '../../components/Screen';
import { Button, ProgressBar } from '../../components/ui';
import { xpToNext } from '../../game/rules';
import type { RootNav } from '../../navigation/types';
import { useActive } from '../../store/game';
import { font, space, useTheme } from '../../theme';
import { ME } from '../../types';

const STATUS_LABEL = { normal: '보통', rising: '상승세', viral: '확산 중', controversy: '논란', cancelled: '캔슬됨' } as const;

export function ProfileScreen() {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const sc = useActive();
  if (!sc) return null;
  const s = sc.stats;
  const following = Object.values(sc.characters).filter((ch) => ch.iFollow && !ch.inactive).length;
  const created = new Date(sc.createdTs);

  return (
    <Screen>
      <ProfileView
        sc={sc}
        showLikes
        info={{
          authorId: ME,
          name: sc.persona.name,
          handle: sc.persona.handle,
          avatar: sc.persona.avatar,
          banner: sc.persona.banner,
          bannerColor: sc.world.color,
          badge: sc.persona.badge ?? (s.followers >= 10_000 ? 'blue' : null),
          bio: sc.persona.bio,
          location: sc.persona.location,
          joined: `${created.getFullYear()}년 ${created.getMonth() + 1}월`,
          following,
          followers: s.followers,
        }}
        actions={
          <>
            <Button title="스탯 조정" size="sm" variant="outline" onPress={() => nav.navigate('StatsEditor')} />
            <Button title="프로필 수정" size="sm" variant="outline" onPress={() => nav.navigate('ProfileEdit')} />
          </>
        }
        extra={
          <View style={[styles.stat, { borderColor: c.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: c.text, fontWeight: '800', fontSize: font.body }}>
                Lv.{s.level} · {sc.persona.role}
              </Text>
              <Text style={{ color: c.subtext, fontSize: font.small }}>
                {s.xp}/{xpToNext(s.level)} XP
              </Text>
            </View>
            <ProgressBar value={s.xp} max={xpToNext(s.level)} />
            <Text style={{ color: c.subtext, fontSize: font.small }}>
              평판 {s.reputation} ({STATUS_LABEL[s.status]}) · 아우라 {s.aura} · 유머 {s.humor} · 게시물 {s.posts}
            </Text>
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stat: { borderWidth: 1, borderRadius: 14, padding: space.md, gap: 6, marginTop: 12 },
});
