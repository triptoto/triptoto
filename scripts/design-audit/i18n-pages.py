"""Local-only screenshot and translation matrix for all routed Tripto screens."""
from pathlib import Path
import json, sys, time

root = AUDIT_OUTPUT / 'i18n-pages'
root.mkdir(parents=True, exist_ok=True)
source = json.loads((REPO / 'public/lang/source-map.json').read_text())
bundles = {lang: json.loads((REPO / f'public/lang/{lang}.json').read_text())['messages'] for lang in ('en','de','fr','es','ru')}
routes = [
 ('welcome','/home'),('trips','/trips'),('timeline','/timeline'),('add-trip','/add'),
 ('add-booking','/bookings/add'),('day-plan','/day-plan'),('save-later','/save-later'),
 ('bookings','/bookings'),('flight','/flights/flight'),('hotel','/hotels/stay'),
 ('train','/trains/train'),('activity','/plans/activity'),('documents','/documents'),
 ('ready','/ready-offline'),('health','/trip-health'),('account','/account'),
 ('subscription','/subscription'),('map','/trip-map'),('weather','/weather'),
 ('currency','/currency'),('options','/trip-options'),('checklist','/before-you-go'),
 ('help','/help'),('travelers','/travelers'),('traveler','/travelers/traveler'),
 ('import','/bookings/import'),('import-review','/bookings/import/review'),
 ('import-history','/bookings/import/history'),('email','/bookings/email-inbox'),
 ('sync','/pending-changes'),('collaboration','/collaboration'),('join','/join/sample'),
 ('trip-form','/trips/new'),('traveler-form','/travelers/new'),
 ('checklist-form','/before-you-go/new'),('neighborhood-form','/collections/new/neighborhood'),
 ('museum-form','/day-plan/new/museum_culture'),
]
routes += [('booking-'+kind,'/bookings/new/'+kind) for kind in
 ('flight','hotel','train','ferry','bus','cruise','car-rental','transfer','taxi','parking',
  'restaurant','tour','activity','attraction','event','insurance','other','reservation','document')]
routes += [('plan-'+kind,'/day-plan/new/'+kind) for kind in
 ('attraction','food_drink','museum_culture','idea')]
start=int(sys.argv[4]) if len(sys.argv)>4 else 0
end=int(sys.argv[5]) if len(sys.argv)>5 else len(routes)
results=[]
def open_route(path):
 b.cmd('Page.navigate',{'url':BASE_URL+path+'?preview=1'})
 for _ in range(60):
  time.sleep(.1)
  if b.js('Boolean(window.TriptoMobileApp)'): break
 else: raise RuntimeError('App did not initialize: '+path)
 # The local static server has no account API; explicitly load its safe preview
 # fixture and reject a loading screen instead of treating it as audit evidence.
 b.js('TriptoMobileApp.reload()')
 if b.js('TriptoMobileApp.getState().loading'): raise RuntimeError('Still loading: '+path)
for name,path in routes[start:end]:
 try:
  open_route(path)
  base=b.js('({screen:TriptoMobileApp.getState().screen,id:TriptoMobileApp.getState().selectedId})')
  for lang in bundles:
   b.js('TriptoI18n.setLocale('+json.dumps(lang)+')')
   b.js('TriptoMobileApp.show('+json.dumps(base['screen'])+','+json.dumps(base['id'])+',true)')
   b.js('TriptoI18n.ready()')
   time.sleep(.06)
   state=b.inspect()
   visible=b.js('''(()=>{const out=[];const walk=document.createTreeWalker(document.querySelector('#app'),NodeFilter.SHOW_TEXT);while(walk.nextNode()){const n=walk.currentNode,e=n.parentElement;if(e&&e.getClientRects().length&&n.nodeValue.trim())out.push(n.nodeValue.trim())}return {text:out,attrs:[...document.querySelectorAll('#app [aria-label],#app [placeholder],#app [title]')].filter(e=>e.getClientRects().length).flatMap(e=>['aria-label','placeholder','title'].map(a=>e.getAttribute(a)).filter(Boolean))}})()''')
   misses=[]
   if lang!='en':
    for phrase in visible['text']+visible['attrs']:
     key=source.get(phrase)
     if key and bundles[lang].get(key,phrase)!=phrase: misses.append(phrase)
   errors=[]
   if state['overflow']: errors.append('horizontal document overflow')
   if b.js('document.documentElement.lang') != lang: errors.append('wrong document language')
   if state['screen']!=base['screen']: errors.append('unexpected route '+str(state['screen']))
   image=f'{name}-{lang}.png'; b.screenshot(root/image)
   scrolled=b.js('''(()=>{const e=document.querySelector('main');if(!e||e.scrollHeight<=e.clientHeight+10)return false;e.scrollTop=e.scrollHeight;return true})()''')
   if scrolled:b.screenshot(root/f'{name}-{lang}-bottom.png')
   result={'route':name,'path':path,'screen':state['screen'],'locale':lang,'image':image,
           'missingTranslations':sorted(set(misses)),'errors':errors,'text':state['text'][:12000],
           'buttons':state['buttons'],'dialogCount':len(state['dialogs']),'bottomImage':f'{name}-{lang}-bottom.png' if scrolled else None}
   (root/f'{name}-{lang}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
   results.append({k:result[k] for k in ('route','locale','image','missingTranslations','errors')})
   print(name,lang,'leaks='+str(len(misses)),'errors='+str(errors),flush=True)
 except Exception as ex:
  (root/f'{name}-error.txt').write_text(str(ex))
  print(name,'ERROR',str(ex)[:250],flush=True)
  results.append({'route':name,'error':str(ex)})
(root/f'matrix-{start}-{end}.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
