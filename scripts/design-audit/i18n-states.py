"""Rendered preview-state and popup coverage across every supported language."""
from pathlib import Path
import json, sys, time

fixture=(SUITE_DIR/'fixture.js').read_text()
states=[
 ('collection','collection','audit-neighborhood','',()),
 ('collection-stop','collection-stop','audit-neighborhood::audit-stop-2','',()),
 ('collection-form','collection-form',None,'',()),
 ('stop-form','stop-form',None,'',()),
 ('add-to-plan','add-to-plan',None,'',()),
 ('subscription','subscription',None,'',()),
 ('import-review','import-review','audit-import','s.importReview={candidates:[{id:"audit-candidate",type:"hotel",confidence:0.95,payload:{propertyName:"Hotel from QA fixture",checkInDate:s.trip.starts_on,checkOutDate:s.trip.ends_on,address:"Preview address",confirmationNumber:"QA-123"}}]};',()),
 ('stop-menu','collection','audit-neighborhood','',('longpress:[data-longpress-stop][data-id="audit-stop-2"]',)),
 ('stop-delete','collection','audit-neighborhood','',('longpress:[data-longpress-stop][data-id="audit-stop-2"]','[data-action="delete-stop"]')),
 ('idea-menu','save-later',None,'',('[data-action="open-idea"]',)),
 ('idea-day','save-later',None,'',('[data-action="open-idea"]','[data-action="idea-add-to-plan"]')),
 ('booking-menu','timeline',None,'',('longpress:[data-longpress-booking]',)),
 ('booking-move','timeline',None,'',('longpress:[data-longpress-booking]','[data-action="move-booking"]')),
 ('booking-delete','timeline',None,'',('longpress:[data-longpress-booking]','[data-action="delete-booking"]')),
 ('switch-trip','account',None,'',('[data-action="switch-trip"]',)),
 ('help-sheet','account',None,'',('[data-action="open-help"]',)),
 ('tour-sheet','account',None,'',('[data-action="open-first-run-how"]',)),
 ('notifications','timeline',None,'',('[data-action="open-navigation"]','[data-action="open-notifications"]')),
 ('currency-picker','currency',None,'',('[data-action="open-currency-picker"]',)),
 ('share-sheet','collaboration',None,'',('[data-action="open-share"]',)),
 ('member-sheet','collaboration',None,'',('[data-action="open-member-actions"]',)),
 ('delete-document','documents',None,'',('[data-action="remove-document"]',)),
 ('delete-import','import-history',None,'',('[data-action="remove-import"]',)),
 ('remove-local','account',None,'',('[data-action="remove-local-data"]',)),
 ('delete-account','account',None,'',('[data-action="delete-account"]',)),
 ('date-range','form','trip','',('[data-action="open-date-range"]',)),
 ('driver','hotel','stay','',('[data-action="show-driver"]',)),
 ('email-trip','booking-email-inbox',None,'',('[data-action="choose-booking-email-trip"]',)),
]
start=int(sys.argv[4]) if len(sys.argv)>4 else 0
end=int(sys.argv[5]) if len(sys.argv)>5 else len(states)
root=AUDIT_OUTPUT/'i18n-states';root.mkdir(parents=True,exist_ok=True)
for name,screen,id,setup,clicks in states[start:end]:
 for lang in ('en','de','fr','es','ru'):
  try:
   b.nav();b.js(fixture)
   if setup:b.js('(()=>{const s=TriptoMobileApp.getState();'+setup+'})()')
   b.js('TriptoI18n.setLocale('+json.dumps(lang)+')')
   b.js('TriptoMobileApp.show('+json.dumps(screen)+','+json.dumps(id)+',true)')
   b.js('TriptoI18n.ready()')
   for click in clicks:b.click(click)
   time.sleep(.07)
   result=b.inspect()
   result['locale']=lang;result['requestedScreen']=screen;result['clicks']=clicks
   result['documentLang']=b.js('document.documentElement.lang')
   result['visibleText']=b.js('''(()=>{const out=[];const w=document.createTreeWalker(document.querySelector('#app'),NodeFilter.SHOW_TEXT);while(w.nextNode()){const n=w.currentNode;if(n.parentElement?.getClientRects().length&&n.nodeValue.trim())out.push(n.nodeValue.trim())}return out})()''')
   result['errors']=[]
   if result['documentLang']!=lang:result['errors'].append('document lang mismatch')
   if result['overflow']:result['errors'].append('horizontal overflow')
   if result['screen']!=('add-to-plan' if name=='idea-day' else screen):result['errors'].append('screen mismatch')
   if clicks and not result['dialogs'] and name not in ('driver','idea-day','delete-account'):result['errors'].append('popup did not open')
   if name=='delete-account':result['previewLimit']='Account deletion requires a real authenticated API; preview intentionally refuses it.'
   b.screenshot(root/f'{name}-{lang}.png')
   (root/f'{name}-{lang}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
   print(name,lang,result['errors'],flush=True)
  except Exception as exc:
   (root/f'{name}-{lang}-error.txt').write_text(str(exc))
   print(name,lang,'ERROR',str(exc)[:150],flush=True)
