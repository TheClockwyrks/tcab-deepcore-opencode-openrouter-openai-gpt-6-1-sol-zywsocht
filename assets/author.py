"""One-time original asset authoring. Not used by the build. Requires the six authoring tools."""
import json, math, random, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TMP = Path('/tmp/opencode')
random.seed(913)
ops = []
def rect(x,y,w,h,c):
    ops.append(dict(op='fill_rect',x=int(x),y=int(y),width=max(1,int(w)),height=max(1,int(h)),color=c))
def line(x,y,xx,yy,c):
    ops.append(dict(op='line',x0=int(x),y0=int(y),x1=int(xx),y1=int(yy),color=c))
def circle(x,y,r,c):
    ops.append(dict(op='fill_circle',cx=int(x),cy=int(y),r=int(r),color=c))
def poly(points,c):
    for y in range(int(min(p[1] for p in points)),int(max(p[1] for p in points))+1):
        xs=[]
        for a,b in zip(points,points[1:]+points[:1]):
            if (a[1]<=y<b[1]) or (b[1]<=y<a[1]): xs.append(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]))
        xs.sort()
        for a,b in zip(xs[::2],xs[1::2]): rect(a,y,b-a+1,1,c)
def save(path,w=80,h=80,bg='transparent',sheet=False):
    out=ROOT/path; out.parent.mkdir(parents=True,exist_ok=True)
    log=TMP/'draw-log.json'; log.write_text(json.dumps(ops))
    subprocess.run(['draw-sheet' if sheet else 'draw','render','--actions',str(log),'--out',str(out),'--width',str(w),'--height',str(h),'--background',bg,'--no-layers'],check=True,stdout=subprocess.DEVNULL)
    ops.clear()

bands={'topsoil':('#544038',['#634d40','#49362f','#705548','#59443a']), 'rockbed':('#3a464b',['#45545a','#2f393f','#536166','#404c50']), 'deepstone':('#282e3b',['#34394a','#1d2430','#414557','#303342']), 'coreshell':('#462f35',['#55333a','#33242c','#6e3a3e','#493037'])}
for band,(base,grain) in bands.items():
    for v in range(3):
        rect(0,0,80,80,base)
        for _ in range(700):
            x,y=random.randrange(80),random.randrange(80); rect(x,y,random.choice([1,2,3,5]),1,random.choice(grain))
        for _ in range(9):
            x,y=random.randrange(80),random.randrange(80);line(x,y,x+random.randrange(5,18),y+random.randrange(-2,4),grain[1])
        save(f'tiles/{band}-{v}.png')
for name in ['bedrock','stone-0','stone-1','tunnel']:
    rect(0,0,80,80,'#121d24' if name=='tunnel' else '#263039')
    if name!='tunnel':
        for x,y,s in [(5,8,32),(38,1,35),(25,38,42),(-8,50,30),(63,43,30)]:
            poly([(x,y+8),(x+12,y),(x+s,y+5),(x+s-3,y+s-4),(x+4,y+s)],'#465661')
            line(x+12,y+1,x+s-2,y+6,'#6c7e87');line(x+5,y+s-3,x+s-4,y+s-5,'#18252e')
    for _ in range(200):
        x,y=random.randrange(80),random.randrange(80);rect(x,y,1,1,'#1a2830' if name=='tunnel' else '#4a5b64')
    save(f'tiles/{name}.png')
for f in range(4):
    for i in range(2+f*3):
        a=i*2.4; x=40+math.cos(a)*32;y=38+math.sin(a)*38
        line(38,38,x,y,'#17171de0');line(x,y,x+8,y-6,'#17171de0')
    save(f'tiles/crack/frame{f:02}.png',sheet=True)
colors=['#c48d72','#c2b96f','#e29c59','#d5e5de','#67b6d9','#c1df67','#9e8acc','#f39361','#eb5c62','#8ce7e3','#6bf0a7','#f98bbe','#ffdc74']
names=['ferron','marlite','cuprite','argenite','cobaltine','voltite','halcite','pyronium','cindrite','adamite','verdite','roselite','aurite']
for idx,(name,c) in enumerate(zip(names,colors)):
    if idx<10:
        for x in range(0,80,2):
            cy=40+math.sin(x*.07+idx)*14
            for _ in range(7):
                y=cy+random.gauss(0,6);rect(x,y,random.randrange(2,7),random.randrange(1,4),c+random.choice(['65','a0','d0','ff']))
        for _ in range(30):
            x=random.randrange(80); y=40+math.sin(x*.07+idx)*14+random.gauss(0,9);rect(x,y,2,1,'#fff4cc90')
    else:
        poly([(19,27),(31,16),(54,18),(65,32),(42,64)],'#102e3c')
        poly([(21,27),(32,18),(53,20),(62,32),(42,61)],c)
        poly([(22,28),(34,23),(47,24),(55,31),(39,34)],'#f6fff2')
        poly([(22,29),(39,34),(42,61)],c+'a0');poly([(55,31),(39,34),(42,61)],'#ffffff60')
        line(55,14,55,28,'#ffffff');line(49,21,61,21,'#ffffff')
    save(f'ore/{name}.png')
for name,c in [('resonite','#81f5cd'),('cryenite','#91b9ff'),('core','#ffb654'),('core-sample','#ffd27c')]:
    for x,y,h in [(22,48,30),(36,51,44),(49,53,27)]:
        poly([(x-8,y),(x-5,y-h),(x+3,y-h-7),(x+10,y-3)],'#193b43')
        poly([(x-5,y-2),(x-3,y-h),(x+2,y-h-4),(x+6,y-4)],c)
        line(x-3,y-h,x,y-6,'#f7fff0')
    for _ in range(18):
        x,y=random.randrange(12,65),random.randrange(10,68);rect(x,y,1,2,c+'80')
    save(f'materials/{name}.png')
for f in range(4):
    rect(0,0,80,80,'#b83e30')
    for y in range(80):
        for x in range(0,80,3):
            v=math.sin(x*.10+y*.14+f*1.6)+math.sin(x*.23-y*.11+f)
            if v>.5:rect(x,y,3,1,'#ff9743' if v<1.2 else '#ffe19a')
    save(f'hazards/lava/frame{f:02}.png',sheet=True)

# The same copper pressure suit, teal visor, oxygen pack and striped rotary drill.
for state,n in [('idle',4),('walk',6),('drill-down',4),('drill-side',4),('jetpack',4),('fall',4),('hurt',3),('fuel-out',3)]:
    for f in range(n):
        bob=[0,-1,0,1][f%4]; sy=2 if state=='drill-down' else -3 if state=='jetpack' else bob
        if state=='hurt':sy+=f*2
        # pack
        rect(15,30+sy,16,29,'#0a1823');rect(17,32+sy,12,23,'#657782');rect(17,35+sy,4,15,'#9db0b5');rect(19,58+sy,9,5,'#172b36')
        if state=='jetpack':
            poly([(18,62),(29,62),(25,78-f%3*3),(21,74)],'#f98943');poly([(20,62),(27,62),(24,72+f%2*5)],'#fff1a6')
        # legs with real stride
        stride=[-5,0,6,4,0,-4][f%6] if state=='walk' else 3 if state in ['fall','jetpack'] else 0
        rect(29+stride,54+sy,10,17,'#152632');rect(43-stride,54+sy,11,17,'#152632')
        rect(30+stride,54+sy,8,11,'#bb7045');rect(44-stride,54+sy,8,10,'#df9b52')
        rect(27+stride,68+sy,14,6,'#0d202a');rect(42-stride,68+sy,16,6,'#0d202a');rect(29+stride,68+sy,10,2,'#71838b');rect(44-stride,68+sy,11,2,'#71838b')
        rect(28,30+sy,27,29,'#142834');rect(30,31+sy,23,24,'#df9850');rect(32,33+sy,6,19,'#f6c878');rect(41,36+sy,11,12,'#9a5839');rect(29,53+sy,26,5,'#263943');rect(39,54+sy,7,3,'#98b9b4')
        # helmet layered silhouette
        circle(41,22+sy,17,'#0a1a26');circle(41,21+sy,15,'#e9ad5d');rect(26,21+sy,31,12,'#b77940');rect(35,14+sy,23,16,'#102d3c');rect(37,16+sy,19,10,'#61bfc1');rect(38,16+sy,15,3,'#c0f6dc');rect(48,24+sy,7,3,'#387f91');rect(24,19+sy,5,11,'#6a7c82');rect(30,7+sy,10,5,'#1e3944');rect(32,7+sy,7,4,'#fff2b4' if f%2 else '#d9efa0')
        # drill and arms
        if state=='drill-down':
            dx=f%2*2;rect(48+dx,43,13,21,'#203843');rect(50+dx,45,9,15,'#78aeb2');poly([(48+dx,64),(61+dx,64),(55+dx,79)],'#bcd2cf')
            for y in range(64,75,4):line(49+dx,y,58+dx,y+2,'#445c65')
            rect(43,38,11,10,'#f1b86b');rect(48,43,8,6,'#1a303c')
        else:
            dy=0 if state!='fall' else -8-f%2*3
            dx=f%2*2 if state=='drill-side' else (stride//2)
            rect(50+dx,42+sy+dy,17,12,'#172e3b');rect(53+dx,43+sy+dy,12,8,'#86b7b9');poly([(65+dx,42+sy+dy),(78+dx,48+sy+dy),(65+dx,54+sy+dy)],'#d0d8ca')
            for i in range(3):line(66+dx+i*3,44+sy+dy+i,66+dx+i*3,51+sy+dy-i,'#4a626a')
            rect(43,35+sy,12,10,'#ffbf6c');rect(47,41+sy,10,7,'#203541')
        if state=='fuel-out':line(29,32+sy,34,42+sy,'#603d32')
        if state=='fuel-out':
            for op in ops:
                if op['op']=='fill_rect' and op['y']<34:op['x']+=4;op['y']+=5
                if op['op']=='fill_circle' and op['cy']<34:op['cx']+=4;op['cy']+=5
        if state=='hurt':
            # A sharp backward head snap and raised, recoiling tool arm.
            for op in ops:
                if op['op']=='fill_circle' and op['cy']<34:op['cx']-=5-f;op['cy']-=3
                elif op['op']=='fill_rect':
                    if op['y']<34:op['x']-=5-f;op['y']-=3
                    elif op['x']>=43 and op['y']<56:op['x']-=7-f;op['y']-=9
                elif op['op']=='line' and op['x0']>=60:
                    op['x0']-=7-f;op['x1']-=7-f;op['y0']-=9;op['y1']-=9
        save(f'miner/{state}/frame{f:02}.png',sheet=True)

# Surface panorama: stippled stars, distant ridges, refinery silhouettes.
rect(0,0,1280,600,'#101f2b')
for y in range(600):
    shade=int(19+y/600*13);rect(0,y,1280,1,f'#{shade:02x}{shade+14:02x}{shade+22:02x}')
circle(1001,143,63,'#384a51');circle(1023,128,57,'#1d303c')
for _ in range(250):
    x=random.randrange(1280);y=random.randrange(430);rect(x,y,1 if random.random()<.9 else 2,1,random.choice(['#78919a','#475d6b','#aac6bd']))
for baseline,col in [(500,'#223742'),(550,'#192c37'),(600,'#12232e')]:
    pts=[(0,600),(0,baseline)]+[(x,baseline-random.randrange(20,100)) for x in range(0,1281,60)]+[(1280,600)]
    poly(pts,col)
for x in [90,180,340,780,1100]:
    rect(x,450,22,150,'#142630');line(x+10,390,x+10,450,'#344651');rect(x+8,389,4,4,'#d38b61')
save('surface/sky.png',1280,600)
rect(0,0,80,40,'#2a3334');rect(0,0,80,5,'#73817a');rect(0,7,80,2,'#121e25')
for x in range(0,80,12):line(x,15,x+10,5,'#bd8e53')
save('surface/ground.png',80,40)
poly([(3,80),(8,30),(24,8),(59,4),(77,30),(79,80)],'#17232b');poly([(14,80),(18,30),(32,18),(57,19),(67,37),(68,80)],'#07141e');rect(5,12,72,8,'#9a7044');rect(8,14,66,2,'#e7b56c');save('surface/cave-mouth.png')
for idx,name in enumerate(['fuel-depot','ore-market','save-pad','upgrade-shop','supply-depot','launch-pad']):
    # grounded plinth, paneling, sloped metal roof, highlights and rivets
    rect(5,162,230,18,'#0b1b25');rect(8,161,224,5,'#78908d');rect(19,68,202,93,'#142832');rect(22,71,196,85,'#3a5359')
    poly([(13,68),(31,40),(206,40),(228,68)],'#1a303d');line(29,41,206,41,'#a8b1a0');line(15,66,225,66,'#6d8888')
    for x in range(28,219,16):line(x,75,x,152,'#2a424b')
    rect(40,80,59,70,'#112732');rect(44,84,51,62,'#223e49');rect(50,91,38,21,'#66a99f');rect(52,93,34,3,'#a5dbc0');rect(83,127,4,5,'#e4b36a')
    rect(108,82,94,44,'#10252e');rect(112,86,86,35,'#233d46');rect(116,91,76,4,'#cfa15e');rect(116,101,52,3,'#6eada6');rect(116,109,65,3,'#6eada6')
    for x in [25,211]:
        for y in [75,150]:rect(x,y,3,3,'#a0ada3')
    rect(34,49,173,12,'#c28c4e');rect(37,51,167,2,'#f3c779')
    if idx==0:
        for x in [128,164]:rect(x,129,27,29,'#1a2d35');circle(x+13,131,13,'#a6ad95');rect(x+3,133,21,23,'#889c90');rect(x+5,136,17,4,'#d8c889')
        rect(5,89,12,67,'#9f734b');line(10,90,2,60,'#acc4b8')
    if idx==1:
        poly([(116,153),(128,130),(139,144),(154,126),(174,153)],'#c38a62');line(117,152,174,152,'#e0ba83')
    if idx==2:
        rect(108,130,92,26,'#1c3843');rect(116,136,77,7,'#7ce2c5');line(155,77,155,19,'#8fafa5');circle(155,19,7,'#b2edce')
    if idx==3:
        for x in [127,161,190]:circle(x,143,10,'#152b36');circle(x,143,6,'#a6c1b5');circle(x,143,2,'#243c48')
        rect(184,9,13,32,'#495d61');rect(180,7,21,5,'#7d918b')
    if idx==4:
        for x in [117,148,179]:rect(x,132,26,25,'#b38a55');rect(x+3,135,20,19,'#816a49');line(x+3,135,x+23,153,'#d1b47b');line(x+23,135,x+3,153,'#d1b47b')
    save(f'surface/{name}.png',240,180)
for n in range(6):
    rect(5,202,230,18,'#1a2d36');rect(12,200,216,5,'#8a9f97');rect(30,25,9,175,'#3f535c');rect(29,24,12,4,'#8d9e9b')
    for y in range(30,200,27):line(31,y,80,y+25,'#5e7378');line(31,y+25,80,y,'#334954')
    rect(78,17,5,185,'#293f4a');rect(37,31,44,4,'#6b7f83')
    if n:
        poly([(99,190),(99,70),(121,40),(143,70),(143,190)],'#162e3b');rect(103,75,36,110,'#a7c4be');rect(107,77,8,105,'#e4e2bc');rect(132,77,6,105,'#6e969b');poly([(103,75),(121,40),(139,75)],'#dbb37a')
    if n>=2:
        rect(104,119,35,10,'#d89451');rect(104,135,35,6,'#315462')
    if n>=3:
        circle(121,89,11,'#233e4c');circle(121,89,7,'#78d2c5');rect(118,84,6,2,'#e6fff1')
    if n>=4:
        poly([(102,152),(88,182),(88,196),(105,186)],'#c88f56');poly([(139,152),(153,182),(153,196),(136,186)],'#b47546');rect(111,185,21,13,'#172a34');rect(114,193,15,6,'#a7b8a8')
    if n>=5:rect(116,108,10,6,'#95f4d1');rect(121,50,2,23,'#fae3a9')
    save(f'rocket/stage{n}.png',240,220)
for i,name in enumerate(['fuel','hull','cargo','credits','depth','resonite','cryenite','core-sample']):
    c=['#e9b56d','#ee9c7e','#9bb9b8','#f4cf7d','#82bac4','#87e8c3','#91b9ff','#ffd27c'][i]
    if i==0:poly([(12,2),(4,14),(5,20),(12,23),(19,19),(20,13)],c)
    elif i==1:poly([(3,3),(12,1),(21,3),(20,15),(12,23),(4,15)],c);poly([(7,6),(17,6),(16,14),(12,18),(8,14)],'#1a303c')
    elif i==2:rect(3,7,18,15,c);rect(7,2,10,5,c);rect(5,10,14,2,'#1a303c')
    elif i==3:circle(12,12,10,c);circle(12,12,7,'#30434a');rect(11,6,3,12,c);rect(8,9,8,3,c)
    elif i==4:line(12,2,12,21,c);line(5,14,12,21,c);line(12,21,19,14,c)
    else:poly([(4,8),(11,2),(19,7),(16,20),(8,23)],c);line(11,3,12,18,'#f2ffec')
    save(f'icons/{name}.png',24,24)
print('Original sprites and animation frames rendered.')
