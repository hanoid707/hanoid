/**
 * 계정 한 줄(X의 "팔로우 추천" 모양): 사진 · 이름 ✓ · @아이디 · 관계 칩 · 팔로우 버튼(한줄소개는 보여 주지 않는다)
 * 왼쪽 가는 띠 = 분류 색(셀럽 노랑 · 친구 보라 · 같은 업계 파랑 · 언론·비즈니스 회색). 색은 RelationChip 한 곳에서 정한다.
 */
import { useNavigation } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { toggleFollow } from '../game/actions';
import type { RootNav } from '../navigation/types';
import { font, space, useTheme } from '../theme';
import type { Character } from '../types';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './Badge';
import { mentionStyleOf, RelationChip } from './RelationChip';
import { Button } from './ui';

export function FollowButton({ c: ch, size = 'sm' }: { c: Character; size?: 'sm' | 'md' }) {
  return ch.iFollow ? (
    <Button title="팔로잉" size={size} variant="outline" onPress={() => toggleFollow(ch.id)} />
  ) : (
    <Button title={ch.followsMe ? '맞팔로우' : '팔로우'} size={size} variant="ink" onPress={() => toggleFollow(ch.id)} />
  );
}

/** showBio: 예전 화면 호환용(한줄소개는 더 보여 주지 않는다) */
export function UserRow({ ch, right, onPress, showRelation = true }: { ch: Character; showBio?: boolean; right?: React.ReactNode; onPress?: () => void; showRelation?: boolean }) {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const badge = ch.badge === undefined ? (ch.isNews ? 'gold' : ch.verified ? 'blue' : null) : ch.badge;
  const accent = mentionStyleOf(ch, c).accent;
  return (
    <Pressable
      testID="user-row"
      onPress={onPress ?? (() => nav.navigate('CharacterProfile', { characterId: ch.id }))}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.hover }]}
    >
      {showRelation && accent !== 'transparent' ? <View style={[styles.accent, { backgroundColor: accent }]} /> : null}
      <Avatar avatar={ch.avatar} size={44} square={badge === 'gold'} />
      <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text numberOfLines={1} style={{ color: c.text, fontWeight: '800', fontSize: font.body, flexShrink: 1 }}>
                {ch.name}
              </Text>
              <VerifiedBadge kind={badge} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text numberOfLines={1} style={{ color: c.subtext, fontSize: font.body, flexShrink: 1 }}>
                @{ch.handle}
              </Text>
              {showRelation ? <RelationChip ch={ch} size="xs" /> : null}
              {ch.followsMe ? (
                <Text numberOfLines={1} style={[styles.follows, { backgroundColor: c.surfaceAlt, color: c.subtext }]}>
                  나를 팔로우합니다
                </Text>
              ) : null}
            </View>
          </View>
          {right ?? <FollowButton c={ch} />}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  accent: { position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  follows: { fontSize: 11, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, overflow: 'hidden', flexShrink: 1 },
});
