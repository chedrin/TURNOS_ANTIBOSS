const STORAGE_KEY = 'antiboss_turnos_state_v1';

const DEFAULT_SHIFT_TYPES = {
  M: { id: 'M', name: 'Mañana', short: 'M', hours: 8, color: '#0284c7', isWork: true },
  T: { id: 'T', name: 'Tarde', short: 'T', hours: 8, color: '#ea580c', isWork: true },
  N: { id: 'N', name: 'Noche', short: 'N', hours: 8, color: '#7c3aed', isWork: true },
  L: { id: 'L', name: 'Libre / Descanso', short: 'L', hours: 0, color: '#10b981', isWork: false },
  F: { id: 'F', name: 'Festivo', short: 'F', hours: 0, color: '#e11d48', isWork: false },
  V: { id: 'V', name: 'Vacaciones', short: 'VAC', hours: 0, color: '#0d9488', isWork: false },
  AP: { id: 'AP', name: 'Asuntos Propios', short: 'AP', hours: 0, color: '#6366f1', isWork: false },
  LD: { id: 'LD', name: 'Libre Disposición', short: 'LD', hours: 0, color: '#d946ef', isWork: false }
};

const INITIAL_STATE = {
  config: {
    year: new Date().getFullYear(),
    targetMonthlyHours: 160,
    annualAllowances: { vacations: 22, ap: 6, ld: 4 },
    shiftHours: { M: 8, T: 8, N: 8 }
  },
  shifts: {}
};

class StateManager {
  constructor() { this.state = this.loadState(); }

  loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { config: { ...INITIAL_STATE.config, ...parsed.config }, shifts: parsed.shifts || {} };
      }
    } catch (e) { console.warn(e); }
    return JSON.parse(JSON.stringify(INITIAL_STATE));
  }

  saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      showToast('⚠️ Espacio local lleno');
    }
  }

  getShift(dateStr) { return this.state.shifts[dateStr] || null; }

  setShift(dateStr, shiftData) {
    if (!shiftData || !shiftData.typeId) {
      delete this.state.shifts[dateStr];
    } else {
      this.state.shifts[dateStr] = shiftData;
    }
    this.saveState();
  }

  deleteShift(dateStr) {
    delete this.state.shifts[dateStr];
    this.saveState();
  }

  updateConfig(newConfig) {
    this.state.config = { ...this.state.config, ...newConfig };
    this.saveState();
  }

  exportJSON() { return JSON.stringify(this.state, null, 2); }

  importJSON(jsonString) {
    const data = JSON.parse(jsonString);
    if (!data.config || !data.shifts) throw new Error('Copia inválida');
    this.state = data;
    this.saveState();
  }

  resetAll() {
    this.state = JSON.parse(JSON.stringify(INITIAL_STATE));
    this.saveState();
  }
}

const store = new StateManager();
let currentDate = new Date();
let activeStampShift = null;
let selectedDateForModal = null;

document.addEventListener('DOMContentLoaded', () => {
  setupNavigationTabs();
  setupCalendarControls();
  setupQuickStampPalette();
  setupDayModal();
  setupSettingsModal();
  setupAuditActions();
  setupPWA();
  renderAll();
});

function renderAll() {
  renderCalendar();
  renderBalances();
  renderCalculator();
  renderAudit();
  renderQuickHeaderStats();
}

function setupNavigationTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const targetPane = document.getElementById(tab.dataset.tab);
      if (targetPane) targetPane.classList.add('active');
      renderAll();
    });
  });
}

function setupCalendarControls() {
  document.getElementById('btn-prev-month').addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderAll();
  });
  document.getElementById('btn-next-month').addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderAll();
  });
  document.getElementById('btn-today').addEventListener('click', () => {
    currentDate = new Date();
    renderAll();
  });
}

function setupQuickStampPalette() {
  const palette = document.getElementById('quick-stamp-palette');
  palette.innerHTML = '';

  const normalBtn = document.createElement('button');
  normalBtn.className = 'stamp-btn active';
  normalBtn.id = 'stamp-btn-normal';
  normalBtn.textContent = '👆 Normal (Detalle)';
  normalBtn.onclick = () => selectStampMode(null);
  palette.appendChild(normalBtn);

  Object.values(DEFAULT_SHIFT_TYPES).forEach(shift => {
    const btn = document.createElement('button');
    btn.className = 'stamp-btn';
    btn.dataset.shiftId = shift.id;
    btn.style.backgroundColor = shift.color;
    btn.textContent = `${shift.short} - ${shift.name}`;
    btn.onclick = () => selectStampMode(shift.id);
    palette.appendChild(btn);
  });
}

function selectStampMode(shiftId) {
  activeStampShift = shiftId;
  const indicator = document.getElementById('stamp-indicator');
  const buttons = document.querySelectorAll('.stamp-btn');
  buttons.forEach(b => b.classList.remove('active'));

  if (!shiftId) {
    document.getElementById('stamp-btn-normal').classList.add('active');
    indicator.textContent = 'Toque normal para detalles';
  } else {
    const activeBtn = Array.from(buttons).find(b => b.dataset.shiftId === shiftId);
    if (activeBtn) activeBtn.classList.add('active');
    const shift = DEFAULT_SHIFT_TYPES[shiftId];
    indicator.textContent = `Pintando: ${shift.name} (${shift.short})`;
  }
}

function renderCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  document.getElementById('calendar-month-year').textContent = `${monthNames[month]} ${year}`;

  const daysGrid = document.getElementById('days-grid');
  daysGrid.innerHTML = '';

  const firstDayOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let startingDayOfWeek = firstDayOfMonth.getDay() - 1;
  if (startingDayOfWeek === -1) startingDayOfWeek = 6;

  const daysInPrevMonth = new Date(year, month, 0).getDate();
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i;
    daysGrid.appendChild(createDayCell(new Date(year, month - 1, dayNum), true));
  }

  const today = new Date();
  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(year, month, day);
    const isToday = (dateObj.getDate() === today.getDate() && dateObj.getMonth() === today.getMonth() && dateObj.getFullYear() === today.getFullYear());
    daysGrid.appendChild(createDayCell(dateObj, false, isToday));
  }

  const totalCells = startingDayOfWeek + daysInMonth;
  const remainingCells = (totalCells % 7 === 0) ? 0 : 7 - (totalCells % 7);
  for (let day = 1; day <= remainingCells; day++) {
    daysGrid.appendChild(createDayCell(new Date(year, month + 1, day), true));
  }

  renderLegend();
}

function createDayCell(dateObj, isOtherMonth = false, isToday = false) {
  const dateStr = formatDateKey(dateObj);
  const cell = document.createElement('div');
  cell.className = `day-cell ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'is-today' : ''}`;
  cell.dataset.date = dateStr;

  const dayNumber = dateObj.getDate();
  const shiftRecord = store.getShift(dateStr);

  let shiftBadgeHtml = '';
  let hoursHtml = '';
  let dotHtml = '';

  if (shiftRecord && DEFAULT_SHIFT_TYPES[shiftRecord.typeId]) {
    const shiftInfo = DEFAULT_SHIFT_TYPES[shiftRecord.typeId];
    shiftBadgeHtml = `<div class="day-shift-badge" style="background-color: ${shiftInfo.color};">${shiftInfo.short}</div>`;
    const totalHours = (Number(shiftRecord.hours) || 0) + (Number(shiftRecord.overtime) || 0);
    if (totalHours > 0) hoursHtml = `<div class="day-hours-pill">${totalHours}h</div>`;
    if (shiftRecord.notes && shiftRecord.notes.trim() !== '') dotHtml = `<span class="has-notes-dot"></span>`;
  }

  cell.innerHTML = `
    <div class="day-header"><span class="day-number">${dayNumber}</span>${dotHtml}</div>
    ${shiftBadgeHtml}
    ${hoursHtml}
  `;

  cell.addEventListener('click', () => handleDayClick(dateStr, dateObj));
  return cell;
}

function handleDayClick(dateStr, dateObj) {
  if (activeStampShift) {
    const shiftDef = DEFAULT_SHIFT_TYPES[activeStampShift];
    const defaultHours = shiftDef.isWork ? (store.state.config.shiftHours[activeStampShift] || shiftDef.hours) : 0;
    const existing = store.getShift(dateStr);

    if (existing && existing.typeId === activeStampShift) {
      store.deleteShift(dateStr);
    } else {
      store.setShift(dateStr, {
        typeId: activeStampShift,
        hours: defaultHours,
        overtime: 0,
        notes: (existing && existing.notes) ? existing.notes : ''
      });
    }

    if ('vibrate' in navigator) navigator.vibrate(30);
    renderAll();
  } else {
    openDayModal(dateStr, dateObj);
  }
}

function renderLegend() {
  const legendContainer = document.getElementById('legend-items');
  legendContainer.innerHTML = '';
  Object.values(DEFAULT_SHIFT_TYPES).forEach(shift => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="legend-color" style="background-color: ${shift.color};"></span><span>${shift.name} (${shift.short})</span>`;
    legendContainer.appendChild(item);
  });
}

function setupDayModal() {
  document.getElementById('modal-btn-close').addEventListener('click', closeDayModal);

  document.getElementById('modal-btn-save').addEventListener('click', () => {
    if (!selectedDateForModal) return;
    const selectedChip = document.querySelector('.shift-chip.selected');
    if (!selectedChip) { showToast('Selecciona un tipo de turno'); return; }

    store.setShift(selectedDateForModal, {
      typeId: selectedChip.dataset.typeId,
      hours: parseFloat(document.getElementById('input-day-hours').value) || 0,
      overtime: parseFloat(document.getElementById('input-day-overtime').value) || 0,
      notes: document.getElementById('input-day-notes').value.trim()
    });

    closeDayModal();
    renderAll();
    showToast('✓ Turno guardado');
  });

  document.getElementById('modal-btn-delete').addEventListener('click', () => {
    if (!selectedDateForModal) return;
    store.deleteShift(selectedDateForModal);
    closeDayModal();
    renderAll();
    showToast('Turno eliminado');
  });
}

function openDayModal(dateStr, dateObj) {
  selectedDateForModal = dateStr;
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('modal-date-title').textContent = dateObj.toLocaleDateString('es-ES', options);

  const existingShift = store.getShift(dateStr);
  const chipsContainer = document.getElementById('modal-shift-options');
  chipsContainer.innerHTML = '';

  Object.values(DEFAULT_SHIFT_TYPES).forEach(shift => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'shift-chip';
    chip.dataset.typeId = shift.id;
    chip.style.backgroundColor = shift.color;
    chip.textContent = `${shift.short} - ${shift.name}`;

    if (existingShift && existingShift.typeId === shift.id) chip.classList.add('selected');

    chip.addEventListener('click', () => {
      document.querySelectorAll('.shift-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      const hoursInput = document.getElementById('input-day-hours');
      hoursInput.value = shift.isWork ? (store.state.config.shiftHours[shift.id] || shift.hours) : 0;
    });

    chipsContainer.appendChild(chip);
  });

  if (existingShift) {
    document.getElementById('input-day-hours').value = existingShift.hours || 0;
    document.getElementById('input-day-overtime').value = existingShift.overtime || 0;
    document.getElementById('input-day-notes').value = existingShift.notes || '';
  } else {
    document.getElementById('input-day-hours').value = 8;
    document.getElementById('input-day-overtime').value = 0;
    document.getElementById('input-day-notes').value = '';
  }

  document.getElementById('day-modal').classList.remove('hidden');
}

function closeDayModal() {
  document.getElementById('day-modal').classList.add('hidden');
  selectedDateForModal = null;
}

function renderBalances() {
  const currentYear = currentDate.getFullYear();
  const allowances = store.state.config.annualAllowances;
  let usedVac = 0, usedAP = 0, usedLD = 0;
  const historyList = document.getElementById('permissions-history-list');
  historyList.innerHTML = '';
  const historyItems = [];

  Object.entries(store.state.shifts).forEach(([dateStr, record]) => {
    if (dateStr.startsWith(currentYear.toString())) {
      if (record.typeId === 'V') { usedVac++; historyItems.push({ date: dateStr, name: 'Vacaciones' }); }
      else if (record.typeId === 'AP') { usedAP++; historyItems.push({ date: dateStr, name: 'Asuntos Propios' }); }
      else if (record.typeId === 'LD') { usedLD++; historyItems.push({ date: dateStr, name: 'Libre Disposición' }); }
    }
  });

  document.getElementById('vac-assigned').textContent = allowances.vacations;
  document.getElementById('vac-used').textContent = usedVac;
  document.getElementById('vac-remaining').textContent = allowances.vacations - usedVac;
  document.getElementById('vac-progress').style.width = `${Math.min(100, Math.round((usedVac / (allowances.vacations || 1)) * 100))}%`;

  document.getElementById('ap-assigned').textContent = allowances.ap;
  document.getElementById('ap-used').textContent = usedAP;
  document.getElementById('ap-remaining').textContent = allowances.ap - usedAP;
  document.getElementById('ap-progress').style.width = `${Math.min(100, Math.round((usedAP / (allowances.ap || 1)) * 100))}%`;

  document.getElementById('ld-assigned').textContent = allowances.ld;
  document.getElementById('ld-used').textContent = usedLD;
  document.getElementById('ld-remaining').textContent = allowances.ld - usedLD;
  document.getElementById('ld-progress').style.width = `${Math.min(100, Math.round((usedLD / (allowances.ld || 1)) * 100))}%`;

  if (historyItems.length === 0) {
    historyList.innerHTML = '<p class="empty-state">No has registrado días de Vacaciones, AP o LD este año.</p>';
  } else {
    historyItems.sort((a, b) => b.date.localeCompare(a.date));
    historyItems.forEach(item => {
      const el = document.createElement('div');
      el.className = 'history-item';
      el.innerHTML = `<span><strong>${formatPrettyDate(item.date)}</strong> - ${item.name}</span><span class="badge-status badge-neutral">Disfrutado</span>`;
      historyList.appendChild(el);
    });
  }
}

function renderCalculator() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

  let totalWorkedHours = 0;
  let totalOvertime = 0;
  const counts = { M: 0, T: 0, N: 0, L: 0, F: 0, V: 0, AP: 0, LD: 0 };

  Object.entries(store.state.shifts).forEach(([dateStr, record]) => {
    if (dateStr.startsWith(monthPrefix)) {
      const h = Number(record.hours) || 0;
      const ot = Number(record.overtime) || 0;
      totalWorkedHours += h + ot;
      totalOvertime += ot;
      if (counts[record.typeId] !== undefined) counts[record.typeId]++;
    }
  });

  const targetHours = Number(store.state.config.targetMonthlyHours) || 160;
  const diff = totalWorkedHours - targetHours;

  document.getElementById('calc-worked-hours').textContent = totalWorkedHours;
  document.getElementById('calc-target-hours').textContent = targetHours;

  const balanceEl = document.getElementById('calc-balance-hours');
  const badgeEl = document.getElementById('calc-balance-badge');

  if (diff > 0) {
    balanceEl.textContent = `+${diff}`;
    badgeEl.textContent = `+${diff}h a tu favor`;
    badgeEl.className = 'badge-status badge-positive';
  } else if (diff < 0) {
    balanceEl.textContent = diff;
    badgeEl.textContent = `${diff}h respecto al convenio`;
    badgeEl.className = 'badge-status badge-negative';
  } else {
    balanceEl.textContent = '0';
    badgeEl.textContent = 'En equilibrio';
    badgeEl.className = 'badge-status badge-neutral';
  }

  document.getElementById('calc-month-overtime').textContent = `+${totalOvertime}h extra`;

  document.getElementById('month-shifts-breakdown').innerHTML = `
    <div class="breakdown-item"><span>☀️ Mañanas:</span> <strong>${counts.M}</strong></div>
    <div class="breakdown-item"><span>🌤️ Tardes:</span> <strong>${counts.T}</strong></div>
    <div class="breakdown-item"><span>🌙 Noches:</span> <strong>${counts.N}</strong></div>
    <div class="breakdown-item"><span>🏖️ Vacaciones:</span> <strong>${counts.V}</strong></div>
    <div class="breakdown-item"><span>📑 Asuntos Propios:</span> <strong>${counts.AP}</strong></div>
    <div class="breakdown-item"><span>⏱️ Libre Disp.:</span> <strong>${counts.LD}</strong></div>
    <div class="breakdown-item"><span>🌱 Descansos / Libres:</span> <strong>${counts.L}</strong></div>
    <div class="breakdown-item"><span>🎉 Festivos:</span> <strong>${counts.F}</strong></div>
  `;
}

function renderAudit() {
  const currentYear = currentDate.getFullYear();
  const allowances = store.state.config.annualAllowances;
  let usedVac = 0, usedAP = 0, usedLD = 0, annualOvertime = 0;
  const incidents = [];

  Object.entries(store.state.shifts).forEach(([dateStr, record]) => {
    if (dateStr.startsWith(currentYear.toString())) {
      if (record.typeId === 'V') usedVac++;
      if (record.typeId === 'AP') usedAP++;
      if (record.typeId === 'LD') usedLD++;
      const ot = Number(record.overtime) || 0;
      annualOvertime += ot;
      if ((record.notes && record.notes.trim() !== '') || ot > 0) {
        incidents.push({ date: dateStr, overtime: ot, notes: record.notes || '' });
      }
    }
  });

  document.getElementById('audit-vac-due').textContent = allowances.vacations - usedVac;
  document.getElementById('audit-ap-due').textContent = allowances.ap - usedAP;
  document.getElementById('audit-ld-due').textContent = allowances.ld - usedLD;
  document.getElementById('audit-hours-balance').textContent = `+${annualOvertime}h`;

  const incidentsContainer = document.getElementById('audit-incidents-list');
  incidentsContainer.innerHTML = '';

  if (incidents.length === 0) {
    incidentsContainer.innerHTML = '<p class="empty-state">No hay incidencias registradas este año.</p>';
  } else {
    incidents.sort((a, b) => b.date.localeCompare(a.date));
    incidents.forEach(inc => {
      const item = document.createElement('div');
      item.className = 'incident-item';
      item.innerHTML = `<div class="incident-date">${formatPrettyDate(inc.date)} ${inc.overtime > 0 ? `(+${inc.overtime}h extra)` : ''}</div><div>${inc.notes || 'Horas extras realizadas.'}</div>`;
      incidentsContainer.appendChild(item);
    });
  }
}

function setupAuditActions() {
  document.getElementById('btn-copy-whatsapp').addEventListener('click', () => {
    const reportText = generateWhatsAppReport();
    navigator.clipboard.writeText(reportText).then(() => {
      showToast('✓ Informe formal copiado');
    });
  });

  document.getElementById('btn-print-report').addEventListener('click', () => {
    preparePrintDocument();
    window.print();
  });
}

function generateWhatsAppReport() {
  const year = currentDate.getFullYear();
  const allowances = store.state.config.annualAllowances;
  let usedVac = 0, usedAP = 0, usedLD = 0, totalOvertime = 0;

  Object.entries(store.state.shifts).forEach(([dateStr, record]) => {
    if (dateStr.startsWith(year.toString())) {
      if (record.typeId === 'V') usedVac++;
      if (record.typeId === 'AP') usedAP++;
      if (record.typeId === 'LD') usedLD++;
      totalOvertime += (Number(record.overtime) || 0);
    }
  });

  return `📌 *COMUNICADO FORMAL - REGISTRO DE TURNOS Y JORNADA (${year})*
📅 *Fecha:* ${new Date().toLocaleDateString('es-ES')}

Estimados/as responsables de Recursos Humanos / Jefatura de Turno,

Resumen actualizado de mi balance de jornadas y permisos del ejercicio ${year}:

🏖️ *Vacaciones anuales:*
• Asignadas: ${allowances.vacations} días | Disfrutadas: ${usedVac} | *Pendientes:* ${allowances.vacations - usedVac} días

📑 *Asuntos Propios (AP):*
• Asignados: ${allowances.ap} días | Disfrutados: ${usedAP} | *Pendientes:* ${allowances.ap - usedAP} días

⏱️ *Libre Disposición (LD):*
• Asignados: ${allowances.ld} días | Disfrutados: ${usedLD} | *Pendientes:* ${allowances.ld - usedLD} días

⏰ *Horas Extraordinarias:* +${totalOvertime} horas trabajadas a compensar/liquidar

Atentamente,
_Registro de Turnos AntiBoss_`;
}

function preparePrintDocument() {
  const printArea = document.getElementById('print-area');
  const year = currentDate.getFullYear();
  const allowances = store.state.config.annualAllowances;
  let usedVac = 0, usedAP = 0, usedLD = 0;

  Object.entries(store.state.shifts).forEach(([dateStr, record]) => {
    if (dateStr.startsWith(year.toString())) {
      if (record.typeId === 'V') usedVac++;
      if (record.typeId === 'AP') usedAP++;
      if (record.typeId === 'LD') usedLD++;
    }
  });

  printArea.innerHTML = `
    <div class="print-header">
      <h2>INFORME OFICIAL DE AUDITORÍA LABORAL Y REGISTRO DE JORNADA</h2>
      <p><strong>Año:</strong> ${year} | <strong>Fecha:</strong> ${new Date().toLocaleDateString('es-ES')}</p>
    </div>
    <table class="print-table">
      <thead><tr><th>Concepto</th><th>Asignados</th><th>Disfrutados</th><th>Saldo Pendiente Real</th></tr></thead>
      <tbody>
        <tr><td>Vacaciones</td><td>${allowances.vacations} días</td><td>${usedVac}</td><td><strong>${allowances.vacations - usedVac} días</strong></td></tr>
        <tr><td>Asuntos Propios</td><td>${allowances.ap} días</td><td>${usedAP}</td><td><strong>${allowances.ap - usedAP} días</strong></td></tr>
        <tr><td>Libre Disposición</td><td>${allowances.ld} días</td><td>${usedLD}</td><td><strong>${allowances.ld - usedLD} días</strong></td></tr>
      </tbody>
    </table>
  `;
}

function renderQuickHeaderStats() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

  let worked = 0;
  Object.entries(store.state.shifts).forEach(([dateStr, record]) => {
    if (dateStr.startsWith(monthPrefix)) worked += (Number(record.hours) || 0) + (Number(record.overtime) || 0);
  });

  const target = Number(store.state.config.targetMonthlyHours) || 160;
  document.getElementById('quick-hours').textContent = `${worked}h / ${target}h`;

  let usedVac = 0;
  Object.entries(store.state.shifts).forEach(([dateStr, record]) => {
    if (dateStr.startsWith(year.toString()) && record.typeId === 'V') usedVac++;
  });
  document.getElementById('quick-vac').textContent = `${store.state.config.annualAllowances.vacations - usedVac} pend.`;

  const diff = worked - target;
  document.getElementById('quick-balance').textContent = diff > 0 ? `+${diff}h` : `${diff}h`;
}

function setupSettingsModal() {
  const modal = document.getElementById('settings-modal');

  document.getElementById('btn-open-settings').addEventListener('click', () => {
    document.getElementById('cfg-vacations').value = store.state.config.annualAllowances.vacations;
    document.getElementById('cfg-ap').value = store.state.config.annualAllowances.ap;
    document.getElementById('cfg-ld').value = store.state.config.annualAllowances.ld;
    document.getElementById('cfg-target-hours').value = store.state.config.targetMonthlyHours;
    document.getElementById('cfg-hours-m').value = store.state.config.shiftHours.M || 8;
    document.getElementById('cfg-hours-t').value = store.state.config.shiftHours.T || 8;
    document.getElementById('cfg-hours-n').value = store.state.config.shiftHours.N || 8;
    modal.classList.remove('hidden');
  });

  document.getElementById('settings-btn-close').addEventListener('click', () => modal.classList.add('hidden'));

  document.getElementById('settings-btn-save').addEventListener('click', () => {
    store.updateConfig({
      annualAllowances: {
        vacations: parseInt(document.getElementById('cfg-vacations').value) || 22,
        ap: parseInt(document.getElementById('cfg-ap').value) || 6,
        ld: parseInt(document.getElementById('cfg-ld').value) || 4
      },
      targetMonthlyHours: parseInt(document.getElementById('cfg-target-hours').value) || 160,
      shiftHours: {
        M: parseFloat(document.getElementById('cfg-hours-m').value) || 8,
        T: parseFloat(document.getElementById('cfg-hours-t').value) || 8,
        N: parseFloat(document.getElementById('cfg-hours-n').value) || 8
      }
    });
    modal.classList.add('hidden');
    renderAll();
    showToast('✓ Ajustes guardados localmente');
  });

  document.getElementById('btn-export-backup').addEventListener('click', () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `turnos_antiboss_backup_${formatDateKey(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('✓ Respaldo descargado');
  });

  document.getElementById('input-import-backup').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        store.importJSON(event.target.result);
        modal.classList.add('hidden');
        renderAll();
        showToast('✓ Datos restaurados');
      } catch (err) {
        alert('Archivo de respaldo no válido.');
      }
    };
    reader.readAsText(file);
  });

  document.getElementById('btn-reset-data').addEventListener('click', () => {
    if (confirm('¿Borrar TODOS los datos de turnos?')) {
      store.resetAll();
      modal.classList.add('hidden');
      renderAll();
      showToast('Datos reiniciados');
    }
  });
}

function setupPWA() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.log(err));
  }
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatPrettyDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2500);
}
