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
'pixel-art':{bg:'#182333',ink:'#f2f0d5',paper:'#26374b',shadow:'rgba(0,0,0,.35)',accent:'#f2b84b',secondary:'#69c5a6'}};
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ease=v=>{v=clamp(v);return v*v*(3-2*v);};
const pixelSnap=(v,size=1)=>Math.round(v/Math.max(1,size))*Math.max(1,size);
function paperBackground(g,id,env){const p=palettes[id]||palettes['paper-cutout'];g.save();g.fillStyle=p.bg;g.fillRect(0,0,env.W,env.H);
if(id==='blueprint'){g.strokeStyle='rgba(210,235,245,.11)';g.lineWidth=1;for(let x=0;x<=env.W;x+=40){g.beginPath();g.moveTo(x,0);g.lineTo(x,env.H);g.stroke();}for(let y=0;y<=env.H;y+=40){g.beginPath();g.moveTo(0,y);g.lineTo(env.W,y);g.stroke();}}g.restore();return p;}
function paperShadow(g,x,y,blur=12,color='rgba(30,20,10,.18)'){g.shadowColor=color;g.shadowBlur=blur;g.shadowOffsetX=0;g.shadowOffsetY=blur*.45;}
function halftone(g,x,y,w,h,spacing=12,color='rgba(20,20,20,.18)'){const step=Math.max(4,spacing);g.save();g.fillStyle=color;for(let yy=y;yy<y+h;yy+=step)for(let xx=x;xx<x+w;xx+=step){g.beginPath();g.arc(xx,yy,Math.max(.7,step*.075),0,Math.PI*2);g.fill();}g.restore();}
function camera(g,env,o={}){const cx=Number.isFinite(o.cx)?o.cx:env.W/2,cy=Number.isFinite(o.cy)?o.cy:env.H/2,zoom=clamp(Number(o.zoom)||1,.25,4),rotation=Number(o.rotation)||0;g.translate(env.W/2,env.H/2);g.rotate(rotation);g.scale(zoom,zoom);g.translate(-cx,-cy);}
function transition(g,env,nextCanvas,progress,type='wipe'){if(!nextCanvas)return;const p=ease(progress);g.save();g.beginPath();if(type==='iris')g.arc(env.W/2,env.H/2,Math.hypot(env.W,env.H)*p,0,Math.PI*2);else if(type==='paper'){const edge=env.W*p;g.moveTo(0,0);g.lineTo(edge,0);for(let y=0;y<=env.H;y+=24)g.lineTo(edge+Math.sin(y*.035)*10,y);g.lineTo(0,env.H);g.closePath();}else if(type==='fade'){g.globalAlpha=p;g.rect(0,0,env.W,env.H);}else g.rect(0,0,env.W*p,env.H);g.clip();Motion.drawLayer(g,env,nextCanvas);g.restore();}
window.ShortcliprStyles=Object.freeze({palette:id=>palettes[id]||palettes['paper-cutout'],paletteIds:Object.freeze(Object.keys(palettes)),paperBackground,paperShadow,halftone,camera,transition,pixelSnap,ease});
})();