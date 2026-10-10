/**
 * 화면 구조 (원본 앱과 같은 React Navigation 사용, 모양은 X 앱처럼)
 *   스택: 온보딩 → 메인 탭 → 상세 화면들
 *   탭 5개: 홈 · 검색 · 알림 · 쪽지 · 나(내 프사) — 아이콘만, 글자 없음
 *   (v3) 왼쪽 위 사이드 메뉴 대신, 바닥 다섯 번째 탭(내 프사)에 프로필·설정을 모았다.
 */
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { IconBell, IconHome, IconMail, IconSearch, IconUser } from '../components/icons';
import { WorldSelectScreen } from '../screens/onboarding/WorldSelectScreen';
import { WorldCustomScreen } from '../screens/onboarding/WorldCustomScreen';
import { PersonaCreateScreen } from '../screens/onboarding/PersonaCreateScreen';
import { FirstFollowerScreen } from '../screens/onboarding/FirstFollowerScreen';
import { HomeScreen } from '../screens/tabs/HomeScreen';
import { ExploreScreen } from '../screens/tabs/ExploreScreen';
import { NotificationsScreen } from '../screens/tabs/NotificationsScreen';
import { MessagesScreen } from '../screens/tabs/MessagesScreen';
import { MeScreen } from '../screens/tabs/MeScreen';
import { ProfileScreen } from '../screens/tabs/ProfileScreen';
import { ProfileEditScreen } from '../screens/stack/ProfileEditScreen';
import { PostDetailScreen } from '../screens/stack/PostDetailScreen';
import { ComposeScreen } from '../screens/stack/ComposeScreen';
import { ChatScreen } from '../screens/stack/ChatScreen';
import { NewMessageScreen } from '../screens/stack/NewMessageScreen';
import { CharacterProfileScreen } from '../screens/stack/CharacterProfileScreen';
import { EventScreen } from '../screens/stack/EventScreen';
import { QuestsScreen } from '../screens/stack/QuestsScreen';
import { ActivityScreen } from '../screens/stack/ActivityScreen';
import { BookmarksScreen } from '../screens/stack/BookmarksScreen';
import { SettingsScreen } from '../screens/stack/SettingsScreen';
import { AISettingsScreen } from '../screens/stack/AISettingsScreen';
import { SyncSettingsScreen } from '../screens/stack/SyncSettingsScreen';
import { CharacterEditorScreen } from '../screens/stack/CharacterEditorScreen';
import { ItemsScreen } from '../screens/stack/ItemsScreen';
import { StatsEditorScreen } from '../screens/stack/StatsEditorScreen';
import { WorldEditScreen } from '../screens/stack/WorldEditScreen';
import { RosterScreen } from '../screens/stack/RosterScreen';
import { useGame, type GameState } from '../store/game';
import { useTheme } from '../theme';
import type { Avatar as AvatarData } from '../types';
import type { RootStackParamList, TabParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// 탭 바는 필요한 숫자만 구독한다(시나리오가 바뀔 때마다 탭 전체를 다시 그리지 않게)
const activeOf = (s: GameState) => (s.activeId ? s.scenarios[s.activeId] : undefined);
const selUnreadNotis = (s: GameState) => activeOf(s)?.notis.reduce((n, x) => n + (x.read ? 0 : 1), 0) ?? 0;
const selUnreadDMs = (s: GameState) => {
  const sc = activeOf(s);
  return sc ? Object.values(sc.dms).reduce((n, cv) => n + cv.unread, 0) : 0;
};
/** 받을 수 있는 미션 보상 수(나 탭 배지) */
const selClaimable = (s: GameState) => activeOf(s)?.quests.reduce((n, q) => n + (q.done && !q.claimed ? 1 : 0), 0) ?? 0;
const selAvatar = (s: GameState) => activeOf(s)?.persona.avatar;

/** 다섯 번째 탭 아이콘: 내 프사(선택되면 테두리) */
function MeTabIcon({ focused, avatar }: { focused: boolean; avatar?: AvatarData }) {
  const { c } = useTheme();
  return (
    <View style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: focused ? c.text : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      {avatar ? <Avatar avatar={avatar} size={26} /> : <IconUser size={24} color={focused ? c.text : c.subtext} strokeWidth={focused ? 2.6 : 1.8} />}
    </View>
  );
}

function MainTabs() {
  const { c } = useTheme();
  const unreadNotis = useGame(selUnreadNotis);
  const unreadDMs = useGame(selUnreadDMs);
  const claimable = useGame(selClaimable);
  const avatar = useGame(selAvatar);
  const icon = (Comp: typeof IconHome) => ({ color, focused }: { color: string; focused: boolean }) => <Comp color={color} size={26} strokeWidth={focused ? 2.6 : 1.8} />;
  const badge = (n: number) => (n ? Math.min(n, 99) : undefined);
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: c.text,
        tabBarInactiveTintColor: c.subtext,
        tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.border },
        tabBarBadgeStyle: { backgroundColor: c.primary, color: '#fff', fontSize: 10, fontWeight: '700' },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: '홈', tabBarAccessibilityLabel: '홈 탭', tabBarButtonTestID: 'tab-home', tabBarIcon: icon(IconHome) }} />
      <Tab.Screen name="Explore" component={ExploreScreen} options={{ title: '검색', tabBarAccessibilityLabel: '검색 탭', tabBarButtonTestID: 'tab-explore', tabBarIcon: icon(IconSearch) }} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} options={{ title: '알림', tabBarAccessibilityLabel: '알림 탭', tabBarButtonTestID: 'tab-notifications', tabBarBadge: badge(unreadNotis), tabBarIcon: icon(IconBell) }} />
      <Tab.Screen name="Messages" component={MessagesScreen} options={{ title: '쪽지', tabBarAccessibilityLabel: '쪽지 탭', tabBarButtonTestID: 'tab-messages', tabBarBadge: badge(unreadDMs), tabBarIcon: icon(IconMail) }} />
      <Tab.Screen
        name="Me"
        component={MeScreen}
        options={{
          title: '나',
          tabBarAccessibilityLabel: '나 탭',
          tabBarButtonTestID: 'tab-me',
          tabBarBadge: badge(claimable),
          tabBarIcon: ({ focused }) => <MeTabIcon focused={focused} avatar={avatar} />,
        }}
      />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { c, dark } = useTheme();
  const base = dark ? DarkTheme : DefaultTheme;
  const navTheme = { ...base, colors: { ...base.colors, background: c.bg, card: c.bg, text: c.text, border: c.border, primary: c.primary } };
  // iOS 기본 모달(시트)은 상단 여백 계산이 달라서, 모든 기기에서 '아래에서 올라오는 카드'로 통일
  const modal = { presentation: 'card' as const, animation: 'slide_from_bottom' as const };

  return (
    // 웹에서도 주소(URL)를 바꾸지 않는다 → 어떤 주소에 올려도 동작
    <NavigationContainer theme={navTheme} documentTitle={{ enabled: false }}>
      {/* 들어오면 늘 세계관 목록부터 — 위에 이어할 것, 아래에 새 세계관 */}
      <Stack.Navigator initialRouteName="WorldSelect" screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'slide_from_right' }}>
        <Stack.Screen name="WorldSelect" component={WorldSelectScreen} />
        <Stack.Screen name="WorldCustom" component={WorldCustomScreen} />
        <Stack.Screen name="PersonaCreate" component={PersonaCreateScreen} />
        <Stack.Screen name="FirstFollower" component={FirstFollowerScreen} />
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="MyProfile" component={ProfileScreen} />
        <Stack.Screen name="PostDetail" component={PostDetailScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="CharacterProfile" component={CharacterProfileScreen} />
        <Stack.Screen name="Quests" component={QuestsScreen} />
        <Stack.Screen name="Activity" component={ActivityScreen} />
        <Stack.Screen name="Bookmarks" component={BookmarksScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="AISettings" component={AISettingsScreen} />
        <Stack.Screen name="SyncSettings" component={SyncSettingsScreen} />
        <Stack.Screen name="StatsEditor" component={StatsEditorScreen} />
        <Stack.Screen name="WorldEdit" component={WorldEditScreen} />
        <Stack.Screen name="Roster" component={RosterScreen} />
        <Stack.Screen name="Compose" component={ComposeScreen} options={modal} />
        <Stack.Screen name="NewMessage" component={NewMessageScreen} options={modal} />
        <Stack.Screen name="Event" component={EventScreen} options={modal} />
        <Stack.Screen name="ProfileEdit" component={ProfileEditScreen} options={modal} />
        <Stack.Screen name="CharacterEditor" component={CharacterEditorScreen} options={modal} />
        <Stack.Screen name="Items" component={ItemsScreen} options={modal} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
