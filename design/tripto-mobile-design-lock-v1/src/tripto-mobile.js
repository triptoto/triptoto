(function(){
'use strict';
const icons={
user:'<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>',
home:'<path d="M3 11.5 12 4l9 7.5"></path><path d="M5 10.5V21h14V10.5"></path>',
trips:'<rect x="4" y="7" width="16" height="13" rx="2"></rect><path d="M9 7V5h6v2"></path>',
plus:'<path d="M12 5v14M5 12h14"></path>',
ticket:'<path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V6Z"></path>',
plane:'<path d="m2 16 20-8-3-3-8 3-4-4-2 1 3 5-4 2-2-1-1 1 3 3Z"></path>',
chevron:'<path d="m9 18 6-6-6-6"></path>',
check:'<path d="m5 12 4 4L19 6"></path>',
qr:'<rect x="3" y="3" width="6" height="6"></rect><rect x="15" y="3" width="6" height="6"></rect><rect x="3" y="15" width="6" height="6"></rect><path d="M15 15h3v3h-3zM18 18h3v3h-3zM18 12h3v3h-3z"></path>',
back:'<path d="m15 18-6-6 6-6"></path>',
share:'<path d="M12 16V3M8 7l4-4 4 4"></path><path d="M5 12v8h14v-8"></path>',
navigation:'<path d="m21 3-8 18-2-8-8-2 18-8Z"></path>',
calendar:'<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M8 3v4M16 3v4M3 10h18"></path>'
};
const icon=(name,size=24)=>`<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[name]||''}</svg>`;
const nav=(active)=>`<nav class="bottom-nav"><button class="nav-item ${active==='home'?'active':''}" data-route="home">${icon('home',23)}<span>Home</span></button><button class="nav-item">${icon('trips',23)}<span>Trip</span></button><button class="nav-item"><span class="nav-add">${icon('plus',27)}</span><span>Add</span></button><button class="nav-item ${active==='flight'?'active':''}" data-route="flight">${icon('ticket',23)}<span>Bookings</span></button><button class="nav-item">${icon('user',23)}<span>Account</span></button></nav>`;
function pass(detail){
return `<section class="flight-pass ${detail?'detail-pass':'home-pass'}"><i class="notch left"></i><i class="notch right"></i><div class="flight-inner">
<div class="flight-header"><div class="flight-pill">${icon('plane',23)} LY 383</div><div class="flight-status"><strong><span class="check">${icon('check',13)}</span>Confirmed</strong><small>Scheduled data</small></div></div>
<div class="flight-route"><div class="airport"><div class="airport-code">TLV</div><div class="airport-name">Ben Gurion Airport</div></div><div class="route-center"><div class="route-line"><span class="route-plane">✈</span></div><div class="duration">◷&nbsp; 3h 28m</div></div><div class="airport right"><div class="airport-code">FCO</div><div class="airport-name">Rome Fiumicino</div></div></div>
<div class="divider"></div>
${detail?`<div class="times"><div class="time"><div class="label">Departs</div><div class="big-time">23:37</div><div class="date">Fri, Aug 21 · Local time</div></div><div class="time-sep"></div><div class="time right"><div class="label">Arrives</div><div class="big-time">01:05</div><div class="date">Sat, Aug 22 · Local time</div></div></div><div class="divider"></div>`:''}
<div class="facts"><div class="fact"><div class="label">${detail?'Terminal':'Departure'}</div><div class="fact-value">${detail?'3':'23:37'}</div><div class="fact-note">${detail?'Departure':'Fri, Aug 21'}</div></div><div class="fact"><div class="label">${detail?'Gate':'Terminal'}</div><div class="fact-value">${detail?'—':'3'}</div><div class="fact-note">${detail?'To be confirmed':'Departure'}</div></div><div class="fact"><div class="label">Seat</div><div class="fact-value">12A</div><div class="fact-note">Economy</div></div></div>
<div class="actions ${detail?'':'compact'}"><button class="primary">${icon('qr',22)}<span>Open Boarding Pass</span><span class="push">${icon('chevron',24)}</span></button>${detail?`<button class="secondary">${icon('navigation',22)} Airport directions</button>`:''}</div>
</div></section>`;
}
function home(){return `<section class="app-screen"><div class="app-content"><div class="brand-row"><div class="brand">tripto<span class="brand-dot">.</span>to</div><button class="profile">${icon('user',28)}</button></div><div class="trip-context"><div><h1>Rome 2026</h1><p>Aug 21, 2026 – Aug 27, 2026</p></div><span class="current-pill">Current trip</span></div>${pass(false)}<div class="section-head"><span class="section-label">Upcoming journey</span><button class="section-link">View all</button></div><div class="summary-row"><div class="summary-icon">${icon('calendar',21)}</div><div><div class="summary-title">Airport to hotel</div><div class="summary-sub">Private transfer</div></div><div class="summary-meta">04:46<br>Sat, Aug 22</div><div>${icon('chevron',22)}</div></div><div class="section-head"><span class="section-label">Trip health</span><button class="section-link">Review</button></div><div class="summary-row"><div class="summary-icon success">${icon('check',24)}</div><div><div class="summary-title">Everything looks good</div><div class="summary-sub">No known trip issues.</div></div><div></div><div>${icon('chevron',22)}</div></div></div>${nav('home')}</section>`}
function flight(){return `<section class="app-screen app-screen--navy"><div class="app-content"><div class="app-bar"><button data-route="home">${icon('back',25)}</button><div class="app-bar-title">Flight Detail</div><button>${icon('share',23)}</button></div>${pass(true)}</div>${nav('flight')}</section>`}
let screen=location.hash.slice(1)||'home';
function render(){document.getElementById('app').innerHTML=screen==='flight'?flight():home()}
document.addEventListener('click',e=>{const route=e.target.closest('[data-route]')?.dataset.route;if(route){screen=route;location.hash=route;render();return}if(e.target.closest('.flight-pass')&&screen==='home'){screen='flight';location.hash='flight';render()}});
window.addEventListener('hashchange',()=>{screen=location.hash.slice(1)||'home';render()});
render();
})();