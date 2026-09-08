from PIL import Image,ImageDraw
root=(AUDIT_OUTPUT/'extra');root.mkdir(parents=True,exist_ok=True)
cases=[]
for kind in ['flight','hotel','train','ferry','bus','cruise','car-rental','transfer','taxi','parking','restaurant','tour','activity','attraction','event','insurance','other','reservation','document']:
 cases.append(('more-'+kind,'/bookings/new/'+kind,'','[data-action="toggle-form-more"]'))
for kind in ['shopping','tour_experience','nature_outdoors','beach_relax','entertainment','viewpoint_scenic','other']:
 cases.append(('day-'+kind,'/day-plan/new/'+kind,'',''))
for qa,path in [('loading','/timeline'),('error','/timeline'),('offline','/timeline'),('empty','/trips'),('empty-offline','/timeline'),('timeline-empty','/timeline'),('timeline-warning','/timeline'),('timeline-now','/timeline'),('hotel-missing-location','/hotels/stay'),('hotel-cancelled','/hotels/stay'),('ready-missing','/ready-offline'),('health-issues','/trip-health'),('sync-conflict','/pending-changes'),('legacy-no-dates','/timeline'),('active-no-upcoming','/timeline'),('trip-empty','/trips')]:
 cases.append((qa,path,qa,''))
for name,path,click in [('faq','/help','[data-action="faq-toggle"]'),('flight-expanded','/flights/flight','[data-action="toggle-flight-details"]'),('trips-upcoming','/trips','[data-action="filter-trips"][data-filter="upcoming"]'),('trips-past','/trips','[data-action="filter-trips"][data-filter="past"]'),('bookings-stays','/bookings','[data-action="filter-bookings"][data-filter="stays"]'),('bookings-plans','/bookings','[data-action="filter-bookings"][data-filter="plans"]'),('date-skip','/trips/new','[data-action="open-date-range"]'),('privacy','/privacy.html',''),('terms','/terms.html','')]:cases.append((name,path,'',click))
start=int(sys.argv[4]) if len(sys.argv)>4 else 0;end=int(sys.argv[5]) if len(sys.argv)>5 else len(cases);records=[]
for name,path,qa,click in cases[start:end]:
 try:
  b.nav(path+'?preview=1'+('&qaState='+qa if qa else ''))
  if click and not (name.startswith('more-') and b.js('document.querySelector("[data-action=toggle-form-more]").getAttribute("aria-expanded")==="true"')):b.click(click)
  b.js('document.querySelector("main")?.scrollTo(0,0)')
  data=b.inspect();shots=[]
  def shot(suffix):
   file=name+'-'+suffix+'.png';b.screenshot(root/file);shots.append(file)
  shot('top')
  for i in range(b.js('document.querySelectorAll("main,.sheet-scroll").length')):
   h,sh=b.js(f'(()=>{{const e=document.querySelectorAll("main,.sheet-scroll")[{i}];return [e.clientHeight,e.scrollHeight]}})()')
   if h and sh>h+2:
    for j,y in enumerate(range(h-50,sh,h-50)):
     b.js(f'document.querySelectorAll("main,.sheet-scroll")[{i}].scrollTop={y}');shot(f'scroll-{i}-{j}')
  if path.endswith('.html'):
   h,sh=b.js('[innerHeight,document.documentElement.scrollHeight]')
   for j,y in enumerate(range(h-50,sh,h-50)):
    b.js(f'scrollTo(0,{y})');shot(f'document-{j}')
  data['evidence']=shots;data['trigger']=click;data['qaState']=qa;(root/(name+'.json')).write_text(json.dumps(data,indent=2));records.append((name,shots));print(name,'OVERFLOW' if data['overflow'] else '',flush=True)
 except Exception as e:print(name,'ERROR',str(e)[:200],flush=True);(root/(name+'-error.txt')).write_text(str(e));raise
# Include EVERY screenshot for long forms/FAQs/legal, rather than only top/bottom.
flat=[(name,f) for name,shots in records for f in shots]
for i in range(0,len(flat),4):
 batch=flat[i:i+4];im=Image.new('RGB',(390*len(batch),874),'#ddd');d=ImageDraw.Draw(im)
 for x,(name,f) in enumerate(batch):d.text((390*x+5,8),f,fill='black');im.paste(Image.open(root/f),(390*x,30))
 im.save(root/f'contact-{start}-{i}.png')
