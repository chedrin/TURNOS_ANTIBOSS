const STORAGE_KEY = 'antiboss_turnos_state_v1';

const BASE_SHIFTS = {
  M: { id: 'M', name: 'Mañana', short: 'M', defaultHours: 8, color: '#0284c7', isWork: true },
  T: { id: 'T', name: 'Tarde', short: 'T', defaultHours: 8, color: '#ea580c', isWork: true },
  N: { id: 'N', name: 'Noche', short: 'N', defaultHours: 8, color: '#7c3aed', isWork: true },
  L: { id: 'L', name: 'Libre / Descanso', short: 'L', defaultHours: 0, color: '#10b981', isWork: false }
};

const MODIFIERS = {
  F: { id: 'F', name: 'Festivo', short: 'FEST', color: '#e11d48', keepsHours: true, icon: '🎉' },
  LD: { id: 'LD', name: 'Libre Disposición', short: 'LD', color: '#d946ef', keepsHours: true, icon: '⏱️' },
  V: { id: 'V', name: 'Vacaciones', short: 'VAC', color: '#0d9488', keepsHours: false, icon: '🏖️' },
  AP: { id: 'AP', name: 'Asuntos Propios', short: 'AP', color: '#6366f1', keepsHours: false, icon: '📑' }
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
        const shifts = {};
        Object.entries(parsed.shifts || {}).forEach(([dateStr, record]) => {
          if (record.typeId) {
            if (['V', 'AP', 'LD', 'F'].includes(record.typeId)) {
              shifts[dateStr] = { shiftId: 'M', modifier: record.typeId, hours: record.hours || 0, overtime: record.overtime || 0, notes: record.notes || '' };
            } else {
              shifts[dateStr] = { shiftId: record.typeId, modifier: null, hours: record.hours || 8, overtime: record.overtime || 0, notes: record.notes || '' };
            }
          } else {
            shifts[dateStr] = record;
          }
        });
        return { config: { ...INITIAL_STATE.config, ...parsed.config }, shifts };
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

  getDay(dateStr) { return this.state.shifts[dateStr] || null; }

  setDay(dateStr, data) {
    if (!data || (!data.shiftId && !data.modifier)) {
      delete this.state.shifts[dateStr];
    } else {
      this.state.shifts[dateStr] = data;
    }
    this.saveState();
  }

  deleteDay(dateStr) {
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
let activeStampTool = null;
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
  normalBtn.textContent = '👆 Normal (Editar)';
  normalBtn.onclick = () => selectStampTool(null);
  palette.appendChild(normalBtn);

  Object.values(BASE_SHIFTS).forEach(shift => {
    const btn = document.createElement('button');
    btn.className = 'stamp-btn';
    btn.dataset.stampType = 'base';
    btn.dataset.stampId = shift.id;
    btn.style.backgroundColor = shift.color;
    btn.textContent = `${shift.short} (${shift.name})`;
    btn.onclick = () => selectStampTool({ type: 'base', id: shift.id });
    palette.appendChild(btn);
  });

  Object.values(MODIFIERS).forEach(mod => {
    const btn = document.createElement('button');
    btn.className = 'stamp-btn';
    btn.dataset.stampType = 'modifier';
    btn.dataset.stampId = mod.id;
    btn.style.backgroundColor = mod.color;
    btn.textContent = `${mod.icon} ${mod.short}`;
    btn.onclick = () => selectStampTool({ type: 'modifier', id: mod.id });
    palette.appendChild(btn);
  });
}

function selectStampTool(tool) {
  activeStampTool = tool;
  const indicator = document.getElementById('stamp-indicator');
  const buttons = document.querySelectorAll('.stamp-btn');
  buttons.forEach(b => b.classList.remove('active'));

  if (!tool) {
    document.getElementById('stamp-btn-normal').classList.add('active');
    indicator.textContent = 'Toque normal para detalles';
  } else {
    const activeBtn = Array.from(buttons).find(b => b.dataset.stampType === tool.type && b.dataset.stampId === tool.id);
    if (activeBtn) activeBtn.classList.add('active');
    if (tool.type === 'base') {
      indicator.textContent = `Pintando Turno: ${BASE_SHIFTS[tool.id].name}`;
    } else {
      indicator.textContent = `Pintando Permiso: ${MODIFIERS[tool.id].name} (sin borrar turno)`;
    }
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
  const dayRecord = store.getDay(dateStr);

  let shiftHtml = '';
  let modifierHtml = '';
  let hoursHtml = '';
  let dotHtml = '';

  if (dayRecord) {
    if (dayRecord.shiftId && BASE_SHIFTS[dayRecord.shiftId]) {
      const b = BASE_SHIFTS[dayRecord.shiftId];
      shiftHtml = `<div class="day-shift-badge" style="background-color: ${b.color};">${b.short}</div>`;
    }

    if (dayRecord.modifier && MODIFIERS[dayRecord.modifier]) {
      const m = MODIFIERS[dayRecord.modifier];
      modifierHtml = `<div class="day-modifier-badge" style="background-color: ${m.color};">${m.icon} ${m.short}</div>`;
    }

    const h = Number(dayRecord.hours) || 0;
    const ot = Number(dayRecord.overtime) || 0;
    const totalH = h + ot;

    if (dayRecord.modifier === 'V' || dayRecord.modifier === 'AP') {
      hoursHtml = `<div class="day-hours-pill hours-vacation">0h</div>`;
    } else if (dayRecord.modifier === 'F') {
      hoursHtml = `<div class="day-hours-pill hours-festive">${totalH}h 🎈</div>`;
    } else if (totalH > 0) {
      hoursHtml = `<div class="day-hours-pill">${totalH}h</div>`;
    }

    if (dayRecord.notes && dayRecord.notes.trim() !== '') {
      dotHtml = `<span class="has-notes-dot"></span>`;
    }
  }

  cell.innerHTML = `
    <div class="day-header"><span class="day-number">${dayNumber}</span>${dotHtml}</div>
    <div class="day-badges-wrap">
      ${shiftHtml}
      ${modifierHtml}
    </div>
    ${hoursHtml}
  `;

  cell.addEventListener('click', () => handleDayClick(dateStr, dateObj));
  return cell;
}

function handleDayClick(dateStr, dateObj) {
  if (activeStampTool) {
    const existing = store.getDay(dateStr) || { shiftId: 'M', modifier: null, hours: 8, overtime: 0, notes: '' };

    if (activeStampTool.type === 'base') {
      existing.shiftId = activeStampTool.id;
      if (existing.modifier === 'V' || existing.modifier === 'AP') {
        existing.hours = 0;
      } else {
        const baseDef = BASE_SHIFTS[activeStampTool.id];
        existing.hours = baseDef.isWork ? (store.state.config.shiftHours[activeStampTool.id] || baseDef.defaultHours) : 0;
      }
    } else if (activeStampTool.type === 'modifier') {
      if (existing.modifier === activeStampTool.id) {
        existing.modifier = null;
        const baseDef = BASE_SHIFTS[existing.shiftId] || BASE_SHIFTS.M;
        existing.hours = baseDef.isWork ? (store.state.config.shiftHours[existing.shiftId] || baseDef.defaultHours) : 0;
      } else {
        existing.modifier = activeStampTool.id;
        if (activeStampTool.id === 'F' || activeStampTool.id === 'LD') {
          const baseDef = BASE_SHIFTS[existing.shiftId] || BASE_SHIFTS.M;
          existing.hours = baseDef.isWork ? (store.state.config.shiftHours[existing.shiftId] || baseDef.defaultHours) : 8;
        } else if (activeStampTool.id === 'V' || activeStampTool.id === 'AP') {
          existing.hours = 0;
        }
      }
    }

    store.setDay(dateStr, existing);
    if ('vibrate' in navigator) navigator.vibrate(30);
    renderAll();
  } else {
    openDayModal(dateStr, dateObj);
  }
}

function renderLegend() {
  const legendContainer = document.getElementById('legend-items');
  legendContainer.innerHTML = '';
  Object.values(BASE_SHIFTS).forEach(shift => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="legend-color" style="background-color: ${shift.color};"></span><span>${shift.name} (${shift.short})</span>`;
    legendContainer.appendChild(item);
  });
  Object.values(MODIFIERS).forEach(mod => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="legend-color" style="background-color: ${mod.color};"></span><span>${mod.icon} ${mod.name}</span>`;
    legendContainer.appendChild(item);
  });
}

function setupDayModal() {
  document.getElementById('modal-btn-close').addEventListener('click', closeDayModal);

  document.getElementById('modal-btn-save').addEventListener('click', () => {
    if (!selectedDateForModal) return;
    const baseChip = document.querySelector('#modal-base-shifts .shift-chip.selected');
    const modChip = document.querySelector('#modal-modifiers .shift-chip.selected');
    const shiftId = baseChip ? baseChip.dataset.id : 'M';
    const modifier = (modChip && modChip.dataset.id !== 'NONE') ? modChip.dataset.id : null;
    const hours = parseFloat(document.getElementById('input-day-hours').value) || 0;
    const overtime = parseFloat(document.getElementById('input-day-overtime').value) || 0;
    const notes = document.getElementById('input-day-notes').value.trim();

    store.setDay(selectedDateForModal, { shiftId, modifier, hours, overtime, notes });
    closeDayModal();
    renderAll();
    showToast('✓ Jornada guardada');
  });

  document.getElementById('modal-btn-delete').addEventListener('click', () => {
    if (!selectedDateForModal) return;
    store.deleteDay(selectedDateForModal);
    closeDayModal();
    renderAll();
    showToast('Día limpiado');
  });
}

function openDayModal(dateStr, dateObj) {
  selectedDateForModal = dateStr;
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('modal-date-title').textContent = dateObj.toLocaleDateString('es-ES', options);

  const existing = store.getDay(dateStr) || { shiftId: 'M', modifier: null, hours: 8, overtime: 0, notes: '' };

  const baseContainer = document.getElementById('modal-base-shifts');
  baseContainer.innerHTML = '';
  Object.values(BASE_SHIFTS).forEach(shift => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `shift-chip ${existing.shiftId === shift.id ? 'selected' : ''}`;
    chip.dataset.id = shift.id;
    chip.style.backgroundColor = shift.color;
    chip.textContent = `${shift.short} - ${shift.name}`;
    chip.addEventListener('click', () => {
      document.querySelectorAll('#modal-base-shifts .shift-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      updateModalComputedHours();
    });
    baseContainer.appendChild(chip);
  });

  const modContainer = document.getElementById('modal-modifiers');
  modContainer.innerHTML = '';

  const noneChip = document.createElement('button');
  noneChip.type = 'button';
  noneChip.className = `shift-chip ${!existing.modifier ? 'selected' : ''}`;
  noneChip.dataset.id = 'NONE';
  noneChip.style.backgroundColor = '#475569';
  noneChip.textContent = 'Normal (Sin permiso)';
  noneChip.addEventListener('click', () => {
    document.querySelectorAll('#modal-modifiers .shift-chip').forEach(c => c.classList.remove('selected'));
    noneChip.classList.add('selected');
    updateModalComputedHours();
  });
  modContainer.appendChild(noneChip);

  Object.values(MODIFIERS).forEach(mod => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `shift-chip ${existing.modifier === mod.id ? 'selected' : ''}`;
    chip.dataset.id = mod.id;
    chip.style.backgroundColor = mod.color;
    chip.textContent = `${mod.icon} ${mod.name}`;
    chip.addEventListener('click', () => {
      document.querySelectorAll('#modal-modifiers .shift-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      updateModalComputedHours();
    });
    modContainer.appendChild(chip);
  });

  document.getElementById('input-day-hours').value = existing.hours;
  document.getElementById('input-day-overtime').value = existing.overtime || 0;
  document.getElementById('input-day-notes').value = existing.notes || '';
  updateModalNotice(existing.modifier);
  document.getElementById('day-modal').classList.remove('hidden');
}

function updateModalComputedHours() {
  const baseChip = document.querySelector('#modal-base-shifts .shift-chip.selected');
  const modChip = document.querySelector('#modal-modifiers .shift-chip.selected');
  const shiftId = baseChip ? baseChip.dataset.id : 'M';
  const modId = modChip ? modChip.dataset.id : 'NONE';

  const hoursInput = document.getElementById('input-day-hours');
  const baseDef = BASE_SHIFTS[shiftId] || BASE_SHIFTS.M;
  const nominalHours = baseDef.isWork ? (store.state.config.shiftHours[shiftId] || baseDef.defaultHours) : 0;

  if (modId === 'V' || modId === 'AP') {
    hoursInput.value = 0;
  } else if (modId === 'F' || modId === 'LD') {
    hoursInput.value = nominalHours || 8;
  } else {
    hoursInput.value = nominalHours;
  }
  updateModalNotice(modId);
}

function updateModalNotice(modId) {
  const notice = document.getElementById('modal-rule-notice');
  notice.className = 'rule-notice';
  if (modId === 'F') {
    notice.classList.add('notice-festive');
    notice.textContent = '🎉 Festivo marcado: No se borra tu turno. Se computan tus horas normales para cobrar el plus de festivo.';
  } else if (modId === 'LD') {
    notice.classList.add('notice-ld');
    notice.textContent = '⏱️ Libre Disposición (LD): Mantiene tu turno, computa tu jornada completa y descuenta 1 día de LD.';
  } else if (modId === 'V') {
    notice.classList.add('notice-vacation');
    notice.textContent = '🏖️ Vacaciones: Mantiene visible el turno de cuadrante, pero computa 0h de trabajo efectivo. Descuenta 1 día de vacaciones.';
  } else if (modId === 'AP') {
    notice.classList.add('notice-vacation');
    notice.textContent = '📑 Asuntos Propios (AP): Mantiene el turno visible y computa 0h de trabajo efectivo. Descuenta 1 día de AP.';
  }
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
    if (dateStr.startsWith(currentYear.toString()) && record.modifier) {
      const shiftName = BASE_SHIFTS[record.shiftId]?.name || record.shiftId || 'Turno';
      if (record.modifier === 'V') {
        usedVac++;
        historyItems.push({ date: dateStr, name: `Vacaciones (${shiftName})`, tag: '0h trabajadas' });
      } else if (record.modifier === 'AP') {
        usedAP++;
        historyItems.push({ date: dateStr, name: `Asuntos Propios (${shiftName})`, tag: '0h trabajadas' });
      } else if (record.modifier === 'LD') {
        usedLD++;
        historyItems.push({ date: dateStr, name: `Libre Disposición (${shiftName})`, tag: 'Jornada cobrada' });
      }
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
      el.innerHTML = `<span><strong>${formatPrettyDate(item.date)}</strong> - ${item.name}</span><span class="badge-status badge-neutral">${item.tag}</span>`;
      historyList.appendChild(el);
    });
  }
}

function renderCalculator() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

  let totalWorkedHours = 0;
  let totalFestiveHours = 0;
  const counts = { M: 0, T: 0, N: 0, L: 0, F: 0, V: 0, AP: 0, LD: 0 };

  Object.entries(store.state.shifts).forEach(([dateStr, record]) => {
    if (dateStr.startsWith(monthPrefix)) {
      const h = Number(record.hours) || 0;
      const ot = Number(record.overtime) || 0;
      totalWorkedHours += h + ot;

      if (record.shiftId && counts[record.shiftId] !== undefined) counts[record.shiftId]++;
      if (record.modifier && counts[record.modifier] !== undefined) counts[record.modifier]++;
      if (record.modifier === 'F') totalFestiveHours += (h + ot);
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

  document.getElementById('month-shifts-breakdown').innerHTML = `
    <div class="breakdown-item"><span>☀️ Mañanas cuadrante:</span> <strong>${counts.M}</strong></div>
    <div class="breakdown-item"><span>🌤️ Tardes cuadrante:</span> <strong>${counts.T}</strong></div>
    <div class="breakdown-item"><span>🌙 Noches cuadrante:</span> <strong>${counts.N}</strong></div>
    <div class="breakdown-item"><span>🎉 Festivos trabajados:</span> <strong style="color:#f43f5e;">${counts.F} (${totalFestiveHours}h)</strong></div>
    <div class="breakdown-item"><span>⏱️ Libre Disposición:</span> <strong style="color:#d946ef;">${counts.LD} días</strong></div>
    <div class="breakdown-item"><span>🏖️ Vacaciones (0h):</span> <strong style="color:#0d9488;">${counts.V} días</strong></div>
    <div class="breakdown-item"><span>📑 Asuntos Propios (0h):</span> <strong style="color:#6366f1;">${counts.AP} días</strong></div>
    <div class="breakdown-item"><span>🌱 Descansos / Libres:</span> <strong>${counts.L}</strong></div>
  `;
}

function renderAudit() {
  const currentYear = currentDate.getFullYear();
  const allowances = store.state.config.annualAllowances;
  let usedVac = 0, usedAP = 0, usedLD = 0, totalFestives = 0;
  const incidents = [];

  Object.entries(store.state.shifts).forEach(([dateStr, record]) => {
    if (dateStr.startsWith(currentYear.toString())) {
      if (record.modifier === 'V') usedVac++;
      if (record.modifier === 'AP') usedAP++;
      if (record.modifier === 'LD') usedLD++;
      if (record.modifier === 'F') totalFestives++;

      const ot = Number(record.overtime) || 0;
      if ((record.notes && record.notes.trim() !== '') || ot > 0 || record.modifier === 'F') {
        const shiftName = BASE_SHIFTS[record.shiftId]?.name || 'Turno';
        const modName = record.modifier ? (MODIFIERS[record.modifier]?.name || '') : '';
        incidents.push({
          date: dateStr,
          title: `${shiftName} ${modName ? `(${modName})` : ''} ${ot > 0 ? `+${ot}h extra` : ''}`,
          notes: record.notes || (record.modifier === 'F' ? 'Festivo trabajado a cobrar con plus.' : 'Horas extraordinarias registradas.')
        });
      }
    }
  });

  document.getElementById('audit-vac-due').textContent = allowances.vacations - usedVac;
  document.getElementById('audit-ap-due').textContent = allowances.ap - usedAP;
  document.getElementById('audit-ld-due').textContent = allowances.ld - usedLD;
  document.getElementById('audit-festives-due').textContent = totalFestives;

  const incidentsContainer = document.getElementById('audit-incidents-list');
  incidentsContainer.innerHTML = '';

  if (incidents.length === 0) {
    incidentsContainer.innerHTML = '<p class="empty-state">No hay incidencias ni festivos registrados este año.</p>';
  } else {
    incidents.sort((a, b) => b.date.localeCompare(a.date));
    incidents.forEach(inc => {
      const item = document.createElement('div');
      item.className = 'incident-item';
      item.innerHTML = `<div class="incident-date">${formatPrettyDate(inc.date)} - ${inc.title}</div><div>${inc.notes}</div>`;
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
  let usedVac = 0, usedAP = 0, usedLD = 0, totalFestives = 0;

  Object.entries(store.state.shifts).forEach(([dateStr, record]) => {
    if (dateStr.startsWith(year.toString())) {
      if (record.modifier === 'V') usedVac++;
      if (record.modifier === 'AP') usedAP++;
      if (record.modifier === 'LD') usedLD++;
      if (record.modifier === 'F') totalFestives++;
    }
  });

  return `📌 *COMUNICADO DE CUADRANTE Y AUDITORÍA LABORAL (${year})*
📅 *Fecha:* ${new Date().toLocaleDateString('es-ES')}

Estimados/as responsables de Recursos Humanos / Jefatura de Turno,

Resumen detallado de mi balance de jornadas, festividades y permisos:

🎉 *Festivos Trabajados:*
• ${totalFestives} jornadas en festivo trabajadas según cuadrante (pendientes de abono/compensación de plus festivo).

🏖️ *Vacaciones anuales:*
• Asignadas: ${allowances.vacations} días | Disfrutadas: ${usedVac} | *Pendientes:* ${allowances.vacations - usedVac} días

📑 *Asuntos Propios (AP):*
• Asignados: ${allowances.ap} días | Disfrutados: ${usedAP} | *Pendientes:* ${allowances.ap - usedAP} días

⏱️ *Libre Disposición (LD):*
• Asignados: ${allowances.ld} días | Disfrutados: ${usedLD} | *Pendientes:* ${allowances.ld - usedLD} días

Solicito su cotejo con los registros de la empresa.

Atentamente,
_Registro de Turnos AntiBoss_`;
}

function preparePrintDocument() {
  const printArea = document.getElementById('print-area');
  const year = currentDate.getFullYear();
  const allowances = store.state.config.annualAllowances;
  let usedVac = 0, usedAP = 0, usedLD = 0, festives = 0;

  Object.entries(store.state.shifts).forEach(([dateStr, record]) => {
    if (dateStr.startsWith(year.toString())) {
      if (record.modifier === 'V') usedVac++;
      if (record.modifier === 'AP') usedAP++;
      if (record.modifier === 'LD') usedLD++;
      if (record.modifier === 'F') festives++;
    }
  });

  printArea.innerHTML = `
    <div class="print-header">
      <h2>INFORME OFICIAL DE AUDITORÍA LABORAL Y REGISTRO DE JORNADA</h2>
      <p><strong>Año:</strong> ${year} | <strong>Fecha:</strong> ${new Date().toLocaleDateString('es-ES')}</p>
    </div>
    <table class="print-table">
      <thead><tr><th>Concepto</th><th>Asignados</th><th>Disfrutados / Trabajados</th><th>Saldo Pendiente / Plus</th></tr></thead>
      <tbody>
        <tr><td>Festivos Trabajados (Plus Festivo)</td><td>-</td><td>${festives} días</td><td><strong>${festives} a liquidar</strong></td></tr>
        <tr><td>Vacaciones</td><td>${allowances.vacations} días</td><td>${usedVac}</td><td><strong>${allowances.vacations - usedVac} días pendientes</strong></td></tr>
        <tr><td>Asuntos Propios (AP)</td><td>${allowances.ap} días</td><td>${usedAP}</td><td><strong>${allowances.ap - usedAP} días pendientes</strong></td></tr>
        <tr><td>Libre Disposición (LD)</td><td>${allowances.ld} días</td><td>${usedLD}</td><td><strong>${allowances.ld - usedLD} días pendientes</strong></td></tr>
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
    if (dateStr.startsWith(year.toString()) && record.modifier === 'V') usedVac++;
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
    showToast('✓ Ajustes guardados');
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
