import base64, json, os, sys, time
from datetime import datetime
from urllib.parse import urlparse
from pathlib import Path
from urllib.request import urlopen
from websockets.sync.client import connect

SUITE_DIR = Path(__file__).resolve().parent
REPO = SUITE_DIR.parents[1]
AUDIT_OUTPUT = Path(os.environ.get("TRIPTO_AUDIT_OUTPUT", str(REPO / "docs/design-audit/evidence" / ("rerun-" + datetime.now().strftime("%Y%m%d-%H%M%S")))))
BASE_URL = os.environ.get("TRIPTO_AUDIT_URL", "http://127.0.0.1:4174").rstrip("/")
CDP_URL = os.environ.get("TRIPTO_AUDIT_CDP", "http://127.0.0.1:9224").rstrip("/")
for endpoint in [BASE_URL, CDP_URL]:
    if urlparse(endpoint).hostname not in ("127.0.0.1", "localhost"):
        raise ValueError("Audit endpoints must be loopback addresses; never run against production.")

class Browser:
    def __init__(self):
        version=json.load(urlopen(CDP_URL + '/json/version'))
        self.ws=connect(version['webSocketDebuggerUrl'],origin='http://localhost')
        self.seq=0
        self.width=390;self.height=844
        self.target=self.cmd('Target.createTarget',{'url':'about:blank'})['targetId']
        targets=json.load(urlopen(CDP_URL + '/json'))
        self.ws.close()
        self.ws=connect(next(t['webSocketDebuggerUrl'] for t in targets if t.get('id')==self.target),origin='http://localhost')
        for method in ['Page.enable','Runtime.enable','Network.enable']:
            self.cmd(method)
        self.cmd('Network.setCacheDisabled', {'cacheDisabled':True})
        self.cmd('Network.setBlockedURLs',{'urls':['*://tripto.to/*','*://accounts.google.com/*','*://www.googletagmanager.com/*','*://www.stay22.com/*']})
    def cmd(self,method,params=None):
        self.seq+=1
        self.ws.send(json.dumps({'id':self.seq,'method':method,'params':params or {}}))
        while True:
            r=json.loads(self.ws.recv(timeout=15))
            if r.get('id')==self.seq:
                if 'error' in r: raise RuntimeError(r['error'])
                return r.get('result',{})
    def js(self,expression):
        r=self.cmd('Runtime.evaluate',{'expression':expression,'awaitPromise':True,'returnByValue':True})
        if r.get('exceptionDetails'): raise RuntimeError(r['exceptionDetails'])
        return r.get('result',{}).get('value')
    def viewport(self,w=390,h=844):
        self.width=w;self.height=h
        self.cmd('Emulation.setDeviceMetricsOverride',{'width':w,'height':h,'deviceScaleFactor':1,'mobile':True})
    def nav(self,path='/timeline?preview=1'):
        old=self.target
        self.target=self.cmd('Target.createTarget',{'url':'about:blank'})['targetId']
        targets=json.load(urlopen(CDP_URL + '/json'))
        self.ws.close()
        self.ws=connect(next(t['webSocketDebuggerUrl'] for t in targets if t.get('id')==self.target),origin='http://localhost')
        self.cmd('Target.closeTarget',{'targetId':old})
        for method in ['Page.enable','Runtime.enable','Network.enable']:self.cmd(method)
        self.cmd('Network.setCacheDisabled',{'cacheDisabled':True})
        self.cmd('Network.setBlockedURLs',{'urls':['*://tripto.to/*','*://accounts.google.com/*','*://www.googletagmanager.com/*','*://www.stay22.com/*']})
        self.viewport(self.width,self.height)
        self.cmd('Page.navigate',{'url':BASE_URL+path})
        time.sleep(.4)
        for i in range(200):
            time.sleep(.1)
            if self.js('Boolean(window.TriptoMobileApp && document.querySelector(".screen,.first-run-screen") && !TriptoMobileApp.getState().loading)'): break
        time.sleep(.25)
        if not self.js('Boolean(window.TriptoMobileApp)'):
            raise RuntimeError('Local preview did not initialize: ' + str(self.js('location.href')))
    def click(self,selector):
        result=self.js('(()=>{const e=document.querySelector('+json.dumps(selector)+');if(!e)return false;e.scrollIntoView({block:"nearest"});e.focus();e.click();return true})()')
        if not result: raise RuntimeError('Missing trigger '+selector)
        time.sleep(.18)
    def screenshot(self,path):
        time.sleep(.1)
        p=Path(path);p.parent.mkdir(parents=True,exist_ok=True)
        p.write_bytes(base64.b64decode(self.cmd('Page.captureScreenshot',{'format':'png','captureBeyondViewport':False})['data']))
    def inspect(self):
        return self.js('''(()=>({url:location.pathname,screen:window.TriptoMobileApp?.getState().screen,text:document.body.innerText,scroll:[...document.querySelectorAll('main,.sheet-scroll')].filter(e=>e.scrollHeight>e.clientHeight+1).map(e=>({class:e.className,height:e.clientHeight,scroll:e.scrollHeight})),overflow:document.documentElement.scrollWidth>innerWidth,dialogs:[...document.querySelectorAll('[role=dialog]')].map(e=>({label:e.getAttribute('aria-label'),rect:e.getBoundingClientRect().toJSON()})),buttons:[...document.querySelectorAll('button')].filter(e=>e.offsetWidth&&e.offsetHeight).map(e=>({text:e.innerText,label:e.getAttribute('aria-label'),action:e.dataset.action,screen:e.dataset.screen,id:e.dataset.id}))}))()''')

if __name__=='__main__':
    b=Browser()
    b.viewport(int(sys.argv[2]) if len(sys.argv)>2 else 390,int(sys.argv[3]) if len(sys.argv)>3 else 844)
    try:
        suite=Path(sys.argv[1])
        if not suite.is_absolute(): suite=SUITE_DIR/suite
        exec(compile(suite.read_text(),str(suite),'exec'))
    finally:
        b.cmd('Target.closeTarget',{'targetId':b.target})
        b.ws.close()
