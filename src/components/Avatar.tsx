/**
 * 아바타: 사진(기본 사진·직접 고른 사진·인터넷 주소)이 있으면 사진, 없으면 색 배경 + 이모지. 단체 계정은 X처럼 둥근 네모
 * 인터넷 주소 사진(공통 캐릭터)을 못 불러오면 이모지로 돌아간다.
 */
import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { usePhotoUri } from '../store/media';
import { useTheme } from '../theme';
import type { Avatar as AvatarData } from '../types';

export function Avatar({ avatar, size = 40, square, ring, onPress, label }: { avatar: AvatarData; size?: number; square?: boolean; ring?: number; onPress?: () => void; label?: string }) {
  const { c } = useTheme();
  const uri = usePhotoUri(avatar, 'avatar');
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => setFailed(null), [uri]);
  const show = uri && failed !== uri ? uri : undefined;
  const r = square ? size * 0.2 : size / 2;
  const body = (
    <View
      accessibilityRole="image"
      style={{
        width: size,
        height: size,
        borderRadius: r,
        backgroundColor: show ? c.surfaceAlt : avatar.color,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderWidth: ring ?? 0,
        borderColor: c.bg,
      }}
    >
      {show ? (
        <Image source={{ uri: show }} style={{ width: size, height: size }} onError={() => setFailed(show)} />
      ) : (
        <Text style={{ fontSize: size * 0.48, lineHeight: size * 0.6 }}>{avatar.emoji}</Text>
      )}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}>
      {body}
    </Pressable>
  );
}
