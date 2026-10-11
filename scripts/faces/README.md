# 얼굴 사진 풀 만들기(기록용)

힉스필드(Seedream 5.0 lite · 2K · 1:1 · Unlimited = 0크레딧)로 2x2 격자 사진을 만들고, 칸마다 얼굴을 찾아 잘라 앱에 넣은 과정의 스크립트.
경로는 작업 당시의 임시 폴더 기준이라 다시 쓰려면 경로만 고치면 된다.

1. `gen.js` / `prompts.json` — 격자별 프롬프트(세계관 분위기 · 성별 · 한국인/외국인 · 장발/단발 · 안경)
2. `fetch.py` — 만든 격자 내려받기
3. `build.py` — 칸별 얼굴 크롭(512px) + 확인 시트
4. `install.py` — `bad.txt`(제외) · `glassat.txt`(안경 칸) 반영 → `assets/photos/avatars`(192px) · `assets/photos/faces_hd`(384px 비축) · `src/data/facePresets.ts`
5. `npx tsx scripts/gen_face_alias.ts` → `python3 scripts/index_photos.py`
