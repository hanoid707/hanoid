# 사진 다시 만들기 (선택)

> 앱에 들어 있는 기본 사진(가상 인물 151장 · 장면 36장 · 배너 18장)을 만든 스크립트입니다. **앱 실행에는 필요 없습니다.**
> 사진 한 장만 바꾸고 싶으면 앱 안에서 캐릭터 설정 → 사진 누르기 → 고르기·자르기가 훨씬 빠릅니다.

## 순서

| 단계 | 명령 | 결과 |
|---|---|---|
| ① 사진 설명 뽑기 | `npx tsx tools/photo_gen/extract_specs.ts photo_specs.json` | 세계관 파일의 `photo`·`scenes`·`banners` 설명 → JSON |
| ② 생성 | `python3 -I tools/photo_gen/gen.py <모델폴더> photo_specs.json out` | `out/avatars·scenes·banners·full` (이미 있는 파일은 건너뜀) |
| ③ 사람 장면 보정 | `python3 -I tools/photo_gen/gen_fix.py <모델폴더> out` | 사람이 나오는 장면을 한국인 얼굴 모델로 다시 생성 |
| ④ 검수 | `out/full` 전부 눈으로 확인 | 노출·로고·글자·이상한 손 → 프롬프트 고쳐 해당 파일만 지우고 ② 재실행 |
| ⑤ 앱에 넣기 | `out/avatars·scenes·banners` → `assets/photos/` 복사 후 `python scripts/build_photos.py` | `src/data/photos.ts` 갱신 |

## 모델 폴더 구성 (diffusers 형식, Hugging Face에서 받기)

| 폴더 | 모델 | 용도 |
|---|---|---|
| `majic/` | majicMIX realistic v7 | 한국인 얼굴 · 사람 장면 |
| `rv51/` | Realistic Vision V5.1 | 외국인 얼굴 · 얼굴 없는 프사 · 장면 · 배너 |
| `vae/` | sd-vae-ft-mse | RV 색감 보정 |
| `lcm/` | LCM-LoRA (SD 1.5) | 6스텝 빠른 생성 |

```text
CPU 2코어 기준   한국인 얼굴 27초/장 · 외국인 얼굴 38초/장 · LCM 장면 13~20초/장 · 전체 약 1시간 20분
얼굴 설정        DPM++ 2M Karras · 11스텝 · CFG 4.5 · 448×448 · bf16
LCM 설정         6스텝 · CFG 1.0
출력             프사 192px(q74) · 장면 560×336 · 배너 600×200
```

## 주의

- **안전 필터가 꺼져 있습니다**(`safety_checker=None`). LCM(CFG 1.0)은 부정 프롬프트(nsfw 등)를 무시하므로, 사람이 나오는 장면은 노출 이미지가 섞일 수 있습니다 → **④ 검수는 반드시** 하고, 사람 장면은 ③처럼 부정 프롬프트가 먹는 설정으로 만드세요.
- 실존 인물 이름·얼굴을 프롬프트에 넣지 마세요(가상 인물만).
- 프롬프트는 앞 77토큰까지만 반영됩니다 → 중요한 피사체를 앞에 두고 짧게 쓰세요.
