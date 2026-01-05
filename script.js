// --- CONFIGURAZIONE ---
const PWD = "giuseppe90";
const PANTRY_ID = "e39b701d-95a9-48c0-ae96-d13b53856c94";

// LINK GOOGLE (Inserisci i tuoi se diversi)
const GCAL_1 = "https://script.google.com/macros/s/AKfycbxB9o4nTJpwgKKdYaCkHtjSTu7SeQsMvUPd-xiXbrXOBgXxkc_X9HjtrUdCxZ2Cs_FS/exec"; 
const GCAL_2 = "https://script.google.com/macros/s/AKfycbx7qYTrubG_KHBkesRUmBxUu3CRI3SC_jhNLH4pxIB0NA5Rgd2nKlgRvmpsToxdJrbN4A/exec";

// Rilevamento Test/Live
const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "";
const BASKET = isLocal ? "Dashboard_TEST_LOCAL" : "Dashboard"; 
const PANTRY_URL = `https://getpantry.cloud/apiv1/pantry/${PANTRY_ID}/basket/${BASKET}`;

const DEFAULT_COMPANIES = [];

// --- VARIABILI GLOBALI ---
let currentMon = getRealMonday();
let globalData = {};
let companyList = [];
let gcalData = []; 
let googleMixData = { email: [], drive: [] };
let saveTimer;
let lastDayFocus = null; 
let isDataLoaded = false;
let dragSrcEl, dragDay, dragIndex;

// --- UTILS DATA ---
function getRealMonday() {
    const d = new Date();
    const day = d.getDay(); 
    const diff = d.getDate() - day + (day == 0 ? -6 : 1);
    const mon = new Date(d); mon.setDate(diff); mon.setHours(0,0,0,0);
    return mon;
}

// --- AVVIO SICURO ---
document.addEventListener("DOMContentLoaded", () => {
    // Se già loggato, avvia subito
    if(localStorage.getItem('auth') === '1') {
        const loginScreen = document.getElementById('loginScreen');
        if(loginScreen) loginScreen.style.display = 'none';
        initApp();
    }
});

// Funzione Login esposta globalmente
window.tryLogin = function() {
    const input = document.getElementById('passwordInput');
    const err = document.getElementById('loginError');
    
    if(input.value.trim() === PWD) {
        localStorage.setItem('auth', '1');
        // Nascondi login
        document.getElementById('loginScreen').style.display = 'none';
        // Mostra app
        document.getElementById('app').style.display = 'grid';
        initApp();
    } else { 
        err.style.display = 'block'; 
        // Shake animation reset
        input.style.border = "1px solid red";
    }
}

function initApp() {
    console.log("App iniziata...");
    
    // Mostra interfaccia
    const app = document.getElementById('app');
    const loader = document.getElementById('loadingScreen');
    if(app) app.style.display = 'grid';
    if(loader) loader.style.display = 'flex';

    if (isLocal) {
        const status = document.getElementById('syncStatus');
        if(status) { 
            status.innerText = "TEST MODE"; 
            status.style.background = "#EF4444"; 
            status.style.color = "white"; 
        }
    }

    // Tema
    if(localStorage.getItem('theme') === 'dark') document.body.setAttribute('data-theme', 'dark');
    
    // Listener Focus per Tag
    document.addEventListener('focusin', e => { 
        if(e.target.classList.contains('task-text')) {
            lastDayFocus = e.target.closest('.day-body').id; 
        }
    });

    updateDateDisplay();
    
    // Caricamento Dati
    loadData(false);
    
    // Timeout di Sicurezza (Sblocco forzato dopo 4 sec)
    setTimeout(() => { 
        if (!isDataLoaded) { 
            console.warn("Forzatura avvio per timeout");
            if(loader) loader.style.display = 'none'; 
            isDataLoaded = true; 
            setStatus('Recupero...', 'ok'); 
            renderWeek(); // Renderizza anche se vuoto
        } 
    }, 4000);

    // Sync periodico
    setInterval(() => loadData(true), 300000); 
}

// --- NAVIGAZIONE ---
window.nav = function(page) {
    document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('active'));
    // Trova il bottone cliccato
    const btn = document.querySelector(`.menu-item[onclick*="${page}"]`);
    if(btn) btn.classList.add('active');
    
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-'+page).classList.add('active');
    
    const tb = document.getElementById('mainToolbar');
    if(tb) tb.style.display = (page === 'calendar') ? 'flex' : 'none';
    
    const titles = { 'home': 'Dashboard', 'calendar': 'Calendario', 'account': 'Account Amazon', 'notes': 'Blocco Note' };
    const titleEl = document.getElementById('pageTitle');
    if(titleEl) titleEl.innerText = titles[page];
    
    if(page === 'home') renderHomeWidgets();
}

function getWeekKey() { return "W_" + currentMon.toISOString().split('T')[0]; }

function setStatus(msg, type) {
    const el = document.getElementById('syncStatus');
    if(!el) return;
    if(isLocal && msg !== "Salvataggio...") return;
    el.innerText = msg;
    el.className = `status-badge status-${type}`;
}

// --- DATI ---
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
            const loader = document.getElementById('loadingScreen');
            if(loader) loader.style.display='none';
            if(!silent) setStatus('Online', 'ok');

            const home = document.getElementById('page-home');
            if(home && home.classList.contains('active')) renderHomeWidgets();
        } else {
             // DB Nuovo
             isDataLoaded = true;
             const loader = document.getElementById('loadingScreen');
             if(loader) loader.style.display='none';
             renderWeek();
        }
    } catch(e) { 
        if(!silent) setStatus('Offline', 'wait'); 
        isDataLoaded = true; 
        const loader = document.getElementById('loadingScreen');
        if(loader) loader.style.display='none';
    }
}

// --- MODALE & FORM ---
window.openActivityModal = function() {
    document.getElementById('activityModal').style.display = 'flex';
    const select = document.getElementById('formCompany');
    if(companyList.length === 0) select.innerHTML = '<option disabled selected>Crea prima un\'azienda</option>';
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
    
    // Header Azienda
    dayData.push({ 
        txt: '', 
        done: false, 
        tag: { name: company.name, bg: company.color, col: (company.color==='#FFD600'?'#000':'#fff'), bd: company.color }, 
        isHeader: true 
    });
    
    // Tasks
    const lines = tasksRaw.split('\n');
    lines.forEach(line => {
        if(line.trim()) dayData.push({ txt: line.trim(), done: false });
    });

    globalData[key][day] = dayData;
    renderWeek();
    saveData();
    closeModal();
}

// --- RENDER WEEK & DRAG DROP ---
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

        // Righe vuote extra
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

    // Dati Extra
    if(globalData.account) {
        const sales = document.getElementById('stat-sales');
        if(sales) sales.innerText = globalData.account.sales || "€ 0,00";
        const units = document.getElementById('stat-units');
        if(units) units.innerText = globalData.account.units || "0";
        const notes = document.getElementById('account-notes');
        if(notes) notes.innerText = globalData.account.notes || "";
    }
    if(globalData.notes) {
        const genNotes = document.getElementById('general-notes');
        if(genNotes) genNotes.innerText = globalData.notes.general || "";
    }
    if(globalData.home) {
        const homeNote = document.getElementById('home-quick-notes');
        if(homeNote) homeNote.value = globalData.home.quick || "";
    }
    
    if(gcalData.length > 0) renderGoogleEvents();
}

// --- AZIONI TASK ---
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
    e.stopPropagation(); e.preventDefault();
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
    const key = getWeekKey();
    if(!globalData[key]) globalData[key] = {};
    if(!globalData[key][day]) globalData[key][day] = [];
    
    const txt = (typeof val === 'string') ? val : '';
    const done = (typeof val !== 'string'); // Se non è stringa, è click su check

    globalData[key][day].push({ txt: txt, done: done });
    renderWeek();
    deferredSave();
}

function updateTask(day, row, val) {
    const key = getWeekKey();
    if(!globalData[key]) globalData[key] = {};
    if(!globalData[key][day]) globalData[key][day] = [];
    // Se l'indice non esiste (riga nuova), crealo
    if(!globalData[key][day][row]) globalData[key][day][row] = { txt:'', done:false };
    
    globalData[key][day][row].txt = val;
    deferredSave();
}

function toggleTask(day, row) {
    const key = getWeekKey();
    if(globalData[key] && globalData[key][day] && globalData[key][day][row]) {
        globalData[key][day][row].done = !globalData[key][day][row].done;
        renderWeek();
        deferredSave();
        const home = document.getElementById('page-home');
        if(home && home.classList.contains('active')) renderHomeWidgets();
    }
}

// --- AZIENDE ---
function renderCompanyButtons() {
    const cont = document.getElementById('companyTagsContainer');
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

// --- HOME ---
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
                // Trova indice reale
                const realIdx = tasks.indexOf(t);
                return `
                <div class="task-row" style="border-bottom:1px solid #f0f0f0;">
                    <div class="task-chk ${t.done?'checked':''}" onclick="toggleTask('${dayCode}', ${realIdx})"></div>
                    <span style="font-size:13px; ${t.done?'text-decoration:line-through; color:#aaa':''}">${t.txt}</span>
                </div>`;
            }).join('');
        } else {
            homeTasksEl.innerHTML = '<p style="color:var(--text-sub); text-align:center; padding-top:20px">Nessuna attività.</p>';
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
    if(googleMixData.email && googleMixData.email.length) {
        mailEl.innerHTML = googleMixData.email.map(m => `<div class="mail-item" onclick="window.open('${m.link}', '_blank')"><span class="mail-from">${m.from}</span><span class="mail-subj">${m.subject}</span></div>`).join('');
    } else { mailEl.innerHTML = '<p style="color:var(--text-sub); font-size:12px; text-align:center;">Vuoto</p>'; }
    
    const docEl = document.getElementById('docs-list');
    if(googleMixData.drive && googleMixData.drive.length) {
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

    const dayEl = document.getElementById('currentDayLabel');
    if(dayEl) dayEl.innerText = strDay.charAt(0).toUpperCase() + strDay.slice(1);
    const weekEl = document.getElementById('currentWeekRange');
    if(weekEl) weekEl.innerText = strWeek;
    const calEl = document.getElementById('calDateDisplay');
    if(calEl) calEl.innerText = strWeek;
}

window.changeWeek = async function(dir) { await saveData(); document.getElementById('loadingScreen').style.display='flex'; currentMon.setDate(currentMon.getDate() + (dir * 7)); updateDateDisplay(); loadData(false); }
window.forceSync = function() { document.getElementById('loadingScreen').style.display='flex'; loadData(false); }
window.toggleTheme = function() { const isDark = document.body.getAttribute('data-theme') === 'dark'; document.body.setAttribute('data-theme', isDark ? 'light' : 'dark'); localStorage.setItem('theme', isDark ? 'light' : 'dark'); }
window.fmt = function(cmd) { document.execCommand(cmd, false, null); deferredSave(); }
window.toggleDone = function() { document.execCommand('strikeThrough'); } // Fallback per note
function isToday(date) { const t = new Date(); return date.getDate() === t.getDate() && date.getMonth() === t.getMonth(); }

async function fetchGoogle() {
    if(GCAL_1.includes("LINK")) return;
    let start = new Date(currentMon); let end = new Date(currentMon); end.setDate(end.getDate() + 5);
    try {
        // Fetch Calendar (Doppio Script)
        const p1 = fetch(`${GCAL_1}?action=calendar&start=${start.toISOString()}&end=${end.toISOString()}`).then(r=>r.json()).catch(()=>[]);
        const p2 = fetch(`${GCAL_2}?action=calendar&start=${start.toISOString()}&end=${end.toISOString()}`).then(r=>r.json()).catch(()=>[]);
        
        // Fetch Mail/Drive (Solo dal primo per semplicità)
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
    for(let i=1; i<=5; i++) { 
        const el = document.getElementById(ids[i]);
        if(el) { 
            el.innerHTML = ''; 
            gcalData.forEach(ev => { 
                const d = new Date(ev.startTime); 
                if(d.getDay() === i) { 
                    const time = d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); 
                    let html = `<a href="${ev.link}" target="_blank" class="gcal-event"><span class="call-badge">CALL</span><span style="font-weight:700; margin-right:5px;">${time}</span>${ev.title}</a>`;
                    el.insertAdjacentHTML('beforeend', html); 
                } 
            }); 
        } 
    }
}