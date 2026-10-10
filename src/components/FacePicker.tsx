/**
 * 사진 프리셋 고르기 — 미리 넣어 둔 가상 인물 사진(data/facePresets) 중에서 프로필 사진을 고른다.
 * 캐릭터 만들기·캐릭터 설정·내 계정 만들기·프로필 수정이 같이 쓴다. 직접 찍은 사진·이모지 대신 고르는 "기본값".
 *   gender : (선택) 처음 보여 줄 성별. 안 주면 전체. 위 칩으로 바꿀 수 있다
 *   exclude: 이 세계에서 이미 다른 인물이 쓰는 사진(목록에서 뺀다)
 */
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { faces, resolveFace } from '../data/facePool';
import { AVATARS } from '../data/photos';
import { font, useTheme } from '../theme';
import type { Gender } from '../types';
import { Chip, FormLabel } from './ui';

type Filter = 'all' | Gender;
const SIZE = 54;

export function FacePicker({ value, onPick, gender, exclude, label = '사진 프리셋', hint = '눌러서 프로필 사진으로' }: { value?: string; onPick: (key: string) => void; gender?: Gender; exclude?: Set<string>; label?: string; hint?: string }) {
  const { c } = useTheme();
  const [filter, setFilter] = useState<Filter>(gender ?? 'all');
  // 캐릭터 성별을 바꾸면 목록도 따라간다
  useEffect(() => {
    if (gender) setFilter(gender);
  }, [gender]);

  // 지금 고른 사진(대신 쓰기 표를 거친 실제 키)
  const cur = value ? resolveFace(value) : undefined;
  const list = useMemo(
    () =>
      faces()
        .filter((f) => (filter === 'all' || f.gender === filter) && (f.key === cur || !exclude?.has(f.key)))
        // 지금 고른 사진을 맨 앞에, 나머지는 나이순
        .sort((a, b) => (a.key === cur ? -1 : b.key === cur ? 1 : a.age - b.age)),
    [filter, exclude, cur],
  );

  return (
    <View style={{ gap: 8 }}>
      <FormLabel hint={hint}>{label}</FormLabel>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Chip small label="전체" selected={filter === 'all'} onPress={() => setFilter('all')} accessibilityLabel="사진 프리셋 전체" />
        <Chip small label="여성" selected={filter === 'f'} onPress={() => setFilter('f')} accessibilityLabel="사진 프리셋 여성" />
        <Chip small label="남성" selected={filter === 'm'} onPress={() => setFilter('m')} accessibilityLabel="사진 프리셋 남성" />
      </View>
      {list.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
          {list.map((f) => {
            const on = f.key === cur;
            return (
              <Pressable
                key={f.key}
                testID={`face-${f.key}`}
                onPress={() => onPick(f.key)}
                accessibilityRole="button"
                accessibilityLabel={`${f.gender === 'f' ? '여성' : '남성'} ${Math.floor(f.age / 10) * 10}대 사진 고르기`}
                accessibilityState={{ selected: on }}
                style={[styles.cell, { borderColor: on ? c.primary : 'transparent' }]}
              >
                <Image source={{ uri: AVATARS[f.key] }} style={styles.img} />
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <Text style={{ color: c.subtext, fontSize: font.small }}>고를 수 있는 사진이 없어요</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cell: { width: SIZE + 6, height: SIZE + 6, borderRadius: (SIZE + 6) / 2, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  img: { width: SIZE, height: SIZE, borderRadius: SIZE / 2 },
});
