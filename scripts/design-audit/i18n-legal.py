"""Audit all public legal/contact documents with locale switching."""
import json, time

root=AUDIT_OUTPUT/'i18n-legal';root.mkdir(parents=True,exist_ok=True)
for page in ('privacy','terms','cookies','contact','landing'):
 for lang in ('en','de','fr','es','ru'):
  try:
   b.nav('/'+page+'.html')
   b.js('TriptoI18n.setLocale('+json.dumps(lang)+')')
   b.js('TriptoI18n.ready()')
   time.sleep(.1)
   result=b.js('''(()=>({lang:document.documentElement.lang,title:document.title,text:document.body.innerText,overflow:document.documentElement.scrollWidth>innerWidth,links:[...document.querySelectorAll('a')].map(a=>({text:a.innerText,href:a.getAttribute('href')}))}))()''')
   b.screenshot(root/f'{page}-{lang}.png')
   if page != 'landing':
    b.js('document.documentElement.style.scrollBehavior="auto";window.scrollTo(0,document.documentElement.scrollHeight)')
    b.screenshot(root/f'{page}-{lang}-bottom.png')
   (root/f'{page}-{lang}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
   print(page,lang,result['lang'],'overflow',result['overflow'],flush=True)
  except Exception as exc:
   (root/f'{page}-{lang}-error.txt').write_text(str(exc))
   print(page,lang,'ERROR',str(exc)[:180],flush=True)
