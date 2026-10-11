"""2차 얼굴 사진: 타이트 셀카 · 순광 · 안경 없음 · 인플루언서/여행/일상. s001~"""
import json, random
random.seed(20261011)
SHOTS = [
 "arm's-length front-camera selfies, very tight close-ups: each face fills most of its panel, framed from the top of the hair to the collarbone, phone held slightly above eye level",
 "tight close-up selfies in typical SNS profile poses: one rests her chin lightly on her hand, one holds a small V sign beside her cheek, one tilts her head, one tucks her hair behind her ear",
 "tight face close-ups taken by a friend from across a small table, each leaning a little toward the camera, framed from the top of the hair to the shoulders",
 "close-up selfies with the face turned slightly to a three-quarter angle and the eyes on the camera, the face large in the frame, cropped at the shoulders",
 "very tight close-up selfies, chin slightly down and eyes looking up into the phone camera, the face filling the frame, cropped just below the collarbone",
]
SHOTS_M = [
 "arm's-length front-camera selfies, tight close-ups: each face fills most of its panel, framed from the top of the hair to the collarbone, phone held at eye level",
 "tight face close-ups taken by a friend from across a small table, each leaning a little toward the camera, framed from the top of the hair to the shoulders",
]
LIGHT = [
 "bright soft daylight from a large window directly in front of them",
 "bright overcast daylight, soft and shadowless",
 "open shade on a bright day, soft even light on the face",
 "bright airy indoor light with soft even fill from the front",
]
LIGHT_RULE = ("Every face is bright, clear and evenly lit from the front, with no shadows across the face; clean neutral-white daylight colour. "
              "No golden-hour or orange sunlight, no sunset tint, no backlight, no rim light, no harsh directional sun.")
SCENE = {
 'influencer': [
  ("They are beauty and daily-look influencers: pretty trendy outfits (a square-neck knit, an off-shoulder top, a cropped cardigan, a satin blouse), light natural makeup, small earrings",
   "softly blurred bright cafe, white-walled bedroom with a vanity, boutique fitting room or minimalist studio"),
  ("They are fashion and lifestyle influencers: clean chic outfits (a tweed jacket, a ribbed tank with a shirt, a slip dress with a cardigan, a fitted tee), dewy natural makeup",
   "softly blurred hotel room by the window, flower shop, bright brunch cafe or white studio wall"),
  ("They are fitness and wellness influencers: athleisure (a zip-up track top, a sports bra with an open shirt, a tennis polo, a seamless tank), fresh natural makeup",
   "softly blurred bright pilates studio, gym lounge, tennis court fence or riverside path"),
 ],
 'travel': [
  ("They are travel vloggers on a trip: light casual outfits (a linen shirt, a summer dress, a striped tee, a light cardigan), sun-kissed natural look",
   "softly blurred seaside on a bright cloudy day, white harbour town, palm-lined street or ferry deck"),
  ("They are travel creators in a city abroad: easy stylish outfits (a trench coat, a knit vest over a shirt, a denim jacket, a hoodie), natural makeup",
   "softly blurred old European street in open shade, observation deck, tram stop or museum steps"),
  ("They are on a trip around Korea and Japan: comfy outfits (a fleece zip-up, a white tee, a windbreaker, a knit polo), natural look",
   "softly blurred Jeju coastal road under bright clouds, train window seat, quiet Kyoto alley or airport gate by the windows"),
 ],
 'daily': [
  ("Everyday SNS profile selfies: simple pretty outfits (a white tee, a soft knit, a hoodie, a shirt), light natural makeup",
   "softly blurred home sofa by the window, campus bench, bookstore or bright bakery"),
  ("Everyday SNS profile selfies: casual outfits (a cardigan over a tank, an oversized shirt, a sweatshirt, a camisole with a shirt), natural makeup",
   "softly blurred car passenger seat in daylight, park in open shade, study cafe or apartment balcony"),
 ],
}
SCENE_M = {
 'influencer': ("They are fashion and fitness influencers: clean outfits (a fitted tee, an open overshirt, a knit polo, a zip-up track top), neat natural grooming",
                "softly blurred bright cafe, white studio wall, gym lounge or boutique"),
 'travel': ("They are travel vloggers on a trip: easy outfits (a linen shirt, a white tee, a windbreaker, a hoodie), natural look",
            "softly blurred seaside on a bright cloudy day, old town street in open shade, observation deck or airport gate by the windows"),
 'daily': ("Everyday SNS profile selfies: simple outfits (a white tee, a sweatshirt, a shirt, a knit), neat natural grooming",
           "softly blurred home by the window, campus, bright cafe or park in open shade"),
}
HAIR = {
 'long': ["all four have long hair past the shoulders in different styles (straight black, loose dark-brown waves, a low ponytail with face-framing strands, soft chestnut layers)",
          "all four have long hair past the shoulders in different styles (see-through bangs with straight hair, big loose waves, half-up hair, a sleek middle part)",
          "all four have long hair past the shoulders in different styles (a high ponytail, wavy ash-brown hair, straight black hair with curtain bangs, a loose braid)"],
 'short': ["all four have short hair in different styles (a chin-length bob, a short layered cut, a wavy bob with bangs, a tucked-behind-the-ear bob)",
           "all four have short hair in different styles (a blunt bob, a soft pixie cut, a shoulder-skimming lob, a hush cut)"],
}
NAT = ["French, Russian, Japanese, and American with honey-blonde hair", "Swedish, Italian, Chinese, and British with auburn hair",
       "Ukrainian, Spanish, Taiwanese, and Australian with light-brown hair", "German, Brazilian with fair skin, Japanese, and Canadian with dark-blonde hair",
       "Polish, Thai with fair skin, French, and American with brown hair", "Dutch, Korean-American, Czech, and Irish with red hair",
       "Norwegian, Portuguese, Hong Kong Chinese, and Russian with ash-blonde hair"]
EXPR = ["a soft natural smile", "a bright friendly smile", "a relaxed calm look with a hint of a smile", "a slight playful smile"]
HEAD = "A 2x2 grid of four separate square profile photos, the four panels touching edge to edge with no borders, no dividing lines and no marks."
TAIL = ("None of them wear glasses or sunglasses; no hats shading the face. All four are slim, 21 to 26 years old, and very good-looking in a natural, real-person way. "
        "Photorealistic phone-camera pictures like real SNS profile photos, real skin texture, no beauty filter, not an illustration, not CGI. No text, no logos, no watermark.")
plan = ([('influencer','f','kr','long')]*8 + [('influencer','f','kr','short')]*4 + [('travel','f','kr','long')]*8 + [('travel','f','kr','short')]*4 +
        [('daily','f','kr','long')]*5 + [('daily','f','kr','short')]*3 +
        [('influencer','f','fr','long')]*2 + [('influencer','f','fr','short')] + [('travel','f','fr','long')]*2 + [('travel','f','fr','short')] + [('daily','f','fr','long')] +
        [('influencer','m','kr','short')]*2 + [('travel','m','kr','short')]*2 + [('daily','m','kr','short')])
out=[]; cnt={}; SEGS=[]
for i,(world,g,origin,hair) in enumerate(plan):
    k=cnt.get((world,g,origin,hair),0); cnt[(world,g,origin,hair)]=k+1
    if g=='m':
        who,scene=SCENE_M[world]; shot=SHOTS_M[k%len(SHOTS_M)]
        people="Each panel shows a DIFFERENT young Korean man"
        look="The four look clearly different from one another: different face shapes, eyes, noses and eyebrows, fair to warm-beige skin; short neat hairstyles in different cuts (a side part, a two-block cut, soft curtain bangs, a textured crop); clean-shaven."
        tail=TAIL.replace('slim','lean').replace('None of them wear','None of them wear')
    else:
        who,scene=SCENE[world][(i+k)%len(SCENE[world])]; shot=SHOTS[(i*2+k)%len(SHOTS)]
        h=HAIR[hair][(i+k)%len(HAIR[hair])]
        if origin=='kr':
            people="Each panel shows a DIFFERENT young Korean woman"
            look=f"The four look clearly different from one another: different face shapes, eyes, noses, eyebrows and lips, fair to warm-beige skin; {h}."
        else:
            people="Each panel shows a DIFFERENT young woman"
            look=f"They are from four different countries: {NAT[k % len(NAT) if world=='influencer' else (k+3) % len(NAT) if world=='travel' else 6]}. All four are strikingly beautiful like fashion models, with clearly different faces and eye colours; fair to light-beige skin; {h.replace(' (straight black, loose dark-brown waves, a low ponytail with face-framing strands, soft chestnut layers)',' and natural hair colours')}."
        tail=TAIL
    light=LIGHT[(i*3+1)%len(LIGHT)]; expr=EXPR[i%len(EXPR)]
    segs=[HEAD, people+", looking at the camera,", expr+".", "The photos are "+shot+".", who+";", scene+" behind them.", look, "Lighting: "+light+".", LIGHT_RULE, tail]
    p=" ".join(segs); SEGS.append(segs)
    out.append({'id':f's{i+1:03d}','world':world,'gender':g,'origin':origin,'hair':hair,'glasses':False,'prompt':p})
json.dump(out,open('prompts.json','w'),ensure_ascii=False,indent=0)
uniq=[]; idx=[]
for segs in SEGS:
    row=[]
    for g in segs:
        if g not in uniq: uniq.append(g)
        row.append(uniq.index(g))
    idx.append(row)
js='const U='+json.dumps(uniq,ensure_ascii=False)+';const I='+json.dumps(idx,separators=(',',':'))+';window.__all=I.map((r,i)=>({id:"s"+String(i+1).padStart(3,"0"),prompt:r.map(k=>U[k]).join(" ")}));'
open('inject.js','w').write(js); print('inject bytes',len(js),'uniq',len(uniq))
import hashlib; print('hash', hashlib.md5('|'.join(o['prompt'] for o in out).encode()).hexdigest()[:8], len('|'.join(o['prompt'] for o in out)))
print(len(out)); print(out[0]['prompt']); print(); print(out[36]['prompt']); print(); print(out[41]['prompt']); print(max(len(o['prompt']) for o in out))
