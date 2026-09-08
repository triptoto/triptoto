from PIL import Image,ImageDraw
root=(AUDIT_OUTPUT/'matrix');root.mkdir(parents=True,exist_ok=True)
fixture=(SUITE_DIR/'fixture.js').read_text()
cases=[('welcome','/home',None,[]),('trips','/trips',None,[]),('trip-form','/trips/new',None,[]),('flight-form','/bookings/new/flight',None,[]),('flight','/flights/flight',None,[]),('collection','/timeline',('collection','audit-neighborhood'),[]),('stop-menu','/timeline',('collection','audit-neighborhood'),['[data-action="stop-menu"][data-id="audit-stop-2"]']),('stop-form','/timeline',('collection','audit-neighborhood'),['[data-action="collection-add-place"]']),('collab','/timeline',('collaboration',None),[]),('share','/timeline',('collaboration',None),['[data-action="open-share"]']),('confirm','/timeline',('collection','audit-neighborhood'),['[data-action="delete-collection"]']),('calendar','/trips/new',None,['[data-action="open-date-range"]']),('ready','/ready-offline',None,[]),('missing','/timeline',('plan','missing'),[])]
viewports=[(320,568),(360,740),(430,932),(768,1024),(1024,768),(844,390)]
start=int(sys.argv[4]) if len(sys.argv)>4 else 0;end=int(sys.argv[5]) if len(sys.argv)>5 else len(viewports)
allresults=[]
for w,h in viewports[start:end]:
 b.viewport(w,h);records=[]
 for name,path,state,clicks in cases:
  key=f'{w}x{h}-{name}'
  try:
   b.nav(path+'?preview=1')
   if state:b.js(fixture);b.js('TriptoMobileApp.show('+json.dumps(state[0])+','+json.dumps(state[1])+',true)');time.sleep(.2)
   for sel in clicks:b.click(sel)
   data=b.inspect();data['viewport']=[w,h]
   data['geometry']=b.js('''(()=>{const rect=e=>e?.getBoundingClientRect().toJSON();const hero=document.querySelector('.collab-hero');return {header:rect(document.querySelector('.screen>header')),main:rect(document.querySelector('.screen>main')),nav:rect(document.querySelector('.bottom-nav')),hero:rect(hero),heroContentBottom:hero?Math.max(...[...hero.children].map(e=>e.getBoundingClientRect().bottom)):null,nextHeroSibling:rect(hero?.nextElementSibling)}})()''')
   data['errors']=[]
   if data['overflow']:data['errors'].append('horizontal document overflow')
   for d in data['dialogs']:
    if d['rect']['top'] < -1 or d['rect']['bottom']>h+1:data['errors'].append('dialog outside viewport')
   g=data['geometry']
   if g.get('hero') and g['heroContentBottom']>g['hero']['bottom']+1:data['errors'].append('hero text outside background')
   if g.get('nextHeroSibling') and g['nextHeroSibling']['top']<g['hero']['bottom']-1:data['errors'].append('hero overlaps next section')
   b.screenshot(root/(key+'.png'));records.append(key)
   if data['dialogs']:
    checks=[]
    for i in range(20):
     b.cmd('Input.dispatchKeyEvent',{'type':'keyDown','key':'Tab','code':'Tab','windowsVirtualKeyCode':9});checks.append(b.js('!!document.activeElement.closest("[role=dialog]")'))
    data['focusTrapped']=all(checks)
    if not all(checks):data['errors'].append('focus escaped dialog')
    # Scroll inside the popup to the last action and capture its reachability.
    b.js('document.querySelectorAll(".sheet-scroll,.range-picker").forEach(e=>e.scrollTop=e.scrollHeight)');b.screenshot(root/(key+'-end.png'))
    b.cmd('Input.dispatchKeyEvent',{'type':'keyDown','key':'Escape','code':'Escape','windowsVirtualKeyCode':27});time.sleep(.2)
    data['escapeClosed']=b.js('!document.querySelector("[role=dialog]")')
    if not data['escapeClosed']:data['errors'].append('Escape failed')
   (root/(key+'.json')).write_text(json.dumps(data,indent=2));allresults.append({'case':key,'errors':data['errors']});print(key,data['errors'],flush=True)
  except Exception as e:print(key,'ERROR',str(e)[:180],flush=True);(root/(key+'-error.txt')).write_text(str(e));raise
 # Smaller export contact sheet is only for review. Originals are actual viewport screenshots.
 tw=320;th=round(h*tw/w)
 for i in range(0,len(records),4):
  batch=records[i:i+4];im=Image.new('RGB',(tw*len(batch),th+26),'#ddd');d=ImageDraw.Draw(im)
  for x,key in enumerate(batch):d.text((tw*x+4,5),key,fill='black');im.paste(Image.open(root/(key+'.png')).resize((tw,th)),(tw*x,26))
  im.save(root/f'contact-{w}x{h}-{i}.png')
(root/f'results-{start}-{end}.json').write_text(json.dumps(allresults,indent=2))
assert all(not r['errors'] for r in allresults), allresults
