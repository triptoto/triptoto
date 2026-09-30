"""Verify changing languages in place, without a page refresh."""
import json

root=AUDIT_OUTPUT/'i18n-regression';root.mkdir(parents=True,exist_ok=True)
b.nav('/privacy.html')
for lang in ('en','de','fr','es','ru','en','ru'):
 b.js('TriptoI18n.setLocale('+json.dumps(lang)+')')
 b.js('TriptoI18n.ready()')
 result=b.js('''(()=>({lang:document.documentElement.lang,selector:document.querySelector('.legal-language')?.value,heading:document.querySelector('h1')?.innerText,title:document.title}))()''')
 (root/f'legal-switch-{lang}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
 assert result['lang']==result['selector']==lang, result
 assert bool(result['heading']),result
 print('legal',lang,result,flush=True)
b.nav('/currency?preview=1')
b.js('TriptoMobileApp.reload()')
for lang in ('en','de','fr','es','ru'):
 b.js('TriptoI18n.setLocale('+json.dumps(lang)+')')
 b.js('TriptoMobileApp.show("currency",null,true)')
 b.js('TriptoI18n.ready()')
 result=b.js('''(()=>({lang:document.documentElement.lang,hero:document.querySelector('.currency-hero p')?.innerText,amount:document.querySelector('.currency-amount .sr-only')?.innerText,rate:document.querySelector('.currency-status')?.innerText}))()''')
 assert '0 trip' not in result['hero'].lower() and '0 reis' not in result['hero'].lower() and '0 voyage' not in result['hero'].lower() and '0 поезд' not in result['hero'].lower(), result
 assert result['lang']==lang,result
 (root/f'currency-{lang}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
 print('currency',lang,result,flush=True)
