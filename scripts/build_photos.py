"""assets/photos/{avatars,scenes,banners}/*.jpg → src/data/photos.ts (data URI 모음)
사진을 바꾸거나 추가한 뒤 실행: python scripts/build_photos.py
파일 이름 규칙: <세계관ID>__<캐릭터 key 또는 장면 key>.jpg
"""
import base64, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'photos')
OUT = os.path.join(ROOT, 'src', 'data', 'photos.ts')

def collect(kind):
    d = os.path.join(SRC, kind)
    items = []
    if os.path.isdir(d):
        for f in sorted(os.listdir(d)):
            if f.lower().endswith(('.jpg', '.jpeg')):
                with open(os.path.join(d, f), 'rb') as fh:
                    items.append((os.path.splitext(f)[0], base64.b64encode(fh.read()).decode()))
    return items

parts = [
    '/**',
    ' * 기본 사진 모음(자동 생성 파일 — 직접 고치지 말고 scripts/build_photos.py 실행)',
    ' * - AVATARS: 캐릭터 프로필 사진(192px), SCENES: 게시물 첨부 사진, BANNERS: 프로필 배너',
    ' * - 사진은 전부 AI로 새로 만든 가상 인물·장면이다(실존 인물 아님).',
    ' * - 키: <세계관ID>__<key>',
    ' */',
]
total = 0
for kind, name in (('avatars', 'AVATARS'), ('scenes', 'SCENES'), ('banners', 'BANNERS')):
    items = collect(kind)
    parts.append(f'export const {name}: Record<string, string> = {{')
    for key, b64 in items:
        total += len(b64)
        parts.append(f"  '{key}': 'data:image/jpeg;base64,{b64}',")
    parts.append('};')
with open(OUT, 'w', encoding='utf-8') as fh:
    fh.write('\n'.join(parts) + '\n')
print(f'wrote {OUT} ({total/1024/1024:.2f} MB base64)')
