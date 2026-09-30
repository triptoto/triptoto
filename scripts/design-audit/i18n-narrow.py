"""Check long-language screens at a compact 320px phone width."""
import json

root=AUDIT_OUTPUT/'i18n-narrow';root.mkdir(parents=True,exist_ok=True)
routes={
 'trips':'/trips','timeline':'/timeline','add-trip':'/add','booking-form':'/bookings/new/ferry',
 'plan-form':'/day-plan/new/museum_culture','trip-options':'/trip-options','account':'/account',
 'weather':'/weather','currency':'/currency','help':'/help','travelers':'/travelers',
 'checklist':'/before-you-go','collaboration':'/collaboration','documents':'/documents',
 'day-plan':'/day-plan','save-later':'/save-later',
}
for name,path in routes.items():
 for lang in ('en','de','fr','es','ru'):
  try:
   b.nav(path+'?preview=1');b.js('TriptoMobileApp.reload()')
   screen=b.js('TriptoMobileApp.getState().screen')
   b.js('TriptoI18n.setLocale('+json.dumps(lang)+')')
   b.js('TriptoMobileApp.show('+json.dumps(screen)+',TriptoMobileApp.getState().selectedId,true)')
   b.js('TriptoI18n.ready()')
   result=b.inspect()
   result['locale']=lang;result['screen']=screen
   result['wideElements']=b.js('''(()=>[...document.querySelectorAll('main *')].filter(e=>e.getClientRects().length&&e.scrollWidth>e.clientWidth+3&&getComputedStyle(e).overflowX==='visible').slice(0,15).map(e=>({tag:e.tagName,cls:e.className,text:e.innerText?.slice(0,90),width:e.clientWidth,scroll:e.scrollWidth})))()''')
   b.screenshot(root/f'{name}-{lang}.png')
   (root/f'{name}-{lang}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
   print(name,lang,'overflow',result['overflow'],'wide',len(result['wideElements']),flush=True)
  except Exception as exc:
   (root/f'{name}-{lang}-error.txt').write_text(str(exc))
   print(name,lang,'ERROR',str(exc)[:150],flush=True)
