/** 인증 배지: 파랑(개인) · 금색(단체·언론) · 회색(기관) — X와 같은 의미 */
import { View } from 'react-native';
import { useTheme } from '../theme';
import type { BadgeKind } from '../types';
import { IconVerified } from './icons';

export function VerifiedBadge({ kind, size = 17 }: { kind?: BadgeKind | null; size?: number }) {
  const { c } = useTheme();
  if (!kind) return null;
  const fill = kind === 'gold' ? c.gold : kind === 'gray' ? c.gray : c.primary;
  return (
    <View style={{ flexShrink: 0, marginLeft: 2 }} accessibilityLabel={kind === 'gold' ? '금색 인증' : kind === 'gray' ? '회색 인증' : '인증됨'}>
      <IconVerified size={size} color="#FFFFFF" fill={fill} strokeWidth={2.4} />
    </View>
  );
}
