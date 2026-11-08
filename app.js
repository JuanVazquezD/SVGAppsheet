/* ===== Estado, almacenamiento e interfaz ===== */
const SAMPLE=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
<style>
.base{fill:none;stroke:#e3e8ef;stroke-width:12}
.arco{fill:none;stroke:[color_principal];stroke-width:12;stroke-linecap:round}
.txt{font-family:Arial,sans-serif;font-size:22px;font-weight:700;fill:#1b2433}
</style>
<circle class="base" cx="60" cy="60" r="40"/>
<circle class="arco" cx="60" cy="60" r="40" stroke-dasharray="[arco] 251.3"
  transform="rotate(-90 60 60)" onclick="alert('x')"/>
<text class="txt" x="60" y="68" text-anchor="middle">[etiqueta]</text>
</svg>`;
const LS='svgappsheet-v1';
let S={projects:{},p:null,d:null};
let D={clean:'',info:{dropped:new Set()},model:null,tags:[],flags:[]};
const dirty=new Set(),gone=new Set();
let lastVal=null,pending=null,saveT=0,saving=false,rbT=0;
const proj=()=>S.projects[S.p];
const cur=()=>proj().designs[S.d];
const nd=(name,code)=>({id:uid(),name,code:code||'',notes:'',rows:[],stash:{},updated:Date.now()});
const np=name=>({id:uid(),name,notes:'',palette:[],designs:{}});
const exampleRows=()=>[
  {id:uid(),kind:'var',target:'[color_principal]',type:'keep',value:'',sample:'#2f7d6d'},
  {id:uid(),kind:'var',target:'[arco]',type:'expr',value:'([Avance]/100)*251.3',sample:'170'},
  {id:uid(),kind:'var',target:'[etiqueta]',type:'var',value:'[Texto avance]',sample:'68%'}];
function seed(){
  const p=np('Mis diseños');const d=nd('Anillo de avance (ejemplo)',SAMPLE);d.rows=exampleRows();
  p.designs[d.id]=d;S.projects={[p.id]:p};S.p=p.id;S.d=d.id;
}
function loadLocal(){try{const j=JSON.parse(localStorage.getItem(LS)||'null');if(j&&j.projects&&Object.keys(j.projects).length&&j.projects[j.p]&&j.projects[j.p].designs[j.d]){S=j;return true;}}catch(e){}return false;}
function setStatus(t){$('#saveState').textContent=t;}
function toast(t){const e=$('#toast');e.textContent=t;e.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>e.hidden=true,2400);}
function scheduleSave(){setStatus('Sin guardar…');clearTimeout(saveT);saveT=setTimeout(persist,700);}
function touch(){S.touched=true;dirty.add(S.p);cur().updated=Date.now();scheduleSave();}
/* ----- Guardado: navegador + respaldo opcional en Google Sheets (Apps Script) ----- */
const CFG='svgappsheet-sync';
const getCfg=()=>{try{return JSON.parse(localStorage.getItem(CFG)||'{}');}catch(e){return {};}};
async function remote(payload){
  const c=getCfg();if(!c.url)return null;
  const r=await fetch(c.url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({token:c.token||''},payload))});
  const j=await r.json();if(!j.ok)throw new Error(j.error||'Error del servidor');return j;
}
async function persist(){
  if(saving){saveT=setTimeout(persist,400);return;}
  saving=true;
  try{localStorage.setItem(LS,JSON.stringify(S));}catch(e){}
  let where='en este navegador';
  if(getCfg().url){
    try{
      for(const id of [...dirty]){dirty.delete(id);const p=S.projects[id];if(p)await remote({action:'save',id,project:p});}
      for(const id of [...gone]){gone.delete(id);await remote({action:'delete',id});}
      where='en este navegador y en Google Sheets';
    }catch(e){where='solo en este navegador (Sheets no respondió: '+e.message+')';}
  }
  saving=false;setStatus('Guardado '+where);
}
async function pullRemote(){
  const c=getCfg();if(!c.url)return;
  setStatus('Cargando desde Sheets…');
  try{
    const j=await remote({action:'load'});
    const projects=j.projects||{};
    if(Object.keys(projects).length){
      const prev={p:S.p,d:S.d};
      for(const k in projects){projects[k].id=k;projects[k].designs=projects[k].designs||{};
        if(!Object.keys(projects[k].designs).length){const d=nd('Diseño 1','');projects[k].designs[d.id]=d;}}
      S.projects=projects;S.p=projects[prev.p]?prev.p:Object.keys(projects)[0];
      S.d=proj().designs[prev.d]?prev.d:Object.keys(proj().designs)[0];
      fullRender();setMode(cur().code?'view':'edit');
      try{localStorage.setItem(LS,JSON.stringify(S));}catch(e){}
      setStatus('Cargado desde Google Sheets');
    }else{Object.keys(S.projects).forEach(k=>dirty.add(k));await persist();}
  }catch(e){setStatus('No se pudo leer Sheets: '+e.message);$('#syncMsg').textContent='Error: '+e.message;}
}

/* ----- Render ----- */
const TYPES={keep:'—',text:'Texto',num:'Número',pct:'Porcentaje',hex:'Color HEX',expr:'Expresión AppSheet',var:'Otra variable'};
const ALLOWED={var:['keep','text','num','pct','hex','expr','var'],color:['keep','hex','expr','var'],frag:['expr','var','text','num','pct','hex','keep']};
const KEEPLBL={var:'Columna tal cual',color:'Sin cambio',frag:'Sin cambio'};
const PH={text:'Texto',num:'12.5',pct:'75%',hex:'#2f7d6d',expr:'IF([Estado]="OK","#1c7c54","#b4232c")',var:'[Otra columna]'};
const PRESET=[['Neutros',['#0f172a','#1e293b','#475569','#94a3b8','#cbd5e1','#f1f5f9','#ffffff','#000000']],
  ['Estado',['#16a34a','#22c55e','#eab308','#f97316','#ef4444','#dc2626','#0ea5e9','#3b82f6']],
  ['Acentos',['#6366f1','#8b5cf6','#d946ef','#ec4899','#14b8a6','#06b6d4','#84cc16','#f59e0b']]];
const norm=s=>s.replace(/\r\n?/g,'\n');

function renderHeader(){
  const ps=Object.values(S.projects);
  $('#selProj').innerHTML=ps.map(p=>'<option value="'+p.id+'"'+(p.id===S.p?' selected':'')+'>'+esc(p.name)+'</option>').join('');
  $('#nameProj').value=proj().name;
  $('#selDes').innerHTML=Object.values(proj().designs).map(d=>'<option value="'+d.id+'"'+(d.id===S.d?' selected':'')+'>'+esc(d.name)+'</option>').join('');
  $('#nameDes').value=cur().name;
}
function fullRender(){
  Object.values(S.projects).forEach(p=>{p.palette=p.palette||[];Object.values(p.designs).forEach(d=>{d.rows=d.rows||[];d.stash=d.stash||{};});});
  renderHeader();
  $('#src').value=cur().code;$('#notesP').value=proj().notes||'';$('#notesD').value=cur().notes||'';
  rebuild();renderNotesList();
}
function rebuild(){
  const d=cur();const c=cleanSvg(numberTags(d.code));
  D.clean=c.code;D.info=c.info;D.flags=flagRanges(d.code);D.tags=tagIndex(c.code);
  syncRows(d,c.code);renderTable();renderOutputs();renderClean();renderPalette();
}
function renderOutputs(){
  D.model=buildModel(cur(),D.clean);
  $('#canvas').innerHTML=D.model.html;
  const pv=D.model.prev.replace(/<(iframe|object|embed|foreignObject)[\s\S]*?<\/\1\s*>/gi,'');
  $('#preview').innerHTML=/<svg[\s>]/i.test(pv)?pv:'<div class="empty">Pega o sube un SVG para ver la imagen.</div>';
  renderCodeView();refreshUses();
  $('#cinfo').textContent=D.model.len+' caracteres · '+D.model.subs.length+' SUBSTITUTE'+(D.model.subs.length?' (los más largos se aplican primero)':'');
}
function renderCodeView(){
  const t=cur().code,n=t.length;
  const mk=new Int32Array(n).fill(-1),fl=new Uint8Array(n),marks=[];
  const place=(s,e,o)=>{for(let i=s;i<e;i++)if(mk[i]>=0)return;marks.push(o);for(let i=s;i<e;i++)mk[i]=marks.length-1;};
  cur().rows.filter(r=>r.kind==='frag'&&r.target).forEach(r=>{let i=-1;while((i=t.indexOf(r.target,i+1))>=0)place(i,i+r.target.length,{cls:'tk-frag',key:'f:'+r.id});});
  let m;const vr=varRe();while((m=vr.exec(t)))place(m.index,m.index+m[0].length,{cls:'tk-var',key:m[0]});
  const hr=hexRe();while((m=hr.exec(t)))place(m.index,m.index+m[0].length,{cls:'tk-col',key:m[0].toLowerCase(),color:m[0].toLowerCase()});
  D.flags.forEach(f=>{for(let i=f.s;i<f.e;i++)fl[i]=1;});
  const starts=[0];for(let i=0;i<n;i++)if(t[i]==='\n')starts.push(i+1);
  const lineCi=starts.map(()=>[]);const tr=new RegExp(TAG_RE.source,'g');let c=0,tm;
  while((tm=tr.exec(t))){let lo=0,hi=starts.length-1;while(lo<hi){const mid=(lo+hi+1)>>1;if(starts[mid]<=tm.index)lo=mid;else hi=mid-1;}lineCi[lo].push(c++);}
  let line=0,i=0;
  const open=()=>'<div class="ln"'+(lineCi[line].length?' data-ci=" '+lineCi[line].join(' ')+' "':'')+'>';
  let html=open();
  while(i<n){
    if(t[i]==='\n'){html+='</div>';line++;html+=open();i++;continue;}
    let j=i+1;while(j<n&&t[j]!=='\n'&&mk[j]===mk[i]&&fl[j]===fl[i])j++;
    const seg=esc(t.slice(i,j)),o=mk[i]>=0?marks[mk[i]]:null,f=fl[i];
    if(!o&&!f)html+=seg;
    else{const st=o&&o.color?' style="background:'+o.color+';color:'+ink(o.color)+'"':'';
      html+='<span class="'+(o?o.cls:'')+(f?' flg':'')+'"'+(o?' data-k="'+esc(o.key)+'"':'')+st+'>'+seg+'</span>';}
    i=j;
  }
  $('#codeView').innerHTML=html+'</div>';
}
function renderClean(){
  const i=D.info,p=[];
  if(i.blocks)p.push('CSS: '+i.blocks+' bloque(s) <style> convertido(s) a atributos');
  if(i.classes)p.push('class ×'+i.classes+' (aplicadas y quitadas)');
  if(i.inline)p.push('style en línea ×'+i.inline+' convertido(s)');
  if(i.scripts)p.push('JS: '+i.scripts+' script(s) eliminado(s)');
  if(i.handlers)p.push('JS: '+i.handlers+' evento(s) o enlace(s) eliminado(s)');
  if(i.dropped.size)p.push('Sin equivalente en atributos (omitido): '+[...i.dropped].join(', '));
  $('#clean').innerHTML=p.length?p.map(x=>'<span class="pill">'+esc(x)+'</span>').join(''):'<span class="pill ok">Sin CSS ni JS</span>';
}
function rowHtml(r){
  const key=r.kind==='frag'?'f:'+r.id:r.target;
  const tgt=r.kind==='frag'?'<input class="tgi" value="'+esc(r.target)+'" placeholder="Fragmento de código" aria-label="Fragmento a sustituir">'
    :'<span class="chip '+r.kind+'"'+(r.kind==='color'?' style="background:'+r.target+';color:'+ink(r.target)+'"':'')+'>'+esc(r.target)+'</span>';
  const opts=ALLOWED[r.kind].map(t=>'<option value="'+t+'"'+(t===r.type?' selected':'')+'>'+(t==='keep'?KEEPLBL[r.kind]:TYPES[t])+'</option>').join('');
  const dis=r.type==='keep',f=dis?{ok:true}:fmt(r.type,r.value),bad=!dis&&r.value&&!f.ok;
  const sm=!STATIC.includes(r.type)&&!(r.kind!=='var'&&r.type==='keep');
  return '<tr data-id="'+r.id+'" data-k="'+esc(key)+'"><td class="tg">'+tgt+'<span class="uses"></span></td>'
    +'<td><select class="ty" aria-label="Tipo de valor">'+opts+'</select></td>'
    +'<td><input class="vl'+(bad?' bad':'')+'" value="'+esc(r.value)+'" placeholder="'+esc(PH[r.type]||'')+'"'+(dis?' disabled':'')+' aria-label="Valor"></td>'
    +'<td><input class="sm" value="'+esc(r.sample)+'" placeholder="'+(r.kind==='var'?esc(inferSample(r.target)):'')+'"'+(sm?'':' disabled')+' aria-label="Muestra para la vista previa"></td>'
    +'<td>'+(r.kind==='frag'?'<button class="btn sm x" aria-label="Quitar sustitución">✕</button>':'')+'</td></tr>';
}
function renderTable(){
  const rows=cur().rows;
  $('#rows').innerHTML=rows.length?rows.map(rowHtml).join(''):'<tr><td colspan="5" class="empty">No hay variables ni colores. Escribe [nombre] en el código o agrega una sustitución.</td></tr>';
}
function refreshUses(){
  const plain=stripCi(D.clean);
  $$('#rows tr[data-id]').forEach(tr=>{
    const r=cur().rows.find(x=>x.id===tr.dataset.id);if(!r)return;
    const n=countIn(plain,r.target),u=tr.querySelector('.uses');
    u.textContent=n+(n===1?' coincidencia':' coincidencias');u.classList.toggle('zero',n===0&&r.kind==='frag');
  });
}
function renderPalette(){
  const p=proj(),d=cur(),used=new Set();
  d.rows.forEach(r=>{if(r.kind==='color')used.add(r.target);if(r.type==='hex'){const f=fmt('hex',r.value);if(f.ok)used.add(f.s);}});
  const grp=(title,arr,mode)=>'<div class="palgrp"><h3>'+title+'</h3><div class="sws">'+(arr.length?arr.map(h=>
    '<span class="swb"><button class="sw" data-hex="'+h+'" style="background:'+h+'" title="'+h+'" aria-label="'+h+'"></button>'
    +(mode==='rm'?'<button class="swx" data-rm="'+h+'" aria-label="Quitar '+h+'">×</button>':mode==='add'?'<button class="swx" data-add="'+h+'" aria-label="Agregar '+h+' al proyecto">+</button>':'')
    +'</span>').join(''):'<span class="hexl">Vacía</span>')+'</div></div>';
  $('#panePal').innerHTML=grp('Colores de este diseño (+ los guarda en el proyecto)',[...used],'add')
    +grp('Paleta del proyecto, para homologar diseños',p.palette,'rm')+PRESET.map(([n,a])=>grp(n,a,'')).join('')
    +'<div class="addc"><input type="color" id="pickc" value="#2b4fd8" aria-label="Elegir color"><input type="text" id="hexin" placeholder="#2b4fd8" aria-label="Código HEX"><button class="btn sm" id="addPal">Agregar al proyecto</button><span class="hexl">Clic en un color: se aplica al campo de valor activo o se copia.</span></div>';
}
function renderNotesList(){
  $('#dlist').innerHTML=Object.values(proj().designs).map(d=>'<button data-d="'+d.id+'"'+(d.id===S.d?' aria-current="true"':'')+'>'+esc(d.name)+'</button>').join('');
}

/* ----- Resaltado cruzado ----- */
let hk=null,hci=null;
function setKey(k){
  if(k===hk)return;hk=k;
  $$('.hk,.hk-row').forEach(e=>e.classList.remove('hk','hk-row'));$$('.pv-hl').forEach(e=>e.classList.remove('pv-hl'));
  if(!k)return;
  $$('[data-k]').forEach(e=>{if(e.dataset.k===k)e.classList.add(e.tagName==='TR'?'hk-row':'hk');});
  let t=k;if(k.startsWith('f:')){const r=cur().rows.find(x=>'f:'+x.id===k);t=r?r.target:'';}
  if(!t)return;
  D.tags.forEach(g=>{if(g.txt.includes(t)){const el=$('#preview [data-ci="'+g.ci+'"]');if(el)el.classList.add('pv-hl');}});
}
function setCi(ci){
  if(ci===hci)return;hci=ci;
  $$('.ln.hl-line').forEach(e=>e.classList.remove('hl-line'));
  if(ci!==null)$$('.ln[data-ci]').forEach(l=>{if(l.dataset.ci.includes(' '+ci+' '))l.classList.add('hl-line');});
}
document.addEventListener('mouseover',e=>{
  const k=e.target.closest&&e.target.closest('[data-k]');setKey(k?k.dataset.k:null);
  const p=e.target.closest&&e.target.closest('#preview [data-ci]');setCi(p?p.dataset.ci:null);
});

/* ----- Acciones ----- */
function setMode(m){
  const ed=m==='edit';$('#src').hidden=!ed;$('#codeView').hidden=ed;
  $('#mEdit').setAttribute('aria-pressed',ed);$('#mView').setAttribute('aria-pressed',!ed);
  if(ed){$('#src').value=cur().code;$('#src').focus();}
}
function commitCode(v){cur().code=norm(v);rebuild();touch();}
async function copyText(t){
  try{await navigator.clipboard.writeText(t);return true;}catch(e){}
  const ta=document.createElement('textarea');ta.value=t;ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.select();
  let ok=false;try{ok=document.execCommand('copy');}catch(e){}ta.remove();return ok;
}
function addFrag(t){
  const rows=cur().rows,ex=rows.find(r=>r.target===t);
  let id;
  if(ex)id=ex.id;
  else{const r={id:uid(),kind:'frag',target:t,type:'expr',value:'',sample:''};rows.push(r);id=r.id;renderTable();renderOutputs();touch();}
  const tr=$('#rows tr[data-id="'+id+'"]');
  if(tr){tr.scrollIntoView({block:'nearest'});const i=tr.querySelector('.vl:not(:disabled)')||tr.querySelector('.ty');if(i)i.focus();}
  getSelection().removeAllRanges();$('#chip').hidden=true;
}
function useHex(h){
  const r=lastVal&&cur().rows.find(x=>x.id===lastVal);
  if(r){
    if(!['hex','text','expr'].includes(r.type))r.type='hex';
    r.value=r.type==='expr'?'"'+h+'"':h;
    renderTable();renderOutputs();touch();toast('Aplicado '+h);
  }else copyText(h).then(ok=>toast(ok?'Copiado '+h:h));
}
function pickFrag(){
  const ta=$('#src');let t='';
  if(!ta.hidden&&ta.selectionEnd>ta.selectionStart)t=ta.value.slice(ta.selectionStart,ta.selectionEnd);
  else{
    const s=getSelection();if(!s||s.isCollapsed||!s.anchorNode)return null;
    const n=s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentElement;
    const host=n&&n.closest('#codeView,#canvas');if(!host)return null;
    t=s.toString();if(host.id==='canvas')t=t.replace(/""/g,'"');
  }
  if(!t||/\n/.test(t)||t.length>200)return null;
  const plain=stripCi(D.clean);
  return [t,t.trim(),t.replace(/^"+|"+$/g,'').trim()].find(c=>c&&plain.includes(c))||null;
}
let armed=null;
function arm(btn,label,fn){
  if(armed&&armed.btn===btn){clearTimeout(armed.t);btn.textContent=armed.label;armed=null;fn();return;}
  if(armed){clearTimeout(armed.t);armed.btn.textContent=armed.label;}
  armed={btn,label:btn.textContent,t:setTimeout(()=>{btn.textContent=armed.label;armed=null;},3000)};btn.textContent='¿Seguro?';
}
function pickDesign(id){S.d=id;fullRender();setMode(cur().code?'view':'edit');try{localStorage.setItem(LS,JSON.stringify(S));}catch(e){}}

/* ----- Eventos ----- */
$('#selProj').onchange=e=>{S.p=e.target.value;S.d=Object.keys(proj().designs)[0];fullRender();setMode(cur().code?'view':'edit');try{localStorage.setItem(LS,JSON.stringify(S));}catch(x){}};
$('#selDes').onchange=e=>pickDesign(e.target.value);
$('#dlist').onclick=e=>{const b=e.target.closest('[data-d]');if(b)pickDesign(b.dataset.d);};
$('#nameProj').oninput=e=>{proj().name=e.target.value;$('#selProj').selectedOptions[0].textContent=e.target.value||'Sin nombre';touch();};
$('#nameDes').oninput=e=>{cur().name=e.target.value;$('#selDes').selectedOptions[0].textContent=e.target.value||'Sin nombre';renderNotesList();touch();};
$('#addProj').onclick=()=>{
  const p=np('Proyecto '+(Object.keys(S.projects).length+1)),d=nd('Diseño 1','');p.designs[d.id]=d;
  S.projects[p.id]=p;S.p=p.id;S.d=d.id;dirty.add(p.id);fullRender();setMode('edit');touch();
};
$('#delProj').onclick=e=>arm(e.target,'Eliminar',()=>{
  const id=S.p;delete S.projects[id];dirty.delete(id);gone.add(id);
  if(!Object.keys(S.projects).length){const p=np('Mis diseños'),d=nd('Diseño 1','');p.designs[d.id]=d;S.projects[p.id]=p;dirty.add(p.id);}
  S.p=Object.keys(S.projects)[0];S.d=Object.keys(proj().designs)[0];fullRender();setMode(cur().code?'view':'edit');touch();
});
$('#addDes').onclick=()=>{const d=nd('Diseño '+(Object.keys(proj().designs).length+1),'');proj().designs[d.id]=d;S.d=d.id;fullRender();setMode('edit');touch();};
$('#dupDes').onclick=()=>{
  const c=JSON.parse(JSON.stringify(cur()));c.id=uid();c.name+=' (copia)';proj().designs[c.id]=c;S.d=c.id;fullRender();touch();toast('Diseño duplicado');
};
$('#delDes').onclick=e=>arm(e.target,'Eliminar',()=>{
  delete proj().designs[S.d];
  if(!Object.keys(proj().designs).length){const d=nd('Diseño 1','');proj().designs[d.id]=d;}
  S.d=Object.keys(proj().designs)[0];fullRender();setMode(cur().code?'view':'edit');touch();
});
$('#mEdit').onclick=()=>setMode('edit');$('#mView').onclick=()=>setMode('view');
$('#src').addEventListener('input',e=>{clearTimeout(rbT);const v=e.target.value;rbT=setTimeout(()=>commitCode(v),200);});
$('#src').addEventListener('paste',e=>{const was=!e.target.value.trim();setTimeout(()=>{if(was){commitCode(e.target.value);setMode('view');}},50);});
$('#upl').onclick=()=>$('#file').click();
$('#file').onchange=e=>{
  const f=e.target.files[0];if(!f)return;const rd=new FileReader();
  rd.onload=()=>{const d=cur();if(/^Diseño \d+$/.test(d.name)){d.name=f.name.replace(/\.[^.]+$/,'');renderHeader();renderNotesList();}
    $('#src').value=norm(String(rd.result));commitCode(rd.result);setMode('view');toast('Archivo cargado');};
  rd.readAsText(f);e.target.value='';
};
$('#exm').onclick=()=>{const d=nd('Anillo de avance (ejemplo)',SAMPLE);d.rows=exampleRows();proj().designs[d.id]=d;S.d=d.id;fullRender();setMode('view');touch();};
$('#addRow').onclick=()=>{
  const r={id:uid(),kind:'frag',target:'',type:'expr',value:'',sample:''};cur().rows.push(r);renderTable();
  const i=$('#rows tr[data-id="'+r.id+'"] .tgi');if(i)i.focus();
};
$('#copy').onclick=async()=>{
  if(await copyText(D.model.text))toast('Expresión copiada. Pégala en AppSheet.');
  else{const g=document.createRange();g.selectNodeContents($('#canvas'));const s=getSelection();s.removeAllRanges();s.addRange(g);toast('Texto seleccionado: presiona Ctrl+C');}
};
$('#dl').onclick=()=>{
  const blob=new Blob([D.model.text],{type:'text/plain;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=(cur().name||'diseno').replace(/[^\w\-]+/g,'_')+'.txt';
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Archivo descargado');
};
$('#syncBtn').onclick=()=>{const c=getCfg();$('#syncUrl').value=c.url||'';$('#syncTok').value=c.token||'';$('#syncBox').hidden=!$('#syncBox').hidden;};
$('#syncClose').onclick=()=>$('#syncBox').hidden=true;
$('#syncSave').onclick=async()=>{
  const url=$('#syncUrl').value.trim();
  if(!/^https:\/\/script\.google\.com\//.test(url))return $('#syncMsg').textContent='La URL debe comenzar con https://script.google.com/';
  try{localStorage.setItem(CFG,JSON.stringify({url,token:$('#syncTok').value.trim()}));}catch(e){}
  $('#syncMsg').textContent='Conectando…';await pullRemote();
  if(/^Cargado|^Guardado/.test($('#saveState').textContent))$('#syncMsg').textContent='Conectado.';
};
$('#syncOff').onclick=()=>{try{localStorage.removeItem(CFG);}catch(e){}$('#syncMsg').textContent='Sincronización desactivada.';setStatus('Guardado en este navegador');};
const rowOf=el=>{const tr=el.closest('tr[data-id]');return tr&&cur().rows.find(x=>x.id===tr.dataset.id);};
const rowsEl=$('#rows');
rowsEl.addEventListener('change',e=>{
  if(!e.target.classList.contains('ty'))return;const r=rowOf(e.target);if(!r)return;
  r.type=e.target.value;renderTable();renderOutputs();touch();renderPalette();
});
rowsEl.addEventListener('input',e=>{
  const r=rowOf(e.target);if(!r)return;const c=e.target.classList;
  if(c.contains('vl')){r.value=e.target.value;const f=fmt(r.type,r.value);e.target.classList.toggle('bad',!!r.value&&!f.ok);}
  else if(c.contains('sm'))r.sample=e.target.value;
  else if(c.contains('tgi'))r.target=e.target.value;
  else return;
  renderOutputs();touch();
});
rowsEl.addEventListener('focusin',e=>{if(e.target.classList.contains('vl')){const r=rowOf(e.target);lastVal=r?r.id:null;}});
rowsEl.addEventListener('click',e=>{
  if(!e.target.classList.contains('x'))return;const r=rowOf(e.target);if(!r)return;
  cur().rows=cur().rows.filter(x=>x!==r);setKey(null);renderTable();renderOutputs();touch();
});
$('#panePal').addEventListener('click',e=>{
  const t=e.target;
  if(t.dataset.hex)return useHex(t.dataset.hex);
  if(t.dataset.rm){proj().palette=proj().palette.filter(h=>h!==t.dataset.rm);renderPalette();return touch();}
  if(t.dataset.add||t.id==='addPal'){
    let h=t.dataset.add||($('#hexin').value.trim()||$('#pickc').value);
    const f=fmt('hex',h);if(!f.ok)return toast('Código HEX no válido');
    if(!proj().palette.includes(f.s))proj().palette.push(f.s);renderPalette();touch();toast('Agregado a la paleta del proyecto');
  }
});
$('#panePal').addEventListener('input',e=>{if(e.target.id==='pickc')$('#hexin').value=e.target.value;});
$('#tabPal').onclick=()=>{$('#panePal').hidden=false;$('#paneNot').hidden=true;$('#tabPal').setAttribute('aria-selected',true);$('#tabNot').setAttribute('aria-selected',false);};
$('#tabNot').onclick=()=>{$('#panePal').hidden=true;$('#paneNot').hidden=false;$('#tabPal').setAttribute('aria-selected',false);$('#tabNot').setAttribute('aria-selected',true);};
$('#notesP').oninput=e=>{proj().notes=e.target.value;touch();};
$('#notesD').oninput=e=>{cur().notes=e.target.value;touch();};
$('#chip').addEventListener('mousedown',e=>e.preventDefault());
$('#chip').onclick=()=>{if(pending)addFrag(pending);};
document.addEventListener('mouseup',e=>{
  if(e.target.closest&&e.target.closest('#chip'))return;
  setTimeout(()=>{
    const c=pickFrag(),chip=$('#chip');
    if(!c){chip.hidden=true;return;}
    pending=c;chip.textContent='Sustituir «'+(c.length>26?c.slice(0,26)+'…':c)+'»';
    chip.style.left=Math.max(8,Math.min(e.clientX+8,innerWidth-240))+'px';chip.style.top=Math.min(e.clientY+14,innerHeight-40)+'px';chip.hidden=false;
  },0);
});
document.addEventListener('scroll',()=>{$('#chip').hidden=true;},true);

/* ----- Inicio ----- */
if(!loadLocal())seed();
fullRender();setMode(cur().code?'view':'edit');setStatus('Listo');
pullRemote();
