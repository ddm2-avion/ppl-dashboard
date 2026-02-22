/* ================================================================
   PPL TRACKER — JAVASCRIPT
   Architecture: Module-like pattern with clear sections
================================================================ */

'use strict';

/* ================================================================
   CONSTANTS — Matières PPL
================================================================ */
const MATIERES = [
  { id: 'regl',   label: 'Réglementation',                        color: '#b07ef0' },
  { id: 'cga',    label: 'Connaissance générale de l\'aéronef',   color: '#4f9cf0' },
  { id: 'ppv',    label: 'Performances et préparation du vol',    color: '#7ecfb3' },
  { id: 'phpl',   label: 'Performances humaines et ses limites',  color: '#e8c840' },
  { id: 'meteo',  label: 'Météorologie',                          color: '#e87f5c' },
  { id: 'nav',    label: 'Navigation',                            color: '#5abf80' },
  { id: 'proc',   label: 'Procédures opérationnelles',            color: '#e05a5a' },
  { id: 'pdv',    label: 'Principes du vol',                      color: '#f07ac0' },
  { id: 'com',    label: 'Communication',                         color: '#f0b44f' }
];

const DAYS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];

const HOURS = Array.from({length: 15}, (_,i) => `${(i+7).toString().padStart(2,'0')}:00`); // 07:00 → 21:00

/* ================================================================
   STATE — Loaded from localStorage at startup
================================================================ */
let state = {
  devoirs:    [],   // [{id, titre, matiere, date, priorite, statut}]
  weekSlots:  {},   // { "YYYY-WNN": [{id, day(0-6), start, end, matiere, desc}] }
  notes:      [],   // [{id, matiere, score, desc, date}]
  bacblancs:  [],   // [{id, matiere, score, duration, date}]
  weekOffset: 0     // current week relative offset
};

/* ================================================================
   LOCALSTORAGE — Persist & load
================================================================ */
function saveState() {
  localStorage.setItem('ppl_state', JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem('ppl_state');
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migration : anciens "slots" (tableau global) → weekSlots semaine courante
      if (parsed.slots && Array.isArray(parsed.slots) && parsed.slots.length > 0 && !parsed.weekSlots) {
        parsed.weekSlots = {};
        const key = getWeekKey(parsed.weekOffset || 0);
        parsed.weekSlots[key] = parsed.slots;
        delete parsed.slots;
      }
      // Merge pour ne pas perdre les nouvelles clés
      state = { ...state, ...parsed };
      if (!state.weekSlots) state.weekSlots = {};
    }
  } catch(e) {
    console.warn('Could not load state:', e);
  }
}

/* ================================================================
   ROUTING — Page navigation
================================================================ */
function initNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      navigateTo(page);
      // Close sidebar on mobile
      document.getElementById('sidebar').classList.remove('open');
    });
  });

  // Hamburger
  document.getElementById('hamburger').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
  // Close sidebar when clicking outside
  document.addEventListener('click', e => {
    const sidebar = document.getElementById('sidebar');
    const hamburger = document.getElementById('hamburger');
    if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== hamburger) {
      sidebar.classList.remove('open');
    }
  });
}

function navigateTo(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + pageId).classList.add('active');
  document.querySelector(`[data-page="${pageId}"]`).classList.add('active');

  // Re-render when navigating to a page
  if (pageId === 'dashboard') renderDashboard();
  if (pageId === 'devoirs')   renderDevoirs();
  if (pageId === 'emploi')    renderSchedule();
  if (pageId === 'notes')     renderNotes();
  if (pageId === 'bacblanc')  renderBacBlanc();
}

/* ================================================================
   UTILS
================================================================ */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatDate(str) {
  if (!str) return '–';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' });
}

function isUrgent(dateStr) {
  if (!dateStr) return false;
  const now = new Date();
  const deadline = new Date(dateStr + 'T23:59:59');
  return (deadline - now) < 48 * 3600 * 1000 && deadline >= now;
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  const deadline = new Date(dateStr + 'T23:59:59');
  return deadline < new Date();
}

function getMatiereLabel(id) {
  return MATIERES.find(m => m.id === id)?.label || id;
}
function getMatiereColor(id) {
  return MATIERES.find(m => m.id === id)?.color || '#888';
}

// Compute average score for a matiere
function avgScore(matiereId) {
  const scores = state.notes.filter(n => n.matiere === matiereId).map(n => n.score);
  if (!scores.length) return null;
  return Math.round(scores.reduce((a,b) => a+b, 0) / scores.length);
}

// Global average (all notes)
function globalAvg() {
  if (!state.notes.length) return 0;
  const s = state.notes.reduce((a,b) => a + b.score, 0);
  return Math.round(s / state.notes.length);
}

function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + type;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 2800);
}

/* ================================================================
   POPULATE SELECT menus with matières
================================================================ */
function populateMatiereSelects() {
  const ids = ['filterMatiere','devoirMatiere','slotMatiere','noteMatiere','bbMatiere'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    // Keep first option (if any)
    const firstOpt = el.options[0]?.value === '' ? el.options[0] : null;
    el.innerHTML = '';
    if (firstOpt) el.appendChild(firstOpt);
    MATIERES.forEach(m => {
      const o = document.createElement('option');
      o.value = m.id;
      o.textContent = m.label;
      el.appendChild(o);
    });
  });
}

/* ================================================================
   SECTION 1 — DASHBOARD
================================================================ */
function renderDashboard() {
  renderRing();
  renderSubjectsList();
  renderUrgentHomework();
  renderQuickStats();
}

function renderRing() {
  const canvas = document.getElementById('ringCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const avg = globalAvg();
  const pct = avg / 100;
  const cx = 80, cy = 80, r = 60;

  ctx.clearRect(0, 0, 160, 160);

  // Track
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#2a2f42';
  ctx.lineWidth = 10;
  ctx.stroke();

  // Progress
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI/2, -Math.PI/2 + pct * Math.PI * 2);
  ctx.strokeStyle = avg >= 85 ? '#5abf80' : avg >= 70 ? '#e8a840' : '#e05a5a';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.stroke();

  document.getElementById('ringPercent').textContent = avg + '%';
}

function renderSubjectsList() {
  const el = document.getElementById('subjectsList');
  if (!el) return;
  el.innerHTML = '';
  MATIERES.forEach(m => {
    const avg = avgScore(m.id);
    const display = avg !== null ? avg + '%' : '–';
    const cls = avg !== null ? (avg < 85 ? 'danger' : 'ok') : '';

    el.innerHTML += `
      <div class="subject-row">
        <div class="subject-dot" style="background:${m.color}"></div>
        <div class="subject-name">${m.label}</div>
        <div class="subject-bar-bg">
          <div class="subject-bar-fill" style="width:${avg||0}%;background:${m.color}"></div>
        </div>
        <div class="subject-avg ${cls}">${display}</div>
      </div>`;
  });
}

function renderUrgentHomework() {
  const el = document.getElementById('urgentHomework');
  if (!el) return;
  const urgent = state.devoirs
    .filter(d => d.statut !== 'done' && (isUrgent(d.date) || isOverdue(d.date)))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 5);

  if (!urgent.length) {
    el.innerHTML = '<div class="no-data">Aucun devoir urgent 🎉</div>';
    return;
  }
  el.innerHTML = urgent.map(d => `
    <div class="urgent-item">
      <div class="urgent-dot" style="background:${isOverdue(d.date)?'#e05a5a':'#e8a840'}"></div>
      <div class="urgent-title">${d.titre}</div>
      <div class="urgent-date">${formatDate(d.date)}</div>
    </div>`).join('');
}

function renderQuickStats() {
  const el = document.getElementById('quickStats');
  if (!el) return;
  const total = state.devoirs.length;
  const done  = state.devoirs.filter(d => d.statut === 'done').length;
  const exams  = state.bacblancs.length;
  const notesCount = state.notes.length;

  el.innerHTML = `
    <div class="stat-item"><span class="stat-val">${total}</span><div class="stat-lbl">Devoirs</div></div>
    <div class="stat-item"><span class="stat-val">${done}</span><div class="stat-lbl">Terminés</div></div>
    <div class="stat-item"><span class="stat-val">${exams}</span><div class="stat-lbl">Bacs blancs</div></div>
    <div class="stat-item"><span class="stat-val">${notesCount}</span><div class="stat-lbl">Notes saisies</div></div>
  `;
}

/* ================================================================
   SECTION 2 — DEVOIRS
================================================================ */
let editingDevoirId = null;

function initDevoirs() {
  document.getElementById('btnAddDevoir').addEventListener('click', () => openDevoirModal(null));
  document.getElementById('closeDevoirModal').addEventListener('click', closeDevoirModal);
  document.getElementById('cancelDevoirModal').addEventListener('click', closeDevoirModal);
  document.getElementById('saveDevoirModal').addEventListener('click', saveDevoir);
  document.getElementById('filterMatiere').addEventListener('change', renderDevoirs);
  document.getElementById('filterStatut').addEventListener('change', renderDevoirs);
}

function openDevoirModal(id) {
  editingDevoirId = id;
  const modal = document.getElementById('modalDevoir');
  document.getElementById('modalDevoirTitle').textContent = id ? 'Modifier le devoir' : 'Nouveau devoir';

  if (id) {
    const d = state.devoirs.find(x => x.id === id);
    document.getElementById('devoirTitre').value = d.titre;
    document.getElementById('devoirMatiere').value = d.matiere;
    document.getElementById('devoirDate').value = d.date;
    document.getElementById('devoirPriorite').value = d.priorite;
    document.getElementById('devoirStatut').value = d.statut;
  } else {
    document.getElementById('devoirTitre').value = '';
    document.getElementById('devoirMatiere').value = MATIERES[0].id;
    document.getElementById('devoirDate').value = '';
    document.getElementById('devoirPriorite').value = 'medium';
    document.getElementById('devoirStatut').value = 'todo';
  }
  modal.classList.remove('hidden');
}

function closeDevoirModal() {
  document.getElementById('modalDevoir').classList.add('hidden');
  editingDevoirId = null;
}

function saveDevoir() {
  const titre = document.getElementById('devoirTitre').value.trim();
  if (!titre) { showToast('Le titre est obligatoire', 'error'); return; }

  const devoir = {
    id:       editingDevoirId || uid(),
    titre,
    matiere:  document.getElementById('devoirMatiere').value,
    date:     document.getElementById('devoirDate').value,
    priorite: document.getElementById('devoirPriorite').value,
    statut:   document.getElementById('devoirStatut').value
  };

  if (editingDevoirId) {
    const idx = state.devoirs.findIndex(d => d.id === editingDevoirId);
    state.devoirs[idx] = devoir;
    showToast('Devoir modifié ✓', 'success');
  } else {
    state.devoirs.push(devoir);
    showToast('Devoir ajouté ✓', 'success');
  }

  saveState();
  closeDevoirModal();
  renderDevoirs();
  renderDashboard();
}

function deleteDevoir(id) {
  if (!confirm('Supprimer ce devoir ?')) return;
  state.devoirs = state.devoirs.filter(d => d.id !== id);
  saveState();
  renderDevoirs();
  renderDashboard();
  showToast('Devoir supprimé', 'info');
}

function renderDevoirs() {
  const el = document.getElementById('devoirsList');
  if (!el) return;

  const filterM = document.getElementById('filterMatiere').value;
  const filterS = document.getElementById('filterStatut').value;

  let list = state.devoirs.filter(d => {
    if (filterM && d.matiere !== filterM) return false;
    if (filterS && d.statut  !== filterS)  return false;
    return true;
  });

  // Sort: overdue first, then urgent, then by date
  list.sort((a, b) => {
    if (a.statut === 'done' && b.statut !== 'done') return 1;
    if (b.statut === 'done' && a.statut !== 'done') return -1;
    return new Date(a.date) - new Date(b.date);
  });

  if (!list.length) {
    el.innerHTML = '<div class="no-data" style="padding:24px">Aucun devoir pour l\'instant.</div>';
    return;
  }

  const statutLabel = { todo: 'À faire', inprogress: 'En cours', done: 'Terminé' };
  const prioLabel   = { low: 'Faible', medium: 'Moyenne', high: 'Haute' };

  el.innerHTML = list.map(d => {
    const urgent   = isUrgent(d.date);
    const overdue  = isOverdue(d.date) && d.statut !== 'done';
    const dateClass = overdue ? 'overdue' : urgent ? 'urgent-date' : '';
    const cardClass = overdue || urgent ? 'urgent' : '';
    const doneClass = d.statut === 'done' ? 'done-card' : '';

    return `
    <div class="devoir-card prio-${d.priorite} ${cardClass} ${doneClass}">
      <div class="devoir-top">
        <div class="devoir-title">${d.titre}</div>
        <div class="devoir-actions">
          <button class="btn-icon" onclick="openDevoirModal('${d.id}')" title="Modifier">✎</button>
          <button class="btn-icon del" onclick="deleteDevoir('${d.id}')" title="Supprimer">✕</button>
        </div>
      </div>
      <div class="devoir-meta">
        <span class="badge badge-matiere" style="background:${getMatiereColor(d.matiere)}22;color:${getMatiereColor(d.matiere)}">${getMatiereLabel(d.matiere)}</span>
        <span class="badge badge-statut-${d.statut}">${statutLabel[d.statut]}</span>
        <span class="badge badge-prio-${d.priorite}">Priorité ${prioLabel[d.priorite]}</span>
      </div>
      ${d.date ? `<div class="devoir-date ${dateClass}">
        ${overdue ? '⚠ En retard — ' : urgent ? '⚡ Urgent — ' : ''}Échéance : ${formatDate(d.date)}
      </div>` : ''}
    </div>`;
  }).join('');
}

/* ================================================================
   SECTION 3 — EMPLOI DU TEMPS (par semaine indépendante)
================================================================ */

/**
 * Calcule la clé unique d'une semaine au format "YYYY-WNN"
 * basée sur l'offset par rapport à la semaine courante.
 */
function getWeekKey(offset) {
  const monday = getWeekStart(offset);
  const year   = monday.getFullYear();
  // Numéro de semaine ISO
  const startOfYear = new Date(year, 0, 1);
  const weekNum = Math.ceil(((monday - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${year}-W${String(weekNum).padStart(2,'0')}`;
}

/** Retourne les créneaux de la semaine courante (offset actuel). */
function getCurrentWeekSlots() {
  const key = getWeekKey(state.weekOffset);
  if (!state.weekSlots[key]) state.weekSlots[key] = [];
  return state.weekSlots[key];
}

function initSchedule() {
  document.getElementById('btnAddSlot').addEventListener('click', () => openSlotModal());
  document.getElementById('closeSlotModal').addEventListener('click', closeSlotModal);
  document.getElementById('cancelSlotModal').addEventListener('click', closeSlotModal);
  document.getElementById('saveSlotModal').addEventListener('click', saveSlot);
  document.getElementById('prevWeek').addEventListener('click', () => {
    state.weekOffset--;
    saveState();
    renderSchedule();
  });
  document.getElementById('nextWeek').addEventListener('click', () => {
    state.weekOffset++;
    saveState();
    renderSchedule();
  });
}

function openSlotModal() {
  document.getElementById('slotMatiere').value = MATIERES[0].id;
  document.getElementById('slotDesc').value    = '';
  document.getElementById('slotStart').value   = '09:00';
  document.getElementById('slotEnd').value     = '10:00';
  document.getElementById('modalSlot').classList.remove('hidden');
}

function closeSlotModal() {
  document.getElementById('modalSlot').classList.add('hidden');
}

function saveSlot() {
  const start = document.getElementById('slotStart').value;
  const end   = document.getElementById('slotEnd').value;
  if (!start || !end || start >= end) {
    showToast("L'heure de fin doit être après l'heure de début", 'error');
    return;
  }
  const slot = {
    id:      uid(),
    day:     parseInt(document.getElementById('slotDay').value),
    start,
    end,
    matiere: document.getElementById('slotMatiere').value,
    desc:    document.getElementById('slotDesc').value.trim()
  };

  // Stocker dans la semaine courante uniquement
  const key = getWeekKey(state.weekOffset);
  if (!state.weekSlots[key]) state.weekSlots[key] = [];
  state.weekSlots[key].push(slot);

  saveState();
  closeSlotModal();
  renderSchedule();
  showToast('Créneau ajouté pour cette semaine ✓', 'success');
}

function deleteSlot(id) {
  const key = getWeekKey(state.weekOffset);
  if (state.weekSlots[key]) {
    state.weekSlots[key] = state.weekSlots[key].filter(s => s.id !== id);
  }
  saveState();
  renderSchedule();
}

function getWeekStart(offset) {
  const now  = new Date();
  const day  = now.getDay(); // 0=Dim
  const diff = (day === 0 ? -6 : 1 - day); // ramener au lundi
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function renderSchedule() {
  const grid = document.getElementById('scheduleGrid');
  if (!grid) return;

  const weekStart = getWeekStart(state.weekOffset);
  const weekEnd   = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  // Label semaine
  const opts = { day: '2-digit', month: 'short' };
  const weekKey = getWeekKey(state.weekOffset);
  document.getElementById('weekLabel').textContent =
    weekStart.toLocaleDateString('fr-FR', opts) + ' – ' + weekEnd.toLocaleDateString('fr-FR', opts)
    + '  (' + weekKey + ')';

  // Slots de cette semaine seulement
  const slots = state.weekSlots[weekKey] || [];

  grid.innerHTML = '';

  // ── En-têtes jours ──
  const corner = document.createElement('div');
  corner.className = 'sched-corner sched-header';
  grid.appendChild(corner);

  DAYS.forEach((day, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const h = document.createElement('div');
    h.className = 'sched-header';
    h.textContent = day + ' ' + d.getDate();
    grid.appendChild(h);
  });

  // ── Lignes horaires ──
  HOURS.forEach(hour => {
    const tc = document.createElement('div');
    tc.className = 'sched-timecol';
    tc.textContent = hour;
    grid.appendChild(tc);

    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const cell  = document.createElement('div');
      cell.className = 'sched-cell';

      const slotH     = parseInt(hour.split(':')[0]);
      const matching  = slots.filter(s => {
        if (s.day !== dayIdx) return false;
        const sh = parseInt(s.start.split(':')[0]);
        const eh = parseInt(s.end.split(':')[0]);
        // Afficher le bloc uniquement à son heure de début
        return sh === slotH;
      });

      matching.forEach(s => {
        // Calcul de hauteur proportionnelle
        const [sh, sm] = s.start.split(':').map(Number);
        const [eh, em] = s.end.split(':').map(Number);
        const durationH = (eh + em/60) - (sh + sm/60);

        const ev = document.createElement('div');
        ev.className = 'sched-event';
        ev.style.borderLeftColor = getMatiereColor(s.matiere);
        ev.style.background      = getMatiereColor(s.matiere) + '1a';
        // Hauteur proportionnelle : 48px par heure
        if (durationH > 1) ev.style.minHeight = (durationH * 48) + 'px';

        ev.innerHTML = `
          <div class="ev-title">${getMatiereLabel(s.matiere)}</div>
          <div class="ev-time">${s.start} – ${s.end}</div>
          ${s.desc ? `<div class="ev-time">${s.desc}</div>` : ''}
          <button class="ev-del" onclick="deleteSlot('${s.id}')" title="Supprimer">✕</button>
        `;
        cell.appendChild(ev);
      });

      grid.appendChild(cell);
    }
  });
}

/* ================================================================
   SECTION 4 — NOTES
================================================================ */
function initNotes() {
  document.getElementById('btnAddNote').addEventListener('click', openNoteModal);
  document.getElementById('closeNoteModal').addEventListener('click', closeNoteModal);
  document.getElementById('cancelNoteModal').addEventListener('click', closeNoteModal);
  document.getElementById('saveNoteModal').addEventListener('click', saveNote);
}

function openNoteModal() {
  document.getElementById('noteMatiere').value = MATIERES[0].id;
  document.getElementById('noteScore').value = '';
  document.getElementById('noteDesc').value = '';
  document.getElementById('modalNote').classList.remove('hidden');
}

function closeNoteModal() {
  document.getElementById('modalNote').classList.add('hidden');
}

function saveNote() {
  const scoreRaw = document.getElementById('noteScore').value;
  const score = parseInt(scoreRaw);
  if (isNaN(score) || score < 0 || score > 100) {
    showToast('Score invalide (0–100)', 'error');
    return;
  }
  const note = {
    id:      uid(),
    matiere: document.getElementById('noteMatiere').value,
    score,
    desc:    document.getElementById('noteDesc').value.trim(),
    date:    new Date().toISOString().slice(0,10)
  };
  state.notes.push(note);
  saveState();
  closeNoteModal();
  renderNotes();
  renderDashboard();
  showToast('Note ajoutée ✓', 'success');
}

function deleteNote(id) {
  state.notes = state.notes.filter(n => n.id !== id);
  saveState();
  renderNotes();
  renderDashboard();
}

function renderNotes() {
  renderBarChart();
  renderNotesHistory();
  renderBadges();
}

function renderBarChart() {
  const canvas = document.getElementById('barChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.parentElement.offsetWidth - 48;
  canvas.width  = W;
  canvas.height = 220;
  ctx.clearRect(0, 0, W, 220);

  const barW   = Math.floor((W - 60) / MATIERES.length);
  const maxH   = 160;
  const baseY  = 190;

  // Axes
  ctx.strokeStyle = '#2a2f42';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(50, 20); ctx.lineTo(50, baseY);
  ctx.lineTo(W - 10, baseY);
  ctx.stroke();

  // Y labels
  [0, 25, 50, 75, 100].forEach(v => {
    const y = baseY - (v / 100) * maxH;
    ctx.fillStyle = '#5c6180';
    ctx.font = '10px IBM Plex Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(v, 44, y + 4);
    ctx.beginPath();
    ctx.strokeStyle = '#2a2f42';
    ctx.setLineDash([3, 4]);
    ctx.moveTo(50, y); ctx.lineTo(W - 10, y);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // 85% threshold line
  const threshY = baseY - (85 / 100) * maxH;
  ctx.strokeStyle = 'rgba(224,90,90,.5)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(50, threshY); ctx.lineTo(W - 10, threshY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#e05a5a';
  ctx.font = '10px IBM Plex Mono, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('85%', W - 40, threshY - 4);

  MATIERES.forEach((m, i) => {
    const avg = avgScore(m.id);
    const x   = 55 + i * barW + 8;
    const pct = avg !== null ? avg / 100 : 0;
    const h   = pct * maxH;

    // Bar background
    ctx.fillStyle = m.color + '20';
    ctx.beginPath();
    ctx.roundRect(x, baseY - maxH, barW - 16, maxH, [4,4,0,0]);
    ctx.fill();

    // Bar fill
    if (avg !== null) {
      const grad = ctx.createLinearGradient(x, baseY - h, x, baseY);
      grad.addColorStop(0, m.color);
      grad.addColorStop(1, m.color + '80');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, baseY - h, barW - 16, h, [4,4,0,0]);
      ctx.fill();
    }

    // Label
    ctx.fillStyle = '#9298b0';
    ctx.font = '9px DM Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(m.label.slice(0,4) + '.', x + (barW - 16) / 2, baseY + 14);

    // Value
    if (avg !== null) {
      ctx.fillStyle = m.color;
      ctx.font = 'bold 11px IBM Plex Mono, monospace';
      ctx.fillText(avg + '%', x + (barW - 16) / 2, baseY - h - 6);
    }
  });
}

function renderNotesHistory() {
  const el = document.getElementById('notesHistory');
  if (!el) return;
  const sorted = [...state.notes].sort((a,b) => new Date(b.date) - new Date(a.date));

  if (!sorted.length) {
    el.innerHTML = '<div class="no-data">Aucune note enregistrée.</div>';
    return;
  }
  el.innerHTML = sorted.map(n => `
    <div class="note-item">
      <div class="note-score ${n.score >= 85 ? 'pass' : 'fail'}">${n.score}%</div>
      <div class="note-meta">
        <div class="note-subject" style="color:${getMatiereColor(n.matiere)}">${getMatiereLabel(n.matiere)}</div>
        ${n.desc ? `<div class="note-desc">${n.desc}</div>` : ''}
      </div>
      <div class="note-date">${formatDate(n.date)}</div>
      <button class="btn-icon del note-del" onclick="deleteNote('${n.id}')" title="Supprimer">✕</button>
    </div>
  `).join('');
}

function renderBadges() {
  const el = document.getElementById('badgesZone');
  if (!el) return;
  el.innerHTML = MATIERES.map(m => {
    const avg = avgScore(m.id);
    const earned = avg !== null && avg >= 90;
    return `
    <div class="badge-award ${earned ? 'earned' : 'locked'}">
      <div class="ba-icon">🏆</div>
      <div class="ba-name">${m.label}<br>${earned ? avg + '% ≥ 90' : '–'}</div>
    </div>`;
  }).join('');
}

/* ================================================================
   SECTION 5 — BAC BLANC
================================================================ */
let bbInterval   = null;  // Timer interval
let bbRemaining  = 0;     // Seconds remaining
let bbTotal      = 0;     // Total seconds
let bbMatiere    = '';    // Current matiere

function initBacBlanc() {
  document.getElementById('btnStartBB').addEventListener('click', startBacBlanc);
  document.getElementById('btnStopBB').addEventListener('click',  stopBacBlanc);
  document.getElementById('btnSaveScore').addEventListener('click', saveBacBlancScore);
}

function startBacBlanc() {
  const mins = parseInt(document.getElementById('bbDuration').value);
  if (isNaN(mins) || mins < 1) { showToast('Durée invalide', 'error'); return; }

  bbMatiere   = document.getElementById('bbMatiere').value;
  bbTotal     = mins * 60;
  bbRemaining = bbTotal;

  document.getElementById('bbSetup').classList.add('hidden');
  document.getElementById('bbTimer').classList.remove('hidden');
  document.getElementById('bbScore').classList.add('hidden');
  document.getElementById('timerMatiere').textContent = getMatiereLabel(bbMatiere);

  updateTimerDisplay();
  bbInterval = setInterval(tickTimer, 1000);
}

function tickTimer() {
  bbRemaining--;
  updateTimerDisplay();
  if (bbRemaining <= 0) {
    clearInterval(bbInterval);
    bbInterval = null;
    showBBScoreForm();
  }
}

function updateTimerDisplay() {
  const m = Math.floor(bbRemaining / 60);
  const s = bbRemaining % 60;
  const display = document.getElementById('timerDisplay');
  display.textContent = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');

  // Color states
  const pct = bbRemaining / bbTotal;
  display.className = 'timer-display';
  if (pct <= .1)      display.classList.add('danger');
  else if (pct <= .25) display.classList.add('warning');

  // Progress bar
  document.getElementById('timerBar').style.width = (pct * 100) + '%';
}

function stopBacBlanc() {
  clearInterval(bbInterval);
  bbInterval = null;
  showBBScoreForm();
}

function showBBScoreForm() {
  document.getElementById('bbTimer').classList.add('hidden');
  document.getElementById('bbScore').classList.remove('hidden');
  const elapsed = bbTotal - bbRemaining;
  const m = Math.floor(elapsed / 60);
  document.getElementById('bbResultLabel').textContent =
    `Matière : ${getMatiereLabel(bbMatiere)} — Durée : ${m} min`;
  document.getElementById('bbScoreInput').value = '';
}

function saveBacBlancScore() {
  const score = parseInt(document.getElementById('bbScoreInput').value);
  if (isNaN(score) || score < 0 || score > 100) {
    showToast('Score invalide (0–100)', 'error');
    return;
  }

  const entry = {
    id:       uid(),
    matiere:  bbMatiere,
    score,
    duration: bbTotal,
    date:     new Date().toISOString().slice(0,10)
  };
  state.bacblancs.push(entry);

  // Also add to notes
  state.notes.push({
    id:      uid(),
    matiere: bbMatiere,
    score,
    desc:    'Bac blanc',
    date:    entry.date
  });

  saveState();
  showToast('Score enregistré ✓', 'success');

  // Reset UI
  document.getElementById('bbScore').classList.add('hidden');
  document.getElementById('bbSetup').classList.remove('hidden');
  renderBacBlanc();
  renderDashboard();
  renderNotes();
}

function deleteBacBlanc(id) {
  state.bacblancs = state.bacblancs.filter(b => b.id !== id);
  saveState();
  renderBacBlanc();
}

function renderBacBlanc() {
  const el = document.getElementById('bbHistory');
  if (!el) return;
  const sorted = [...state.bacblancs].sort((a,b) => new Date(b.date) - new Date(a.date));

  if (!sorted.length) {
    el.innerHTML = '<div class="no-data">Aucun bac blanc enregistré.</div>';
    return;
  }
  el.innerHTML = sorted.map(b => {
    const durMin = Math.floor(b.duration / 60);
    return `
    <div class="bb-item">
      <div class="bb-item-score ${b.score >= 75 ? 'pass' : 'fail'}">${b.score}%</div>
      <div class="bb-item-meta">
        <div class="bb-item-subject" style="color:${getMatiereColor(b.matiere)}">${getMatiereLabel(b.matiere)}</div>
        <div class="bb-item-info">${durMin} min — ${formatDate(b.date)}</div>
      </div>
      <button class="btn-icon del bb-item-del" onclick="deleteBacBlanc('${b.id}')" title="Supprimer">✕</button>
    </div>`;
  }).join('');
}

/* ================================================================
   INIT — Entry point
================================================================ */
function init() {
  loadState();
  populateMatiereSelects();
  initNav();
  initDevoirs();
  initSchedule();
  initNotes();
  initBacBlanc();

  // Render default page
  renderDashboard();

  // Handle bar chart resize
  window.addEventListener('resize', () => {
    const notesPage = document.getElementById('page-notes');
    if (notesPage && notesPage.classList.contains('active')) renderBarChart();
  });
}

// Start when DOM ready
document.addEventListener('DOMContentLoaded', init);
