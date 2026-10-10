/**
 * 빌드 설정 — 프로젝트 루트의 .env.local 값이 빌드할 때 들어간다(EXPO_PUBLIC_로 시작하는 값만).
 * ⚠️ .env.local 에는 개인 키가 들어 있다. 동아리에 코드를 공유할 땐 .env.local 을 빼고 공유할 것.
 */
import { Platform } from 'react-native';

export const CONFIG = {
  /** Gemini API 키(비어 있으면 AI 연결 화면에서 넣어야 캐릭터들이 반응한다) */
  geminiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '',
  geminiModel: process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-3.5-flash-lite',
  /** Supabase 주소·공개 키(앱이 직접 DB 함수를 부를 때) */
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '',
  /** Supabase 프로젝트 ID(웹 아티팩트가 Supabase 커넥터로 접근할 때) */
  supabaseProject: process.env.EXPO_PUBLIC_SUPABASE_PROJECT ?? '',
  /** 동기화 코드(같은 코드를 쓰는 기기끼리 데이터 공유) */
  syncKey: process.env.EXPO_PUBLIC_AISNS_SYNC_KEY ?? '',
  /** 웹 아티팩트가 쓰는 공간 이름(커넥터 경로는 코드 대신 이 이름으로 찾는다) */
  spaceLabel: process.env.EXPO_PUBLIC_AISNS_SPACE_LABEL || 'main',
} as const;

/** 클로드 아티팩트(claude.ai 페이지) 안에서 실행 중인지 */
export function isArtifactRuntime(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const w = window as unknown as { claude?: { use?: unknown } };
  return typeof w.claude?.use === 'function';
}

/** 아티팩트 런타임 기능 가져오기(sample = 클로드, mcp = 커넥터). 없으면 null */
export async function getArtifactCapability<T = unknown>(name: 'sample' | 'mcp'): Promise<T | null> {
  if (!isArtifactRuntime()) return null;
  try {
    const w = window as unknown as { claude: { use(n: string): Promise<T | null> } };
    return (await w.claude.use(name)) ?? null;
  } catch {
    return null;
  }
}
