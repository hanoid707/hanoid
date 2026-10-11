"""cells/ + faces.json(+ bad.txt) → 앱에 넣기
  - assets/photos/avatars/face__<gid>_<q>.jpg (192px, 번들에 들어감)
  - assets/photos/faces_hd/face__<gid>_<q>.jpg (384px 비축본 — 번들에 안 들어감)
  - 예전 얼굴 사진 삭제(로고·얼굴 없는 사진은 그대로)
  - src/data/facePresets.ts 생성
"""
import json, os, re, glob, hashlib, subprocess
from PIL import Image
REPO='/home/claude/hanoid707/hanoid'
AV=f'{REPO}/assets/photos/avatars'; HD=f'{REPO}/assets/photos/faces_hd'
faces=json.load(open('faces.json'))
bad=set(open('bad.txt').read().split()) if os.path.exists('bad.txt') else set()
noglass=set(open('noglass.txt').read().split()) if os.path.exists('noglass.txt') else set()   # 안경 격자인데 안경이 안 나온 격자
glassat={}  # 안경이 tr 이 아닌 칸에 나온 격자: 'g012 bl'
if os.path.exists('glassat.txt'):
    for line in open('glassat.txt'):
        p=line.split()
        if len(p)==2: glassat[p[0]]=p[1]
P={o['id']:o for o in json.load(open('prompts.json'))}; P['g091']={'glasses':True}
for _g in ('g093','g094','g095'): P[_g]={'glasses':False}
# 1) 예전 얼굴 지우기: 예전 프리셋 목록(깃 HEAD)에 있던 키 전부
old=subprocess.run(['git','-C',REPO,'show','HEAD:src/data/facePresets.ts'],capture_output=True,text=True).stdout
oldkeys=set(re.findall(r"key: '([^']+)'", old))
removed=0
for k in oldkeys:
    f=f'{AV}/{k}.jpg'
    if os.path.exists(f) and not k.startswith('face__'): os.remove(f); removed+=1
for f in glob.glob(f'{AV}/face__*.jpg')+glob.glob(f'{HD}/face__*.jpg'): os.remove(f)
os.makedirs(HD,exist_ok=True)
for src,dst in (('g092_tl','football__abel'),('g092_br','football__rocha')):
    Image.open(f'cells/{src}.jpg').convert('RGB').resize((192,192),Image.LANCZOS).save(f'{AV}/{dst}.jpg',quality=82,optimize=True)
rows=[]
for key,m in sorted(faces.items()):
    if key in bad or not m.get('detected',True): continue
    gid,q=key.split('_')
    name=f'face__{key}'
    im=Image.open(f'cells/{key}.jpg').convert('RGB')
    im.resize((384,384),Image.LANCZOS).save(f'{HD}/{name}.jpg',quality=86,optimize=True)
    im.resize((192,192),Image.LANCZOS).save(f'{AV}/{name}.jpg',quality=82,optimize=True)
    h=int(hashlib.md5(key.encode()).hexdigest(),16)
    glasses=bool(P[gid].get('glasses')) and gid not in noglass and q==glassat.get(gid,'tr')
    rows.append({'key':name,'gender':m['gender'],'age':21+h%6,'hair':m['hair'],'theme':m['world'],'origin':m['origin'],'glasses':glasses,'h':h})
# 목록 순서: 같은 격자 얼굴이 붙어 나오지 않게 섞는다(고정 순서)
rows.sort(key=lambda r:r['h'])
out=['/**',' * 사진 프리셋(자동 생성 목록 — 직접 고치지 않는다) — 힉스필드에서 만든 가상 인물 사진만 골라 둔 목록(실존 인물 아님, 전원 20대).',
 ' *  - 캐릭터·내 계정을 만들 때 고르는 프리셋(components/FacePicker)과 세계관 인물의 얼굴(data/faceAlias · data/facePool)이 이 목록만 쓴다.',
 ' *  - key 는 src/data/photos.ts AVATARS 의 키(face__<격자>_<칸>). 384px 비축본은 assets/photos/faces_hd 에 있다(번들에는 192px만).',
 ' *  - theme: 복장·배경 분위기 / hair: 장발·단발 / origin: fr = 외국인 / glasses: 안경',' */',"import type { Gender } from '../types';",'',
 "export type FaceTheme = 'daily' | 'office' | 'military' | 'football' | 'cyberpunk' | 'travel' | 'influencer';","export type FaceHair = 'long' | 'short';",'',
 'export interface FacePreset {','  key: string;','  gender: Gender;','  /** 보이는 나이(대략, 전원 20대) */','  age: number;','  hair: FaceHair;','  theme: FaceTheme;',"  origin?: 'fr';",'  glasses?: boolean;','}','','export const FACE_PRESETS: FacePreset[] = [']
for r in rows:
    extra=(", origin: 'fr'" if r['origin']=='fr' else '')+(', glasses: true' if r['glasses'] else '')
    out.append(f"  {{ key: '{r['key']}', gender: '{r['gender']}', age: {r['age']}, hair: '{r['hair']}', theme: '{r['theme']}'{extra} }},")
out+=['];','']
open(f'{REPO}/src/data/facePresets.ts','w',encoding='utf-8').write('\n'.join(out))
import collections
n=len(rows)
print('faces',n,'removed old',removed,'bad',len(bad))
print('gender',collections.Counter(r['gender'] for r in rows),'origin',collections.Counter(r['origin'] for r in rows),'hair(f)',collections.Counter(r['hair'] for r in rows if r['gender']=='f'),'glasses',sum(r['glasses'] for r in rows), f"{sum(r['glasses'] for r in rows)/n:.0%}")
print('theme',collections.Counter((r['theme'],r['gender']) for r in rows))
print('avatar bytes', sum(os.path.getsize(f) for f in glob.glob(f'{AV}/face__*.jpg'))//1024,'KB', 'hd', sum(os.path.getsize(f) for f in glob.glob(f'{HD}/*.jpg'))//1024,'KB')
