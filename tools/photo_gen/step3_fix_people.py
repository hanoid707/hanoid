"""사람이 나오는 장면 몇 장을 majicMIX(한국인 얼굴)로 다시 생성
사용: python3 -I step3_fix_people.py <models_dir> <out_dir>
"""
import hashlib, sys, time
import torch
from PIL import Image
from diffusers import StableDiffusionPipeline, DPMSolverMultistepScheduler

torch.set_num_threads(2)
MODELS, OUT = sys.argv[1], sys.argv[2]
NEG = ('(worst quality, low quality:1.4), (deformed, distorted, disfigured:1.2), bad anatomy, bad hands, extra fingers, mutated hands, '
       'poorly drawn face, cartoon, anime, 3d, cgi, render, painting, illustration, doll, plastic skin, watermark, text, logo, letters, signature, '
       'nsfw, nude, topless, cleavage, lingerie, swimsuit, child, kid')
JOBS = {
    'influencer__goldenhour_portrait': 'RAW photo, candid portrait of a 24 year old korean woman with shoulder-length hair laughing and looking away, quiet residential alley with low brick houses, golden hour backlight, beige knit cardigan, film camera look',
    'influencer__gym_mirror': 'RAW photo, gym mirror selfie of a 25 year old korean woman in a loose black t-shirt and gray track pants, messy bun, holding a smartphone, dumbbell rack and treadmills behind, fluorescent light, candid',
    'football__football_stands': 'RAW photo, 22 year old korean woman football fan in a navy and orange striped jersey holding a knitted scarf above her head, stadium stands at sunset, crowd, golden backlight, candid smartphone photo',
    'cyberpunk__cyberpunk_ramen': 'RAW photo, close-up of korean instant ramen noodles in a paper cup with wooden chopsticks, red spicy soup, half boiled egg, steam, window ledge at night, pink and blue neon light, rainy window, phone photo',
}
only = sys.argv[3].split(',') if len(sys.argv) > 3 else None

pipe = StableDiffusionPipeline.from_pretrained(f'{MODELS}/majic', torch_dtype=torch.bfloat16, variant='fp16', safety_checker=None, feature_extractor=None, requires_safety_checker=False)
pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config, use_karras_sigmas=True, algorithm_type='dpmsolver++')
pipe.set_progress_bar_config(disable=True)
for name, prompt in JOBS.items():
    if only and name not in only:
        continue
    t0 = time.time()
    seed = int(hashlib.md5((name + ':fix').encode()).hexdigest()[:8], 16)
    img = pipe(prompt, negative_prompt=NEG, num_inference_steps=12, guidance_scale=4.5, width=640, height=384,
               generator=torch.Generator().manual_seed(seed)).images[0]
    img.save(f'{OUT}/full/{name}.jpg', quality=90)
    img.resize((560, 336), Image.LANCZOS).save(f'{OUT}/scenes/{name}.jpg', quality=66, optimize=True, progressive=True)
    print(time.strftime('%H:%M:%S'), 'fix', name, round(time.time() - t0, 1), flush=True)
print('FIX DONE', flush=True)
