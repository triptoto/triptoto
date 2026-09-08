from PIL import Image,ImageDraw
root=(AUDIT_OUTPUT/'regression');root.mkdir(parents=True,exist_ok=True)
fixture=(SUITE_DIR/'fixture.js').read_text();flat=[];results=[]
def record(name,checks=None,scroll=True):
 data=b.inspect();data['checks']=checks or {};data['evidence']=[]
 def shot(suffix):
  f=name+'-'+suffix+'.png';b.screenshot(root/f);data['evidence'].append(f);flat.append(f)
 shot('top')
 if scroll:
  for i in range(b.js('document.querySelectorAll("main,.sheet-scroll,.discard-dialog").length')):
   h,sh=b.js(f'(()=>{{const e=document.querySelectorAll("main,.sheet-scroll,.discard-dialog")[{i}];return [e.clientHeight,e.scrollHeight]}})()')
   if h and sh>h+2:
    for j,y in enumerate(range(max(1,h-50),sh,max(1,h-50))):
     b.js(f'document.querySelectorAll("main,.sheet-scroll,.discard-dialog")[{i}].scrollTop={y}');shot(f'scroll-{i}-{j}')
 (root/(name+'.json')).write_text(json.dumps(data,indent=2));results.append({'case':name,'overflow':data['overflow'],'checks':data['checks']});print(name,data['checks'],flush=True);assert not data['overflow'],name;assert all(data['checks'].values()),(name,data['checks'])
def scenario(screen,id=None,setup=''):
 b.nav();b.js(fixture)
 if setup:b.js('(()=>{const s=TriptoMobileApp.getState();'+setup+'})()')
 b.js('TriptoMobileApp.show('+json.dumps(screen)+','+json.dumps(id)+',true)');time.sleep(.2)
def escape():b.cmd('Input.dispatchKeyEvent',{'type':'keyDown','key':'Escape','code':'Escape','windowsVirtualKeyCode':27});time.sleep(.3)
part=sys.argv[4] if len(sys.argv)>4 else 'all'
if part in ['all','viewer']:
 b.viewport(390,844);b.nav('/bookings/new/activity?preview=1');f=Path('/tmp/tripto-local-audit-document.png')
 im=Image.new('RGB',(500,700),'white');ImageDraw.Draw(im).text((40,50),'LOCAL QA FIXTURE '+str(time.time())+'\nNo real booking or personal data.',fill='black');im.save(f)
 b.cmd('DOM.enable');doc=b.cmd('DOM.getDocument');node=b.cmd('DOM.querySelector',{'nodeId':doc['root']['nodeId'],'selector':'#form-manualAttachments'})['nodeId'];b.cmd('DOM.setFileInputFiles',{'nodeId':node,'files':[str(f)]});time.sleep(1)
 b.js('const e=document.querySelector("#native-form input:not([type=hidden]):not([type=file])");e.value="Local audit unsaved name";e.dispatchEvent(new Event("input",{bubbles:true}))')
 before=b.js('[...document.querySelectorAll("#native-form input:not([type=file]),#native-form textarea")].map(e=>[e.name,e.value])');b.click('[data-action="manual-attachment-open"]')
 checks={'dialogSemantics':b.js('document.querySelector("#doc-viewer").getAttribute("aria-modal")==="true"'),'initialFocusInside':b.js('!!document.activeElement.closest("#doc-viewer")')}
 focus=[]
 for i in range(16):
  b.cmd('Input.dispatchKeyEvent',{'type':'keyDown','key':'Tab','code':'Tab','windowsVirtualKeyCode':9});focus.append(b.js('!!document.activeElement.closest("#doc-viewer")'))
 checks['focusTrapped']=all(focus);record('document-viewer',checks,False);escape()
 checks['escapeClosed']=b.js('!document.querySelector("#doc-viewer")');checks['historyPopped']=b.js('!history.state.triptoDocumentViewer');checks['focusReturned']=b.js('document.activeElement.dataset.action==="manual-attachment-open"')
 checks['formPreserved']=before==b.js('[...document.querySelectorAll("#native-form input:not([type=file]),#native-form textarea")].map(e=>[e.name,e.value])')
 b.click('[data-action="manual-attachment-open"]');b.click('[data-action="close-doc-viewer"]');time.sleep(.3);checks['backClosedAndPopped']=b.js('!document.querySelector("#doc-viewer")&&!history.state.triptoDocumentViewer');checks['backgroundRestored']=b.js('!document.querySelector("#app").inert');b.click('[data-action="manual-attachment-remove"]');checks['stagingRemoved']=b.js('!document.querySelector(".manual-attachment-row")');record('document-return',checks);assert all(checks.values()),checks
if part in ['all','responsive']:
 for w,h in [(320,568),(360,740),(390,844),(430,932),(768,1024),(1024,768),(844,390)]:
  b.viewport(w,h);scenario('plan','missing');record(f'missing-{w}',{'missingStateRendered':b.js('document.body.innerText.includes("Plan unavailable")'),'navAtBottom':b.js('Math.abs(document.querySelector(".bottom-nav").getBoundingClientRect().bottom-innerHeight)<2')},False)
  if w>430:continue
  scenario('collection','audit-neighborhood');b.click('[data-action="collection-add-place"]');record(f'stop-form-{w}',{'saveVisible':b.js('document.querySelector(".app-bar-save").getBoundingClientRect().right<=innerWidth')})
  scenario('currency',setup='s.currency={from:"EUR",to:"USD",amount:100,rate:null}')
  b.js('const e=document.querySelector("[data-currency-amount]");e.value="999999999999.99";e.dispatchEvent(new Event("input",{bubbles:true}))')
  record(f'currency-unavailable-{w}',{'unavailableRemainsUnavailable':b.js('document.querySelector(".currency-result__amount").textContent==="—"'),'compactNumber':b.js('getComputedStyle(document.querySelector("[data-currency-amount]")).fontSize==="24px"')})
  scenario('currency',setup='s.currency={from:"EUR",to:"USD",amount:999999999999.99,rate:1.25,date:"2026-09-08",cached:true,source:"LOCAL QA RATE - not real financial data"}');record(f'currency-long-result-{w}')
 b.viewport(390,844);scenario('help');b.js('const e=document.querySelector("[data-faq-search]");e.value="zzzznone";e.dispatchEvent(new Event("input",{bubbles:true}))');record('faq-empty',{'emptySectionsHidden':b.js('[...document.querySelectorAll("[data-faq-section]")].every(e=>e.getBoundingClientRect().height===0)')})
 scenario('timeline',setup='s.timeline=[];s.brain={...s.brain,nextItem:null}');record('timeline-empty')
 scenario('weather');b.js('const s=TriptoMobileApp.getState();s.weatherByPlace={};document.querySelectorAll("[data-action=weather-place]").forEach(e=>s.weatherByPlace[e.dataset.key]={tempC:22,hourly:Array.from({length:6},(_,i)=>({time:Date.now()+i*3600000,iconName:"weather",temp:22+i,precip:0,wind:4})),daily:Array.from({length:7},(_,i)=>({weekday:["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i],iconName:"weather",hi:24,lo:18,precip:0,wind:4}))});s.offline=true;TriptoMobileApp.show("weather",null,true)');record('weather-fixture-saved')
 scenario('collection','audit-neighborhood');b.click('[data-action="stop-menu"][data-id="audit-stop-2"]');before=b.js('document.querySelector(".collection-timeline-scroll").scrollTop');b.cmd('Input.synthesizeScrollGesture',{'x':20,'y':130,'yDistance':-300,'gestureSourceType':'mouse'});record('background-scroll-lock',{'backgroundDidNotScroll':before==b.js('document.querySelector(".collection-timeline-scroll").scrollTop')},False);escape()
if part in ['all','edit']:
 b.viewport(390,844)
 for kind in ['flight','hotel','train','ferry','bus','cruise','car-rental','transfer','taxi','parking','restaurant','tour','activity','attraction','event','insurance','other','reservation']:
  b.nav();b.js(fixture)
  base='hotel' if kind=='hotel' else 'flight' if kind=='flight' else 'train' if kind in ['train','ferry','bus','cruise','car-rental','transfer','taxi','parking'] else 'activity'
  b.js('(()=>{const s=TriptoMobileApp.getState();const row='+('s.stays[0]' if base=='hotel' else 's.transport.find(e=>e.transport_type==="flight")' if base=='flight' else 's.transport.find(e=>e.transport_type==="train")' if base=='train' else 's.timeline.find(e=>e.type==="activity")')+';s.editingEntity={kind:'+json.dumps(kind)+',id:row.trip_item_id||row.id};TriptoMobileApp.show("form",'+json.dumps(kind)+',true)})()');time.sleep(.2)
  checks={'editForm':b.js('!!document.querySelector("form[data-edit-id]")')}
  if b.js('document.querySelector("[data-action=toggle-form-more]").getAttribute("aria-expanded")!=="true"'):b.click('[data-action="toggle-form-more"]')
  checks['moreExpanded']=b.js('!document.querySelector(".form-more-panel").hidden');b.js('document.querySelector("main").scrollTop=0');record('edit-'+kind,checks)
for i in range(0,len(flat),4):
 batch=flat[i:i+4];im=Image.new('RGB',(390*len(batch),874),'#ddd');d=ImageDraw.Draw(im)
 for x,file in enumerate(batch):
  shot=Image.open(root/file);shot.thumbnail((390,844));d.text((390*x+5,8),file,fill='black');im.paste(shot,(390*x,30))
 im.save(root/f'contact-{part}-{i}.png')
(root/f'results-{part}.json').write_text(json.dumps(results,indent=2))
