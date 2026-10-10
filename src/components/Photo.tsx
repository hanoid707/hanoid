/** 사진 표시(배너·게시물 첨부): 기본 사진·직접 고른 사진·인터넷 주소를 같은 방식으로(못 불러오면 바탕색만) */
import { useEffect, useState } from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import { usePhotoUri } from '../store/media';
import { useTheme } from '../theme';
import type { PhotoRef } from '../types';

export function Photo({ photo, table, style, fallback, ratio }: { photo?: PhotoRef; table: 'banner' | 'scene' | 'avatar'; style?: StyleProp<ViewStyle>; fallback?: string; ratio?: number }) {
  const { c } = useTheme();
  const uri = usePhotoUri(photo, table);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => setFailed(null), [uri]);
  const show = uri && failed !== uri ? uri : undefined;
  return (
    <View style={[{ backgroundColor: fallback ?? c.surfaceAlt, overflow: 'hidden' }, ratio ? { aspectRatio: ratio } : null, style]}>
      {show ? <Image source={{ uri: show }} resizeMode="cover" style={{ width: '100%', height: '100%' }} onError={() => setFailed(show)} /> : null}
    </View>
  );
}
