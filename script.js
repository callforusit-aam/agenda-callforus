// --- CONFIGURAZIONE ---
const PWD = "giuseppe90";
const PANTRY_ID = "e39b701d-95a9-48c0-ae96-d13b53856c94";

// LINK GOOGLE SCRIPT
const GCAL_1 = "https://script.google.com/macros/s/AKfycbw7l-WUQr3cW1BxuEbIMmmGG_MdCfJxW1_O2S-E740/exec";
const GCAL_2 = "https://script.google.com/macros/s/AKfycbx7qYTrubG_KHBkesRUmBxUu3CRI3SC_jhNLH4pxIB0NA5Rgd2nKlgRvmpsToxdJrbN4A/exec"; // Se hai un secondo script, altrimenti usa lo stesso

// Rilevamento Test/Live
const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "";
const BASKET = isLocal ? "Dashboard_TEST_FINAL_V2" : "Dashboard_FINAL_V2"; 
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
    document.getElementById('loadingText').innerText = "Caricamento Dati...";
    
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

// --- CARICAMENTO DATI ---
async function loadData(silent) {
    if(!silent) setStatus('Sync...', 'wait');
    try {
        const res = await fetch(PANTRY_URL + "?t=" + Date.now(), { cache: "no-store" });
        if(res.ok) {
            const json = await res.json();
            globalData = json || {};
            
            companyList = globalData.COMPANIES || DEFAULT_COMPANIES;
            renderCompanyButtons();
            
            renderWeek();     // Renderizza Calendario
            renderSidebar();  // Renderizza Sidebar (IMPORTANTE!)
            
            fetchGoogle();
            
            isDataLoaded = true;
            document.getElementById('loadingScreen').style.display='none';
            if(!silent) setStatus('Online', 'ok');

            if(document.getElementById('page-home').classList.contains('active')) renderHomeWidgets();
        } else {
             isDataLoaded = true;
             document.getElementById('loadingScreen').style.display='none';
             renderWeek();
             renderSidebar();
        }
    } catch(e) { if(!silent) setStatus('Offline', 'wait'); isDataLoaded = true; document.getElementById('loadingScreen').style.display='none'; }
}

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

        // Righe vuote per inserimento manuale
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

    // Extra Data
    if(globalData.account) {
        if(document.getElementById('stat-sales')) document.getElementById('stat-sales').innerText = globalData.account.sales || "€ 0,00";
        if(document.getElementById('stat-units')) document.getElementById('stat-units').innerText = globalData.account.units || "0";
        if(document.getElementById('account-notes')) document.getElementById('account-notes').innerText = globalData.account.notes || "";
    }
    if(globalData.notes && document.getElementById('general-notes')) document.getElementById('general-notes').innerText = globalData.notes.general || "";
    if(globalData.home && document.getElementById('home-quick-notes')) document.getElementById('home-quick-notes').value = globalData.home.quick || "";
    
    if(gcalData.length > 0) renderGoogleEvents();
}

// Funzione dedicata per renderizzare la sidebar e popolarla
function renderSidebar() {
    const key = getWeekKey();
    const d = globalData[key] || {};

    // 1. Call Settimana
    const callList = document.getElementById('callList');
    if(callList) {
        let callHtml = '';
        // Se ci sono dati salvati per le call (array di oggetti o stringhe)
        //