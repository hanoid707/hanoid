/** 화면 이름과 화면에 넘기는 값 정의 (React Navigation 타입) */
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type TabParamList = {
  Home: undefined;
  Explore: undefined;
  Notifications: undefined;
  Messages: undefined;
  /** (v3) 다섯 번째 탭: 내 프사 → 나(프로필·설정 모음) */
  Me: undefined;
};

export type RootStackParamList = {
  WorldSelect: undefined;
  WorldCustom: undefined;
  PersonaCreate: undefined;
  FirstFollower: undefined;
  Main: NavigatorScreenParams<TabParamList> | undefined;
  MyProfile: undefined;
  ProfileEdit: undefined;
  PostDetail: { postId: string };
  /** quoteId: 이 글을 재게시해서 그 아래에 이어 쓴다 */
  Compose: { text?: string; quoteId?: string } | undefined;
  Chat: { characterId: string };
  NewMessage: undefined;
  CharacterProfile: { characterId: string };
  Event: { eventId: string };
  Quests: undefined;
  Activity: undefined;
  Bookmarks: undefined;
  Settings: undefined;
  AISettings: undefined;
  AITune: undefined;
  SyncSettings: undefined;
  CharacterEditor: { characterId?: string } | undefined;
  /** (v3) 아이템(바이럴 모먼트·되돌리기·시간 건너뛰기) — 상단 날짜를 누르면. 선물은 쪽지 대화·프로필에서 */
  Items: undefined;
  /** (v3) 내 팔로워·스탯 직접 조정 */
  StatsEditor: undefined;
  WorldEdit: undefined;
  /** (v3) 공통 캐릭터(세계관 공통 등장) 목록·가져오기·켜기/끄기 */
  Roster: undefined;
};

export type RootNav = NativeStackNavigationProp<RootStackParamList>;
