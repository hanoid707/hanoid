/** 본문 텍스트: #해시태그·@멘션을 색칠하고, 멘션을 누르면 그 캐릭터 프로필로 이동(지금 이야기에서 빠진 계정도 프로필은 열린다) */
import { useNavigation } from '@react-navigation/native';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import type { RootNav } from '../navigation/types';
import { useActive } from '../store/game';
import { font, useTheme } from '../theme';
import type { Scenario } from '../types';

const TOKEN = new RegExp('(#[A-Za-z0-9_\\uAC00-\\uD7A3\\u3131-\\u318E]+|@[A-Za-z0-9_]+)', 'g');

/** @아이디 → 캐릭터 ID(지금 등장 중인 계정 먼저) */
function idByHandle(sc: Scenario, handle: string): string | undefined {
  const h = handle.toLowerCase();
  return sc.cast.find((cid) => sc.characters[cid]?.handle.toLowerCase() === h) ?? Object.values(sc.characters).find((ch) => ch.handle.toLowerCase() === h)?.id;
}

export function RichText({ text, style, numberOfLines }: { text: string; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const sc = useActive();
  const parts = text.split(TOKEN).filter((p) => p !== '');
  return (
    <Text numberOfLines={numberOfLines} style={[{ color: c.text, fontSize: font.body, lineHeight: 21 }, style]}>
      {parts.map((p, i) => {
        if (p.startsWith('#')) return <Text key={i} style={{ color: c.primary }}>{p}</Text>;
        if (p.startsWith('@')) {
          const handle = p.slice(1).toLowerCase();
          return (
            <Text
              key={i}
              style={{ color: c.primary }}
              onPress={() => {
                if (!sc) return;
                // 누를 때만 찾는다(그릴 때는 계산 0)
                const id = idByHandle(sc, handle);
                if (id) nav.navigate('CharacterProfile', { characterId: id });
                else if (sc.persona.handle.toLowerCase() === handle) nav.navigate('MyProfile');
              }}
            >
              {p}
            </Text>
          );
        }
        return <Text key={i}>{p}</Text>;
      })}
    </Text>
  );
}
