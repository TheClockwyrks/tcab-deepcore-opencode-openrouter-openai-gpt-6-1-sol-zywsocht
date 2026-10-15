"""One-time authoring of the live particle systems, sound cues and score."""
import json, subprocess
from pathlib import Path
R=Path(__file__).resolve().parent; T=Path('/tmp/opencode')
def run(tool,cfg,*args):
    subprocess.run([tool,'--config',str(cfg),*map(str,args)],check=True,stdout=subprocess.DEVNULL)
effects=[('gas-seep','#b6d7b7',12,18,700,8),('drill-debris','#c79767',32,95,500,3),('jetpack-exhaust','#ffb454',35,100,400,7),('ore-sparkle','#f5dc98',24,65,650,4),('material-shimmer','#8ef9da',48,85,1100,5),('gas-explosion','#ffbb62',100,190,950,10),('lava-embers','#ff7e42',35,80,800,4),('impact-dust','#a9a08b',35,80,650,6),('core-extract','#ffbc77',60,95,1200,8),('core-detonation','#ff9b55',220,290,1600,16),('launch-exhaust','#ffd694',95,155,1200,11),('death-burst','#bdd8cd',65,125,1000,5)]
(R/'fx').mkdir(exist_ok=True);(R/'audio').mkdir(exist_ok=True)
for i,(name,color,count,speed,life,size) in enumerate(effects):
    cfg=T/'particle.json';cfg.write_text(json.dumps(dict(width=256,height=256,duration_ms=2200,fps=30,seed=45+i,actions=str(T/'p-actions.json'),preview=str(T/'p.png'),system=str(R/'fx'/f'{name}.json'))))
    run('particle-2d',cfg,'init')
    run('particle-2d',cfg,'add-emitter','--name','body','--shape','disc','--radius',12,'--x',128,'--y',128,'--burst',count,'--lifetime',life,'--lifetime-spread',200,'--speed',speed,'--speed-spread',speed*.4,'--dir-y',-1 if name in ['jetpack-exhaust','launch-exhaust'] else 1,'--cone-angle',25 if 'exhaust' in name else 180)
    run('particle-2d',cfg,'set-particle','--emitter','body','--size-from',size/5,'--size-to',.1,'--opacity-from',.18 if name=='gas-seep' else .8,'--opacity-to',0,'--color-gradient',f'{color}@0,#54616b@1')
    run('particle-2d',cfg,'set-forces','--drag',1.4,'--gravity',-30 if name!='gas-seep' else 25)
    if 'explosion' in name or 'detonation' in name:
        run('particle-2d',cfg,'add-emitter','--name','shock','--shape','disc','--radius',4,'--x',128,'--y',128,'--burst',90,'--lifetime',300,'--speed',310,'--dir-y',1,'--cone-angle',180)
        run('particle-2d',cfg,'set-particle','--emitter','shock','--size-from',1.3,'--size-to',.2,'--opacity-from',.9,'--opacity-to',0,'--color-gradient','#fff3ce@0,#ef8050@1')
    run('particle-2d',cfg,'render','--frame',10,'--out',T/'p.png')

samplemap={'drill':'engine_diesel_idle','thrust':'whoosh_air','gas-explosion':'cannon_body_heavy','lava-sizzle':'fire_crackle','impact':'debris_rubble','fabricate':'mech_ratchet','launch':'boom_sub_rumble','death':'impact_metal_hollow','ore-pickup':'mech_clip_load','material-chime':'zap_electric'}
for i,name in enumerate(['drill','thrust','ore-pickup','material-chime','gas-explosion','lava-sizzle','impact','fabricate','launch','death','alarm-fuel','alarm-core']):
    cfg=T/'sound.json';cfg.write_text(json.dumps(dict(sample_rate=22050,channels='mono',max_duration_ms=2200,seed=94+i,sample_pack='combat-core',actions=str(T/'s-actions.json'),preview=str(T/'s.png'),wav=str(R/'audio'/f'{name}.wav'))))
    tool='sfx-sample' if name in samplemap else 'sfx-synth';run(tool,cfg,'init')
    if name in samplemap:run(tool,cfg,'add-sample','--name',samplemap[name],'--t',0,'--gain',-18,'--fade-out',150)
    freq={'ore-pickup':740,'material-chime':660,'fabricate':440,'alarm-fuel':440,'alarm-core':880}.get(name,65)
    run(tool,cfg,'add-voice','--name','tone','--wave','sine' if freq>100 else 'triangle','--freq',freq,'--dur',450 if freq>100 else 1100,'--gain',-27 if name in samplemap else -23)
    run(tool,cfg,'set-envelope','--voice','tone','--env','pluck')
    if freq>100:
        run(tool,cfg,'add-voice','--name','chime','--wave','sine','--freq',freq*1.5,'--start',100,'--dur',500,'--gain',-29)
        run(tool,cfg,'set-envelope','--voice','chime','--env','pluck')
    run(tool,cfg,'render')
cfg=T/'music.json';cfg.write_text(json.dumps(dict(sample_rate=22050,channels='stereo',max_duration_ms=24000,seed=78,instrument_bank='gm-lite',actions=str(T/'m-actions.json'),preview=str(T/'m.png'),wav=str(R/'audio/music.wav'),mid=str(R/'audio/music.mid'))))
run('music',cfg,'init');run('music',cfg,'set-tempo','--bpm',80)
for track,wave in [('abyss','synth_pad'),('beacon','electric_piano'),('pulse','bass_electric')]:run('music',cfg,'define-track','--name',track,'--instrument',wave)
for j,p in enumerate([38,34,41,36]):
    run('music',cfg,'add-note','--track','abyss','--pitch',p,'--t',j*8,'--dur',7.8,'--velocity',28)
    for k in range(4):run('music',cfg,'add-note','--track','beacon','--pitch',p+24+[0,7,12,7][k],'--t',j*8+k*2,'--dur',1.6,'--velocity',19)
    for k in range(8):run('music',cfg,'add-note','--track','pulse','--pitch',p-12,'--t',j*8+k,'--dur',.2,'--velocity',24)
run('music',cfg,'render')
print('All effects, cues and the descent score rendered.')
