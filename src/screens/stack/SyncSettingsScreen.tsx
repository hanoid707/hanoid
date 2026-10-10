/** DB 저장·동기화 — Supabase(aisns) 상태 · 지금 동기화 · 동기화 코드(기기 연결) */
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Screen, TopBar } from '../../components/Screen';
import { Button, Field, Row } from '../../components/ui';
import { CONFIG, isArtifactRuntime } from '../../config';
import { useGame } from '../../store/game';
import { restartSync, retrySync, syncNow, useSync } from '../../sync';
import { font, radius, space, useTheme } from '../../theme';

export function SyncSettingsScreen() {
  const { c } = useTheme();
  const sync = useSync();
  const settings = useGame((s) => s.settings.sync);
  const setSync = useGame((s) => s.setSync);
  const showToast = useGame((s) => s.showToast);
  const [key, setKey] = useState(settings.key);
  const inArtifact = isArtifactRuntime();
  const configured = inArtifact ? !!CONFIG.supabaseProject : !!(CONFIG.supabaseUrl && CONFIG.supabaseKey);

  const statusText = {
    off: '꺼짐',
    idle: '정상 — 바뀐 내용은 자동으로 저장돼요',
    syncing: '동기화 중…',
    error: `오류 — ${sync.message ?? ''}`,
    blocked: `확인 필요 — ${sync.message ?? ''}`,
  }[sync.status];
  const color = { off: c.subtext, idle: c.repost, syncing: c.primary, error: c.danger, blocked: c.warning }[sync.status];

  return (
    <Screen>
      <TopBar title="DB 저장·동기화" />
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <View style={{ padding: space.lg, gap: 8 }}>
          <Text style={{ color: c.text, fontSize: font.body, lineHeight: 22 }}>
            캐릭터·사진·특성·게시물·쪽지 내역이 전부 <Text style={{ fontWeight: '800' }}>Supabase의 aisns 공간</Text>에 저장돼요. 폰 앱과 웹 페이지가 같은 데이터를 봐요.
          </Text>
          <View style={[styles.status, { borderColor: c.border }]}>
            <Text style={{ color, fontWeight: '800', fontSize: font.body }}>{statusText}</Text>
            <Text style={{ color: c.subtext, fontSize: font.small }}>
              경로: {sync.via === 'mcp' ? 'claude.ai Supabase 커넥터' : sync.via === 'rest' ? 'Supabase API' : '-'}
              {sync.lastSync ? ` · 마지막 동기화 ${new Date(sync.lastSync).toLocaleTimeString('ko-KR')}` : ''}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <Button title="지금 동기화" variant="ink" size="sm" disabled={sync.status === 'off'} onPress={() => (sync.status === 'blocked' ? retrySync() : void syncNow())} />
            {sync.status === 'blocked' && <Button title="다시 시도" variant="outline" size="sm" onPress={retrySync} />}
          </View>
        </View>

        <Row
          title="자동 동기화"
          desc={configured ? '끄면 이 기기에만 저장돼요' : '이 빌드에는 DB 설정이 없어요(.env.local)'}
          right={
            <Switch
              value={settings.enabled}
              disabled={!configured}
              onValueChange={(enabled) => {
                setSync({ enabled });
                void restartSync();
              }}
              trackColor={{ true: c.primary, false: c.border }}
            />
          }
        />

        {!inArtifact && (
          <View style={{ padding: space.lg, gap: space.md }}>
            <Field
              label="동기화 코드"
              value={key}
              onChangeText={setKey}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              hint="같은 코드를 쓰는 기기끼리 데이터를 공유해요. 다른 기기의 코드를 넣으면 그 데이터를 받아와요(24자 이상)."
            />
            <Button
              title="코드 적용"
              variant="outline"
              disabled={key.trim().length < 24 || key.trim() === settings.key}
              onPress={() => {
                setSync({ key: key.trim() });
                void restartSync();
                showToast('동기화 코드를 바꿨어요', 'success');
              }}
            />
          </View>
        )}
        {inArtifact && (
          <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 19, paddingHorizontal: space.lg }}>
            이 페이지는 외부 인터넷이 막혀 있어서, 내 claude.ai의 Supabase 커넥터로 DB에 접근해요. 처음 한 번 커넥터 사용 허용 창이 떠요.
          </Text>
        )}
        <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 19, padding: space.lg }}>
          Supabase 대시보드 → Table Editor → 스키마 aisns 에서 v_characters(캐릭터), v_dms(쪽지), v_posts(게시물), v_roster(공통 캐릭터) 뷰로 내용을 바로 볼 수 있어요.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  status: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: 4, marginTop: 4 },
});
