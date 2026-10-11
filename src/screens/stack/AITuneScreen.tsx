/**
 * AI 개수 조절(토큰) — 답글·댓글·쪽지·하루 정산의 새 글 수처럼 토큰과 바로 이어지는 양을 한 화면에서 정한다.
 * 설정이라 모든 세계관·세이브에 똑같이 적용된다(DB 동기화를 켜면 다른 기기에도). 줄마다 예상 소모가 보인다.
 * 같은 목록이 AI 연결 화면 아래에도 있다(components/AITuneList).
 */
import { ScrollView, Text } from 'react-native';
import { AITuneList } from '../../components/AITuneList';
import { Screen, TopBar } from '../../components/Screen';
import { useGame } from '../../store/game';
import { font, space, useTheme } from '../../theme';
import { DEFAULT_USD_KRW } from './AISettingsScreen';

export function AITuneScreen() {
  const { c } = useTheme();
  const ai = useGame((s) => s.settings.ai);
  const rate = ai.usdKrw && ai.usdKrw > 0 ? ai.usdKrw : DEFAULT_USD_KRW;
  return (
    <Screen>
      <TopBar title="AI 개수 조절" subtitle="토큰과 바로 이어지는 양 · 모든 세계관에 적용" />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 19, paddingHorizontal: space.lg, paddingTop: space.md }}>
          줄이면 토큰이 덜 들고, 0으로 두면 그 일엔 AI를 쓰지 않아요. 바꾸면 다음 반응부터 바로 적용돼요.
        </Text>
        <AITuneList rate={rate} />
      </ScrollView>
    </Screen>
  );
}
