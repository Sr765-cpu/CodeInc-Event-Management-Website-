const byId=(id)=>document.getElementById(id);
const qs=(s,el=document)=>el.querySelector(s);const qsa=(s,el=document)=>[...el.querySelectorAll(s)];

// ===== Enhanced Navbar Animations =====
const navbar = qs('.navbar');
let lastScroll = 0;

// Add scroll shadow effect
window.addEventListener('scroll', () => {
  const currentScroll = window.pageYOffset;
  
  // Add shadow on scroll
  if (currentScroll > 50) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
  
  lastScroll = currentScroll;
});

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const href = this.getAttribute('href');
    if (href !== '#' && document.querySelector(href)) {
      e.preventDefault();
      document.querySelector(href).scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  });
});

// Add loading state to buttons
qsa('button[type="submit"], .btn-primary').forEach(btn => {
  btn.addEventListener('click', function(e) {
    if (this.form && !this.form.checkValidity()) {
      return;
    }
    this.classList.add('loading');
    setTimeout(() => {
      this.classList.remove('loading');
    }, 2000);
  });
});

// Enhanced form field interactions
qsa('.field input, .field textarea, .field select').forEach(field => {
  field.addEventListener('focus', function() {
    this.parentElement.classList.add('focused');
  });
  
  field.addEventListener('blur', function() {
    this.parentElement.classList.remove('focused');
  });
});

const navToggle=qs('.nav-toggle');
const navLinks=qs('#nav-links');
if(navToggle&&navLinks){
  navToggle.addEventListener('click',()=>{
    const open=navLinks.classList.toggle('open');
    navToggle.setAttribute('aria-expanded',String(open));
  });
}

// ===== Events page interactions =====
(function(){
  const tabs = qsa('.events-toolbar .tab');
  const panels = qsa('.events-panel');
  const mapBtn = byId('toggle-map-btn');
  const mapView = byId('map-view');
  const mapIframe = byId('map-iframe');
  const createBtn = byId('create-event-btn');
  const createModal = byId('create-event-modal');
  const createForm = byId('create-event-form');
  if(tabs.length){
    function activateTab(name){
      tabs.forEach(t=>{const on=t.dataset.tab===name;t.classList.toggle('active',on);t.setAttribute('aria-selected',String(on));});
      panels.forEach(p=>{p.classList.toggle('hidden', p.dataset.panel!==name);});
    }
    tabs.forEach(t=>t.addEventListener('click',()=>activateTab(t.dataset.tab)));
    // default
    activateTab(qs('.events-toolbar .tab.active')?.dataset.tab||'upcoming');
  }

  const API_BASE = 'http://localhost:4000';

  // slider buttons for panels
  qsa('.events-panel').forEach(panel=>{
    const grid = qs('.events-grid', panel);
    const left = qs('.scroll-btn.left', panel);
    const right = qs('.scroll-btn.right', panel);
    if(grid && left){ left.addEventListener('click',()=>{ grid.scrollBy({left: -grid.clientWidth, behavior:'smooth'}); }); }
    if(grid && right){ right.addEventListener('click',()=>{ grid.scrollBy({left: grid.clientWidth, behavior:'smooth'}); }); }
  });

  const searchInp = byId('filter-search');
  const catSel = byId('filter-category');
  const fromSel = byId('filter-from');
  const toSel = byId('filter-to');
  const locInp = byId('filter-location');
  const radiusSel = byId('filter-radius');
  const sortSel = byId('sort-by');
  const clearBtn = byId('clear-filters');
  const useLocBtn = byId('use-location');
  const eventCards = qsa('.event-card');

  function panelFor(event){
    if(event.ongoing) return 'ongoing';
    const now = new Date();
    const endDate = new Date(event.end || event.start);
    return endDate < now ? 'past' : 'upcoming';
  }

  function renderEventCard(ev){
    const panelName = panelFor(ev);
    const grid = qs(`.events-panel[data-panel="${panelName}"] .events-grid`);
    if(!grid) return;
    const dateAttr = (ev.start||'').slice(0,10);
    const startDate = ev.start ? new Date(ev.start) : null;
    const endDate = ev.end ? new Date(ev.end) : null;
    const startTxt = (startDate && !isNaN(startDate)) ? startDate.toLocaleString([], { dateStyle:'medium', timeStyle:'short' }) : 'Date TBA';
    const endTxt = (endDate && !isNaN(endDate)) ? endDate.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : '';
    const dateDisplay = endTxt ? `${startTxt} – ${endTxt}` : startTxt;
    const category = ev.category || 'General';
    const categoryDisplay = category.charAt(0).toUpperCase() + category.slice(1);
    const liveBadge = ev.ongoing && panelName==='ongoing' ? '<span class="live">Live Now</span>' : '';
    const joinOrRegister = panelName==='ongoing' ? 'Join' : (panelName==='past' ? 'Gallery' : 'Register');
    const joinHref = panelName==='past'
      ? '#'
      : `participant-registration.html?eventId=${encodeURIComponent(ev.id||'')}`;
    const banner = ev.banner || 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1200&auto=format&fit=crop';
    const html = `
      <article class="event-card ${panelName==='past'?'past':''} ${ev.ongoing?'live':''} reveal" data-id="${ev.id||''}" data-category="${category.toLowerCase()}" data-date="${dateAttr}" data-location="${ev.city||''}">
        <img src="${banner}" alt="${ev.title||'Event'}">
        <div class="event-body">
          <div class="event-head">
            <h3>${ev.title||'Untitled Event'}</h3>
            <span class="chip">${categoryDisplay}</span>
            ${liveBadge}
          </div>
          <ul class="meta">
            <li>📅 ${dateDisplay}</li>
            <li>📍 <a target="_blank" href="https://maps.google.com/?q=${encodeURIComponent(ev.city||'')}">${ev.city||'TBA'}</a></li>
          </ul>
          <p class="desc">${ev.desc||''}</p>
          <div class="actions">
            <a class="btn btn-secondary" href="${joinHref}">${joinOrRegister}</a>
            ${panelName!=='past' ? '<a class="btn btn-ghost" href="volunteers.html#login">Volunteer</a>' : ''}
            <button class="btn btn-ghost share-btn" data-title="${ev.title||'Event'}" data-url="events.html">Share</button>
            ${panelName!=='past' && panelName!=='upcoming' ? `<button class="btn btn-ghost rsvp-btn">RSVP</button>` : ''}
            ${panelName!=='past' && panelName!=='upcoming' ? `<button class="btn btn-ghost calendar-btn" data-title="${ev.title||'Event'}" data-start="${(ev.start||'').replace(/[-:]/g,'').replace('.000','').replace('Z','')}" data-end="${(ev.end||'').replace(/[-:]/g,'').replace('.000','').replace('Z','')}" data-location="${ev.city||''}">Add to Calendar</button>` : ''}
          </div>
        </div>
      </article>`;
    const temp = document.createElement('div'); temp.innerHTML = html.trim();
    const card = temp.firstElementChild;
    grid.prepend(card);
    // observe for scroll-reveal if available
    if(window.__revealIO){ window.__revealIO.observe(card); }
    // bind btns
    card.querySelectorAll('.share-btn').forEach(btn=>btn.addEventListener('click',async ()=>{
      const title=btn.dataset.title||'Event';
      const url=new URL('events.html', window.location.origin).toString();
      if(navigator.share){ try{ await navigator.share({title,url}); } catch{} } else { navigator.clipboard?.writeText(url); alert('Event link copied'); }
    }));
    card.querySelectorAll('.calendar-btn').forEach(btn=>btn.addEventListener('click',()=>{
      const title=encodeURIComponent(btn.dataset.title||'Event');
      const start=btn.dataset.start; const end=btn.dataset.end; const loc=encodeURIComponent(btn.dataset.location||'');
      window.open(`https://calendar.google.com/calendar/u/0/r/eventedit?text=${title}&dates=${start}/${end}&location=${loc}`,'_blank');
    }));
    card.querySelectorAll('.rsvp-btn').forEach(b=>b.addEventListener('click',()=>openRsvp(card)));
  }

  async function loadEvents(){
    try{
      const res = await fetch(`${API_BASE}/api/events`);
      const data = await res.json();
      (data.events||[]).forEach(renderEventCard);
      applyFilters();
      // If redirected from Template creation, render pending and highlight
      renderPendingEventAndHighlight();
    }catch(e){ /* ignore offline */ }
  }
  // kick off fetch if on events page
  if(qs('.events-toolbar')) loadEvents();

  function textMatches(card){
    const q=(searchInp?.value||'').trim().toLowerCase();
    if(!q) return true;
    const text=(card.textContent||'').toLowerCase();
    return text.includes(q);
  }

  function applyFilters(){
    const cat=(catSel?.value||'').toLowerCase();
    const from= fromSel?.value ? new Date(fromSel.value) : null;
    const to= toSel?.value ? new Date(toSel.value) : null;
    const loc=(locInp?.value||'').toLowerCase();
    const radiusKm = (radiusSel && radiusSel.value!=='any') ? Number(radiusSel.value) : null;
    const currentCards = qsa('.event-card');
    currentCards.forEach(card=>{
      const c=(card.dataset.category||'').toLowerCase();
      const d=new Date(card.dataset.date||'2100-01-01');
      const l=(card.dataset.location||'').toLowerCase();
      let show=true;
      if(cat && c!==cat) show=false;
      if(from && d<from) show=false;
      if(to && d>to) show=false;
      if(loc && !l.includes(loc)) show=false;
      if(show && !textMatches(card)) show=false;
      // Optional radius filter: works only when card exposes data-lat/data-lng and we have window.__userLoc
      if(show && radiusKm && window.__userLoc && card.dataset.lat && card.dataset.lng){
        const lat=parseFloat(card.dataset.lat); const lng=parseFloat(card.dataset.lng);
        const toRad=(v)=>v*Math.PI/180;
        const R=6371; // km
        const dLat=toRad(lat-window.__userLoc.lat);
        const dLng=toRad(lng-window.__userLoc.lng);
        const a=Math.sin(dLat/2)**2+Math.cos(toRad(window.__userLoc.lat))*Math.cos(toRad(lat))*Math.sin(dLng/2)**2;
        const dist=2*R*Math.asin(Math.sqrt(a));
        if(dist>radiusKm) show=false;
      }
      card.style.display = show? '' : 'none';
    });
    applySort();
  }
  function applySort(){
    if(!sortSel) return;
    const val=sortSel.value;
    ['upcoming','ongoing','past'].forEach(panelName=>{
      const grid = qs(`.events-panel[data-panel="${panelName}"] .events-grid`);
      if(!grid) return;
      const cards=[...qsa('.event-card',grid)].filter(c=>c.style.display!=='none');
      cards.sort((a,b)=>{
        const da=new Date(a.dataset.date||'2100-01-01');
        const db=new Date(b.dataset.date||'2100-01-01');
        if(val==='soonest') return da-db;
        if(val==='latest') return db-da;
        return 0;
      });
      cards.forEach(c=>grid.appendChild(c));
    });
  }
  ;[searchInp,catSel,fromSel,toSel,locInp,radiusSel,sortSel].forEach(el=>{ if(el) el.addEventListener('input', applyFilters); });
  if(clearBtn){
    clearBtn.addEventListener('click',()=>{
      if(searchInp) searchInp.value='';
      if(catSel) catSel.value='';
      if(fromSel) fromSel.value='';
      if(toSel) toSel.value='';
      if(locInp) locInp.value='';
      if(radiusSel) radiusSel.value='any';
      applyFilters();
    });
  }
  if(useLocBtn){
    useLocBtn.addEventListener('click',()=>{
      if(!navigator.geolocation){ alert('Geolocation not supported'); return; }
      navigator.geolocation.getCurrentPosition((pos)=>{
        const {latitude:lat, longitude:lng}=pos.coords; window.__userLoc={lat,lng};
        // Update map and location input with coordinates
        if(mapIframe){ mapIframe.src = `https://www.google.com/maps?q=${lat},${lng}&output=embed`; }
        if(locInp){ locInp.value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`; }
        applyFilters();
      },()=>alert('Unable to fetch location'));
    });
  }
  if(locInp && mapIframe){
    locInp.addEventListener('change',()=>{
      const q = encodeURIComponent(locInp.value||'Pune');
      mapIframe.src = `https://www.google.com/maps?q=${q}&output=embed`;
    });
  }

  // Map toggle
  if(mapBtn && mapView){
    mapBtn.addEventListener('click',()=>{
      const hidden = mapView.classList.toggle('hidden');
      mapBtn.textContent = hidden ? 'Map View' : 'Hide Map';
    });
  }

  // RSVP & Volunteer modals
  const rsvpModal = byId('rsvp-modal');
  const rsvpForm = byId('rsvp-form');
  const rsvpEventId = byId('rsvp-event-id');
  const rsvpEventTitle = byId('rsvp-event-title');
  const volModal = byId('volunteer-modal');
  const volForm = byId('volunteer-form');
  const volEventId = byId('vol-event-id');
  const volEventTitle = byId('vol-event-title');

  function openModalEl(modal){ if(modal){ modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); } }
  function closeModalEl(modal){ if(modal){ modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); } }
  document.addEventListener('click',(e)=>{
    const t=e.target;
    if(t && (t.matches('[data-close]') || t.classList.contains('modal-backdrop'))){
      if(rsvpModal && rsvpModal.contains(t)) closeModalEl(rsvpModal);
      if(volModal && volModal.contains(t)) closeModalEl(volModal);
    }
  });
  document.addEventListener('keydown',(e)=>{ if(e.key==='Escape'){ closeModalEl(rsvpModal); closeModalEl(volModal); }});

  function openRsvp(card){
    const id = card.dataset.id || '';
    const title = (qs('h3',card)?.textContent||'').trim();
    if(rsvpEventId) rsvpEventId.value = id;
    if(rsvpEventTitle) rsvpEventTitle.textContent = title;
    openModalEl(rsvpModal);
  }
  function openVolunteer(card){
    const id = card.dataset.id || '';
    const title = (qs('h3',card)?.textContent||'').trim();
    if(volEventId) volEventId.value = id;
    if(volEventTitle) volEventTitle.textContent = title;
    // Populate event type from data-category
    const cat = (card.dataset.category||'').toLowerCase();
    const typeEl = byId('vol-event-type');
    if(typeEl){
      const pretty = cat ? cat.charAt(0).toUpperCase()+cat.slice(1) : 'General';
      typeEl.textContent = pretty;
    }
    // Suggest roles by category
    const rolesEl = byId('vol-roles');
    if(rolesEl){
      const suggestions = {
        community: ['registration','usher','cleaning','hospitality','logistics'],
        environment: ['cleaning','logistics','registration'],
        health: ['firstaid','registration','hospitality'],
        education: ['tech','registration','usher'],
        workshop: ['tech','registration','hospitality']
      };
      const prefs = suggestions[cat]||[];
      // clear previous selections
      Array.from(rolesEl.options).forEach(o=>{ o.selected = prefs.includes(o.value); });
    }
    openModalEl(volModal);
  }

  if(rsvpForm){
    rsvpForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd=new FormData(rsvpForm);
      const id=fd.get('eventId');
      const name=fd.get('name')?.toString().trim();
      const email=fd.get('email')?.toString().trim();
      const message=fd.get('message')?.toString().trim();
      if(!id||!name||!email){ alert('Please fill required fields'); return; }
      try{
        const res=await fetch(`http://localhost:4000/api/events/${id}/rsvp`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,message})});
        const data=await res.json();
        if(!res.ok) throw new Error(data.message||'Failed to submit RSVP');
        alert('RSVP submitted.');
        rsvpForm.reset();
        closeModalEl(rsvpModal);
      }catch(err){ alert(err.message||'Network error'); }
    });
  }
  if(volForm){
    volForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd=new FormData(volForm);
      const id=fd.get('eventId');
      const name=fd.get('name')?.toString().trim();
      const email=fd.get('email')?.toString().trim();
      const phone=fd.get('phone')?.toString().trim();
      const address=fd.get('address')?.toString().trim();
      const speciality=fd.get('speciality')?.toString();
      const availableDates=fd.get('availableDates')?.toString().trim();
      const availabilityTimes=fd.get('availabilityTimes')?.toString().trim();
      const status=fd.get('status')?.toString();
      const roles = Array.from((byId('vol-roles')?.selectedOptions)||[]).map(o=>o.value);
      const motivation=fd.get('motivation')?.toString().trim();
      const emergencyName=fd.get('emergencyName')?.toString().trim();
      const emergencyPhone=fd.get('emergencyPhone')?.toString().trim();
      const tshirt=fd.get('tshirt')?.toString();
      const transport=fd.get('transport')?.toString().trim();
      const message=fd.get('message')?.toString().trim();
      const consentWaiver=byId('vol-consent-waiver')?.checked||false;
      const consentBgCheck=byId('vol-consent-bg')?.checked||false;
      if(!id){ alert('This event is still syncing. Please refresh the page and try again.'); return; }
      if(!name||!email){ alert('Please fill required fields'); return; }
      try{
        const payload = {
          name,
          email,
          phone,
          address,
          speciality,
          availableDates,
          availabilityTimes,
          status,
          roles,
          motivation,
          emergencyName,
          emergencyPhone,
          tshirt,
          transport,
          message,
          consentWaiver,
          consentBgCheck,
        };
        const res=await fetch(`http://localhost:4000/api/events/${id}/volunteer`,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify(payload),
        });
        const data=await res.json();
        if(!res.ok) throw new Error(data.message||'Failed to submit Volunteer request');
        alert('Thanks for volunteering! Taking you to Volunteers...');
        volForm.reset();
        closeModalEl(volModal);
        window.location.href = 'volunteers.html';
      }catch(err){ alert(err.message||'Network error'); }
    });
  }

  function highlightCard(card){
    if(!card) return;
    card.scrollIntoView({behavior:'smooth', block:'center', inline:'center'});
    const prev = card.style.boxShadow;
    card.style.boxShadow = '0 0 0 3px rgba(255,215,0,.9), 0 0 18px rgba(255,105,180,.6)';
    setTimeout(()=>{ card.style.boxShadow = prev; }, 2200);
  }

  function findCardBy(title,dateStr,city){
    const t = String(title||'').trim().toLowerCase();
    const d = String(dateStr||'');
    const c = String(city||'').trim().toLowerCase();
    return qsa('.event-card').find(card=>{
      const h=(qs('h3',card)?.textContent||'').trim().toLowerCase();
      const dd=card.dataset.date||'';
      const loc=(card.dataset.location||'').toLowerCase();
      return h===t && dd===d && (!c || loc.includes(c));
    });
  }

  function renderPendingEventAndHighlight(){
    try{
      // Preferred: full pending event payload
      const raw = localStorage.getItem('eventnest_pending_event');
      if(raw){
        const ev = JSON.parse(raw);
        localStorage.removeItem('eventnest_pending_event');
        renderEventCard(ev);
        const card = findCardBy(ev.title, (ev.start||'').slice(0,10), ev.city);
        highlightCard(card);
        return;
      }
      // Fallback: minimal marker
      const raw2 = localStorage.getItem('eventnest_new_event');
      if(raw2){
        const m = JSON.parse(raw2);
        localStorage.removeItem('eventnest_new_event');
        const card = findCardBy(m.title, m.date, m.city);
        highlightCard(card);
      }
    }catch{}
  }

  // Create Event modal
  function openCreate(){ if(createModal){ createModal.classList.add('open'); createModal.setAttribute('aria-hidden','false'); } }
  function closeCreate(){ if(createModal){ createModal.classList.remove('open'); createModal.setAttribute('aria-hidden','true'); } }
  if(createBtn){ createBtn.addEventListener('click', openCreate); }
  if(createModal){
    createModal.addEventListener('click',(e)=>{ const t=e.target; if(t && (t.matches('[data-close]') || t.classList.contains('modal-backdrop'))) closeCreate(); });
    document.addEventListener('keydown',(e)=>{ if(e.key==='Escape' && createModal.classList.contains('open')) closeCreate(); });
  }

  // Create Event submit → POST backend and render
  if(createForm){
    createForm.addEventListener('submit',async (e)=>{
      e.preventDefault();
      const fd = new FormData(createForm);
      const title = (fd.get('title')||'').toString().trim();
      const category = (fd.get('category')||'').toString();
      const organizer = (fd.get('organizer')||'').toString().trim();
      const city = (fd.get('city')||'').toString().trim();
      const start = (fd.get('start')||'').toString();
      const end = (fd.get('end')||'').toString();
      const banner = (fd.get('banner')||'').toString().trim() || 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1200&auto=format&fit=crop';
      const desc = (fd.get('desc')||'').toString().trim();
      const ongoing = fd.get('ongoing')==='on';
      if(!title||!category||!organizer||!city||!start||!end||!desc){ alert('Please fill all required fields.'); return; }
      try{
        const res = await fetch(`${API_BASE}/api/events`,{
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ title, category, organizer, city, start, end, banner, desc, ongoing })
        });
        const data = await res.json();
        if(!res.ok) throw new Error(data.message||'Failed to create event');
        renderEventCard(data.event);
        createForm.reset();
        closeCreate();
        applyFilters();
      }catch(err){ alert(err.message||'Network error'); }
    });
  }

  // Share
  qsa('.share-btn').forEach(btn=>{
    btn.addEventListener('click',async ()=>{
      const title=btn.dataset.title||'Event';
      const url= new URL(btn.dataset.url||window.location.href, window.location.origin).toString();
      if(navigator.share){ try{ await navigator.share({title, url}); } catch{} }
      else { navigator.clipboard?.writeText(url); alert('Event link copied to clipboard'); }
    });
  });

  // Calendar
  qsa('.calendar-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const title=encodeURIComponent(btn.dataset.title||'Event');
      const start=btn.dataset.start; // YYYYMMDDTHHMMSS
      const end=btn.dataset.end;
      const loc=encodeURIComponent(btn.dataset.location||'');
      const gcal=`https://calendar.google.com/calendar/u/0/r/eventedit?text=${title}&dates=${start}/${end}&location=${loc}`;
      window.open(gcal,'_blank');
    });
  });

  // RSVP / Volunteer (mock)
  qsa('.rsvp-btn').forEach(b=>b.addEventListener('click',()=>alert('RSVP received. See you there!')));
  qsa('.volunteer-btn').forEach(b=>b.addEventListener('click',()=>alert('Thanks for volunteering! The organizer will contact you.')));
})();

// Navbar login dropdown logic
const loginNav=qs('#login-nav');
const loginLinkDd=qs('#login-link');
const dropdown=qs('#login-dropdown');
const selectDd=qs('#login-select-dd');
const formDd=qs('#login-form-dd');
const roleLabelDd=qs('#role-label-dd');
const backDd=qs('#back-to-select-dd');
const authTabs= qsa('.auth-tab');
const submitDdBtn= qs('#submit-dd');
const signupOnly= qs('#signup-only');
const nameDd= qs('#dd-name');
const addressDd= qs('#dd-address');
const emailDd= qs('#dd-email');
const passwordDd= qs('#dd-password');
const pwToggleDd= qs('#pw-toggle-dd');
const rememberDd= qs('#remember-dd');
const goSignupBtn= qs('#go-signup');
const switchRoleBtn= qs('#switch-role-btn');
let currentRoleDd='user';
let authModeDd='login'; // 'login' | 'signup'

function openDd(){loginNav.classList.add('open');loginLinkDd.setAttribute('aria-expanded','true');dropdown.hidden=false;}
function closeDd(){loginNav.classList.remove('open');loginLinkDd.setAttribute('aria-expanded','false');dropdown.hidden=true;showSelectDd();}
function showFormDd(role){currentRoleDd=role;roleLabelDd.textContent=role==='participant'?'Participant':'User';selectDd.hidden=true;formDd.hidden=false;qs('#dd-name').focus();updateSubmitLabel();}
function showSelectDd(){selectDd.hidden=false;formDd.hidden=true;}
const roleToggleDd=qs('#role-toggle-dd');
if(roleToggleDd){
  roleToggleDd.addEventListener('click',()=>{
    const next=currentRoleDd==='user'?'participant':'user';
    showFormDd(next);
  });
}

// Disabled - login link now redirects to login.html page
// if(loginLinkDd){
//   loginLinkDd.addEventListener('click',(e)=>{
//     e.preventDefault();
//     const isOpen=loginNav.classList.contains('open');
//     isOpen?closeDd():openDd();
//   });
// }

// auth mode switching
authTabs.forEach(tab=>{
  tab.addEventListener('click',()=>{
    const mode=tab.getAttribute('data-auth-mode');
    setAuthModeDd(mode);
  });
});
updateSubmitLabel();

// default UI state
setAuthModeDd('login');
if(localStorage.getItem('eventnest_email') && emailDd){ emailDd.value = localStorage.getItem('eventnest_email'); }
// (removed) previously auto-opened Volunteers login after submit

// password toggle
if(pwToggleDd && passwordDd){
  pwToggleDd.addEventListener('click',()=>{
    const isPw = passwordDd.type==='password';
    passwordDd.type = isPw ? 'text' : 'password';
    pwToggleDd.setAttribute('aria-label', isPw ? 'Hide password' : 'Show password');
  });
}

// go to signup link
if(goSignupBtn){ goSignupBtn.addEventListener('click',()=> setAuthModeDd('signup')); }

qsa('[data-role-dd]','#login-dropdown').forEach(btn=>{
  btn.addEventListener('click',()=>{const role=btn.getAttribute('data-role-dd');showFormDd(role);});
});
if(backDd){backDd.addEventListener('click',showSelectDd);}

document.addEventListener('click',(e)=>{
  if(!loginNav.contains(e.target) && dropdown && !dropdown.hidden){closeDd();}
});

if(formDd){
  formDd.addEventListener('submit',async (e)=>{
    e.preventDefault();
    const fd=new FormData(formDd);
    const payload={
      role: currentRoleDd,
      name: fd.get('name')?.toString().trim(),
      email: fd.get('email')?.toString().trim(),
      address: fd.get('address')?.toString().trim(),
      password: fd.get('password')?.toString()
    };
    if(!payload.name||!payload.email||!payload.address||!payload.password){alert('Please fill all fields.');return;}
    try{
      const endpoint = authModeDd==='signup' ? 'http://localhost:4000/api/auth/register' : 'http://localhost:4000/api/auth/login';
      const res=await fetch(endpoint,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
      });
      const data=await res.json();
      if(!res.ok) throw new Error(data.message||'Login failed');
      const actionText = authModeDd==='signup' ? 'Signed up' : 'Logged in';
      alert(`Welcome ${data.user.name}! ${actionText} as ${data.user.role}.`);
      if(rememberDd && rememberDd.checked && emailDd){ localStorage.setItem('eventnest_email', emailDd.value); }
      formDd.reset();
      closeDd();
    }catch(err){
      alert(err.message||'Network error');
    }
  });
}

const sidebarToggle=qs('.sidebar-toggle');
const registerForm=qs('#register-form');
if(sidebarToggle&&registerForm){
  sidebarToggle.addEventListener('click',()=>{
    const open=registerForm.classList.toggle('open');
    sidebarToggle.setAttribute('aria-expanded',String(open));
  });
}

const yearEl=byId('year');
if(yearEl){yearEl.textContent=String(new Date().getFullYear());}

function animateCount(el){
  const target=Number(el.dataset.target||'0');
  const dur=1200;const start=performance.now();
  const step=(t)=>{const p=Math.min((t-start)/dur,1);el.textContent=Math.floor(p*target).toLocaleString();if(p<1)requestAnimationFrame(step)};requestAnimationFrame(step);
}

async function syncVolunteerCount(){
  try{
    const statEl = qs('#stats .stat:nth-child(3) .num');
    if(!statEl) return;
    const res = await fetch('http://localhost:4000/api/volunteers');
    const data = await res.json();
    if(!res.ok || !data || !data.stats) return;
    const total = Number(data.stats.totalVolunteers || 0);
    statEl.dataset.target = String(total);
    // If stats already animated, keep the displayed number in sync
    if(statEl.textContent && statEl.textContent !== '0'){
      statEl.textContent = total.toLocaleString();
    }
  }catch(e){
    // Ignore if API is not reachable; fall back to static value
  }
}

syncVolunteerCount();
const io=new IntersectionObserver((entries)=>{
  entries.forEach(e=>{if(e.isIntersecting){qsa('.num',e.target).forEach(animateCount);io.unobserve(e.target);}});
},{threshold:.4});
const stats=qs('#stats');if(stats)io.observe(stats);

// ===== Global scroll-reveal (highlights, events, upcoming, stats) =====
(function(){
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches){ return; }
  const revealIO = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){ entry.target.classList.add('in'); revealIO.unobserve(entry.target); }
    });
  }, { threshold: 0.15 });
  window.__revealIO = revealIO;
  const targets = qsa('.highlights .card, .events-page .event-card, .upcoming .eh-card, .stats .stat');
  targets.forEach(el=>{ if(!el.classList.contains('reveal')) el.classList.add('reveal'); revealIO.observe(el); });
})();

// ===== Compact Parallax (data-parallax="<speed>") =====
(function(){
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(prefersReduced) return;
  const els = ()=> qsa('[data-parallax]');
  let ticking=false;
  function apply(){
    const y = window.scrollY || window.pageYOffset;
    els().forEach(el=>{
      const s = parseFloat(el.getAttribute('data-parallax')||'0.25');
      el.style.transform = `translateY(${Math.round(y * s)}px)`;
    });
    ticking=false;
  }
  function onScroll(){ if(!ticking){ ticking=true; requestAnimationFrame(apply); } }
  window.addEventListener('scroll', onScroll, {passive:true});
  window.addEventListener('load', apply);
})();

const slider=qs('.slider');
if(slider){
  const slidesWrap=qs('.slides',slider);const slides=qsa('.slide',slidesWrap);
  const prev=qs('.prev',slider);const next=qs('.next',slider);
  const dotsWrap=qs('.dots',slider);
  const progressBar=qs('.slider-progress .bar',slider);
  let index=0;let timer;const len=slides.length;const progressMs=5000;
  function updateDots(){ if(!dotsWrap) return; const btns=qsa('button',dotsWrap); btns.forEach((b,i)=>{ const on=i===index; b.classList.toggle('active',on); b.setAttribute('aria-selected', String(on)); }); }
  function animateProgress(){ if(!progressBar) return; progressBar.style.transition='none'; progressBar.style.width='0%'; requestAnimationFrame(()=>{ requestAnimationFrame(()=>{ progressBar.style.transition=`width ${progressMs}ms linear`; progressBar.style.width='100%'; }); }); }
  function go(i){ index=(i+len)%len; slidesWrap.style.transform=`translateX(-${index*100}%)`; updateDots(); animateProgress(); }
  function start(){ if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return; stop(); animateProgress(); timer=setInterval(()=>go(index+1),progressMs); }
  function stop(){ if(timer)clearInterval(timer); }
  if(dotsWrap){ dotsWrap.innerHTML=''; slides.forEach((_,i)=>{ const b=document.createElement('button'); b.type='button'; b.role='tab'; b.setAttribute('aria-label',`Go to slide ${i+1}`); b.addEventListener('click',()=>{ go(i); start(); }); dotsWrap.appendChild(b); }); }
  if(prev)prev.addEventListener('click',()=>{ go(index-1); start(); });
  if(next)next.addEventListener('click',()=>{ go(index+1); start(); });
  slider.addEventListener('mouseenter',stop); slider.addEventListener('mouseleave',start);
  slider.setAttribute('tabindex','0');
  slider.addEventListener('keydown',(e)=>{ if(e.key==='ArrowLeft'){ e.preventDefault(); go(index-1); start(); } if(e.key==='ArrowRight'){ e.preventDefault(); go(index+1); start(); } });
  let sx=0,dx=0; slider.addEventListener('touchstart',(e)=>{ sx=e.touches[0].clientX; dx=0; stop(); },{passive:true});
  slider.addEventListener('touchmove',(e)=>{ dx=e.touches[0].clientX - sx; },{passive:true});
  slider.addEventListener('touchend',()=>{ if(Math.abs(dx)>30){ if(dx<0) go(index+1); else go(index-1); } start(); },{passive:true});
  updateDots();
  start();
}

// Get Started → navigate to Events
const getStartedBtn = byId('get-started-btn');
if(getStartedBtn){ getStartedBtn.addEventListener('click',(e)=>{ e.preventDefault(); window.location.href = 'event.html'; }); }

const form=qs('#register-form');
if(form){
  form.addEventListener('submit',(e)=>{
    e.preventDefault();
    const data=Object.fromEntries(new FormData(form).entries());
    if(!data.name||!data.email||!data.location||!data.interest){alert('Please fill all fields.');return;}
    alert('Thanks for registering!');
    form.reset();
  });
}

// Login modal logic
const loginLink=qs('#login-link');
const modal=qs('#login-modal');
const modalDialog=qs('.modal-dialog',modal||document);
const closeEls=qsa('[data-close]',modal||document);
const selectView=qs('#login-select');
const formView=qs('#login-form');
const roleLabel=qs('#role-label');
const backBtn=qs('#back-to-select');
let currentRole='user';

function openModal(){if(!modal)return;modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';}
function closeModal(){if(!modal)return;modal.classList.remove('open');modal.setAttribute('aria-hidden','true');document.body.style.overflow='';showSelect();}
function showForm(role){currentRole=role;roleLabel.textContent=role==='participant'?'Participant':'User';selectView.hidden=true;formView.hidden=false;qs('#login-name').focus();}
function showSelect(){selectView.hidden=false;formView.hidden=true;}
const roleToggle=qs('#role-toggle');
if(roleToggle){
  roleToggle.addEventListener('click',()=>{
    const next=currentRole==='user'?'participant':'user';
    showForm(next);
  });
}

// Disabled - login link now redirects to login.html page
// if(loginLink){loginLink.addEventListener('click',(e)=>{e.preventDefault();openModal();});}
closeEls.forEach(el=>el.addEventListener('click',closeModal));
if(modal){modal.addEventListener('click',(e)=>{if(e.target===modal)closeModal();});}
document.addEventListener('keydown',(e)=>{if(e.key==='Escape')closeModal();});

qsa('[data-role]','#login-modal').forEach(btn=>{
  btn.addEventListener('click',()=>{const role=btn.getAttribute('data-role');showForm(role);});
});
if(backBtn){backBtn.addEventListener('click',showSelect);}

const loginForm=formView;
if(loginForm){
  loginForm.addEventListener('submit',async (e)=>{
    e.preventDefault();
    const fd=new FormData(loginForm);
    const payload={
      role: currentRole,
      name: fd.get('name')?.toString().trim(),
      email: fd.get('email')?.toString().trim(),
      address: fd.get('address')?.toString().trim(),
      password: fd.get('password')?.toString()
    };
    if(!payload.name||!payload.email||!payload.address||!payload.password){alert('Please fill all fields.');return;}
    try{
      const res=await fetch('http://localhost:4000/api/auth/login',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
      });
      const data=await res.json();
      if(!res.ok){throw new Error(data.message||'Login failed');}
      alert(`Welcome ${data.user.name}! Logged in as ${data.user.role}.`);
      loginForm.reset();
      closeModal();
    }catch(err){
      alert(err.message||'Network error');
    }
  });
}

// ===== Templates page interactions =====
(function(){
  const tplToolbar = qs('.templates-toolbar');
  if(!tplToolbar) return;
  const API_BASE = 'http://localhost:4000';
  const tabs = qsa('.templates-toolbar .tab');
  const panels = qsa('.tpl-panel');
  const searchInp = byId('tpl-search');
  const catSel = byId('tpl-category');
  const dateInp = byId('tpl-date');
  const locInp = byId('tpl-location');
  const sortSel = byId('tpl-sort');
  const grid = byId('tpl-grid');
  const myGrid = byId('mytpl-grid');
  const createBtn = byId('create-template-btn');
  const createModal = byId('create-template-modal');
  const createForm = byId('create-template-form');
  const createCardForm = byId('create-template-card-form');
  let templates = [];

  function activateTab(name){
    tabs.forEach(t=>{const on=t.dataset.tab===name;t.classList.toggle('active',on);t.setAttribute('aria-selected',String(on));});
    panels.forEach(p=>{p.classList.toggle('hidden', p.dataset.panel!==name);});
    if(name==='mine') renderMyTemplates();
  }
  tabs.forEach(t=>t.addEventListener('click',()=>activateTab(t.dataset.tab)));
  activateTab(qs('.templates-toolbar .tab.active')?.dataset.tab||'browse');

  function getMy(){ try{return JSON.parse(localStorage.getItem('my_templates')||'[]');}catch{return []} }
  function setMy(list){ localStorage.setItem('my_templates', JSON.stringify(list)); }

  function renderCard(t){
    const img = (t.images&&t.images[0])||'https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=1200&auto=format&fit=crop';
    const dt = t.datetime ? new Date(t.datetime).toLocaleString([], { dateStyle:'medium', timeStyle:'short' }) : '';
    const el = document.createElement('article');
    el.className = 'card';
    el.dataset.id = t.id;
    el.dataset.category = (t.category||'').toLowerCase();
    el.dataset.location = (t.location||'').toLowerCase();
    el.dataset.date = (t.datetime||'').slice(0,10);
    el.innerHTML = `
      <img src="${img}" alt="${t.title||'Template'}">
      <div class="card-body tpl-card-body">
        <div class="tpl-card-header">
          <h3>${t.title||'Untitled Template'}</h3>
          <span class="tpl-chip">${t.category||'Template'}</span>
        </div>
        <p class="desc">${t.description||''}</p>
        <ul class="meta tpl-meta">
          <li>📅 ${dt || 'Date TBA'}</li>
          <li>📍 ${t.location||'Location TBA'}</li>
          <li>👤 ${t.organizer||'Organizer'}</li>
        </ul>
        <div class="tpl-card-actions actions">
          <button class="btn btn-secondary tpl-summary-btn" type="button">Generate Summary</button>
          <button class="btn btn-ghost tpl-edit-btn" type="button">Edit</button>
          <button class="btn btn-ghost btn-danger tpl-delete-btn" type="button">Delete</button>
        </div>
      </div>`;

    const summaryBtn = el.querySelector('.tpl-summary-btn');
    const editBtn = el.querySelector('.tpl-edit-btn');
    const deleteBtn = el.querySelector('.tpl-delete-btn');

    if(summaryBtn){
      summaryBtn.addEventListener('click', () => {
        const lines = [
          `Event: ${t.title||''}`,
          dt ? `When: ${dt}` : '',
          t.location ? `Where: ${t.location}` : '',
          t.organizer ? `Organizer: ${t.organizer}` : '',
          '',
          (t.description||'').trim()
        ].filter(Boolean).join('\n');
        alert(lines || 'No details available yet.');
      });
    }

    if(editBtn && createForm){
      editBtn.addEventListener('click', () => {
        createForm.dataset.editId = t.id;
        const titleInp = byId('ct-title-inp');
        const descInp = byId('ct-desc');
        const dtInp = byId('ct-datetime');
        const locInp = byId('ct-location');
        const imgInp = byId('ct-images');
        const orgInp = byId('ct-organizer');
        const catSel = byId('ct-category');
        if(titleInp) titleInp.value = t.title||'';
        if(descInp) descInp.value = t.description||'';
        if(dtInp) dtInp.value = t.datetime||'';
        if(locInp) locInp.value = t.location||'';
        if(imgInp) imgInp.value = (t.images&&t.images[0])||'';
        if(orgInp) orgInp.value = t.organizer||'';
        if(catSel) catSel.value = t.category||'';
        openCreate();
      });
    }

    if(deleteBtn){
      deleteBtn.addEventListener('click', async () => {
        if(!confirm('Delete this template?')) return;
        try{
          const res = await fetch(`${API_BASE}/api/templates/${t.id}`,{ method:'DELETE' });
          if(res.ok){
            templates = templates.filter(x=>x.id!==t.id);
            renderTemplates();
          }
        }catch{}
      });
    }
    return el;
  }

  function matchesFilters(el){
    const q=(searchInp?.value||'').toLowerCase();
    const cat=(catSel?.value||'').toLowerCase();
    const d = dateInp?.value ? new Date(dateInp.value) : null;
    const loc=(locInp?.value||'').toLowerCase();
    let ok=true;
    if(q){ const text=(el.textContent||'').toLowerCase(); if(!text.includes(q)) ok=false; }
    if(cat && el.dataset.category!==cat) ok=false;
    if(d){ const ed=new Date(el.dataset.date||'2100-01-01'); if(ed.toDateString()!==d.toDateString()) ok=false; }
    if(loc && !(el.dataset.location||'').includes(loc)) ok=false;
    return ok;
  }

  function sortCards(cards){
    const s=sortSel?.value||'newest';
    if(s==='popular') cards.sort((a,b)=>{
      const la=Number(qs('.like-btn',a)?.textContent.split(' ')[1]||0);
      const lb=Number(qs('.like-btn',b)?.textContent.split(' ')[1]||0);
      return lb-la;
    });
    else cards.sort((a,b)=> new Date(b.dataset.date||'1970-01-01') - new Date(a.dataset.date||'1970-01-01'));
  }

  function renderTemplates(){
    if(!grid) return;
    grid.innerHTML='';
    const els = templates.map(renderCard).filter(Boolean);
    const filtered = els.filter(matchesFilters);
    sortCards(filtered);
    filtered.forEach(el=>grid.appendChild(el));
  }

  function renderMyTemplates(){
    if(!myGrid) return;
    const mine = getMy();
    myGrid.innerHTML='';
    mine.map(renderCard).forEach(el=>{
      const actions = qs('.actions', el);
      if(actions){
        const del=document.createElement('button');
        del.className='btn btn-ghost'; del.textContent='Remove';
        del.addEventListener('click',()=>{
          const next = getMy().filter(x=>x.id!==el.dataset.id);
          setMy(next);
          renderMyTemplates();
        });
        actions.appendChild(del);
      }
      myGrid.appendChild(el);
    });
  }

  ;[searchInp,catSel,dateInp,locInp,sortSel].forEach(el=>{ if(el) el.addEventListener('input', renderTemplates); });

  async function loadTemplates(){
    try{
      const res = await fetch(`${API_BASE}/api/templates`);
      const data = await res.json();
      templates = data.templates||[];
      renderTemplates();
    }catch{}
  }
  loadTemplates();

  function openCreate(){ if(createModal){ createModal.classList.add('open'); createModal.setAttribute('aria-hidden','false'); } }
  function closeCreate(){ if(createModal){ createModal.classList.remove('open'); createModal.setAttribute('aria-hidden','true'); } }
  if(createBtn){ createBtn.addEventListener('click', openCreate); }
  if(createModal){
    createModal.addEventListener('click',(e)=>{ const t=e.target; if(t && (t.matches('[data-close]') || t.classList.contains('modal-backdrop'))) closeCreate(); });
    document.addEventListener('keydown',(e)=>{ if(e.key==='Escape' && createModal.classList.contains('open')) closeCreate(); });
  }

  async function submitTemplateForm(fd, editingId){
    const payload = {
      title: fd.get('title')?.toString().trim(),
      description: fd.get('description')?.toString().trim(),
      datetime: fd.get('datetime')?.toString(),
      location: fd.get('location')?.toString().trim(),
      images: (fd.get('images')?.toString().trim()||'') ? [fd.get('images').toString().trim()] : [],
      agenda: fd.get('agenda')?.toString().trim()||'',
      organizer: fd.get('organizer')?.toString().trim(),
      category: fd.get('category')?.toString(),
    };
    if(!payload.title||!payload.description||!payload.datetime||!payload.location||!payload.organizer||!payload.category){ alert('Please fill all required fields.'); return; }
    try{
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId ? `${API_BASE}/api/templates/${editingId}` : `${API_BASE}/api/templates`;
      const res = await fetch(url,{ method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const data = await res.json();
      if(!res.ok) throw new Error(data.message||'Failed to create template');
      if(editingId){
        const idx = templates.findIndex(t=>t.id===editingId);
        if(idx!==-1) templates[idx] = data.template;
      }else{
        templates.unshift(data.template);
      }
      renderTemplates();
      // If it's a Community template, also create a corresponding Event for Events sliders (no redirect)
      if((payload.category||'').toLowerCase()==='community'){
        try{
          const startISO = payload.datetime;
          const endISO = (()=>{ try{ const d=new Date(startISO); d.setHours(d.getHours()+2); return d.toISOString(); }catch{ return startISO; } })();
          const banner = payload.images && payload.images[0] ? payload.images[0] : undefined;
          const ev = {
            title: payload.title,
            category: 'community',
            organizer: payload.organizer,
            city: payload.location,
            start: startISO,
            end: endISO,
            banner,
            desc: payload.description,
            ongoing: false
          };
          // Save to localStorage so Events page can render immediately (even if API write is delayed)
          try{ localStorage.setItem('eventnest_pending_event', JSON.stringify(ev)); }catch{}
          // Also attempt to persist on backend so Events fetch includes it
          try{ await fetch(`${API_BASE}/api/events`,{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(ev) }); }catch{}
          // Minimal marker to help locate and highlight later
          try{ localStorage.setItem('eventnest_new_event', JSON.stringify({ title: ev.title, city: ev.city, date: (ev.start||'').slice(0,10) })); }catch{}
        }catch{/* best-effort, non-blocking */}
      }
      return true;
    }catch(err){ alert(err.message||'Network error'); return false; }
  }

  if(createForm){
    createForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd = new FormData(createForm);
      const editingId = createForm.dataset.editId || '';
      const ok = await submitTemplateForm(fd, editingId || undefined);
      if(ok){
        createForm.reset();
        delete createForm.dataset.editId;
        closeCreate();
      }
    });
  }

  if(createCardForm){
    createCardForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd = new FormData(createCardForm);
      const ok = await submitTemplateForm(fd);
      if(ok){ createCardForm.reset(); }
    });
  }
})();

// ===== Volunteers page interactions =====
(function(){
  const root = qs('.volunteers-page');
  if(!root) return;
  const API_BASE = 'http://localhost:4000';
  const totalEl = byId('v-total');
  const availEl = byId('v-available');
  const eventsEl = byId('v-events');
  const upcomingEl = byId('v-upcoming');
  const bodyEl = byId('v-body');
  const searchEl = byId('v-search');
  const statusEl = byId('v-status');
  const eventSel = byId('v-event');
  const sortEl = byId('v-sort');
  let volunteers = [];
  let events = [];

  function setStats(stats){
    if(totalEl) totalEl.textContent = String(stats.totalVolunteers||0);
    if(availEl) availEl.textContent = String(stats.availableVolunteers||0);
    if(eventsEl) eventsEl.textContent = String(stats.totalEvents||0);
    if(upcomingEl) upcomingEl.textContent = String(stats.upcomingEvents||0);
  }

  function renderOptions(){
    if(!eventSel) return;
    const opts = ['<option value="">All Events</option>'].concat(
      events.map(e=>`<option value="${e.id}">${e.title}</option>`) 
    );
    eventSel.innerHTML = opts.join('');
  }

  function matches(v){
    const q = (searchEl?.value||'').toLowerCase();
    const st = (statusEl?.value||'');
    const ev = (eventSel?.value||'');
    let ok = true;
    if(q){
      const text = `${v.name} ${v.email} ${v.speciality||''}`.toLowerCase();
      if(!text.includes(q)) ok=false;
    }
    if(st && v.status!==st) ok=false;
    if(ev && v.eventId!==ev) ok=false;
    return ok;
  }

  function sortList(list){
    const s = sortEl?.value||'name';
    if(s==='name') list.sort((a,b)=>a.name.localeCompare(b.name));
    else if(s==='email') list.sort((a,b)=>a.email.localeCompare(b.email));
    else if(s==='event') list.sort((a,b)=> (a.eventTitle||'').localeCompare(b.eventTitle||''));
    else if(s==='status') list.sort((a,b)=> (a.status||'').localeCompare(b.status||''));
  }

  function renderTable(){
    if(!bodyEl) return;
    bodyEl.innerHTML='';
    const list = volunteers.filter(matches);
    sortList(list);
    list.forEach(v=>{
      const row = document.createElement('div');
      row.className='v-row';
      row.setAttribute('role','row');
      row.innerHTML = `
        <div class="v-cell" role="cell">${v.name||''}</div>
        <div class="v-cell" role="cell">${v.email||''}</div>
        <div class="v-cell" role="cell">${v.phone||''}</div>
        <div class="v-cell" role="cell">${v.speciality||''}</div>
        <div class="v-cell" role="cell">${v.availableDates||''}</div>
        <div class="v-cell" role="cell">${v.eventTitle||'-'}</div>
        <div class="v-cell" role="cell"><span class="chip">${v.status||'Available'}</span></div>
        <div class="v-cell" role="cell">
          <button class="btn btn-ghost">View Profile</button>
          <button class="btn btn-secondary">Edit</button>
        </div>
      `;
      bodyEl.appendChild(row);
    });
  }

  [searchEl,statusEl,eventSel,sortEl].forEach(el=>{ if(el) el.addEventListener('input', renderTable); });

  async function loadAll(){
    try{
      const [vres,eres] = await Promise.all([
        fetch(`${API_BASE}/api/volunteers`),
        fetch(`${API_BASE}/api/events`)
      ]);
      const vdata = await vres.json();
      const edata = await eres.json();
      volunteers = vdata.volunteers||[];
      events = edata.events||[];
      setStats(vdata.stats||{totalVolunteers:0,availableVolunteers:0,totalEvents:events.length,upcomingEvents:0});
      renderOptions();
      renderTable();
    }catch{}
  }
  // Expose so other scripts (like volunteers.html inline handler) can refresh stats/table
  window.__volunteersLoadAll = loadAll;

  loadAll();
})();
