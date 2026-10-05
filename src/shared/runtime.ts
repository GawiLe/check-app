// De banner-runtime: het enige script dat in een geëxporteerde banner zit.
// Minified ±1,5KB. Geen externe libraries, geen Enabler, geen polyfills.
//
// Data-formaat (D):
//   w,h  formaat     d  duur van één loop (s)     l  aantal loops     a  autoplay
//   L    geanimeerde lagen: { i: element-id, b: basiswaarden, p: tracks, g: write-on, f: vul-fractie, w: wipe-modus }
//        basiswaarden/tracks gebruiken korte sleutels: x y s(scale) r(rotation) o(opacity) v(reveal)
//        keyframes zijn [tijd, waarde, easing-index] — volgorde van easings gelijk aan EASES in types.ts
//
// Houd de easing- en sample-logica gelijk aan anim.ts.

export const RUNTIME_SOURCE = String.raw`
(function(D){
var B=function(t){var n=7.5625,d=2.75;if(t<1/d)return n*t*t;if(t<2/d)return n*(t-=1.5/d)*t+.75;if(t<2.5/d)return n*(t-=2.25/d)*t+.9375;return n*(t-=2.625/d)*t+.984375};
var E=[function(t){return t},function(t){return t*t*t},function(t){return 1-Math.pow(1-t,3)},function(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2},function(t){return 1+2.70158*Math.pow(t-1,3)+1.70158*Math.pow(t-1,2)},function(t){return t<=0?0:t>=1?1:Math.pow(2,-10*t)*Math.sin((t*10-.75)*2.0944)+1},B,function(){return 0}];
function S(k,t){var n=k.length,i=0;if(t<=k[0][0])return k[0][1];if(t>=k[n-1][0])return k[n-1][1];for(;i<n-1;i++)if(t<k[i+1][0])break;var a=k[i],b=k[i+1];return a[1]+(b[1]-a[1])*E[a[2]]((t-a[0])/(b[0]-a[0]))}
function C(x){return x<0?0:x>1?1:x}
var L=D.L.map(function(l){var el=document.getElementById(l.i);return{l:l,el:el,g:l.g?el.getElementsByTagName('path'):null}});
function R(t){for(var m=0;m<L.length;m++){var o=L[m],l=o.l,v={},k;for(k in l.b)v[k]=l.p[k]?S(l.p[k],t):l.b[k];
var s=o.el.style;s.transform='translate('+v.x+'px,'+v.y+'px) rotate('+v.r+'deg) scale('+v.s+')';s.opacity=v.o;
if(o.g){var n=o.g.length,w=2/(n+1),f=l.f;for(var j=0;j<n;j++){var q=C((v.v-j/(n+1))/w),ps=o.g[j].style;ps.strokeDashoffset=1-q;ps.visibility=q>0?'visible':'hidden';ps.fillOpacity=f>0?C((q-1+f)/f):0}}
else if(l.w){var h=(1-C(v.v))*100+'%';s.clipPath=l.w==1?'inset(0 '+h+' 0 0)':l.w==2?'inset(0 0 0 '+h+')':l.w==3?'inset('+h+' 0 0 0)':'inset(0 0 '+h+' 0)'}}}
var T=D.d,N=D.l,t0=0,cur=0,raf=0;
function tick(n){var e=(n-t0)/1e3;if(e>=T*N){cur=T;R(T);return}cur=e%T;R(cur);raf=requestAnimationFrame(tick)}
var BS=window.BS={seek:function(t){cancelAnimationFrame(raf);cur=Math.min(Math.max(t,0),T);R(cur)},play:function(){cancelAnimationFrame(raf);t0=performance.now()-cur*1e3;raf=requestAnimationFrame(tick)},pause:function(){cancelAnimationFrame(raf)}};
function go(){R(0);document.body.className+=' r';if(D.a)BS.play()}
var fr=document.fonts&&document.fonts.ready;
if(document.readyState=='complete')fr?fr.then(go):go();else window.addEventListener('load',function(){fr?fr.then(go):go()});
if(!D.a)window.addEventListener('message',function(m){var d=m.data;if(d&&d.bs=='seek')BS.seek(d.t)});
})(`

/** Heel eenvoudige minifier voor de runtime: we kennen de code, dus regels samenvoegen volstaat. */
export function minifiedRuntime(): string {
  return RUNTIME_SOURCE.split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('')
}

export const WIPE_INDEX = { none: 0, wipeLeft: 1, wipeRight: 2, wipeUp: 3, wipeDown: 4 } as const
