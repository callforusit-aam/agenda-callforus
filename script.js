// --- CONFIGURAZIONE ---
const PWD = "giuseppe90";
const PANTRY_ID = "e39b701d-95a9-48c0-ae96-d13b53856c94";
const GCAL_1 = "https://script.google.com/macros/s/AKfycbw7l-WUQr3cW1BxuEbIMmmGG_MdCfJxW1_O2S-E740/exec";
const GCAL_2 = "https://script.google.com/macros/s/AKfycbx7qYTrubG_KHBkesRUmBxUu3CRI3SC_jhNLH4pxIB0NA5Rgd2nKlgRvmpsToxdJrbN4A/exec";

// Rilevamento Test/Live
const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "";
const BASKET = isLocal ? "Dashboard_TEST_FINAL_V3" : "Dashboard_FINAL_V3"; 
const URL_BIN = `https://api.jsonbin.io/v3/b/695e8223d0ea881f405b10f2`; 
const API_KEY = "$2a$10$/b3gwPG1OcyJYyOgtNM.iujzuvPXS5bPnyJvDz5UI9StDI.nQFMQG";
const PANTRY_URL = `https://getpantry.cloud/apiv1/pantry/${PANTRY_ID}/basket/${BASKET}`;

const DEFAULT_COMPANIES = [];

// --- STATO ---
let currentMon = getRealMonday();
let globalData = {};
let companyList = [];
let gcalData = []; 
let googleMixData = { email: [], drive: [] };
let saveTimer;
let lastDayFocus = null; 
let isDataLoaded = false;
let dragSrcEl, dragDay, dragIndex;
let currentBacklogIndex = null;

// --- INIT ---
function getRealMonday() {
    const d = new Date();
    const day = d.getDay(); 
    const diff = d.getDate() - day + (day == 0 ? -6 : 1);
    const mon = new Date(d); mon.setDate(diff); mon.setHours(0,0,0,0);
    return mon;
}

if(localStorage.getItem('auth')==='1') {
    document.getElementById('loginScreen').style.display='none';
    setTimeout(initApp, 100);
}

function tryLogin() {
    if(document.getElementById('passwordInput').value === PWD) {
        localStorage.setItem('auth', '1');
        document.getElementById('loginScreen').style.display='none';
        initApp();
    } else { document.getElementById('loginError').style.display='block'; }
}

function initApp() {
    document.getElementById('app').style.display='grid';
    document.getElementById('loadingScreen').style.display='flex';
    document.getElementById('loadingText').innerText = "Caricamento...";
    
    if (isLocal) {
        const status = document.getElementById('syncStatus');
        status.innerText = "TEST MODE"; 
        status.style.background = "#EF4444"; 
        status.style.color = "white"; 
    }

    if(localStorage.getItem('theme') === 'dark') document.body.setAttribute('data-theme', 'dark');
    
    document.addEventListener('focusin', e => { 
        if(e.target.classList.contains('task-text')) {
            lastDayFocus = e.target.closest('.day-body').id; 
        }
    });

    updateDateDisplay();
    loadData(false);
    
    setTimeout(() => { if (!isDataLoaded) { document.getElementById('loadingScreen').style.display = 'none'; isDataLoaded = true; setStatus('Recupero...', 'ok'); } }, 5000);
    setInterval(() => loadData(true), 300000); 
}

function nav(page) {
    document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('active'));
    event.currentTarget.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-'+page).classList.add('active');
    
    const tb = document.getElementById('mainToolbar');
    // Mostra toolbar solo in calendar
    if(tb) tb.style.display = (page === 'calendar') ? 'flex' : 'none';
    
    const titles = { 'home': 'Dashboard', 'calendar': 'Calendario', 'account': 'Account Amazon', 'notes': 'Da Pianificare' };
    document.getElementById('pageTitle').innerText = titles[page];
    
    if(page === 'home') renderHomeWidgets();
    if(page === 'notes') renderBacklog();
}

function getWeekKey() { return "W_" + currentMon.toISOString().split('T')[0]; }

function setStatus(msg, type) {
    const el = document.getElementById('syncStatus');
    if(isLocal && msg !== "Salvataggio...") return;
    el.innerText = msg;
    el.className = `status-badge status-${type}`;
}

// --- CARICAMENTO ---
async function loadData(silent) {
    if(!silent) setStatus('Sync...', 'wait');
    try {
        const res = await fetch(URL_BIN, {
            method: 'GET',
            headers: { 'X-Master-Key': API_KEY, 'Cache-Control': 'no-cache' }
        });

        if(res.ok) {
            const json = await res.json();
            globalData = json.record || {};
            
            // Inizializza array se mancano
            if (!globalData.backlog) globalData.backlog = [];

            companyList = globalData.COMPANIES || DEFAULT_COMPANIES;
            renderCompanyButtons();
            
            renderWeek();     
            fetchGoogle();
            
            isDataLoaded = true;
            document.getElementById('loadingScreen').style.display='none';
            if(!silent) setStatus('Online', 'ok');

            const activePage = document.querySelector('.page.active').id;
            if(activePage === 'page-home') renderHomeWidgets();
            if(activePage === 'page-notes') renderBacklog();
        } else {
             isDataLoaded = true;
             document.getElementById('loadingScreen').style.display='none';
             renderWeek();
        }
    } catch(e) { if(!silent) setStatus('Offline', 'wait'); isDataLoaded = true; document.getElementById('loadingScreen').style.display='none'; }
}

// --- NUOVA LOGICA BACKLOG ---
function addToBacklog() {
    const compName = document.getElementById('blCompany').value.trim().toUpperCase();
    const txtRaw = document.getElementById('blText').value.trim();

    if (!compName || !txtRaw) return alert("Compila tutti i campi");

    const lines = txtRaw.split('\n');
    lines.forEach(line => {
        if(line.trim()) {
            globalData.backlog.push({ company: compName, text: line.trim() });
        }
    });

    document.getElementById('blCompany').value = '';
    document.getElementById('blText').value = '';
    
    renderBacklog();
    saveData(true);
}

function renderBacklog() {
    const cont = document.getElementById('backlogListContainer');
    const count = document.getElementById('backlogCount');
    
    if(!globalData.backlog || globalData.backlog.length === 0) {
        cont.innerHTML = '<p style="text-align:center; color:#aaa; margin-top:50px;">Nessuna attività da pianificare.</p>';
        if(count) count.innerText = "0";
        return;
    }

    if(count) count.innerText = globalData.backlog.length;
    
    cont.innerHTML = globalData.backlog.map((item, i) => `
        <div class="backlog-item">
            <div class="bl-info">
                <span class="bl-company">${item.company}</span>
                <span class="bl-text">${item.text}</span>
            </div>
            <div style="display:flex; gap:5px;">
                <div class="bl-action" onclick="openScheduleModal(${i})" title="Pianifica">
                    <span class="material-icons-round">event_available</span>
                </div>
                <div class="bl-action" onclick="deleteFromBacklog(${i})" title="Elimina" style="color:#EF4444;">
                    <span class="material-icons-round">delete</span>
                </div>
            </div>
        </div>
    `).join('');
}

function deleteFromBacklog(index) {
    if(confirm("Eliminare questa attività?")) {
        globalData.backlog.splice(index, 1);
        renderBacklog();
        saveData(true);
    }
}

// Pianificazione (Backlog -> Calendario)
function openScheduleModal(index) {
    currentBacklogIndex = index;
    document.getElementById('scheduleModal').style.display = 'flex';
}
function closeScheduleModal() {
    document.getElementById('scheduleModal').style.display = 'none';
    currentBacklogIndex = null;
}
function confirmSchedule() {
    if (currentBacklogIndex === null) return;

    const day = document.getElementById('scheduleDay').value;
    const item = globalData.backlog[currentBacklogIndex];
    
    // Rimuovi dal backlog
    globalData.backlog.splice(currentBacklogIndex, 1);
    
    const key = getWeekKey();
    if(!globalData[key]) globalData[key] = {};
    if(!globalData[key][day]) globalData[key][day] = [];
    
    // Cerca colore azienda esistente o usa default
    const knownComp = companyList.find(c => c.name === item.company);
    const color = knownComp ? knownComp.color : "#000000";
    const txtColor = (color === '#FFD600') ? '#000' : '#fff';

    let dayData = globalData[key][day];
    
    // Header
    dayData.push({ txt: '', done: false, tag: { name: item.company, bg: color, col: txtColor, bd: color }, isHeader: true });
    // Task
    dayData.push({ txt: item.text, done: false });

    saveData(true);
    closeScheduleModal();
    renderBacklog();
    // Se siamo su calendar, aggiorna la vista
    if(document.getElementById('page-calendar').classList.contains('active')) renderWeek();
    alert("Attività spostata nel Calendario!");
}

// --- SALVATAGGIO ---
function deferredSave() {
    if(!isDataLoaded) return;
    setStatus('Scrivendo...', 'wait');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveData(false), 2000);
}

window.manualSave = function() { saveData(true); }

async function saveData(immediate) {
    if(!isDataLoaded) return;
    if(immediate) clearTimeout(saveTimer);
    setStatus('Salvataggio...', 'wait');
    
    const key = getWeekKey();
    if(!globalData[key]) globalData[key] = {};

    if(document.getElementById('stat-sales')) {
        globalData.account = {
            sales: document.getElementById('stat-sales').innerText,
            units: document.getElementById('stat-units').innerText,
            notes: document.getElementById('account-notes').innerText
        };
    }
    if(document.getElementById('general-notes')) {
        globalData.notes = { general: document.getElementById('general-notes').innerText };
    }
    if(document.getElementById('home-quick-notes')) {
        globalData.home = { quick: document.getElementById('home-quick-notes').value };
    }
    globalData.COMPANIES = companyList;

    try {
        await fetch(URL_BIN, { 
            method: 'PUT', 
            headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY }, 
            body: JSON.stringify(globalData)
        });
        setStatus('Salvato', 'ok');
    } catch(e) { setStatus('Errore Save', 'err'); }
}

// --- CALENDAR & TASKS ---
window.addTaskManually = function(day, val) {
    const key = getWeekKey();
    if(!globalData[key]) globalData[key] = {};
    if(!globalData[key][day]) globalData[key][day] = [];
    const txt = (typeof val === 'string') ? val : '';
    const done = (typeof val !== 'string'); 
    globalData[key][day].push({ txt: txt, done: done });
    renderWeek(); saveData(true);
}

function updateTask(day, row, val) {
    const key = getWeekKey();
    if(globalData[key][day][row]) { globalData[key][day][row].txt = val; deferredSave(); }
}

function toggleTask(day, row) {
    const key = getWeekKey();
    if(globalData[key][day][row]) {
        globalData[key][day][row].done = !globalData[key][day][row].done;
        renderWeek(); saveData(true);
        if(document.getElementById('page-home').classList.contains('active')) renderHomeWidgets();
    }
}

window.deleteTask = function(e, day, index) {
    if(e) e.stopPropagation();
    if(confirm("Eliminare questa riga?")) {
        const key = getWeekKey();
        globalData[key][day].splice(index, 1);
        renderWeek(); saveData(true);
    }
}

// Drag & Drop
window.handleDragStart = function(e, day, index) { dragSrcEl=e.target; dragDay=day; dragIndex=index; e.target.style.opacity='0.5'; e.dataTransfer.effectAllowed='move'; }
window.handleDragOver = function(e) { if (e.preventDefault) e.preventDefault(); e.dataTransfer.dropEffect='move'; return false; }
window.handleDrop = function(e, targetDay, targetIndex) {
    e.stopPropagation(); e.preventDefault();
    if (dragDay === targetDay && dragIndex !== targetIndex) {
        const key = getWeekKey();
        const list = globalData[key][targetDay];
        const [movedItem] = list.splice(dragIndex, 1);
        list.splice(targetIndex, 0, movedItem);
        renderWeek(); saveData(true);
    }
    return false;
}

// --- RENDER WEEK ---
function renderWeek() {
    const key = getWeekKey();
    const d = globalData[key] || {};
    const days = ['mon','tue','wed','thu','fri'];
    const labels = ['LUN','MAR','MER','GIO','VEN'];
    const todayIdx = new Date().getDay(); 
    const calContainer = document.getElementById('calendar-days');
    if(!calContainer) return;
    
    calContainer.innerHTML = days.map((dayCode, i) => {
        const dayData = Array.isArray(d[dayCode]) ? d[dayCode] : [];
        let rowsHtml = dayData.map((task, idx) => {
            if(task.isHeader) {
                return `<div class="task-row header-row" draggable="true" ondragstart="handleDragStart(event, '${dayCode}', ${idx})" ondragover="handleDragOver(event)" ondrop="handleDrop(event, '${dayCode}', ${idx})"><span class="material-icons-round drag-handle">drag_indicator</span><span class="client-tag" style="background:${task.tag.bg}; color:${task.tag.col}; border-color:${task.tag.bd}; width:100%; display:block; text-align:center;">${task.tag.name}</span><span class="material-icons-round delete-btn" onclick="deleteTask(event, '${dayCode}', ${idx})">delete</span></div>`;
            } else {
                const checked = task.done ? 'checked' : '';
                const completedClass = task.done ? 'completed' : '';
                return `<div class="task-row" draggable="true" ondragstart="handleDragStart(event, '${dayCode}', ${idx})" ondragover="handleDragOver(event)" ondrop="handleDrop(event, '${dayCode}', ${idx})"><span class="material-icons-round drag-handle">drag_indicator</span><div class="task-chk ${checked}" onclick="toggleTask('${dayCode}', ${idx})"></div><input type="text" class="task-text ${completedClass}" value="${task.txt}" oninput="updateTask('${dayCode}', ${idx}, this.value)"><span class="material-icons-round delete-btn" onclick="deleteTask(event, '${dayCode}', ${idx})">delete</span></div>`;
            }
        }).join('');

        const emptySlots = Math.max(0, 5 - dayData.length);
        for(let e=0; e<emptySlots; e++) rowsHtml += `<div class="task-row"><span class="material-icons-round drag-handle" style="opacity:0.1">drag_indicator</span><div class="task-chk" onclick="addTaskManually('${dayCode}')"></div><input type="text" class="task-text" placeholder="..." onchange="addTaskManually('${dayCode}', this.value)"></div>`;

        return `<div class="day-col ${todayIdx===i+1?'current-day':''}"><div class="day-head">${labels[i]}</div><div class="gcal-wrapper" id="${dayCode}-gcal"></div><div class="day-body" id="${dayCode}">${rowsHtml}</div></div>`;
    }).join('');

    if(globalData.account) {
        if(document.getElementById('stat-sales')) document.getElementById('stat-sales').innerText = globalData.account.sales || "€ 0,00";
        if(document.getElementById('stat-units')) document.getElementById('stat-units').innerText = globalData.account.units || "0";
        if(document.getElementById('account-notes')) document.getElementById('account-notes').innerText = globalData.account.notes || "";
    }
    if(globalData.notes && document.getElementById('general-notes')) document.getElementById('general-notes').innerText = globalData.notes.general || "";
    if(globalData.home && document.getElementById('home-quick-notes')) document.getElementById('home-quick-notes').value = globalData.home.quick || "";
    
    if(gcalData.length > 0) renderGoogleEvents();
}

// --- ALTRE FUNZIONI (Aziende, Modale Calendario) ---
window.openActivityModal = function() {
    document.getElementById('activityModal').style.display = 'flex';
    const select = document.getElementById('formCompany');
    if(companyList.length === 0) select.innerHTML = '<option disabled selected>Crea prima un\'azienda</option>';
    else select.innerHTML = companyList.map((c, i) => `<option value="${i}">${c.name}</option>`).join('');
    const today = new Date().getDay();
    const daysMap = ['mon','mon','tue','wed','thu','fri','mon'];
    document.getElementById('formDay').value = daysMap[today];
}
window.closeModal = function() { document.getElementById('activityModal').style.display = 'none'; document.getElementById('formTasks').value = ''; }
window.saveFromForm = function() {
    const day = document.getElementById('formDay').value;
    const compIdx = document.getElementById('formCompany').value;
    const tasksRaw = document.getElementById('formTasks').value;
    if(!companyList[compIdx]) return alert("Crea un'azienda!");
    const company = companyList[compIdx];
    if (!tasksRaw.trim()) return alert("Scrivi un task!");
    const key = getWeekKey();
    if(!globalData[key]) globalData[key] = {};
    if(!globalData[key][day]) globalData[key][day] = [];
    let dayData = globalData[key][day];
    dayData.push({ txt: '', done: false, tag: { name: company.name, bg: company.color, col: (company.color==='#FFD600'?'#000':'#fff'), bd: company.color }, isHeader: true });
    const lines = tasksRaw.split('\n');
    lines.forEach(line => { if(line.trim()) dayData.push({ txt: line.trim(), done: false }); });
    globalData[key][day] = dayData;
    renderWeek(); saveData(true); closeModal();
}
function renderCompanyButtons() {
    const cont = document.getElementById('companyTagsContainer');
    if(cont) {
        if (!companyList.length) cont.innerHTML = "<span style='font-size:10px; color:#aaa; margin-left:10px;'>Crea un'azienda</span>"; 
        else cont.innerHTML = companyList.map((c, i) => `<button class="btn-company" oncontextmenu="deleteCompany(event, ${i})"><div class="company-dot" style="background:${c.color}"></div>${c.name}</button>`).join('');
    }
}
window.addNewCompany = function() {
    const name = document.getElementById('newCompName').value.trim().toUpperCase();
    const color = document.getElementById('newCompColor').value;
    if(name) { companyList.push({name, color}); document.getElementById('newCompName').value = ""; saveData(true); renderCompanyButtons(); }
}
window.deleteCompany = function(e, index) { e.preventDefault(); if(confirm(`Eliminare ${companyList[index].name}?`)) { companyList.splice(index, 1); renderCompanyButtons(); saveData(true); } }

// --- HOME WIDGETS ---
function renderHomeWidgets() {
    const today = new Date().getDay(); 
    const daysMap = [null, 'mon', 'tue', 'wed', 'thu', 'fri'];
    const homeTasksEl = document.getElementById('home-tasks');
    if (today >= 1 && today <= 5) {
        const dayCode = daysMap[today];
        const key = getWeekKey();
        const tasks = (globalData[key] && globalData[key][dayCode]) ? globalData[key][dayCode] : [];
        const activeTasks = tasks.filter(t => !t.isHeader && t.txt.trim() !== "");
        if(activeTasks.length > 0) {
            homeTasksEl.innerHTML = activeTasks.map((t, i) => {
                const realIdx = tasks.indexOf(t);
                return `<div class="task-row" style="border-bottom:1px solid #f0f0f0;"><div class="task-chk ${t.done?'checked':''}" onclick="toggleTask('${dayCode}', ${realIdx});"></div><span style="font-size:13px; ${t.done?'text-decoration:line-through; color:#aaa':''}">${t.txt}</span></div>`;
            }).join('');
        } else { homeTasksEl.innerHTML = '<p style="color:var(--text-sub); text-align:center; padding-top:20px">Nessuna attività oggi.</p>'; }
    } else { homeTasksEl.innerHTML = '<p style="color:var(--text-sub); text-align:center; padding-top:20px">Buon Weekend!</p>'; }
    renderExternalData();
}

function renderExternalData() {
    const homeCallsEl = document.getElementById('home-calls');
    if(homeCallsEl) {
        homeCallsEl.innerHTML = '';
        const todayCalls = gcalData.filter(ev => isToday(new Date(ev.startTime)));
        if (todayCalls.length > 0) {
            todayCalls.forEach(ev => {
                const time = new Date(ev.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
                let html = `<a href="${ev.link||'#'}" target="_blank" class="gcal-event"><span class="call-badge">CALL</span><span style="font-weight:700; margin-right:5px;">${time}</span>${ev.title}</a>`;
                homeCallsEl.innerHTML += html;
            });
        } else { homeCallsEl.innerHTML = '<p style="color:var(--text-sub); text-align:center;">Nessuna call.</p>'; }
    }
    
    const mailEl = document.getElementById('mail-list-container');
    if(mailEl && googleMixData.email.length) { mailEl.innerHTML = googleMixData.email.map(m => `<div class="mail-item" onclick="window.open('${m.link}', '_blank')"><span class="mail-from">${m.from}</span><span class="mail-subj">${m.subject}</span></div>`).join(''); } else if(mailEl) { mailEl.innerHTML = '<p style="color:var(--text-sub); font-size:12px; text-align:center;">Vuoto</p>'; }
    
    const docEl = document.getElementById('docs-list');
    if(docEl && googleMixData.drive.length) { docEl.innerHTML = googleMixData.drive.map(d => `<a href="${d.url}" target="_blank" class="doc-link"><span class="material-icons-round" style="font-size:18px; color:#5E6C84">${d.icon}</span><span class="doc-name" style="overflow:hidden; text-overflow:ellipsis;">${d.name}</span></a>`).join(''); } else if(docEl) { docEl.innerHTML = '<p style="color:var(--text-sub); font-size:12px; text-align:center;">Vuoto</p>'; }
}

function updateDateDisplay() {
    const start = new Date(currentMon);
    const end = new Date(currentMon); end.setDate(start.getDate() + 4);
    const strDay = start.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    const strWeek = `${start.getDate()} - ${end.getDate()} ${end.toLocaleDateString('it-IT', { month: 'long' })}`;
    document.getElementById('currentDayLabel').innerText = strDay.charAt(0).toUpperCase() + strDay.slice(1);
    document.getElementById('currentWeekRange').innerText = strWeek;
    document.getElementById('calDateDisplay').innerText = strWeek;
}
window.changeWeek = async function(dir) { await saveData(true); document.getElementById('loadingScreen').style.display='flex'; currentMon.setDate(currentMon.getDate() + (dir * 7)); updateDateDisplay(); loadData(false); }
window.forceSync = function() { document.getElementById('loadingScreen').style.display='flex'; loadData(false); }
window.toggleTheme = function() { const isDark = document.body.getAttribute('data-theme') === 'dark'; document.body.setAttribute('data-theme', isDark ? 'light' : 'dark'); localStorage.setItem('theme', isDark ? 'light' : 'dark'); }
window.fmt = function(cmd) { document.execCommand(cmd, false, null); deferredSave(); }
function isToday(date) { const t = new Date(); return date.getDate() === t.getDate() && date.getMonth() === t.getMonth(); }
async function fetchGoogle() {
    if(GCAL_1.includes("LINK")) return;
    let start = new Date(currentMon); let end = new Date(currentMon); end.setDate(end.getDate() + 5);
    try {
        const p1 = fetch(`${GCAL_1}?action=calendar&start=${start.toISOString()}&end=${end.toISOString()}`).then(r=>r.json()).catch(()=>[]);
        const p2 = fetch(`${GCAL_2}?action=calendar&start=${start.toISOString()}&end=${end.toISOString()}`).then(r=>r.json()).catch(()=>[]);
        const pData = fetch(`${GCAL_1}?action=data`).then(r=>r.json()).catch(()=>({email:[], drive:[]}));
        const [ev1, ev2, data] = await Promise.all([p1, p2, pData]);
        gcalData = [...ev1, ...ev2];
        googleMixData = data;
        if(document.getElementById('page-home').classList.contains('active')) renderHomeWidgets();
        renderGoogleEvents();
    } catch(e) { console.log("Google Err", e); }
}
function renderGoogleEvents() {
    const ids = [null, 'mon-gcal', 'tue-gcal', 'wed-gcal', 'thu-gcal', 'fri-gcal'];
    for(let i=1; i<=5; i++) { const el = document.getElementById(ids[i]); if(el) { el.innerHTML = ''; gcalData.forEach(ev => { const d = new Date(ev.startTime); if(d.getDay() === i) { const time = d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); let html = `<a href="${ev.link}" target="_blank" class="gcal-event"><span class="call-badge">CALL</span><span style="font-weight:700; margin-right:5px;">${time}</span>${ev.title}</a>`; el.insertAdjacentHTML('beforeend', html); } }); } }
}