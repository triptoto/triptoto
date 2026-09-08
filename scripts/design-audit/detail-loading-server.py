"""Loopback-only regression fixture for cached detail loading, with real shell JS.

Open /collections/old-town?build=before&cache=full&delay=8 to reproduce v244.
Use build=after with cache=full or cache=partial to verify the current shell.
The fixture serves API replies locally and never proxies production requests.
"""
import base64
import json
import mimetypes
import subprocess
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / 'public'
TOKEN = base64.urlsafe_b64encode(json.dumps({'userId': 'local-detail-qa', 'exp': 4102444800000}).encode()).decode().rstrip('=') + '.local-only'
TRIP = {'id': 'local-qa-trip', 'title': 'LOCAL loading QA', 'starts_on': '2026-09-10', 'ends_on': '2026-09-16', 'lifecycle_state': 'upcoming'}
PLAN = {'id': 'local-qa-plan', 'trip_id': TRIP['id'], 'title': 'Old town', 'type': 'custom', 'collection_type': 'neighborhood', 'status': 'planned', 'version': 1}
STOP = {'id': 'local-qa-stop', 'collection_item_id': PLAN['id'], 'title': 'Local QA museum', 'position': 0, 'status': 'planned', 'version': 1}
REPLIES = {
    '/api/v1/trips': {'trips': [TRIP]},
    '/api/v1/account': {'account': {'mode': 'guest'}},
    f"/api/v1/trips/{TRIP['id']}/timeline": {'items': [PLAN]},
    f"/api/v1/trips/{TRIP['id']}/collections": {'collections': [PLAN], 'stops': [STOP]},
}
BEFORE = subprocess.check_output(['git', 'show', '62c7bb2:public/mobile-app.js'], cwd=ROOT)
MODE = {'build': 'after', 'delay': 0}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def send(self, body, mime='application/json', cookies=()):
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Cache-Control', 'no-store')
        for cookie in cookies:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_POST(self):
        self.send(json.dumps({'token': TOKEN}).encode())

    def do_GET(self):
        url = urlparse(self.path)
        build, delay = MODE['build'], MODE['delay']
        if url.path.startswith('/api/'):
            time.sleep(min(max(delay, 0), 10))
            self.send(json.dumps(REPLIES.get(url.path, {})).encode())
            return
        path = (PUBLIC / url.path.lstrip('/')).resolve()
        if path.is_file() and path.is_relative_to(PUBLIC):
            body = BEFORE if url.path == '/mobile-app.min.js' and build == 'before' else path.read_bytes()
            if url.path == '/mobile-app.min.js':
                body = f'document.documentElement.dataset.qaBuild={json.dumps(build)};'.encode() + body
            self.send(body, mimetypes.guess_type(str(path))[0] or 'application/octet-stream')
            return
        query = parse_qs(url.query)
        build = query.get('build', ['after'])[0]
        cache = query.get('cache', ['full'])[0]
        delay = min(max(float(query.get('delay', ['2'])[0]), 0), 10)
        MODE.update(build=build, delay=delay)
        cached = dict(REPLIES)
        if cache == 'partial':
            cached.pop(f"/api/v1/trips/{TRIP['id']}/collections")
        if cache == 'none':
            cached = {}
        seed = f"""<script>
          localStorage.clear();
          localStorage.setItem('tripto_token', {json.dumps(TOKEN)});
          localStorage.setItem('tripto_selected_trip', {json.dumps(TRIP['id'])});
          for (const [path,data] of Object.entries({json.dumps(cached)}))
            localStorage.setItem('tripto_cache_v3:local-detail-qa:'+path,JSON.stringify({{at:Date.now(),data}}));
          if ('serviceWorker' in navigator) navigator.serviceWorker.register=()=>Promise.resolve({{}});
          document.documentElement.dataset.qaUnavailableFrames='0';
          new MutationObserver(()=>{{
            if ([...document.querySelectorAll('#app h1')].some(e=>e.textContent==='Plan unavailable'))
              document.documentElement.dataset.qaUnavailableFrames=String(Number(document.documentElement.dataset.qaUnavailableFrames)+1);
          }}).observe(document.documentElement,{{childList:true,subtree:true}});
        </script>"""
        html = (PUBLIC / 'index.html').read_text().replace('<head>', '<head>' + seed, 1)
        self.send(html.encode(), 'text/html; charset=utf-8', [f'qa_build={build}; Path=/; SameSite=Lax', f'qa_delay={delay}; Path=/; SameSite=Lax'])


if __name__ == '__main__':
    print('Local detail-loading QA: http://127.0.0.1:4195/collections/old-town?build=after&cache=full&delay=8', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 4195), Handler).serve_forever()
