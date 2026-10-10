# 핸드오프

AI-SNS 인수인계 문서. 운영·수정 방법은 [README](README.md), 이 문서는 **현재 상태와 다음 할 일**만 다룹니다.

## 1. 프로젝트

가상 인물들이 사는 SNS 시뮬레이션. 글을 올리면 AI가 답글·댓글·쪽지를 쓰고 관계 수치가 변합니다.

| 항목 | 값 |
|---|---|
| 스택 | Expo SDK 57 · React Native 0.86.3 · React 19.2.3 · TypeScript 6.0.3 |
| 상태 관리 | zustand + immer |
| 저장 | AsyncStorage(기기) → Supabase(`aisns` 스키마) 동기화 |
| AI | Gemini `gemini-3.5-flash-lite` 기본, 클로드 폴백 |
| 화면 | react-navigation v7 (하단 5탭 + 스택) |
| 저장소 | `hanoid707/hanoid` (public) |

## 2. 현재 상태

| 구분 | 상태 |
|---|---|
| 기능 | 완성. 온보딩·글·답글·쪽지·이벤트·아이템·공통 캐릭터·세계관 수정 전부 동작 |
| 타입 검사 | 통과 (`npx tsc --noEmit`) |
| 세계관 | 6종 · 기본 사진 205장 포함 |
| **배포** | **Cloudflare Worker 로 운영 중** — https://hanoid.hansy-dawn.workers.dev |
| 배포 방식 | GitHub `main` 에 푸시하면 Cloudflare 가 자동으로 빌드·배포 (2~3분) |
| 로그인 | 비밀번호는 Cloudflare Secret 에만 있고 번들에 없다 (`/api/login` 이 서버에서 확인) |
| AI 호출 | 키 없이 `/api/gemini` 로 보내면 서버가 키를 붙여 구글에 대신 요청한다 |
| **테스트** | **0개** |
| **CI** | **없음** |

## 3. 코드 지도

| 경로 | 역할 |
|---|---|
| `src/screens/` | 화면 (tabs 5개 · stack 상세 · onboarding 3단계) |
| `src/game/` | 게임 규칙 — 행동 처리·관계·난이도·수치·아이템 |
| `src/ai/` | AI 지시문(`prompts.ts`)·세계관 말투 힌트(`voice.ts`)·문맥(`context.ts`)·엔진 연결 |
| `src/data/worlds/` | 세계관 6종 (인물·시작 글·이벤트) |
| `src/store/` · `src/sync/` | 상태·기기 저장 · Supabase 동기화 |
| `supabase/aisns.sql` | DB 스키마·함수·보기 |
| `scripts/index_photos.py` | `assets/photos/` → `src/data/photos.ts` 목록 갱신 |

## 4. 환경 변수 (`.env.local`)

`.env.example` 복사해서 채웁니다. git에서 제외됨.

| 키 | 용도 |
|---|---|
| `EXPO_PUBLIC_GEMINI_API_KEY` | Gemini 키 (없으면 캐릭터 무반응) |
| `EXPO_PUBLIC_GEMINI_MODEL` | 기본 `gemini-3.5-flash-lite` |
| `EXPO_PUBLIC_SUPABASE_URL` · `_KEY` · `_PROJECT` | DB 연결 |
| `EXPO_PUBLIC_AISNS_SYNC_KEY` | 동기화 코드 (같은 코드끼리 데이터 공유) |
| `EXPO_PUBLIC_AISNS_SPACE_LABEL` | 공간 이름 (기본 `main`) |

## 5. 다음 할 일

폰·웹 상시 사용은 끝났습니다(Cloudflare). 남은 것은 아래입니다.

| 순위 | 할 일 | 왜 | 손대는 곳 |
|---|---|---|---|
| P2 | `gh-pages` 브랜치 삭제 | Cloudflare 로 옮겨 쓸모없어졌다. 프록시가 막아 수동으로 해야 한다 | GitHub 저장소 Branches |
| P2 | `eas.json` 생성 | 앱(APK)으로도 쓰려면 필요. `npx eas build:configure` | 루트 |
| P2 | 순수 함수 테스트 | 수치 규칙이 많은데 안전망 0 | `src/game/rules·relationship·difficulty·engagement` 부터 |
| P2 | CI 추가 | 푸시마다 `tsc --noEmit` + 테스트 | `.github/workflows/` |
| P3 | 사진 교체 | 기본 사진을 외부 생성 서비스 결과물로 교체 | `assets/photos/` → `python scripts/index_photos.py` |
| P3 | README 복구 | 현재 한 줄짜리 임의 문자열로 덮여 있다 | `README.md` |
| P3 | 에러 리포팅 | 폰에서 터지면 원인 추적 수단 없음 | Sentry 등 |

## 6. 최적화 후보

| 대상 | 현재 | 방향 |
|---|---|---|
| AI 입력 토큰 | 호출당 약 4,500 (한 판 13회 ≈ 45,000) | `src/ai/context.ts`에서 보내는 인물 정보 축소. 비용에 직결 |
| 번들 크기 | 사진 205장 2.2MB가 앱에 포함 | 웹 초기 로딩 부담. Supabase `media` 원격 로딩 또는 지연 로딩 |
| `src/data/photos.ts` | 자동 생성 파일, 사진 늘수록 커짐 | 사진 추가 시 번들 영향 확인 |
| 쪽지 요약 | 최근 16줄 + 앞부분 260자 요약 | 재요약 반복 시 사실이 흐려짐. 요약 보존 규칙 개선 여지 |
| 동기화 주기 | 올리기 2.5초(웹 6초) · 받기 15초(웹 45초) | 사용 패턴 보고 조정 |

## 7. 건드리면 깨지는 것

| 대상 | 이유 |
|---|---|
| `src/store/`의 `mainchar:` 키 접두어 | 바꾸면 **기존 저장 데이터 전부 유실** |
| `public/index.html` | Expo 웹 빌드가 규칙상 쓰는 템플릿. 설정에 안 적혀 있다고 지우면 안 됨 |
| `src/data/worlds/legacy.ts` | `migrate.ts`가 옛 세이브 변환에 사용 |
| `src/data/photos.ts` | 자동 생성 파일. 직접 수정 말고 `index_photos.py` 실행 |

## 8. 참고

- `src/ai/prompts.ts`에 수위 3단계(순한맛·보통·에로틱) 지시문이 있습니다. 공개 타임라인은 어느 단계든 암시까지이고 에로틱 단계의 노골적 묘사는 썸·연인 사이 쪽지에서만 나오며, 공통 캐릭터(실존 인물일 수 있음)·가족·10대 인물은 단계와 무관하게 연애 반응이 없습니다. 세계관별 말투 힌트는 `src/ai/voice.ts`에 있습니다.
- 기본 세계관 인물·사진은 전부 가상입니다. 실존 인물은 사용자가 공통 캐릭터로 직접 넣는 구조이며, 공개·공유 시 초상권·명예 책임은 넣은 사람에게 있습니다.
- DB 내용은 Supabase 대시보드 → Table Editor → 스키마 `aisns` → `v_characters`·`v_dms`·`v_posts`·`v_roster`에서 바로 볼 수 있습니다.
