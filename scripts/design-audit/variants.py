from PIL import Image,ImageDraw
root=(AUDIT_OUTPUT/'variants');root.mkdir(parents=True,exist_ok=True)
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

b.viewport(390,844)
for kind in ['attraction','food_drink','museum_culture','shopping','tour_experience','nature_outdoors','beach_relax','entertainment','viewpoint_scenic','other','idea']:
 scenario('day-plan-form','audit-idea','s.timeline.find(e=>e.id==="audit-idea").activity_type='+json.dumps(kind))
 record('day-edit-'+kind,{'editShown':b.js('document.querySelector(".app-bar").innerText.includes("Edit")')})
scenario('timeline')
keys=b.js('[...document.querySelectorAll("[data-action=select-timeline-day]")].map(e=>e.dataset.key)')
for i,key in enumerate(keys):
 b.click('[data-action="select-timeline-day"][data-key='+json.dumps(key)+']');record('timeline-day-'+str(i),scroll=False)
scenario('trips');b.click('[data-action="filter-trips"][data-filter="current"]');record('trips-current')
scenario('bookings');b.click('[data-action="filter-bookings"][data-filter="transport"]');record('bookings-transport')
b.nav('/bookings/new/flight?preview=1');b.click('input[name="roundTrip"]');record('flight-round-trip',{'returnTimeVisible':b.js('!document.querySelector("[data-round-trip-return]").hidden')})
for screen,id in [('add-trip',None),('add-booking',None),('form','flight'),('day-plan-form','new:museum_culture'),('save-later',None)]:
 scenario(screen,id,'s.trip=null;s.trips=[]');record('no-trip-'+screen)
# Equivalent reflow only: does not claim actual browser zoom.
b.viewport(512,340)
for screen,id in [('form','trip'),('collection','audit-neighborhood')]:
 scenario(screen,id);record('reflow-'+screen)
scenario('collection','audit-neighborhood');b.click('[data-action="stop-menu"][data-id="audit-stop-2"]');record('reflow-popup')
for i in range(0,len(flat),4):
 batch=flat[i:i+4];im=Image.new('RGB',(390*len(batch),874),'#ddd');d=ImageDraw.Draw(im)
 for x,file in enumerate(batch):
  shot=Image.open(root/file);shot.thumbnail((390,844));d.text((390*x+5,8),file,fill='black');im.paste(shot,(390*x,30))
 im.save(root/f'contact-{i}.png')
(root/'results.json').write_text(json.dumps(results,indent=2))
