"""Measure rendered typography across the existing route and popup matrices."""
import json
import sys
import time

from browser import AUDIT_OUTPUT, REPO, SUITE_DIR, Browser

scope = {'AUDIT_OUTPUT': AUDIT_OUTPUT, 'REPO': REPO, 'SUITE_DIR': SUITE_DIR, 'sys': sys, 'json': json, 'Path': __import__('pathlib').Path}
exec((SUITE_DIR / 'i18n-pages.py').read_text().split('start=int(sys.argv[4])')[0], scope)
routes = scope['routes']
exec((SUITE_DIR / 'i18n-states.py').read_text().split('start=int(sys.argv[4])')[0], scope)
states = scope['states']
fixture = scope['fixture']
out = AUDIT_OUTPUT / 'font-audit.json'
out.parent.mkdir(parents=True, exist_ok=True)
js_metrics = r'''(()=>{
 const root=document.querySelector('#app')||document.body;
 const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 const items=[];
 while(w.nextNode()){
  const n=w.currentNode,e=n.parentElement,t=n.nodeValue.trim();
  if(!e||!t||!e.getClientRects().length)continue;
  const s=getComputedStyle(e),r=e.getBoundingClientRect();
  if(r.width<1||r.height<1)continue;
  const size=parseFloat(s.fontSize),lh=parseFloat(s.lineHeight);
  if(size<12||(!Number.isNaN(lh)&&lh<size*1.12)||e.scrollWidth>e.clientWidth+3||e.scrollHeight>e.clientHeight+3){
   items.push({text:t.slice(0,90),tag:e.tagName,cls:String(e.className).slice(0,100),size,lh,
    scroll:[e.scrollWidth,e.scrollHeight],client:[e.clientWidth,e.clientHeight],rect:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]});
  }
 }
 const smallInputs=[...document.querySelectorAll('input,textarea,select')].filter(e=>e.getClientRects().length&&parseFloat(getComputedStyle(e).fontSize)<16).map(e=>({tag:e.tagName,cls:String(e.className),size:getComputedStyle(e).fontSize}));
 return {items,smallInputs,overflow:document.documentElement.scrollWidth>innerWidth};
})()'''
b=Browser(); b.viewport(390,844)
results=[]
try:
 for name,path in routes:
  try:
   b.nav(path+'?preview=1')
   base=b.js('({screen:TriptoMobileApp.getState().screen,id:TriptoMobileApp.getState().selectedId})')
   for lang in ('en','de','fr','es','ru'):
    b.js('TriptoI18n.setLocale('+json.dumps(lang)+')')
    b.js('TriptoMobileApp.show('+json.dumps(base['screen'])+','+json.dumps(base['id'])+',true)')
    b.js('TriptoI18n.ready()'); time.sleep(.04)
    results.append({'case':name,'lang':lang,'screen':base['screen'],'metrics':b.js(js_metrics)})
   print('route',name,flush=True)
  except Exception as ex:results.append({'case':name,'error':str(ex)})
 for name,screen,id,setup,clicks in states:
  for lang in ('en','de','fr','es','ru'):
   try:
    b.nav();b.js(fixture)
    if setup:b.js('(()=>{const s=TriptoMobileApp.getState();'+setup+'})()')
    b.js('TriptoI18n.setLocale('+json.dumps(lang)+')')
    b.js('TriptoMobileApp.show('+json.dumps(screen)+','+json.dumps(id)+',true)')
    b.js('TriptoI18n.ready()')
    for click in clicks:b.click(click)
    results.append({'case':name,'lang':lang,'screen':screen,'metrics':b.js(js_metrics)})
   except Exception as ex:results.append({'case':name,'lang':lang,'error':str(ex)})
  print('state',name,flush=True)
finally:
 out.write_text(json.dumps(results,ensure_ascii=False,indent=2))
 b.cmd('Target.closeTarget',{'targetId':b.target});b.ws.close()
 print('saved',out,flush=True)
