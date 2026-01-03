// --- CONFIGURAZIONE ---
const PWD = "giuseppe90";
const PANTRY_ID = "e39b701d-95a9-48c0-ae96-d13b53856c94";
// INSERISCI QUI SOTTO IL TUO LINK GOOGLE SCRIPT (quello con /exec finale)
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw7l-WUQr3cW1BxuEbIMmmGG_MdCfJxW1_O2S-E740/exec";

// Rilevamento Test/Live
const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "";
const BASKET = isLocal ? "Dashboard_TEST_LOCAL" : "Dashboard"; 
const PANTRY_URL = `https://getpantry.cloud/apiv1/pantry/${PANTRY_ID}/basket/${BASKET}`;

const DEFAULT_COMPANIES = [];

let currentMon = getRealMonday();
let globalData = {};
let companyList = [];
let gcalData = []; 
let googleMixData = { email: [], drive: [] };
let saveTimer;
let lastDayFocus = null; 
let isDataLoaded = false;

// Variabili Drag & Drop
let dragSrcEl = null;
let dragDay = null;
let dragIndex = null;

function getRealMonday() {
    const d = new Date();
    const day = d.getDay(); 
    const diff = d.getDate() - day + (day == 0 ? -6 : 1);
    const mon = new Date(d); mon.setDate(diff); mon.setHours(0,0,0,0);
    return mon;
}

// AUTO LOGIN
if(localStorage.getItem('auth')==='1') {
    // Nascondi login subito
    const login = document.getElementById('loginScreen');
    if(login) login.style.display='none';
    // Avvia app con leggero ritardo per sicurezza
    setTimeout(initApp, 100);
}

// LOGIN MANUALE
function tryLogin() {
    const input = document.getElementById('passwordInput');
    const err = document.getElementById('loginError');
    
    if(input.value.trim() === PWD) {
        localStorage.setItem('auth', '1');
        // Forza nascondi login PRIMA di caricare i dati
        document.getElementById('loginScreen').style.display='none';
        document.getElementById('app').style.display='grid';
        initApp();
    } else { 
        err.style.display='block';
        input.value = '';
        input.focus();
    }
}

function initApp() {
    // UI Setup
    document.getElementById('loginScreen').style.display='none';
    document.getElementById('app').style.display='grid';
    document.getElementById('loadingScreen').style.display='flex';
    
    if (isLocal) {
        const status = document.getElementById('syncStatus');
        if(status) { status.innerText = "TEST MODE"; status.style.background = "#EF4444"; status.style.color = "white"; }
    }
    
    if(localStorage.getItem('theme') === 'dark') document.body.setAttribute('data-theme', 'dark');
    
    // Listener Focus
    document.addEventListener('focusin', e => { 
        if(e.target.classList.contains('task-text')) {
            lastDayFocus = e.target.closest('.day-body').id; 
        }
    });

    updateDateDisplay();
    loadData(false);
    
    // Safety Timeout: Se non carica entro 4 sec, sblocca comunque
    setTimeout(() => { 
        if (!isDataLoaded) { 
            document.getElementById('loadingScreen').style.display = 'none'; 
            isDataLoaded = true; 
            setStatus('Recupero...', 'ok'); 
            // Prova a renderizzare comunque la struttura vuota
            renderWeek();
        } 
    }, 4000);
    
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
    if(isLocal && msg !== "Salvataggio...") return;
    el.innerText = msg;
    el.className = `status-badge status-${type}`;
}

async function loadData(silent) {
    if(!silent) setStatus('Sync...', 'wait');
    try {
        const res = await fetch(PANTRY_URL + "?t=" + Date.now());
        if(res.ok) {
            const json = await res.json();
            globalData = json || {};
            
            companyList = globalData.COMPANIES || DEFAULT_COMPANIES;
            renderCompanyButtons();
            
            renderWeek();
            fetchGoogle();
            
            isDataLoaded = true;
            document.getElementById('loadingScreen').style.display='none';
            if(!silent) setStatus('Online', 'ok');

            if(document.getElementById('page-home') && document.getElementById('page-home').classList.contains('active')) renderHomeWidgets();
        } else {
             // DB Nuovo
             isDataLoaded = true;
             document.getElementById('loadingScreen').style.display='none';
             renderWeek();
        }
    } catch(e) { if(!silent) setStatus('Offline', 'wait'); isDataLoaded = true; document.getElementById('loadingScreen').style.display='none'; }
}

// --- GESTIONE MODALE FORM ---
window.openActivityModal = function() {
    document.getElementById('activityModal').style.display = 'flex';
    const select = document.getElementById('formCompany');
    if(companyList.length === 0) select.innerHTML = '<option disabled selected>Crea prima un\'azienda (tasto +)</option>';
    else select.innerHTML = companyList.map((c, i) => `<option value="${i}">${c.name}</option>`).join('');
    
    const today = new Date().getDay();
    const daysMap = ['mon','mon','tue','wed','thu','fri','mon'];
    document.getElementById('formDay').value = daysMap[today];
}

window.closeModal = function() {
    document.getElementById('activityModal').style.display = 'none';
    document.getElementById('formTasks').value = '';
}

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
    lines.forEach(line => {
        if(line.trim()) dayData.push({ txt: line.trim(), done: false });
    });

    globalData[key][day] = dayData;
    renderWeek();
    saveData();
    closeModal();
}

// --- RENDER CALENDARIO ---
function renderWeek() {
    const key = getWeekKey();
    const d = globalData[key] || {};
    const days = ['mon','tue','wed','thu','fri'];
    const labels = ['LUN','MAR','MER','GIO','VEN'];
    const todayIdx = new Date().getDay(); 
    const todayDate = new Date().getDate(); // Per capire il giorno esatto

    const calContainer = document.getElementById('calendar-days');
    
    if(calContainer) {
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

            // Righe vuote
            const emptySlots = Math.max(0, 5 - dayData.length);
            for(let e=0; e<emptySlots; e++) {
                rowsHtml += `
                <div class="task-row">
                    <span class="material-icons-round drag-handle" style="opacity:0.1">drag_indicator</span>
                    <div class="task-chk" onclick="addTaskManually('${dayCode}')"></div>
                    <input type="text" class="task-text" placeholder="..." onchange="addTaskManually('${dayCode}', this.value)">
                </div>`;
            }

            // Calcolo se è oggi (per colorare l'header)
            // Attenzione: getRealMonday ci dà il lunedì corrente.
            // Controlliamo se la data del giorno renderizzato corrisponde a oggi
            let thisDayDate = new Date(currentMon);
            thisDayDate.setDate(thisDayDate.getDate() + i);
            const isTodayClass = (thisDayDate.toDateString() === new Date().toDateString()) ? 'current-day' : '';

            return `
            <div class="day-col ${isTodayClass}">
                <div class="day-head">${labels[i]} <span style="font-weight:400; opacity:0.7">${thisDayDate.getDate()}</span></div>
                <div class="gcal-wrapper" id="${dayCode}-gcal"></div>
                <div class="day-body" id="${dayCode}">
                    ${rowsHtml}
                </div>
            </div>`;
        }).join('');
    }

    // Extra Data (Account & Notes)
    if(globalData.account) {
        if(document.getElementById('stat-sales')) document.getElementById('stat-sales').innerText = globalData.account.sales || "€ 0,00";
        if(document.getElementById('stat-units')) document.getElementById('stat-units').innerText = globalData.account.units || "0";
        if(document.getElementById('account-notes')) document.getElementById('account-notes').innerText = globalData.account.notes || "";
    }
    if(globalData.notes && document.getElementById('general-notes')) document.getElementById('general-notes').innerText = globalData.notes.general || "";
    if(globalData.home && document.getElementById('home-quick-notes')) document.getElementById('home-quick-notes').value = globalData.home.quick || "";
    
    if(gcalData.length > 0) renderGoogleEvents();
}

window.deleteTask = function(e, day, index) {
    if(e) e.stopPropagation();
    if(confirm("Eliminare questa riga?")) {
        const key = getWeekKey();
        globalData[key][day].splice(index, 1);
        renderWeek();
        saveData();
    }
}

window.handleDragStart = function(e, day, index) {
    dragSrcEl = e.target;
    dragDay = day;
    dragIndex = index;
    e.target.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
}

window.handleDragOver = function(e) {
    if (e.preventDefault) e.preventDefault(); 
    e.dataTransfer.dropEffect = 'move';
    return false;
}

window.handleDrop = function(e, targetDay, targetIndex) {
    e.stopPropagation();
    e.preventDefault();
    if (dragDay === targetDay && dragIndex !== targetIndex) {
        const key = getWeekKey();
        const list = globalData[key][targetDay];
        const [movedItem] = list.splice(dragIndex, 1);
        list.splice(targetIndex, 0, movedItem);
        renderWeek();
        saveData();
    }
    return false;
}

window.addTaskManually = function(day, val) {
    if(!val) return;
    const key = getWeekKey();
    if(!globalData[key]) globalData[key] = {};
    if(!globalData[key][day]) globalData[key][day] = [];
    globalData[key][day].push({ txt: val, done: false });
    renderWeek();
    deferredSave();
}

function updateTask(day, row, val) {
    const key = getWeekKey();
    if(globalData[key][day][row]) {
        globalData[key][day][row].txt = val;
        deferredSave();
    }
}

function toggleTask(day, row) {
    const key = getWeekKey();
    if(globalData[key][day][row]) {
        globalData[key][day][row].done = !globalData[key][day][row].done;
        renderWeek();
        deferredSave();
        if(document.getElementById('page-home').classList.contains('active')) renderHomeWidgets();
    }
}

// --- AZIENDE ---
function renderCompanyButtons() {
    const cont = document.getElementById('companyTagsContainer');
    if(!cont) return;
    if (!companyList.length) {
        cont.innerHTML = "<span style='font-size:10px; color:#aaa; margin-left:10px;'>Crea un'azienda</span>";
    } else {
        cont.innerHTML = companyList.map((c, i) => `
            <button class="btn-company" oncontextmenu="deleteCompany(event, ${i})">
                <div class="company-dot" style="background:${c.color}"></div>
                ${c.name}
            </button>
        `).join('');
    }
}

window.addNewCompany = function() {
    const name = document.getElementById('newCompName').value.trim().toUpperCase();
    const color = document.getElementById('newCompColor').value;
    if(name) {
        companyList.push({name, color});
        document.getElementById('newCompName').value = "";
        saveData();
        renderCompanyButtons();
    }
}

window.deleteCompany = function(e, index) {
    e.preventDefault();
    if(confirm(`Eliminare ${companyList[index].name}?`)) {
        companyList.splice(index, 1);
        renderCompanyButtons();
        saveData();
    }
}

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
                return `
                <div class="task-row" style="border-bottom:1px solid #f0f0f0;">
                    <div class="task-chk ${t.done?'checked':''}" onclick="toggleTask('${dayCode}', ${realIdx}); renderHomeWidgets();"></div>
                    <span style="font-size:13px; ${t.done?'text-decoration:line-through; color:#aaa':''}">${t.txt}</span>
                </div>`;
            }).join('');
        } else {
            homeTasksEl.innerHTML = '<p style="color:var(--text-sub); text-align:center; padding-top:20px">Nessuna attività oggi.</p>';
        }
    } else {
        homeTasksEl.innerHTML = '<p style="color:var(--text-sub); text-align:center; padding-top:20px">Buon Weekend!</p>';
    }
    renderExternalData();
}

function renderExternalData() {
    const homeCallsEl = document.getElementById('home-calls');
    homeCallsEl.innerHTML = '';
    const todayCalls = gcalData.filter(ev => isToday(new Date(ev.startTime)));
    if (todayCalls.length > 0) {
        todayCalls.forEach(ev => {
            const time = new Date(ev.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            let html = `<a href="${ev.link}" target="_blank" class="gcal-event">
                        <span class="call-badge">CALL</span>
                        <span style="font-weight:700; margin-right:5px;">${time}</span>
                        ${ev.title}
                    </a>`;
            homeCallsEl.innerHTML += html;
        });
    } else { homeCallsEl.innerHTML = '<p style="color:var(--text-sub); text-align:center;">Nessuna call.</p>'; }
    
    const mailEl = document.getElementById('mail-list-container');
    if(googleMixData.email.length) {
        mailEl.innerHTML = googleMixData.email.map(m => `<div class="mail-item" onclick="window.open('${m.link}', '_blank')"><span class="mail-from">${m.from}</span><span class="mail-subj">${m.subject}</span></div>`).join('');
    } else { mailEl.innerHTML = '<p style="color:var(--text-sub); font-size:12px; text-align:center;">Vuoto</p>'; }
    
    const docEl = document.getElementById('docs-list');
    if(googleMixData.drive.length) {
        docEl.innerHTML = googleMixData.drive.map(d => `<a href="${d.url}" target="_blank" class="doc-link"><span class="material-icons-round" style="font-size:18px; color:#5E6C84">${d.icon}</span><span class="doc-name" style="overflow:hidden; text-overflow:ellipsis;">${d.name}</span></a>`).join('');
    } else { docEl.innerHTML = '<p style="color:var(--text-sub); font-size:12px; text-align:center;">Vuoto</p>'; }
}

async function saveData() {
    const key = getWeekKey();
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
        await fetch(PANTRY_URL, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(globalData)
        });
        setStatus('Salvato', 'ok');
    } catch(e) { setStatus('Errore Save', 'err'); }
}

function updateDateDisplay() {
    const start = new Date(currentMon);
    const end = new Date(currentMon); end.setDate(start.getDate() + 4);
    
    const strDay = start.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    const strWeek = `${start.getDate()} - ${end.getDate()} ${end.toLocaleDateString('it-IT', { month: 'long' })}`;

    const dayLabel = document.getElementById('currentDayLabel');
    if(dayLabel) dayLabel.innerText = strDay.charAt(0).toUpperCase() + strDay.slice(1);
    
    const weekLabel = document.getElementById('currentWeekRange');
    if(weekLabel) weekLabel.innerText = strWeek;
    
    const calLabel = document.getElementById('calDateDisplay');
    if(calLabel) calLabel.innerText = strWeek;
}

window.changeWeek = async function(dir) { await saveData(); document.getElementById('loadingScreen').style.display='flex'; currentMon.setDate(currentMon.getDate() + (dir * 7)); updateDateDisplay(); loadData(false); }
window.forceSync = function() { document.getElementById('loadingScreen').style.display='flex'; loadData(false); }
window.toggleTheme = function() { const isDark = document.body.getAttribute('data-theme') === 'dark'; document.body.setAttribute('data-theme', isDark ? 'light' : 'dark'); localStorage.setItem('theme', isDark ? 'light' : 'dark'); }
window.fmt = function(cmd) { document.execCommand(cmd, false, null); deferredSave(); }
function isToday(date) { const t = new Date(); return date.getDate() === t.getDate() && date.getMonth() === t.getMonth(); }
async function fetchGoogle() {
    if(GOOGLE_SCRIPT_URL.includes("INSERISCI")) return;
    let start = new Date(currentMon); let end = new Date(currentMon); end.setDate(end.getDate() + 5);
    try {
        const resCal = await fetch(`${GOOGLE_SCRIPT_URL}?action=calendar&start=${start.toISOString()}&end=${end.toISOString()}`);
        gcalData = await resCal.json();
        const resMix = await fetch(`${GOOGLE_SCRIPT_URL}?action=data`);
        googleMixData = await resMix.json();
        if(document.getElementById('page-home').classList.contains('active')) renderHomeWidgets();
        renderGoogleEvents();
    } catch(e) { console.log("Google Err", e); }
}
function renderGoogleEvents() {
    const ids = [null, 'mon-gcal', 'tue-gcal', 'wed-gcal', 'thu-gcal', 'fri-gcal'];
    for(let i=1; i<=5; i++) { const el = document.getElementById(ids[i]); if(el) { el.innerHTML = ''; gcalData.forEach(ev => { const d = new Date(ev.startTime); if(d.getDay() === i) { const time = d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); let html = `<a href="${ev.link}" target="_blank" class="gcal-event"><span class="call-badge">CALL</span><span style="font-weight:700; margin-right:5px;">${time}</span>${ev.title}</a>`; el.insertAdjacentHTML('beforeend', html); } }); } }
}