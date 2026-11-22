/* ShortClipr deterministic 2D style and transition helpers. */
(() => {
'use strict';
const palettes={
'paper-cutout':{bg:'#f2ead8',ink:'#302b26',paper:'#fff8e9',shadow:'rgba(45,35,25,.22)',accent:'#d86b45',secondary:'#658b83'},
risograph:{bg:'#f4ecd9',ink:'#25223b',paper:'#fff9e9',shadow:'rgba(30,25,40,.18)',accent:'#ef5b45',secondary:'#287f83'},
comic:{bg:'#fff3d6',ink:'#171717',paper:'#fffdf5',shadow:'rgba(0,0,0,.2)',accent:'#e84437',secondary:'#2474bd'},
'70s-poster':{bg:'#f0dfbd',ink:'#3d3028',paper:'#fff0d2',shadow:'rgba(55,35,20,.2)',accent:'#c85a36',secondary:'#58756a'},
engraving:{bg:'#f1eadb',ink:'#302d28',paper:'#faf5e9',shadow:'rgba(30,25,20,.16)',accent:'#8b4937',secondary:'#65705d'},
blueprint:{bg:'#102f50',ink:'#f1f4e8',paper:'#173d63',shadow:'rgba(0,0,0,.2)',accent:'#f2c86a',secondary:'#78c9d0'},
line:{bg:'#f8f7f1',ink:'#242a2b',paper:'#ffffff',shadow:'rgba(0,0,0,.12)',accent:'#d56b4b',secondary:'#688c88'},
'pixel-art':{bg:'#182333',ink:'#f2f0d5',paper:'#26374b',shadow:'rgba(0,0,0,.35)',accent:'#f2b84b',secondary:'#69c5a6'},
'cinematic-editorial':{bg:'#e9e2d3',ink:'#252b2c',paper:'#f7f1e5',shadow:'rgba(22,28,30,.28)',accent:'#d45b3f',secondary:'#557c78'},
'isometric-technical':{bg:'#e8edf0',ink:'#263746',paper:'#f8faf8',shadow:'rgba(24,43,55,.2)',accent:'#e17b42',secondary:'#4c8990'},
'layered-paper':{bg:'#eee4d2',ink:'#40372f',paper:'#fff8e9',shadow:'rgba(58,42,28,.24)',accent:'#d36f50',secondary:'#78958a'}};
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ease=v=>{v=clamp(v);return v*v*(3-2*v);};
const pixelSnap=(v,size=1)=>Math.round(v/Math.max(1,size))*Math.max(1,size);
function paperBackground(g,id,env){const p=palettes[id]||palettes['paper-cutout'];g.save();g.fillStyle=p.bg;g.fillRect(0,0,env.W,env.H);
if(id==='blueprint'){g.strokeStyle='rgba(210,235,245,.11)';g.lineWidth=1;for(let x=0;x<=env.W;x+=40){g.beginPath();g.moveTo(x,0);g.lineTo(x,env.H);g.stroke();}for(let y=0;y<=env.H;y+=40){g.beginPath();g.moveTo(0,y);g.lineTo(env.W,y);g.stroke();}}g.restore();return p;}
function paperShadow(g,x,y,blur=12,color='rgba(30,20,10,.18)'){g.shadowColor=color;g.shadowBlur=blur;g.shadowOffsetX=0;g.shadowOffsetY=blur*.45;}
function halftone(g,x,y,w,h,spacing=12,color='rgba(20,20,20,.18)'){const step=Math.max(4,spacing);g.save();g.fillStyle=color;for(let yy=y;yy<y+h;yy+=step)for(let xx=x;xx<x+w;xx+=step){g.beginPath();g.arc(xx,yy,Math.max(.7,step*.075),0,Math.PI*2);g.fill();}g.restore();}
function camera(g,env,o={}){const cx=Number.isFinite(o.cx)?o.cx:env.W/2,cy=Number.isFinite(o.cy)?o.cy:env.H/2,zoom=clamp(Number(o.zoom)||1,.25,4),rotation=Number(o.rotation)||0;g.translate(env.W/2,env.H/2);g.rotate(rotation);g.scale(zoom,zoom);g.translate(-cx,-cy);}
function transition(g,env,nextCanvas,progress,type='wipe'){if(!nextCanvas)return;const p=ease(progress);g.save();g.beginPath();if(type==='iris')g.arc(env.W/2,env.H/2,Math.hypot(env.W,env.H)*p,0,Math.PI*2);else if(type==='paper'){const edge=env.W*p;g.moveTo(0,0);g.lineTo(edge,0);for(let y=0;y<=env.H;y+=24)g.lineTo(edge+Math.sin(y*.035)*10,y);g.lineTo(0,env.H);g.closePath();}else if(type==='fade'){g.globalAlpha=p;g.rect(0,0,env.W,env.H);}else g.rect(0,0,env.W*p,env.H);g.clip();Motion.drawLayer(g,env,nextCanvas);g.restore();}

/* Dedicated deterministic primitives for the three new art systems. */
function editorialShape(g,points,opts={}){if(!Array.isArray(points)||points.length<3)return;const depth=Number(opts.depth)||0,shadow=opts.shadow||'rgba(20,25,28,.22)';g.save();if(depth>0){g.fillStyle=shadow;g.beginPath();g.moveTo(points[0][0]+depth,points[0][1]+depth);for(let i=1;i<points.length;i++)g.lineTo(points[i][0]+depth,points[i][1]+depth);g.closePath();g.fill();}g.beginPath();g.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)g.lineTo(points[i][0],points[i][1]);g.closePath();g.fillStyle=opts.fill||'#d45b3f';g.fill();if(opts.stroke){g.strokeStyle=opts.stroke;g.lineWidth=Number(opts.lineWidth)||3;g.stroke();}g.restore();}
function editorialLight(g,x,y,r,color='rgba(255,236,190,.24)'){g.save();const grad=g.createRadialGradient(x,y,0,x,y,r);grad.addColorStop(0,color);grad.addColorStop(1,'rgba(255,236,190,0)');g.fillStyle=grad;g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();g.restore();}
function isoProject(x,y,z=0,scale=1,origin={x:0,y:0}){const u=(Number(x)-Number(y))*0.8660254037844386*scale;const v=(Number(x)+Number(y))*0.5*scale-Number(z)*scale;return {x:Number(origin.x||0)+u,y:Number(origin.y||0)+v};}
function isoBox(g,x,y,z,w,d,h,scale=1,colors={}){const a=isoProject(x,y,z,scale),b=isoProject(x+w,y,z,scale),c=isoProject(x+w,y+d,z,scale),e=isoProject(x,y+d,z,scale),at=isoProject(x,y,z+h,scale),bt=isoProject(x+w,y,z+h,scale),ct=isoProject(x+w,y+d,z+h,scale),et=isoProject(x,y+d,z+h,scale);g.save();g.lineJoin='round';g.lineWidth=Math.max(1,scale*.035);g.strokeStyle=colors.edge||'#263746';g.fillStyle=colors.left||'#66818a';g.beginPath();g.moveTo(e.x,e.y);g.lineTo(c.x,c.y);g.lineTo(ct.x,ct.y);g.lineTo(et.x,et.y);g.closePath();g.fill();g.stroke();g.fillStyle=colors.right||'#3f6877';g.beginPath();g.moveTo(c.x,c.y);g.lineTo(b.x,b.y);g.lineTo(bt.x,bt.y);g.lineTo(ct.x,ct.y);g.closePath();g.fill();g.stroke();g.fillStyle=colors.top||'#a9c1c1';g.beginPath();g.moveTo(at.x,at.y);g.lineTo(bt.x,bt.y);g.lineTo(ct.x,ct.y);g.lineTo(et.x,et.y);g.closePath();g.fill();g.stroke();g.restore();return {top:[at,bt,ct,et],left:[e,c,ct,et],right:[c,b,bt,ct]};}
function isoLine(g,a,b,color='#263746',width=2){g.save();g.strokeStyle=color;g.lineWidth=width;g.beginPath();g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.stroke();g.restore();}
function paperLayer(g,draw,opts={}){g.save();g.shadowColor=opts.shadowColor||'rgba(58,42,28,.24)';g.shadowBlur=Number.isFinite(opts.blur)?opts.blur:10;g.shadowOffsetX=Number.isFinite(opts.offsetX)?opts.offsetX:0;g.shadowOffsetY=Number.isFinite(opts.offsetY)?opts.offsetY:7;g.fillStyle=opts.fill||'#fff8e9';g.strokeStyle=opts.edge||'rgba(80,60,42,.18)';g.lineWidth=Number(opts.lineWidth)||1.5;draw(g);g.fill();if(opts.edge!==false)g.stroke();g.restore();}
function paperPolygon(g,points,opts={}){if(!Array.isArray(points)||points.length<3)return;paperLayer(g,ctx=>{ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();},opts);}
function paperEllipse(g,x,y,rx,ry,opts={}){paperLayer(g,ctx=>{ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);},opts);}
function paperParallax(g,offset,drawLayers){for(let i=0;i<drawLayers.length;i++){const layer=drawLayers[i];g.save();g.translate(offset*(layer.depth||0),0);layer.draw(g);g.restore();}}

function mechanismPose(spec,progress){
if(!spec||typeof spec!=='object')throw new TypeError('mechanism spec is required');
const p=clamp(Number(progress)||0),lerp=(a,b,t)=>a+(b-a)*t;
const point=v=>({x:Number(v.x),y:Number(v.y)});
if(spec.type==='pivot'){
const anchor=point(spec.anchor),angle=lerp(Number(spec.start_angle_deg),Number(spec.end_angle_deg),p)*Math.PI/180;
return {type:'pivot',part:spec.part,anchor,angle_rad:angle};
}
if(spec.type==='translation'){
const start=point(spec.start),end=point(spec.end);
return {type:'translation',part:spec.part,position:{x:lerp(start.x,end.x,p),y:lerp(start.y,end.y,p)}};
}
if(spec.type==='actuator'){
const base=point(spec.base_anchor),rod=point(spec.rod_anchor),dx=rod.x-base.x,dy=rod.y-base.y;
const initial=Math.hypot(dx,dy)||1,length=lerp(Number(spec.min_length),Number(spec.max_length),p),ratio=length/initial;
return {type:'actuator',part:spec.part,base,tip:{x:base.x+dx*ratio,y:base.y+dy*ratio},length,angle_rad:Math.atan2(dy,dx)};
}
throw new TypeError('Unsupported kinematics type: '+spec.type);
}
window.ShortcliprStyles=Object.freeze({mechanismPose,palette:id=>palettes[id]||palettes['paper-cutout'],paletteIds:Object.freeze(Object.keys(palettes)),paperBackground,paperShadow,halftone,camera,transition,pixelSnap,ease,editorialShape,editorialLight,isoProject,isoBox,isoLine,paperLayer,paperPolygon,paperEllipse,paperParallax});
})();