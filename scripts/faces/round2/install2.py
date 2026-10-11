"""1차(hf2: g###) + 2차(hf3: s###) 얼굴을 합쳐 앱에 넣기
  제외: 각 폴더 bad.txt · 안경(1차의 안경 칸 전부) · hf2/cull.txt(골든아워·역광·강한 방향광·얼굴 그림자·모자 그늘, rescue.txt 는 살림)
  - assets/photos/avatars/face__<id>_<q>.jpg (192px, 번들) · assets/photos/faces_hd/…(384px 비축) · src/data/facePresets.ts
"""
import json, os, re, glob, hashlib, collections
from PIL import Image
REPO='/home/claude/hanoid707/hanoid'
AV=f'{REPO}/assets/photos/avatars'; HD=f'{REPO}/assets/photos/faces_hd'
H2='../hf2'; H3='.'
rd=lambda p: set(open(p).read().split()) if os.path.exists(p) else set()
f2=json.load(open(f'{H2}/faces.json')); f3=json.load(open(f'{H3}/faces.json'))
bad=rd(f'{H2}/bad.txt')|rd(f'{H3}/bad.txt')
cull=rd(f'{H2}/cull.txt')-rd(f'{H2}/rescue.txt')
asian=rd(f'{H3}/asian.txt')
P={o['id']:o for o in json.load(open(f'{H2}/prompts.json'))}; P['g091']={'glasses':True}
glassat={}
for line in open(f'{H2}/glassat.txt'):
    p=line.split()
    if len(p)==2: glassat[p[0]]=p[1]
def has_glasses(key):
    gid,q=key.split('_')
    return bool(P.get(gid,{}).get('glasses')) and q==glassat.get(gid,'tr')
for f in glob.glob(f'{AV}/face__*.jpg')+glob.glob(f'{HD}/face__*.jpg'): os.remove(f)
os.makedirs(HD,exist_ok=True)
for src,dst in (('g092_tl','football__abel'),('g092_br','football__rocha')):
    Image.open(f'{H2}/cells/{src}.jpg').convert('RGB').resize((192,192),Image.LANCZOS).save(f'{AV}/{dst}.jpg',quality=82,optimize=True)
rows=[]; skipped=collections.Counter()
for base,faces in ((H2,f2),(H3,f3)):
    for key,m in sorted(faces.items()):
        if key in bad: skipped['bad']+=1; continue
        if base==H2 and has_glasses(key): skipped['glasses']+=1; continue
        if key in cull: skipped['light']+=1; continue
        name=f'face__{key}'
        im=Image.open(f'{base}/cells/{key}.jpg').convert('RGB')
        im.resize((384,384),Image.LANCZOS).save(f'{HD}/{name}.jpg',quality=86,optimize=True)
        im.resize((192,192),Image.LANCZOS).save(f'{AV}/{name}.jpg',quality=82,optimize=True)
        h=int(hashlib.md5(key.encode()).hexdigest(),16)
        origin='kr' if key in asian else m['origin']
        rows.append({'key':name,'gender':m['gender'],'age':21+h%6,'hair':m['hair'],'theme':m['world'],'origin':origin,'selfie':base==H3,'h':h})
# 예전 세이브가 쓰던(이제 뺀) 얼굴: 비슷한 새 얼굴로 이어 주게 목록을 남긴다(scripts/gen_face_alias.ts 가 읽음)
kept={r['key'] for r in rows}
removed=[{'key':f'face__{k}','gender':m['gender'],'theme':m['world'],'hair':m['hair'],'origin':m['origin']} for k,m in sorted(f2.items()) if f'face__{k}' not in kept and not k.startswith('g092')]
os.makedirs(f'{REPO}/scripts/faces',exist_ok=True)
json.dump(removed,open(f'{REPO}/scripts/faces/removed.json','w'),ensure_ascii=False,indent=0)
print('removed (aliased later)',len(removed))
rows.sort(key=lambda r:r['h'])
out=['/**',' * 사진 프리셋(자동 생성 목록 — 직접 고치지 않는다) — 힉스필드에서 만든 가상 인물 사진만 골라 둔 목록(실존 인물 아님, 전원 20대).',
 ' *  - 캐릭터·내 계정을 만들 때 고르는 프리셋(components/FacePicker)과 세계관 인물의 얼굴(data/faceAlias · data/facePool)이 이 목록만 쓴다.',
 ' *  - key 는 src/data/photos.ts AVATARS 의 키(face__<격자>_<칸>). 384px 비축본은 assets/photos/faces_hd 에 있다(번들에는 192px만).',
 ' *  - theme: 복장·배경 분위기 / hair: 장발·단발 / origin: fr = 외국인 / selfie: 얼굴 위주 셀카 구도(2차 생성분)',
 ' *  - 넣지 않는 사진: 안경 · 노란 햇빛(골든아워) · 역광 · 방향이 강한 빛 · 얼굴에 그림자(만든 과정은 scripts/faces)',' */',"import type { Gender } from '../types';",'',
 "export type FaceTheme = 'daily' | 'office' | 'military' | 'football' | 'cyberpunk' | 'travel' | 'influencer';","export type FaceHair = 'long' | 'short';",'',
 'export interface FacePreset {','  key: string;','  gender: Gender;','  /** 보이는 나이(대략, 전원 20대) */','  age: number;','  hair: FaceHair;','  theme: FaceTheme;',"  origin?: 'fr';",'  selfie?: boolean;','}','','export const FACE_PRESETS: FacePreset[] = [']
for r in rows:
    extra=(", origin: 'fr'" if r['origin']=='fr' else '')+(', selfie: true' if r['selfie'] else '')
    out.append(f"  {{ key: '{r['key']}', gender: '{r['gender']}', age: {r['age']}, hair: '{r['hair']}', theme: '{r['theme']}'{extra} }},")
out+=['];','']
open(f'{REPO}/src/data/facePresets.ts','w',encoding='utf-8').write('\n'.join(out))
n=len(rows)
print('faces',n,'skipped',dict(skipped))
print('gender',collections.Counter(r['gender'] for r in rows),'origin',collections.Counter(r['origin'] for r in rows),'hair(f)',collections.Counter(r['hair'] for r in rows if r['gender']=='f'),'selfie',sum(r['selfie'] for r in rows))
print('theme',sorted(collections.Counter(r['theme'] for r in rows).items()), 'm by theme',collections.Counter(r['theme'] for r in rows if r['gender']=='m'))
print('avatar KB', sum(os.path.getsize(f) for f in glob.glob(f'{AV}/face__*.jpg'))//1024,'hd KB', sum(os.path.getsize(f) for f in glob.glob(f'{HD}/*.jpg'))//1024)
