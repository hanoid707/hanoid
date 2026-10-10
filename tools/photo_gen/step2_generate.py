"""프로필 사진·장면 이미지 일괄 생성 (CPU, bf16)
사용: python3 -I gen.py <models_dir> <specs.json> <out_dir> [--only face|rv] [--limit N]
- 1단계 majicMIX: 한국인 얼굴(core 먼저)
- 2단계 Realistic Vision: 외국인 얼굴(DPM) → LCM 합친 뒤 얼굴 없는 프사·게시물 장면·배너
이미 만들어진 파일은 건너뛴다(중간에 끊겨도 이어서 실행 가능).
"""
import gc, hashlib, json, os, sys, time
import torch
from PIL import Image, ImageDraw, ImageFont

torch.set_num_threads(2)
MODELS, SPECS, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
ONLY = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None
LIMIT = int(sys.argv[sys.argv.index('--limit') + 1]) if '--limit' in sys.argv else 10**9
for d in ('avatars', 'scenes', 'banners', 'full'):
    os.makedirs(f'{OUT}/{d}', exist_ok=True)

FOREIGN = ('argentin', 'portugu', 'brazil', 'spanish', 'european', 'caucasian', 'latin', 'african', 'western', 'french', 'british', 'american', 'german', 'italian', 'dutch', 'japanese', 'chinese')
NEG_FACE = ('(worst quality, low quality:1.4), (deformed, distorted, disfigured:1.2), bad anatomy, bad hands, extra fingers, mutated hands, '
            'poorly drawn face, cartoon, anime, 3d, cgi, render, painting, illustration, doll, plastic skin, watermark, text, logo, signature, '
            'nsfw, nude, cleavage, lingerie, child, kid')
NEG_SCENE = '(worst quality, low quality:1.4), text, watermark, logo, signature, letters, deformed, cartoon, anime, painting, illustration, nsfw'

specs = json.load(open(SPECS))

def seed_of(s: str) -> int:
    return int(hashlib.md5(s.encode()).hexdigest()[:8], 16)

def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)

# ───────── 작업 목록
face_jobs, rv_face_jobs, faceless_jobs, scene_jobs, banner_jobs, logo_jobs = [], [], [], [], [], []
for w in specs:
    for c in sorted(w['cast'], key=lambda c: 0 if c['tier'] == 'core' else 1):
        p = c['photo']
        name = f"{w['id']}__{c['key']}"
        if p['kind'] == 'face':
            job = dict(name=name, prompt=p['prompt'], gender=p.get('gender', 'f'), age=p.get('age', 25), tier=c['tier'])
            (rv_face_jobs if any(k in p['prompt'].lower() for k in FOREIGN) else face_jobs).append(job)
        elif p['kind'] == 'faceless':
            faceless_jobs.append(dict(name=name, prompt=p['prompt']))
        else:
            logo_jobs.append(dict(name=name, text=p['prompt'], color=c.get('color') or w['color']))
    for s in w['scenes']:
        scene_jobs.append(dict(name=f"{w['id']}__{s['key']}", prompt=s['prompt']))
    for s in w['banners']:
        banner_jobs.append(dict(name=f"{w['id']}__{s['key']}", prompt=s['prompt']))
# core 얼굴 먼저(세계관 순서 섞어서 골고루)
face_jobs.sort(key=lambda j: 0 if j['tier'] == 'core' else 1)
log('jobs', len(face_jobs), len(rv_face_jobs), len(faceless_jobs), len(scene_jobs), len(banner_jobs), len(logo_jobs))

def done(path):
    return os.path.exists(path) and os.path.getsize(path) > 0

def save_avatar(img: Image.Image, name: str):
    img.save(f'{OUT}/full/{name}.jpg', quality=90)
    a = img.resize((192, 192), Image.LANCZOS)
    a.save(f'{OUT}/avatars/{name}.jpg', quality=74, optimize=True, progressive=True)

# ───────── 로고(그림 생성기 없이)
FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
def make_logo(job):
    path = f"{OUT}/avatars/{job['name']}.jpg"
    if done(path):
        return
    size = 384
    col = job['color'] if job['color'].startswith('#') else '#111111'
    img = Image.new('RGB', (size, size), col)
    d = ImageDraw.Draw(img)
    text = job['text'][:6]
    fs = 200
    while fs > 40:
        f = ImageFont.truetype(FONT, fs, index=1 if os.path.exists(FONT) else 0)
        l, t, r, b = d.textbbox((0, 0), text, font=f)
        if r - l <= size * 0.78 and b - t <= size * 0.6:
            break
        fs -= 8
    l, t, r, b = d.textbbox((0, 0), text, font=f)
    d.text(((size - (r - l)) / 2 - l, (size - (b - t)) / 2 - t), text, font=f, fill='#FFFFFF')
    img.save(f'{OUT}/full/{job["name"]}.jpg', quality=92)
    img.resize((192, 192), Image.LANCZOS).save(path, quality=86)

for j in logo_jobs:
    make_logo(j)
log('logos done')

from diffusers import StableDiffusionPipeline, DPMSolverMultistepScheduler, LCMScheduler, AutoencoderKL

def dpm(pipe):
    pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config, use_karras_sigmas=True, algorithm_type='dpmsolver++')

def face_prompt(j, korean=True):
    who = f"{j['age']} year old {'korean ' if korean else ''}{'woman' if j['gender'] == 'f' else 'man'}"
    return f"RAW photo, {who}, {j['prompt']}, realistic skin texture, natural imperfections, shot on smartphone, sns profile photo, candid, detailed face"

count = 0
# ───────── 1단계: majicMIX 한국인 얼굴
if ONLY in (None, 'face'):
    pipe = StableDiffusionPipeline.from_pretrained(f'{MODELS}/majic', torch_dtype=torch.bfloat16, variant='fp16', safety_checker=None, feature_extractor=None, requires_safety_checker=False)
    dpm(pipe)
    pipe.set_progress_bar_config(disable=True)
    for j in face_jobs:
        if count >= LIMIT:
            break
        if done(f"{OUT}/avatars/{j['name']}.jpg"):
            continue
        t0 = time.time()
        img = pipe(face_prompt(j), negative_prompt=NEG_FACE, num_inference_steps=11, guidance_scale=4.5, width=448, height=448,
                   generator=torch.Generator().manual_seed(seed_of(j['name']))).images[0]
        save_avatar(img, j['name'])
        count += 1
        log('face', j['name'], round(time.time() - t0, 1))
    del pipe
    gc.collect()

# ───────── 2단계: Realistic Vision
if ONLY in (None, 'rv'):
    vae = AutoencoderKL.from_pretrained(f'{MODELS}/vae', torch_dtype=torch.bfloat16)
    pipe = StableDiffusionPipeline.from_pretrained(f'{MODELS}/rv51', vae=vae, torch_dtype=torch.bfloat16, safety_checker=None, feature_extractor=None, requires_safety_checker=False)
    pipe.set_progress_bar_config(disable=True)
    dpm(pipe)
    for j in rv_face_jobs:
        if done(f"{OUT}/avatars/{j['name']}.jpg"):
            continue
        t0 = time.time()
        img = pipe(face_prompt(j, korean=False), negative_prompt=NEG_FACE, num_inference_steps=12, guidance_scale=5, width=448, height=448,
                   generator=torch.Generator().manual_seed(seed_of(j['name']))).images[0]
        save_avatar(img, j['name'])
        log('rvface', j['name'], round(time.time() - t0, 1))
    # 빠른 생성(LCM)
    pipe.scheduler = LCMScheduler.from_config(pipe.scheduler.config)
    pipe.load_lora_weights(f'{MODELS}/lcm', weight_name='pytorch_lora_weights.safetensors')
    pipe.fuse_lora()

    def lcm(prompt, w, h, seed):
        return pipe(prompt, num_inference_steps=6, guidance_scale=1.0, width=w, height=h, generator=torch.Generator().manual_seed(seed)).images[0]

    for j in faceless_jobs:
        if done(f"{OUT}/avatars/{j['name']}.jpg"):
            continue
        t0 = time.time()
        img = lcm(f"RAW photo, {j['prompt']}, shot on smartphone, realistic, natural light, sns profile photo", 448, 448, seed_of(j['name']))
        save_avatar(img, j['name'])
        log('faceless', j['name'], round(time.time() - t0, 1))
    for j in scene_jobs:
        path = f"{OUT}/scenes/{j['name']}.jpg"
        if done(path):
            continue
        t0 = time.time()
        img = lcm(f"RAW photo, {j['prompt']}, candid smartphone snapshot, realistic, natural colors", 640, 384, seed_of(j['name']))
        img.save(f"{OUT}/full/{j['name']}.jpg", quality=90)
        img.resize((560, 336), Image.LANCZOS).save(path, quality=66, optimize=True, progressive=True)
        log('scene', j['name'], round(time.time() - t0, 1))
    for j in banner_jobs:
        path = f"{OUT}/banners/{j['name']}.jpg"
        if done(path):
            continue
        t0 = time.time()
        img = lcm(f"RAW photo, {j['prompt']}, wide landscape photo, realistic", 768, 384, seed_of(j['name']))
        img = img.crop((0, 64, 768, 320))
        img.save(f"{OUT}/full/{j['name']}.jpg", quality=90)
        img.resize((600, 200), Image.LANCZOS).save(path, quality=66, optimize=True, progressive=True)
        log('banner', j['name'], round(time.time() - t0, 1))
log('ALL DONE')
