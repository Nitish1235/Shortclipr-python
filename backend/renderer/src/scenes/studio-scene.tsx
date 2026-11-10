import {Circle, Layout, Line, Rect, Txt, makeScene2D} from '@revideo/2d'
import {all, createRef, easeInOutCubic, useScene, waitFor} from '@revideo/core'
import type {RenderPlan, ScenePlan} from '../contracts'

const fallback: RenderPlan = {
  projectId:'preview',title:'A STORY IN MOTION',narration:'',aspectRatio:'9:16',fps:30,durationSeconds:15,
  palette:{background:'#171914',foreground:'#f2f0e7',accent:'#bdff32',secondary:'#c6b7ec'},
  scenes:[{index:0,start_frame:0,end_frame:450,purpose:'Preview',visual_description:'A declarative ShortClipr scene',complexity:'light',operations:['text_reveal'],layers:['background','title'],camera:'locked',transition_out:'fade',animation:{visual_family:'orbit',headline:'A STORY IN MOTION',caption:'CODED FRAME BY FRAME',primary_value:'60',motion:'trace',density:8,emphasis:'bold',background:'ink'}}]
}

type Animation = NonNullable<ScenePlan['animation']>
type Palette = Required<NonNullable<RenderPlan['palette']>>

const backgroundFor = (name:Animation['background'],palette:Palette) => ({ink:palette.background,paper:'#ece9de',midnight:'#0d1022',signal:'#30155f'}[name])

function visual(scene:ScenePlan,palette:Palette) {
  const program=scene.animation!
  const family=program.visual_family
  if(family==='orbit') return <Layout width={720} height={720}>{[0,1,2].map(i=><Circle key={String(i)} size={680-i*150} stroke={i===1?palette.secondary:palette.accent} lineWidth={i===1?5:2} opacity={0.28+i*.1}/>) }<Circle size={150} fill={palette.accent}/><Txt text={program.primary_value} fill={palette.background} fontFamily={'DM Sans'} fontWeight={900} fontSize={52}/></Layout>
  if(family==='bars') return <Layout width={760} height={500} alignItems={'end'} justifyContent={'center'} gap={28}>{Array.from({length:Math.min(10,program.density)},(_,i)=><Rect key={String(i)} width={42} height={90+((i*83)%360)} radius={21} fill={i%3===0?palette.accent:palette.secondary} opacity={.46+i*.045}/>)}</Layout>
  if(family==='timeline') return <Layout width={820} height={360}><Line points={[[-380,0],[380,0]]} stroke={palette.secondary} lineWidth={8}/>{Array.from({length:Math.min(8,program.density)},(_,i)=><Circle key={String(i)} x={-360+i*(720/Math.max(1,Math.min(8,program.density)-1))} size={i===Math.min(8,program.density)-1?76:38} fill={i===Math.min(8,program.density)-1?palette.accent:palette.foreground}/>)}</Layout>
  if(family==='particles') return <Layout width={780} height={600}>{Array.from({length:program.density},(_,i)=><Circle key={String(i)} x={((i*173)%700)-350} y={((i*251)%520)-260} size={28+(i%4)*16} fill={i%3===0?palette.accent:palette.secondary} opacity={.35+(i%5)*.1}/>)}</Layout>
  if(family==='split') return <Layout width={820} height={520} gap={24}><Rect width={390} height={500} radius={44} fill={palette.secondary} opacity={.78}/><Rect width={390} height={500} radius={44} fill={palette.accent} opacity={.88}/><Txt text={program.primary_value} fill={palette.background} fontFamily={'DM Sans'} fontWeight={900} fontSize={72}/></Layout>
  if(family==='diagram') return <Layout width={840} height={520} direction={'column'} alignItems={'center'} justifyContent={'center'} gap={50}><Layout gap={70}>{[0,1,2].map(i=><Rect key={String(i)} width={180} height={110} radius={28} fill={i===1?palette.accent:palette.secondary}><Txt text={String(i+1).padStart(2,'0')} fill={palette.background} fontFamily={'DM Sans'} fontWeight={900} fontSize={40}/></Rect>)}</Layout><Line points={[[-300,20],[0,150],[300,20]]} stroke={palette.foreground} lineWidth={5}/></Layout>
  if(family==='counter') return <Layout width={800} height={560}><Txt text={program.primary_value} fill={palette.accent} fontFamily={'Barlow Condensed'} fontWeight={900} fontSize={280} lineHeight={.8}/></Layout>
  return <Layout width={850} height={540}><Txt text={program.primary_value||program.headline} fill={palette.accent} fontFamily={'Barlow Condensed'} fontWeight={900} fontSize={190} lineHeight={.8} textAlign={'center'} textWrap/></Layout>
}

export default makeScene2D('shortclipr-studio-scene',function* (view) {
  const plan=useScene().variables.get<RenderPlan>('plan',fallback)()
  const palette={...fallback.palette,...plan.palette} as Palette
  const wide=plan.aspectRatio==='16:9',square=plan.aspectRatio==='1:1'
  const frameSize=wide?{width:1920,height:1080}:square?{width:1080,height:1080}:{width:1080,height:1920}
  const focalBase={x:wide?430:0,y:wide?0:square?-170:-120}
  const copyBase={x:wide?-430:0,y:wide?0:square?350:560}
  const stage=createRef<Layout>()
  view.add(<Layout ref={stage} width={'100%'} height={'100%'}/>)

  for(const scene of plan.scenes){
    const program=scene.animation??fallback.scenes[0].animation!
    const duration=Math.max(1,(scene.end_frame-scene.start_frame)/plan.fps)
    const card=createRef<Layout>(),focal=createRef<Layout>(),copy=createRef<Layout>()
    stage().removeChildren()
    view.fill(backgroundFor(program.background,palette))
    stage().add(<Layout ref={card} width={'100%'} height={'100%'} opacity={0} y={44}>
      <Rect width={'90%'} height={'90%'} radius={48} stroke={palette.foreground} lineWidth={2} opacity={.18}/>
      <Layout ref={focal} x={focalBase.x} y={focalBase.y} scale={wide ? .72 : .82}>{visual({...scene,animation:program},palette)}</Layout>
      <Layout ref={copy} width={wide?700:'82%'} x={copyBase.x} y={copyBase.y} direction={'column'} gap={22} alignItems={'start'}>
        <Txt text={program.headline.toUpperCase()} fill={palette.foreground} fontFamily={'Barlow Condensed'} fontWeight={900} fontSize={wide?84:program.emphasis==='bold'?108:88} lineHeight={.86} textWrap/>
        <Txt text={program.caption.toUpperCase()} fill={palette.accent} fontFamily={'DM Sans'} fontWeight={700} fontSize={30} letterSpacing={4} textWrap/>
      </Layout>
      <Txt text={`SHORTCLIPR / ${String(scene.index+1).padStart(2,'0')}`} x={-frameSize.width/2+145} y={-frameSize.height/2+70} fill={palette.foreground} opacity={.5} fontFamily={'DM Sans'} fontWeight={700} fontSize={22} letterSpacing={3}/>
    </Layout>)
    const enter=Math.min(.55,duration*.25),exit=Math.min(.4,duration*.2),hold=Math.max(.05,duration-enter-exit)
    yield* all(card().opacity(1,enter),card().y(0,enter,easeInOutCubic),focal().scale(1,enter,easeInOutCubic))
    if(program.motion==='pulse')yield* all(focal().scale(1.08,hold/2).to(1,hold/2),copy().x(18,hold/2).to(0,hold/2))
    else if(program.motion==='rise')yield* all(focal().y(focalBase.y-50,hold,easeInOutCubic),copy().y(copyBase.y-40,hold,easeInOutCubic))
    else if(program.motion==='parallax')yield* all(focal().x(focalBase.x+80,hold,easeInOutCubic),copy().x(copyBase.x-45,hold,easeInOutCubic))
    else if(program.motion==='cascade')yield* all(focal().rotation(9,hold,easeInOutCubic),copy().y(copyBase.y-25,hold,easeInOutCubic))
    else yield* all(focal().rotation(program.motion==='trace'?18:5,hold,easeInOutCubic),copy().x(copyBase.x+(program.motion==='sweep'?34:0),hold,easeInOutCubic))
    yield* all(card().opacity(0,exit),card().y(-30,exit,easeInOutCubic))
  }
  yield* waitFor(.01)
})
