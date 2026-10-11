/**
 * 사진 프리셋 고르기 — 미리 넣어 둔 가상 인물 사진(data/facePresets, 전원 20대) 중에서 프로필 사진을 고른다.
 * 캐릭터 만들기·캐릭터 설정·내 계정 만들기·프로필 수정이 같이 쓴다. 직접 찍은 사진·이모지 대신 고르는 "기본값".
 *   거르기: 성별(전체/여성/남성) · 머리(장발/단발) · 분위기(일상·회사·군복·축구·네온·여행·인플루언서·외국인)
 *   gender : (선택) 처음 보여 줄 성별. 안 주면 전체
 *   exclude: 이 세계에서 이미 다른 인물이 쓰는 사진(목록에서 뺀다)
 */
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { faces, resolveFace } from '../data/facePool';
import type { FaceHair, FaceTheme } from '../data/facePresets';
import { AVATARS } from '../data/photos';
import { font, useTheme } from '../theme';
import type { Gender } from '../types';
import { Chip, FormLabel } from './ui';

type GenderFilter = 'all' | Gender;
type Mood = 'all' | FaceTheme | 'foreign';
const SIZE = 54;
const MOODS: { key: Mood; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'daily', label: '일상' },
  { key: 'office', label: '회사' },
  { key: 'military', label: '군복' },
  { key: 'football', label: '축구' },
  { key: 'cyberpunk', label: '네온' },
  { key: 'travel', label: '여행' },
  { key: 'influencer', label: '인플루언서' },
  { key: 'foreign', label: '외국인' },
];

export function FacePicker({ value, onPick, gender, exclude, label = '사진 프리셋', hint = '눌러서 프로필 사진으로' }: { value?: string; onPick: (key: string) => void; gender?: Gender; exclude?: Set<string>; label?: string; hint?: string }) {
  const { c } = useTheme();
  const [filter, setFilter] = useState<GenderFilter>(gender ?? 'all');
  const [hair, setHair] = useState<FaceHair | 'all'>('all');
  const [mood, setMood] = useState<Mood>('all');
  useEffect(() => {
    if (gender) setFilter(gender);
  }, [gender]);

  // 지금 고른 사진(대신 쓰기 표를 거친 실제 키)
  const cur = value ? resolveFace(value) : undefined;
  const list = useMemo(
    () =>
      faces()
        .filter(
          (f) =>
            f.key === cur ||
            ((filter === 'all' || f.gender === filter) &&
              (hair === 'all' || f.hair === hair) &&
              (mood === 'all' || (mood === 'foreign' ? f.origin === 'fr' : f.theme === mood)) &&
              !exclude?.has(f.key)),
        )
        // 지금 고른 사진을 맨 앞에, 나머지는 목록 순서(분위기별로 섞여 있음)
        .sort((a, b) => (a.key === cur ? -1 : b.key === cur ? 1 : 0)),
    [filter, hair, mood, exclude, cur],
  );
  const toggleHair = (h: FaceHair) => setHair((x) => (x === h ? 'all' : h));

  return (
    <View style={{ gap: 8 }}>
      <FormLabel hint={hint}>{label}</FormLabel>
      <View style={styles.chips}>
        <Chip small label="전체" selected={filter === 'all'} onPress={() => setFilter('all')} accessibilityLabel="사진 프리셋 전체" />
        <Chip small label="여성" selected={filter === 'f'} onPress={() => setFilter('f')} accessibilityLabel="사진 프리셋 여성" />
        <Chip small label="남성" selected={filter === 'm'} onPress={() => setFilter('m')} accessibilityLabel="사진 프리셋 남성" />
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <Chip small label="장발" selected={hair === 'long'} onPress={() => toggleHair('long')} accessibilityLabel="사진 프리셋 장발" />
        <Chip small label="단발" selected={hair === 'short'} onPress={() => toggleHair('short')} accessibilityLabel="사진 프리셋 단발" />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6 }}>
        {MOODS.map((m) => (
          <Chip key={m.key} small label={m.label} selected={mood === m.key} onPress={() => setMood(m.key)} accessibilityLabel={`사진 분위기 ${m.label}`} />
        ))}
      </ScrollView>
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
                accessibilityLabel={`${f.gender === 'f' ? '여성' : '남성'} ${f.hair === 'long' ? '장발' : '단발'} 사진 고르기`}
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
      <Text style={{ color: c.faint, fontSize: font.tiny }}>{list.length}장</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  sep: { width: StyleSheet.hairlineWidth, height: 18, marginHorizontal: 2 },
  cell: { width: SIZE + 6, height: SIZE + 6, borderRadius: (SIZE + 6) / 2, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  img: { width: SIZE, height: SIZE, borderRadius: SIZE / 2 },
});
