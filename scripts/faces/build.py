"""raw/*.webp + prompts.json + log_*.txt → 칸별 얼굴 크롭(cells/<gid>_<q>.jpg, 512px) + faces.json(태그) + 확인 시트(sheets/)"""
import sys; sys.path.insert(0,'../hf/cvold')
import cv2, glob, json, os, re
import numpy as np
from PIL import Image, ImageDraw, ImageFont
P={o['id']:o for o in json.load(open('prompts.json'))}
P['g091']={'id':'g091','world':'office','gender':'f','origin':'kr','hair':'long','glasses':True}
for _g,_w,_h in (('g093','daily','long'),('g094','influencer','long'),('g095','travel','short')): P[_g]={'id':_g,'world':_w,'gender':'f','origin':'fr','hair':_h,'glasses':False}
log=[]
for f in sorted(glob.glob('log_*.txt')):
    for m in re.finditer(r'(g\d{3}):OK:(\d+)', open(f).read()): log.append((m.group(1), int(m.group(2))%86400))
files=[]
for f in sorted(glob.glob('raw/*_min.webp')):
    m=re.search(r'hf_20261011_(\d{2})(\d{2})(\d{2})_([0-9a-f-]{36})', f)
    files.append((int(m.group(1))*3600+int(m.group(2))*60+int(m.group(3)), f))
gridfile={}
for gid,sec in log:
    c=[(sec-fs, f) for fs,f in files if -2 <= sec-fs <= 11]
    if c: gridfile[gid]=min(c)[1]
t=[f for fs,f in files if f.endswith('c982b69f-fea9-4080-abed-cf0879f0e321_min.webp')]
if t: gridfile['g091']=t[0]
print('log',len(log),'files',len(files),'matched',len(gridfile),'unmatched',[g for g,_ in log if g not in gridfile][:20])
cas=cv2.CascadeClassifier('../hf/haar.xml')
os.makedirs('cells',exist_ok=True); os.makedirs('sheets',exist_ok=True)
faces={}; bad=[]; tick={}
TICKG={'g051','g058','g067','g068','g074','g077','g091'}   # 격자 경계에 흰 눈금이 그려진 격자(눈으로 확인)
def ticks(a):
    found=set()
    for name,strip in (('top',a[:4]),('bottom',a[-4:]),('left',a[:,:4].transpose(1,0,2)),('right',a[:,-4:].transpose(1,0,2))):
        w=(strip.min(axis=2)>232).all(axis=0); lum=strip.mean(axis=(0,2)); idx=np.where(w)[0]
        if len(idx)==0: continue
        for r in np.split(idx,np.where(np.diff(idx)>1)[0]+1):
            if 2<=len(r)<=14:
                l=lum[max(0,r[0]-8):max(0,r[0]-3)]; rr=lum[r[-1]+4:r[-1]+9]
                if len(l) and len(rr) and l.mean()<205 and rr.mean()<205: found.add(name)
    return found
SCALE=float(os.environ.get('SCALE','2.45')); UP=0.47
for gid,f in sorted(gridfile.items()):
    im=Image.open(f).convert('RGB'); W,H=im.size
    for q,(x0,y0,x1,y1) in {'tl':(0,0,W//2,H//2),'tr':(W//2,0,W,H//2),'bl':(0,H//2,W//2,H),'br':(W//2,H//2,W,H)}.items():
        key=f'{gid}_{q}'; out=f'cells/{key}.jpg'
        cell=im.crop((x0,y0,x1,y1)); cw,ch=cell.size
        s=640/max(cell.size); small=cell.resize((int(cw*s),int(ch*s)))
        g=cv2.cvtColor(np.array(small),cv2.COLOR_RGB2GRAY)
        fs=cas.detectMultiScale(g,1.1,5,minSize=(110,110))
        if len(fs)==0: fs=cas.detectMultiScale(g,1.05,3,minSize=(80,80))
        m=int(min(cw,ch)*(0.12 if gid in TICKG else 0.02))   # 눈금 격자는 칸 가장자리를 넉넉히 피한다
        if len(fs)==0:
            bad.append(key); size=min(cw,ch)-2*m; left=m; top=m
        else:
            fx,fy,fw,fh=[v/s for v in max(fs,key=lambda b:b[2]*b[3])]
            size=min(fw*SCALE, cw-2*m, ch-2*m); cx=fx+fw/2; cy=fy+fh/2
            left=min(max(cx-size/2,m),cw-m-size); top=min(max(cy-size*UP,m),ch-m-size)
        # 격자 경계의 흰 눈금(틱)이 걸리면 그쪽 변을 조금씩 안으로 당긴다(안 풀리면 원래 크롭으로 되돌리고 따로 확인)
        fixed=0; o=(left,top,size); ever=set(); minsize=(fw*1.95 if len(fs) else size*0.85)
        def render(l,t_,sz): return cell.crop((int(l),int(t_),int(l+sz),int(t_+sz))).resize((512,512),Image.LANCZOS)
        for _ in range(14):
            crop=render(left,top,size)
            t=ticks(np.asarray(crop).astype(int))
            t=set()
            if not t or size<=minsize: break
            d=cw*0.012; fixed+=1; ever|=t
            if 'top' in t: top+=d; size-=d; left+=d/2
            if 'bottom' in t: size-=d; left+=d/2
            if 'left' in t: left+=d; size-=d; top+=d*UP
            if 'right' in t: size-=d; top+=d*UP
        if fixed and t:
            left,top,size=o; crop=render(left,top,size); tick[key]=(fixed,sorted(t),'UNRESOLVED')
        elif fixed:
            d=cw*0.012   # 여유 한 칸 더
            if 'top' in ever: top+=d; size-=d; left+=d/2
            if 'bottom' in ever: size-=d; left+=d/2
            if 'left' in ever: left+=d; size-=d; top+=d*UP
            if 'right' in ever: size-=d; top+=d*UP
            crop=render(left,top,size); tick[key]=(fixed,sorted(ever),'ok')
        crop.save(out,quality=88)
        p=P[gid]; faces[key]={'gender':p['gender'],'world':p['world'],'origin':p['origin'],'hair':p['hair'],'detected':key not in bad}
json.dump(faces,open('faces.json','w'),indent=0)
print('faces',len(faces),'no-face',bad)
print('tick-fixed',len(tick),{k:v for k,v in tick.items()})
json.dump({k:list(v) for k,v in tick.items()},open('tick.json','w'))
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',15)
gids=sorted(gridfile); per=6; cell=230
for si in range(0,len(gids),per):
    part=gids[si:si+per]
    sh=Image.new('RGB',(4*cell+90,len(part)*cell),'white'); d=ImageDraw.Draw(sh)
    for r,gid in enumerate(part):
        p=P[gid]; d.text((4,r*cell+8),gid,fill='black',font=font); d.text((4,r*cell+30),p['world'][:8],fill='black',font=font); d.text((4,r*cell+52),f"{p['gender']} {p['origin']}",fill='black',font=font); d.text((4,r*cell+74),p['hair'],fill='black',font=font)
        for c,q in enumerate(['tl','tr','bl','br']):
            sh.paste(Image.open(f'cells/{gid}_{q}.jpg').resize((cell-4,cell-4)),(90+c*cell,r*cell+2))
    sh.save(f'sheets/s{si//per+1:02d}.jpg',quality=84)
print('sheets',len(glob.glob('sheets/*.jpg')))
