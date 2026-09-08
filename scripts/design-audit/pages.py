from PIL import Image, ImageDraw
root=AUDIT_OUTPUT
phase='after'
routes=[('welcome','/home'),('trips','/trips'),('timeline','/timeline'),('add','/add'),('add-booking','/bookings/add'),('day-plan','/day-plan'),('save-later','/save-later'),('planning','/planning'),('bookings','/bookings'),('flight','/flights/flight'),('hotel','/hotels/stay'),('train','/trains/train'),('activity','/plans/activity'),('documents','/documents'),('ready','/ready-offline'),('health','/trip-health'),('account','/account'),('map','/trip-map'),('weather','/weather'),('currency','/currency'),('options','/trip-options'),('esim','/esim'),('checklist','/before-you-go'),('help','/help'),('travelers','/travelers'),('traveler','/travelers/traveler'),('import','/bookings/import'),('import-history','/bookings/import/history'),('email','/bookings/email-inbox'),('sync','/pending-changes'),('collaboration','/collaboration'),('join','/join/sample'),('trip-form','/trips/new'),('traveler-form','/travelers/new'),('checklist-form','/before-you-go/new'),('neighborhood-form','/collections/new/neighborhood'),('museum-form','/day-plan/new/museum_culture')]
routes += [('form-'+k,'/bookings/new/'+k) for k in ['flight','hotel','train','ferry','bus','cruise','car-rental','transfer','taxi','parking','restaurant','tour','activity','attraction','event','insurance','other','reservation','document']]
routes += [('day-plan-'+k,'/day-plan/new/'+k) for k in ['attraction','food_drink','museum_culture','idea']]
start=int(sys.argv[4]) if len(sys.argv)>4 else 0
end=int(sys.argv[5]) if len(sys.argv)>5 else len(routes)
records=[]
for name,path in routes[start:end]:
    b.nav(path+'?preview=1')
    state=b.inspect()
    shots=[]
    b.screenshot(root/phase/(name+'-top.png'));shots.append(name+'-top.png')
    # Read every part of each actual scroll container, not a tall fake viewport.
    count=b.js('document.querySelectorAll("main,.sheet-scroll").length')
    for i in range(count):
        info=b.js(f'(()=>{{const e=document.querySelectorAll("main,.sheet-scroll")[{i}];return [e.clientHeight,e.scrollHeight]}})()')
        if info[0]<1 or info[1]<=info[0]+2: continue
        for j,y in enumerate(range(max(1,info[0]-60),info[1],max(1,info[0]-60))):
            b.js(f'document.querySelectorAll("main,.sheet-scroll")[{i}].scrollTop={y}')
            filename=f'{name}-scroll-{i}-{j}.png'
            b.screenshot(root/phase/filename);shots.append(filename)
    state['evidence']=shots
    (root/phase/(name+'.json')).write_text(json.dumps(state,indent=2))
    records.append((name,shots))
    print(name,state['url'], 'OVERFLOW' if state['overflow'] else '',len(shots),flush=True)
for group in range(0,len(records),4):
    batch=records[group:group+4]
    canvas=Image.new('RGB',(390*len(batch),844*2+30),'#d9dde2')
    draw=ImageDraw.Draw(canvas)
    for i,(name,shots) in enumerate(batch):
        draw.text((i*390+8,8),name,fill='black')
        canvas.paste(Image.open(root/phase/shots[0]),(i*390,30))
        canvas.paste(Image.open(root/phase/shots[-1]),(i*390,874))
    canvas.save(root/phase/f'contact-{start+group}.png')
