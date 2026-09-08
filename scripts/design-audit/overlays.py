from PIL import Image,ImageDraw
root=AUDIT_OUTPUT
phase='interaction'
fixture=(SUITE_DIR/'fixture.js').read_text()
# All selectors below are existing visible product triggers, never synthetic buttons.
cases=[
 ('stop-menu','collection','audit-neighborhood',['[data-action="stop-menu"][data-id="audit-stop-2"]']),
 ('stop-delete','collection','audit-neighborhood',['[data-action="stop-menu"][data-id="audit-stop-2"]','[data-action="delete-stop"]']),
 ('collection-delete','collection','audit-neighborhood',['[data-action="delete-collection"]']),
 ('idea-menu','save-later',None,['[data-action="open-idea"]']),
 ('idea-delete','save-later',None,['[data-action="open-idea"]','[data-action="delete-idea"]']),
 ('manage-booking','flight','flight',['[data-action="manage-booking"]']),
 ('move-booking','flight','flight',['[data-action="manage-booking"]','[data-action="move-booking"]']),
 ('delete-booking','flight','flight',['[data-action="manage-booking"]','[data-action="delete-booking"]']),
 ('trip-switch','account',None,['[data-action="switch-trip"]']),
 ('help-sheet','account',None,['[data-action="open-help"]']),
 ('tour-sheet','account',None,['[data-action="open-first-run-how"]']),
 ('notifications','timeline',None,['[data-action="open-notifications"]']),
 ('currency-picker','currency',None,['[data-action="open-currency-picker"]']),
 ('share-sheet','collaboration',None,['[data-action="open-share"]']),
 ('member-sheet','collaboration',None,['[data-action="open-member-actions"]']),
 ('member-remove','collaboration',None,['[data-action="open-member-actions"]','[data-action="member-remove"]']),
 ('member-transfer','collaboration',None,['[data-action="open-member-actions"]','[data-action="member-transfer"]']),

 ('delete-document','documents',None,['[data-action="remove-document"]']),
 ('delete-import','import-history',None,['[data-action="remove-import"]']),
 ('remove-local','account',None,['[data-action="remove-local-data"]']),
 ('delete-account','account',None,['[data-action="delete-account"]']),
 ('calendar','form','trip',['[data-action="open-date-range"]']),
 ('driver','hotel','stay',['[data-action="show-driver"]']),
 ('email-trip','booking-email-inbox',None,['[data-action="choose-booking-email-trip"]']),
]
start=int(sys.argv[4]) if len(sys.argv)>4 else 0
end=int(sys.argv[5]) if len(sys.argv)>5 else len(cases)
records=[]
for name,screen,id,clicks in cases[start:end]:
    try:
        b.nav();b.js(fixture)
        b.js('TriptoMobileApp.show('+json.dumps(screen)+','+json.dumps(id)+',true)');time.sleep(.3)
        for selector in clicks:b.click(selector)
        b.screenshot(root/phase/(name+'.png'))
        data=b.inspect()
        data['focusInside']=b.js('Boolean(document.activeElement.closest("[role=dialog],.driver-screen"))')
        data['trigger']=clicks
        b.js('[...document.querySelectorAll(".sheet-scroll,main")].forEach(e=>e.scrollTop=e.scrollHeight)')
        b.screenshot(root/phase/(name+'-bottom.png'))
        data['bottomEvidence']=name+'-bottom.png'
        # Use actual keyboard events for focus containment and escape dismissal.
        if data['dialogs']:
            focus=[]
            for i in range(18):
                b.cmd('Input.dispatchKeyEvent',{'type':'keyDown','key':'Tab','code':'Tab','windowsVirtualKeyCode':9})
                b.cmd('Input.dispatchKeyEvent',{'type':'keyUp','key':'Tab','code':'Tab','windowsVirtualKeyCode':9})
                focus.append(b.js('Boolean(document.activeElement.closest("[role=dialog]"))'))
            data['focusTrapped']=all(focus)
            b.cmd('Input.dispatchKeyEvent',{'type':'keyDown','key':'Escape','code':'Escape','windowsVirtualKeyCode':27})
            time.sleep(.25)
            data['closedByEscape']=b.js('!document.querySelector("[role=dialog]")')
            data['returnedFocus']=b.js('document.activeElement.outerHTML')
        (root/phase/(name+'.json')).write_text(json.dumps(data,indent=2))
        print(name,'dialogs',len(data['dialogs']),'trap',data.get('focusTrapped'),'closed',data.get('closedByEscape'),flush=True)
        records.append(name)
    except Exception as e:
        print(name,'ERROR',str(e)[:280],flush=True)
        (root/phase/(name+'-error.txt')).write_text(str(e))
        raise
for group in range(0,len(records),4):
    batch=records[group:group+4];canvas=Image.new('RGB',(390*len(batch),874),'#ddd');draw=ImageDraw.Draw(canvas)
    for i,name in enumerate(batch):
        draw.text((i*390+6,8),name,fill='black');canvas.paste(Image.open(root/phase/(name+'.png')),(i*390,30))
    canvas.save(root/phase/f'contact-{start+group}.png')
