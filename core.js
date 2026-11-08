/* ===== Núcleo: limpieza, detección y generación ===== */
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const uid=()=>Math.random().toString(36).slice(2,9);
const escRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const TAG_RE=/<([a-zA-Z][\w:-]*)((?:\s+[^\s=>\/"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g;
const VAR_SRC='\\[([A-Za-z_][^\\[\\]\\r\\n"\'<>]{0,59})\\]';
const HEX_SRC='(?<!url\\()(?<!(?:href|id)\\s*=\\s*["\'])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\\w-])';
const varRe=()=>new RegExp(VAR_SRC,'g');
const hexRe=()=>new RegExp(HEX_SRC,'g');
const PRES=new Set('fill stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset stroke-miterlimit stroke-opacity fill-opacity opacity fill-rule clip-rule font-family font-size font-weight font-style text-anchor stop-color stop-opacity display visibility mix-blend-mode letter-spacing dominant-baseline text-decoration flood-color flood-opacity'.split(' '));

function numberTags(code){let n=0;return code.replace(TAG_RE,(m,name,attrs,sl)=>'<'+name+attrs+' data-ci="'+(n++)+'"'+sl+'>');}

function flagRanges(s){
  const r=[];
  const add=(re,kind)=>{let m;while((m=re.exec(s)))r.push({s:m.index,e:m.index+m[0].length,kind});};
  add(/<style[\s\S]*?<\/style\s*>/gi,'CSS');add(/<script[\s\S]*?<\/script\s*>/gi,'JS');
  add(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi,'CSS');add(/\sclass\s*=\s*("[^"]*"|'[^']*')/gi,'CSS');
  add(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi,'JS');add(/javascript:[^"'\s>]*/gi,'JS');
  return r;
}
function parseDecls(t){
  const o={};
  t.split(';').forEach(d=>{const i=d.indexOf(':');if(i<1)return;const k=d.slice(0,i).trim().toLowerCase();
    const v=d.slice(i+1).replace(/!important/i,'').trim();if(k&&v)o[k]=v;});
  return o;
}
function cleanSvg(src){
  const info={blocks:0,scripts:0,inline:0,classes:0,handlers:0,dropped:new Set()};
  let s=src.replace(/<\?xml[\s\S]*?\?>/gi,'').replace(/<!DOCTYPE[\s\S]*?>/gi,'').replace(/<!--[\s\S]*?-->/g,'').replace(/<!\[CDATA\[|\]\]>/g,'');
  const rules={};
  s=s.replace(/<style[^>]*>([\s\S]*?)<\/style\s*>/gi,(m,css)=>{
    info.blocks++;
    css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/([^{}]+)\{([^{}]*)\}/g,(mm,sel,body)=>{
      sel.split(',').forEach(x=>{x=x.trim();
        if(/^\.[\w-]+$|^[a-zA-Z][\w-]*$/.test(x))rules[x]=Object.assign(rules[x]||{},parseDecls(body));
        else if(x)info.dropped.add('selector '+x);});
      return '';});
    return '';});
  s=s.replace(/<script[\s\S]*?<\/script\s*>/gi,()=>{info.scripts++;return '';});
  s=s.replace(TAG_RE,(m,name,attrs,sl)=>{
    const list=[];
    attrs.replace(/([^\s=>\/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g,(a,k,v1,v2,v3)=>{list.push([k,v1??v2??v3??'']);return a;});
    let touched=false,cls='',sty='';const attr=new Map();
    for(const [k,v] of list){
      const lk=k.toLowerCase();
      if(lk==='class'){cls=v;touched=true;info.classes++;}
      else if(lk==='style'){sty=v;touched=true;info.inline++;}
      else if(/^on[a-z]+$/.test(lk)){touched=true;info.handlers++;}
      else if((lk==='href'||lk==='xlink:href')&&/^\s*javascript:/i.test(v)){touched=true;info.handlers++;}
      else attr.set(k,v);
    }
    const decl=Object.assign({},rules[name]||{});
    cls.split(/\s+/).filter(Boolean).forEach(c=>Object.assign(decl,rules['.'+c]||{}));
    Object.assign(decl,parseDecls(sty));
    for(const [k,v] of Object.entries(decl)){if(PRES.has(k)){attr.set(k,v);touched=true;}else info.dropped.add(k);}
    if(!touched)return m;
    return '<'+name+[...attr].map(([k,v])=>' '+k+'="'+v.replace(/"/g,'&quot;')+'"').join('')+sl+'>';
  });
  s=s.replace(hexRe(),m=>m.toLowerCase());
  s=s.split('\n').map(l=>l.trim()).filter(Boolean).join('\n');
  return {code:s,info};
}
const stripCi=s=>s.replace(/ data-ci="\d+"/g,'');

function detect(clean){
  const c=stripCi(clean);const vars=[],cols=[];
  c.replace(varRe(),m=>{if(!vars.includes(m))vars.push(m);return m;});
  c.replace(hexRe(),m=>{if(!cols.includes(m))cols.push(m);return m;});
  return {vars,cols};
}
function syncRows(d,clean){
  const det=detect(clean);d.stash=d.stash||{};
  const old=new Map(d.rows.map(r=>[r.kind+':'+r.target,r]));
  const next=[];
  const take=(kind,t)=>{const k=kind+':'+t;const r=old.get(k)||d.stash[k]||{id:uid(),kind,target:t,type:'keep',value:'',sample:''};delete d.stash[k];next.push(r);};
  det.vars.forEach(t=>take('var',t));det.cols.forEach(t=>take('color',t));
  d.rows.forEach(r=>{if(r.kind==='frag')next.push(r);else if(!next.includes(r))d.stash[r.kind+':'+r.target]=r;});
  d.rows=next;
}
function inferSample(t){
  const n=t.slice(1,-1);const c=stripCi(D.clean||'');
  const m=c.match(new RegExp('([\\w:-]+)\\s*=\\s*"[^"]*'+escRe(t)));
  if(m){const a=m[1].toLowerCase();
    if(/fill|stroke$|color/.test(a))return '#7a8ca5';
    if(/opacity/.test(a))return '1';
    if(a==='d')return 'M10 10 L50 50';if(a==='points')return '10,10 50,10 30,50';
    if(a==='transform')return 'rotate(0)';if(/href/.test(a))return '#';
    if(/dash/.test(a))return '120';
    if(/^(x|y|cx|cy|r|rx|ry|x1|x2|y1|y2|width|height|offset|stroke-width|font-size)$/.test(a))return '20';}
  if(new RegExp('>\\s*'+escRe(t)+'\\s*<').test(c))return /(%|pct|porc|avance)/i.test(n)?'68%':'Texto';
  return 'x';
}
function fmt(type,val){
  val=(val||'').trim();
  const isN=v=>/^-?(\d+\.?\d*|\.\d+)$/.test(v);
  if(type==='text')return {ok:val.length>0,s:val};
  if(type==='num'){const v=val.replace(',','.');return {ok:isN(v),s:v};}
  if(type==='pct'){const v=val.replace(/\s/g,'').replace(',','.').replace(/%$/,'');return {ok:isN(v),s:v+'%'};}
  if(type==='hex'){const v=val.replace(/^#?/,'#').toLowerCase();return {ok:/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(v),s:v};}
  if(type==='expr')return {ok:val.length>0,s:val};
  if(type==='var'){const v=val.replace(/^\[?/,'[').replace(/\]?$/,']');return {ok:/^\[[^\[\]]+\]$/.test(v)&&v.length>2,s:v};}
  return {ok:false,s:''};
}
const STATIC=['text','num','pct','hex'];
function effect(r){
  if(r.type==='keep')return {mode:r.kind==='var'?'col':'none'};
  const f=fmt(r.type,r.value);
  if(!f.ok)return {mode:r.kind==='var'?'col':'none',bad:true};
  if(STATIC.includes(r.type)){
    if(r.kind==='frag')return {mode:'sub',repl:'"'+f.s.replace(/"/g,'""')+'"',plain:f.s,stat:true};
    return {mode:'inline',s:f.s};
  }
  if(r.type==='expr'){return r.kind==='var'||r.kind==='color'?{mode:'arg',s:f.s}:{mode:'sub',repl:f.s};}
  if(r.type==='var'){return r.kind==='color'?{mode:'arg',s:f.s}:{mode:'sub',repl:f.s,other:f.s};}
  return {mode:'none'};
}
const isHex=s=>/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s||'');
function ink(h){let x=h.slice(1);if(x.length<6)x=x.split('').map(c=>c+c).join('');
  const r=parseInt(x.slice(0,2),16),g=parseInt(x.slice(2,4),16),b=parseInt(x.slice(4,6),16);
  return (r*299+g*587+b*114)/1000>150?'#111':'#fff';}
const qd=s=>s.replace(/"/g,'""');
const countIn=(txt,t)=>t?txt.split(t).length-1:0;

/* Genera el modelo del lienzo, el texto final y el código para la vista previa */
function buildModel(d,clean){
  const rows=d.rows;const map=new Map();
  rows.filter(r=>r.kind==='frag'&&r.target).forEach(r=>map.set(r.target,r));
  rows.filter(r=>r.kind!=='frag').forEach(r=>map.set(r.target,r));
  const E=new Map(rows.map(r=>[r,effect(r)]));
  const targets=[...map.keys()].sort((a,b)=>b.length-a.length);
  const re=targets.length?new RegExp(targets.map(escRe).join('|'),'g'):null;
  const plain=stripCi(clean);
  const subs=[];
  for(const r of rows){const e=E.get(r);
    if(e.mode==='sub'&&r.target&&countIn(plain,r.target)>0)
      subs.push({find:r.target,repl:e.repl,key:r.kind==='frag'?'f:'+r.id:r.target,stat:e.stat});}
  subs.sort((a,b)=>a.find.length-b.find.length);
  /* líneas de contenido */
  const body=[];
  const cl=clean.split('\n');
  for(const raw of cl){
    const cis=[...raw.matchAll(/data-ci="(\d+)"/g)].map(m=>m[1]);
    const line=stripCi(raw);if(!line)continue;
    const args=[];let buf=[];
    const flush=()=>{if(buf.length){args.push({q:buf});buf=[];}};
    const push=(txt,cls,key,color)=>buf.push({s:txt,cls,key,color});
    let last=0,m;
    if(re){re.lastIndex=0;
      while((m=re.exec(line))){
        if(m.index>last)push(line.slice(last,m.index));
        const hit=m[0],r=map.get(hit),e=E.get(r);
        if(r.kind==='var'){
          if(e.mode==='col'){flush();args.push({raw:hit,cls:'tk-var',key:hit});}
          else if(e.mode==='arg'){flush();args.push({raw:e.s,cls:'tk-expr',key:hit});}
          else if(e.mode==='inline')push(e.s,'tk-val',hit,isHex(e.s)?e.s:null);
          else push(hit,'tk-sub',hit);
        }else if(r.kind==='color'){
          if(e.mode==='arg'){flush();args.push({raw:e.s,cls:'tk-expr',key:hit});}
          else if(e.mode==='inline')push(e.s,'tk-col',hit,e.s);
          else push(hit,'tk-col',hit,hit);
        }else push(hit,'tk-frag','f:'+r.id);
        last=m.index+hit.length;
      }}
    if(last<line.length)push(line.slice(last));
    if(!/>$/.test(line)&&buf.length)push(' ');
    flush();
    body.push({args,cis});
  }
  /* composición de líneas finales */
  const out=[];
  const L=(ind,parts,cis)=>({ind,parts,cis:cis||[]});
  const P=(txt,cls,key,color)=>({txt,cls,key,color});
  const lit=(s,cls,key)=>[P('"'+qd(s)+'"',cls,key)];
  const contentLines=ind=>body.map((b,i)=>{
    const parts=[];
    b.args.forEach((a,j)=>{
      if(j)parts.push(P(','));
      if(a.q){parts.push(P('"','q'));a.q.forEach(g=>parts.push(P(qd(g.s),g.cls,g.key,g.color)));parts.push(P('"','q'));}
      else parts.push(P(a.raw,a.cls,a.key));
    });
    if(i<body.length-1)parts.push(P(','));
    return L(ind,parts,b.cis);
  });
  const emit=(i,ind)=>{
    if(i===subs.length)return [L(ind,[P('concatenate(')]),...contentLines(ind+2),L(ind,[P(')')])];
    const s=subs[i];
    const inner=emit(i+1,ind+2);
    inner[inner.length-1].parts.push(P(','));
    return [L(ind,[P('SUBSTITUTE(')]),...inner,
      L(ind+2,[...lit(s.find,'tk-frag',s.key),P(', '),P(s.repl,s.stat?'tk-val':'tk-expr',s.key)]),L(ind,[P(')')])];
  };
  out.push(L(0,[P('"data:image/svg+xml;utf8,"&encodeurl(')]));
  out.push(...emit(0,2));
  out.push(L(0,[P(')')]));
  const text=out.map(l=>' '.repeat(l.ind)+l.parts.map(p=>p.txt).join('')).join('\n');
  const html=out.map(l=>'<div class="ln"'+(l.cis.length?' data-ci=" '+l.cis.join(' ')+' "':'')+'>'
    +esc(' '.repeat(l.ind))+l.parts.map(p=>{
      const t=esc(p.txt);if(!p.cls)return t;
      if(p.cls==='q')return '<span class="q">'+t+'</span>';
      const st=p.color&&isHex(p.color)?' style="background:'+p.color+';color:'+ink(p.color)+'"':'';
      return '<span class="'+p.cls+'"'+(p.key?' data-k="'+esc(p.key)+'"':'')+st+'>'+t+'</span>';
    }).join('')+'</div>').join('');
  /* código para vista previa */
  const sampleVar=t=>{const r=rows.find(x=>x.kind==='var'&&x.target===t);return r?(r.sample||inferSample(t)):'x';};
  let prev=clean;
  if(re)prev=clean.replace(re,hit=>{
    const r=map.get(hit),e=E.get(r);
    if(r.kind==='var'){
      if(e.mode==='inline')return e.s;
      if(e.mode==='sub'&&e.other)return sampleVar(e.other)||hit;
      return r.sample||inferSample(hit);}
    if(r.kind==='color'){if(e.mode==='inline')return e.s;return e.mode==='arg'?(r.sample||hit):hit;}
    if(e.mode==='sub')return e.stat?e.plain:(r.sample||hit);
    return hit;});
  return {text,html,prev,subs,len:text.length};
}

/* Índice de etiquetas para enlazar código <-> imagen */
function tagIndex(clean){
  const out=[];let last=0,m;const re=new RegExp(TAG_RE.source,'g');
  while((m=re.exec(clean))){
    const ci=(m[0].match(/data-ci="(\d+)"/)||[])[1];
    if(out.length)out[out.length-1].txt+=clean.slice(last,m.index);
    out.push({ci,txt:stripCi(m[0])});last=m.index+m[0].length;
  }
  if(out.length)out[out.length-1].txt+=clean.slice(last);
  return out;
}
