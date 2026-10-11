"""ids_*.txt(쉼표 구분 'HHMMSS<uuid>') → raw/hf_20261011_HHMMSS_<uuid>_min.webp 내려받기(이미 있으면 건너뜀)"""
import glob, os, subprocess, sys
B='https://d8j0ntlcm91z4.cloudfront.net/user_38xXeAqYqC0pfQ4NJv5WNLmgGdI'
ids=set()
for f in glob.glob('ids_*.txt'):
    for x in open(f).read().replace('\n',',').split(','):
        x=x.strip()
        if len(x)==42: ids.add((x[:6], x[6:]))
os.makedirs('raw', exist_ok=True)
new=0
for t,u in sorted(ids):
    name=f'hf_20261011_{t}_{u}_min.webp'
    if os.path.exists('raw/'+name) and os.path.getsize('raw/'+name)>10000: continue
    r=subprocess.run(['curl','-sS','-o','raw/'+name,'-w','%{http_code}',f'{B}/{name}'],capture_output=True,text=True)
    if r.stdout.strip()!='200': print('FAIL',name,r.stdout); os.remove('raw/'+name) if os.path.exists('raw/'+name) else None
    else: new+=1
print('ids',len(ids),'new',new,'files',len(glob.glob('raw/*_min.webp')))
