const targets = await fetch('http://127.0.0.1:9228/json/list').then((response) => response.json());
const target = targets.find((entry) => entry.type === 'page');
if (!target) throw new Error('No Chrome page target.');
const socket = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const errors = [];
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  } else if (message.method === 'Runtime.exceptionThrown') {
    errors.push(message.params.exceptionDetails?.text || 'Runtime exception');
  } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    errors.push(message.params.args.map((arg) => arg.value || arg.description || '').join(' '));
  }
};
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});
const send = (method, params = {}) => new Promise((resolve) => {
  const requestId = ++id;
  pending.set(requestId, resolve);
  socket.send(JSON.stringify({ id: requestId, method, params }));
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evaluate = async (expression) => {
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.result?.exceptionDetails) throw new Error(JSON.stringify(response.result.exceptionDetails));
  return response.result.result.value;
};
await send('Runtime.enable');
await send('Page.enable');

const sizes = [[360,800],[375,812],[390,844],[393,852],[430,932]];
const results = [];
for (const [width, height] of sizes) {
  console.log(`Checking ${width}x${height}`);
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true, screenWidth: width, screenHeight: height });
  await send('Page.navigate', { url: 'http://127.0.0.1:8804/index.html?preview=1&qaState=trip-empty&placesQa=1#form:flight' });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await evaluate(`Boolean(document.querySelector('[name="fromLocation"]'))`)) break;
    await wait(150);
  }
  if (!(await evaluate(`Boolean(document.querySelector('[name="fromLocation"]'))`))) {
    throw new Error(await evaluate(`JSON.stringify({href:location.href,text:document.body.innerText.slice(0,500)})`));
  }
  await evaluate(`(()=>{const input=document.querySelector('[name="fromLocation"]');input.focus();input.value='Par';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await wait(width === 360 ? 5000 : 1800);
  results.push(await evaluate(`(()=>{const input=document.querySelector('[name="fromLocation"]'),popup=document.querySelector('.place-suggestions'),options=[...document.querySelectorAll('.place-option')],iata=[...document.querySelectorAll('.place-option__code')].map(x=>x.textContent);return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,inputVisible:input.getBoundingClientRect().top>=0&&input.getBoundingClientRect().bottom<=innerHeight,popupVisible:!popup.hidden,popupRight:popup.getBoundingClientRect().right,optionCount:options.length,minTouch:Math.min(...options.map(x=>x.getBoundingClientRect().height)),aria:input.getAttribute('role')==='combobox'&&input.getAttribute('aria-expanded')==='true'&&popup.getAttribute('role')==='listbox',iata};})()`));
  console.log(JSON.stringify(results.at(-1)));
}

await evaluate(`(()=>{const input=document.querySelector('[name="fromLocation"]');input.value='CDG';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
await wait(500);
const exact = await evaluate(`(()=>{const first=document.querySelector('.place-option');return {name:first?.querySelector('strong')?.textContent,code:first?.querySelector('.place-option__code')?.textContent};})()`);
await evaluate(`document.querySelector('.place-option')?.click()`);
const selected = await evaluate(`(()=>{const input=document.querySelector('[name="fromLocation"]'),snapshot=JSON.parse(document.querySelector('[name="fromLocationPlace"]').value);return {value:input.value,timezone:snapshot.timezone,iata:snapshot.iata};})()`);
const cache = await evaluate(`caches.open('tripto-places-2026-08-26').then(async c=>Boolean(await c.match('/data/places-2026-08-26.json',{ignoreSearch:true})))`);
console.log('Exact and cache checks completed.');

for (const row of results) {
  if (row.scrollWidth > row.width || !row.inputVisible || !row.popupVisible || row.popupRight > row.width + 0.5 || row.optionCount < 1 || row.optionCount > 8 || row.minTouch < 44 || !row.aria) throw new Error(JSON.stringify(row));
}
if (exact.code !== 'CDG' || selected.iata !== 'CDG' || selected.timezone !== 'Europe/Paris' || errors.length) throw new Error(JSON.stringify({ exact, selected, cache, errors }));
console.log(JSON.stringify({ viewports: results, exact, selected, cachedOfflineDataset: cache, consoleErrors: errors }, null, 2));
socket.close();
