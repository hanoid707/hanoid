# 얼굴 사진 풀 만들기(기록용)

힉스필드(Seedream 5.0 lite · 2K · 1:1 · Unlimited = 0크레딧)로 2x2 격자 사진을 만들고, 칸마다 얼굴을 찾아 잘라 앱에 넣은 과정의 스크립트.
경로는 작업 당시의 임시 폴더 기준이라 다시 쓰려면 경로만 고치면 된다.

1. `gen.js` / `prompts.json` — 격자별 프롬프트(세계관 분위기 · 성별 · 한국인/외국인 · 장발/단발 · 안경)
2. `fetch.py` — 만든 격자 내려받기
3. `build.py` — 칸별 얼굴 크롭(512px) + 확인 시트
4. `install.py` — `bad.txt`(제외) · `glassat.txt`(안경 칸) 반영 → `assets/photos/avatars`(192px) · `assets/photos/faces_hd`(384px 비축) · `src/data/facePresets.ts`
5. `npx tsx scripts/gen_face_alias.ts` → `python3 scripts/index_photos.py`

## 2차(셀카 구도)
- `round2/prompts.py` — 얼굴 위주 타이트 셀카 · 순광 · 안경 없음 · 인플루언서/여행/일상 44격자
- `round2/install2.py` — 1차 + 2차를 합쳐 넣는다. 빼는 사진: 안경 전부 · `cull.txt`(골든아워 · 역광 · 방향이 강한 빛 · 얼굴 그림자 · 모자 그늘, `rescue.txt`는 살림) · 각 `bad.txt`
- 뺀 얼굴을 쓰던 예전 세이브는 `removed.json` → `gen_face_alias.ts` 가 비슷한 새 얼굴로 이어 준다
- 만든 격자는 힉스필드 프로젝트 "SNS asset"에 모아 둔다
