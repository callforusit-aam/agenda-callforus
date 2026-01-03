// --- FETCH GOOGLE AGGIORNATA ---
async function fetchGoogle() {
    if(GOOGLE_SCRIPT_URL.includes("INSERISCI")) return;
    
    // Calcola date per la settimana corrente visualizzata
    let start = new Date(currentMon);
    let end = new Date(currentMon); end.setDate(end.getDate() + 5);
    
    try {
        // Scarica Calendario
        const resCal = await fetch(`${GOOGLE_SCRIPT_URL}?action=calendar&start=${start.toISOString()}&end=${end.toISOString()}`);
        gcalData = await resCal.json();
        
        // Scarica Mail/Drive (solo se serve, per non rallentare)
        const resMix = await fetch(`${GOOGLE_SCRIPT_URL}?action=data`);
        googleMixData = await resMix.json();
        
        // Aggiorna Home e Calendario
        if(document.getElementById('page-home').classList.contains('active')) renderHomeWidgets();
        renderGoogleEvents();

    } catch(e) { console.error("Google Err:", e); }
}

// --- RENDER EVENTI CALENDARIO (CON LINK CLICCABILE) ---
function renderGoogleEvents() {
    const ids = [null, 'mon-gcal', 'tue-gcal', 'wed-gcal', 'thu-gcal', 'fri-gcal'];
    
    // 1. Pulisci tutti i contenitori gcal
    for(let i=1; i<=5; i++) { 
        const el = document.getElementById(ids[i]);
        if(el) el.innerHTML = ''; 
    }

    // 2. Inserisci gli eventi
    gcalData.forEach(ev => {
        const d = new Date(ev.startTime);
        const dayIdx = d.getDay(); // 1=Lun, 5=Ven
        
        // Se è un giorno della settimana lavorativa
        if(dayIdx >= 1 && dayIdx <= 5) {
            const container = document.getElementById(ids[dayIdx]);
            
            if(container) {
                const time = d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
                let html = '';

                // SE C'È UN LINK (Meet, Zoom, ecc)
                if(ev.link && ev.link.length > 5) {
                    html = `
                    <a href="${ev.link}" target="_blank" class="gcal-event" title="Apri Call">
                        <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                            <span class="call-badge">CALL</span>
                            <span class="material-icons-round" style="font-size:12px;">open_in_new</span>
                        </div>
                        <div style="font-weight:700; margin-top:2px;">${time}</div>
                        <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${ev.title}</div>
                    </a>`;
                } 
                // SE NON C'È LINK
                else {
                    html = `
                    <div class="gcal-event" style="cursor:default; background:#F1F5F9; border-left-color:#94A3B8;">
                        <div style="font-weight:700;">${time}</div>
                        <div>${ev.title}</div>
                    </div>`;
                }
                
                container.insertAdjacentHTML('beforeend', html);
            }
        }
    });
}