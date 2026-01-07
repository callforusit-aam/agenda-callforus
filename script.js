// --- CONFIGURAZIONE JSONBIN ---
const PWD = "giuseppe90";

// ⚠️ INSERISCI I TUOI DATI JSONBIN QUI ⚠️
const BIN_ID = "695e8223d0ea881f405b10f2";       // Es: 659d...
const API_KEY = "$2a$10$/b3gwPG1OcyJYyOgtNM.iujzuvPXS5bPnyJvDz5UI9StDI.nQFMQG";  // Es: $2a$10...

// Link Google Script (i tuoi)
const GCAL_1 = "https://script.google.com/macros/s/AKfycbw7l-WUQr3cW1BxuEbIMmmGG_MdCfJxW1_O2S-E740/exec";
const GCAL_2 = "https://script.google.com/macros/s/AKfycbx7qYTrubG_KHBkesRUmBxUu3CRI3SC_jhNLH4pxIB0NA5Rgd2nKlgRvmpsToxdJrbN4A/exec";

// --- SETUP ---
const URL_BIN = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
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
    document.getElementById('loadingText').innerText = "Connessione JSONBin...";
    
    if(localStorage.getItem('theme') === 'dark') document.body.setAttribute('data-theme', 'dark');
    
    document.addEventListener('focusin', e => { 
        if(e.target.classList.contains('task-text')) {
            lastDayFocus = e.target.closest('.day-body').id; 
        }
    });

    updateDateDisplay();
    loadData(false);
    
    // Timeout sicurezza
    setTimeout(() => { 
        if (!isDataLoaded) { 
            document.getElementById('loadingScreen').style.display = 'none'; 
            isDataLoaded = true; 
            setStatus('Recupero...', 'ok');
            renderWeek(); 
        } 
    }, 6000);
    
    setInterval(() => loadData(true), 300000); 
}

function nav(page) {
    document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('active'));
    event.currentTarget.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-'+page).classList.add('active');
    
    const tb = document.getElementById('mainToolbar');
    if(tb) tb.style.display = (page === 'calendar') ? 'flex' : 'none';
    
    const titles = { 'home': 'Dashboard', 'calendar': 'Calendario', 'account': 'Account Amazon', 'notes': 'Blocco Note' };
    document.getElementById('pageTitle').innerText = titles[page];
    
    if(page === 'home') renderHomeWidgets();
}

function getWeekKey() { return "W_" + currentMon.toISOString().split('T')[0]; }

function setStatus(msg, type) {
    const el = document.getElementById('syncStatus');
    el.innerText = msg;
    el.className = `status-badge status-${type}`;
}

// --- CARICAMENTO DATI (JSONBIN) ---
async function loadData(silent) {
    if(!silent) setStatus('Sync...', 'wait');
    try {
        const res = await fetch(URL_BIN, {
            method: 'GET',
            headers: {
                'X-Master-Key': API_KEY,
                'Cache-Control': 'no-cache'
            }
        });

        if(res.ok) {
            const json = await res.json();
            // JSONBin restituisce i dati dentro la proprietà .record
            globalData = json.record || {};
            
            companyList = globalData.COMPANIES || DEFAULT_COMPANIES;
            renderCompanyButtons();
            
            renderWeek();     
            renderSidebar(); 
            
            fetchGoogle();
            
            isDataLoaded = true;
            document.getElementById('loadingScreen').style.display='none';
            if(!silent) setStatus('Online', 'ok');

            if(document.getElementById('page-home').classList.contains('active')) renderHomeWidgets();
        } else {
             // Errore Chiavi o Bin non trovato
             console.error("Errore JSONBin:", res.status);
             isDataLoaded = true; 
             document.getElementById('loadingScreen').style.display='none';
             renderWeek();
        }
    } catch(e) { 
        if(!silent) setStatus('Offline', 'wait'); 
        isDataLoaded = true; 
        document.getElementById('loadingScreen').style.display='none'; 
    }
}

// --- SALVATAGGIO DATI (JSONBIN) ---
async function saveData(immediate) {
    if(!isDataLoaded) return;
    if(immediate) clearTimeout(saveTimer);
    
    setStatus('Salvataggio...', 'wait');
    
    const key = getWeekKey();
    
    // Recupero dati extra dal DOM
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
        // JSONBin usa PUT per aggiornare
        await fetch(URL_BIN, { 
            method: 'PUT', 
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': API_KEY
            }, 
            body: JSON.stringify(globalData)
        });
        setStatus('Salvato', 'ok');
    } catch(e) { 
        setStatus('Errore Save', 'err'); 
    }
}

function deferredSave() {
    if(!isDataLoaded) return;
    setStatus('Scrivendo...', 'wait');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveData(false), 2000);
}

window.manualSave = function() { saveData(true); }

// --- RENDER COMPONENTI ---
function renderWeek() {
    const key = getWeekKey();
    const d = globalData[key] || {};
    const days = ['mon','tue','wed','thu','fri'];
    const labels = ['LUN','MAR','MER','GIO','VEN'];
    const todayIdx = new Date().getDay(); 

    const calContainer = document.getElementById('calendar-days');
    
    calContainer.innerHTML = days.map((dayCode, i) => {
        const dayData = Array.isArray(d[dayCode]) ? d[dayCode] : [];
        
        let rowsHtml = dayData.map((task, idx) => {
            if(task.isHeader) {
                return `
                <div class="task-row header-row" draggable="true" ondragstart="handleDragStart(event, '${dayCode}', ${idx})" ondragover="handleDragOver(event)" ondrop="handleDrop(event, '${dayCode}', ${idx})">
                    <span class="material-icons-round drag-handle">drag_indicator</span>
                    <span class="client-tag" style="background:${task.tag.bg}; color:${task.tag.col}; border-color:${task.tag.bd}; width:100%; display:block; text-align:center;">${task.tag.name}</span>
                    <span class="material-icons-round delete-btn" onclick="deleteTask(event, '${dayCode}', ${idx})">delete</span>
                </div>`;
            } else {
                const checked = task.done ? 'checked' : '';
                const completedClass = task.done ? 'completed' : '';
                return `
                <div class="task-row" draggable="true" ondragstart="handleDragStart(event, '${dayCode}', ${idx})" ondragover="handleDragOver(event)" ondrop="handleDrop(event, '${dayCode}', ${idx})">
                    <span class="material-icons-round drag-handle">drag_indicator</span>
                    <div class="task-chk ${checked}" onclick="toggleTask('${dayCode}', ${idx})"></div>
                    <input type="text" class="task-text ${completedClass}" value="${task.txt}" oninput="updateTask('${dayCode}', ${idx}, this.value)">
                    <span class="material-icons-round delete-btn" onclick="deleteTask(event, '${dayCode}', ${idx})">delete</span>
                </div>`;
            }
        }).join('');

        const emptySlots = Math.max(0, 5 - dayData.length);
        for(let e=0; e<emptySlots; e++) {
             rowsHtml += `
            <div class="task-row">
                <span class="material-icons-round drag-handle" style="opacity:0.1">drag_indicator</span>
                <div class="task-chk" onclick="addTaskManually('${dayCode}')"></div>
                <input type="text" class="task-text" placeholder="..." onchange="addTaskManually('${dayCode}', this.value)">
            </div>`;
        }

        const isTodayClass = (todayIdx === i+1) ? 'current-day' : '';

        return `
        <div class="day-col ${isTodayClass}">
            <div class="day-head">${labels[i]}</div>
            <div class="gcal-wrapper" id="${dayCode}-gcal"></div>
            <div class="day-body" id="${dayCode}">
                ${rowsHtml}
            </div>
        </div>`;
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

function renderSidebar() {
    const key = getWeekKey();
    const d = globalData[key] || {};

    const callList = document.getElementById('callList');
    if(callList) {
        let callHtml = '';
        const savedCalls = d.calls || []; 
        for(let i=0; i<8; i++) {
            const val = savedCalls[i] || ''; 
            // Qui andrebbe logica più complessa per salvare i singoli input della riga, 
            // per semplicità assumiamo che il salvataggio sidebar sia gestito a parte o integrato.
            // Per ora renderizziamo vuoto o base se non gestito diversamente.
        }
    }
}

// --- GESTIONE DATI ---
window.addTaskManually = function(day, val) {
    const key = getWeekKey();
    if(!globalData[key]) globalData[key] = {};
    if(!globalData[key][day]) globalData[key][day] = [];
    
    const txt = (typeof val === 'string') ? val : '';
    const done = (typeof val !== 'string'); 
    
    globalData[key][day].push({ txt: txt, done: done });
    
    renderWeek();
    saveData(true);
}

function updateTask(day, row, val) {
    const key = getWeekKey();
    if(globalData[key] && globalData[key][day] && globalData[key][day][row]) {
        globalData[key][day][row].txt = val;
        deferredSave();
    }
}

function toggleTask(day, row) {
    const key = getWeekKey();
    if(globalData[key] && globalData[key][day] && globalData[key][day][row]) {
        globalData[key][day][row].done = !globalData[key][day][row].done;
        renderWeek();
        saveData(true); 
        if(document.getElementById('page-home').classList.contains('active')) renderHomeWidgets();
    }
}

window.deleteTask = function(e, day, index) {
    if(e) e.stopPropagation();
    if(confirm("Eliminare questa riga?")) {
        const key = getWeekKey();
        globalData[key][day].splice(index, 1);
        renderWeek();
        saveData(true);
    }
}

// --- DRAG & DROP ---
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

// --- ALTRE FUNZIONI (MODALE, AZIENDE) ---
window.openActivityModal = function() {
    document.getElementById('activityModal').style.display = 'flex';
    const select = document.getElementById('formCompany');
    if(companyList.length === 0) select.innerHTML = '<option disabled selected>Crea prima un\'azienda (tasto +)</option>';
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
    if (!companyList.length) cont.innerHTML = "<span style='font-size:10px; color:#aaa; margin-left:10px;'>Crea un'azienda</span>";
    else cont.innerHTML = companyList.map((c, i) => `<button class="btn-company" oncontextmenu="deleteCompany(event, ${i})"><div class="company-dot" style="background:${c.color}"></div>${c.name}</button>`).join('');
}
window.addNewCompany = function() {
    const name = document.getElementById('newCompName').value.trim().toUpperCase();
    const color = document.getElementById('newCompColor').value;
    if(name) { companyList.push({name, color}); document.getElementById('newCompName').value = ""; saveData(true); renderCompanyButtons(); }
}
window.deleteCompany = function(e, index) { e.preventDefault(); if(confirm(`Eliminare ${companyList[index].name}?`)) { companyList.splice(index, 1); renderCompanyButtons(); saveData(true); } }

// --- HOME & GOOGLE ---
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
                return `<div class="task-row" style="border-bottom:1px solid #f0f0f0;"><div class="task-chk ${t.done?'checked':''}" onclick="toggleTask('${dayCode}', ${realIdx})"></div><span style="font-size:13px; ${t.done?'text-decoration:line-through; color:#aaa':''}">${t.txt}</span></div>`;
            }).join('');
        } else { homeTasksEl.innerHTML = '<p style="color:var(--text-sub); text-align:center; padding-top:20px">Nessuna attività oggi.</p>'; }
    } else { homeTasksEl.innerHTML = '<p style="color:var(--text-sub); text-align:center; padding-top:20px">Buon Weekend!</p>'; }
    renderExternalData();
}

function renderExternalData() {
    const homeCallsEl = document.getElementById('home-calls');
    homeCallsEl.innerHTML = '';
    const todayCalls = gcalData.filter(ev => isToday(new Date(ev.startTime)));
    if (todayCalls.length > 0) {
        todayCalls.forEach(ev => {
            const time = new Date(ev.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            let html = `<a href="${ev.link}" target="_blank" class="gcal-event"><span class="call-badge">CALL</span><span style="font-weight:700; margin-right:5px;">${time}</span>${ev.title}</a>`;
            homeCallsEl.innerHTML += html;
        });
    } else { homeCallsEl.innerHTML = '<p style="color:var(--text-sub); text-align:center;">Nessuna call.</p>'; }
    
    const mailEl = document.getElementById('mail-list-container');
    if(googleMixData.email.length) { mailEl.innerHTML = googleMixData.email.map(m => `<div class="mail-item" onclick="window.open('${m.link}', '_blank')"><span class="mail-from">${m.from}</span><span class="mail-subj">${m.subject}</span></div>`).join(''); } else { mailEl.innerHTML = '<p style="color:var(--text-sub); font-size:12px; text-align:center;">Vuoto</p>'; }
    const docEl = document.getElementById('docs-list');
    if(googleMixData.drive.length) { docEl.innerHTML = googleMixData.drive.map(d => `<a href="${d.url}" target="_blank" class="doc-link"><span class="material-icons-round" style="font-size:18px; color:#5E6C84">${d.icon}</span><span class="doc-name" style="overflow:hidden; text-overflow:ellipsis;">${d.name}</span></a>`).join(''); } else { docEl.innerHTML = '<p style="color:var(--text-sub); font-size:12px; text-align:center;">Vuoto</p>'; }
}

async function fetchGoogle() {
    if(GCAL_1.includes("LINK_SCRIPT")) return;
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
    } catch(e) { console.error("Google Err:", e); }
}

function renderGoogleEvents() {
    const ids = [null, 'mon-gcal', 'tue-gcal', 'wed-gcal', 'thu-gcal', 'fri-gcal'];
    for(let i=1; i<=5; i++) { const el = document.getElementById(ids[i]); if(el) { el.innerHTML = ''; gcalData.forEach(ev => { const d = new Date(ev.startTime); if(d.getDay() === i) { const time = d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); let html = `<a href="${ev.link}" target="_blank" class="gcal-event"><span class="call-badge">CALL</span><span style="font-weight:700; margin-right:5px;">${time}</span>${ev.title}</a>`; el.insertAdjacentHTML('beforeend', html); } }); } }
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