'use strict';

const STORAGE_KEY = 'pr-strength-data-v1';
const NEW_EXERCISE = '__new__';

// ---------- Data ----------

function emptyData() {
  return { exercises: [], sessions: [] };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    const data = JSON.parse(raw);
    if (!Array.isArray(data.exercises) || !Array.isArray(data.sessions)) return emptyData();
    return data;
  } catch {
    return emptyData();
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- Stats (pure) ----------

// Sessions are compared by date, then by creation time for same-day entries.
function compareSessions(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return (a.createdAt || 0) - (b.createdAt || 0);
}

function exerciseStats(sessions) {
  let heaviest = null; // highest weight, ties broken by more reps
  let mostReps = null; // most reps, ties broken by more weight
  let recent = null;

  for (const s of sessions) {
    for (const set of s.sets) {
      if (!heaviest || set.weight > heaviest.weight ||
          (set.weight === heaviest.weight && set.reps > heaviest.reps)) {
        heaviest = { ...set, date: s.date };
      }
      if (!mostReps || set.reps > mostReps.reps ||
          (set.reps === mostReps.reps && set.weight > mostReps.weight)) {
        mostReps = { ...set, date: s.date };
      }
    }
    if (!recent || compareSessions(s, recent) > 0) recent = s;
  }
  return { heaviest, mostReps, recent };
}

if (typeof module !== 'undefined') {
  module.exports = { exerciseStats, compareSessions };
}

// ---------- UI ----------

if (typeof document !== 'undefined') {
  let data = loadData();
  let currentExerciseId = null;

  const $ = (id) => document.getElementById(id);
  const select = $('exercise-select');
  const newWrap = $('new-exercise-wrap');
  const newName = $('new-exercise-name');
  const dateInput = $('log-date');
  const setsList = $('sets-list');
  const setTpl = $('set-row-tpl');
  const logMsg = $('log-msg');

  const fmtKg = (w) => `${+w.toFixed(2)} kg`;
  const fmtDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  const todayISO = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  };
  const sortedExercises = () =>
    [...data.exercises].sort((a, b) => a.name.localeCompare(b.name));
  const sessionsFor = (exId) => data.sessions.filter((s) => s.exerciseId === exId);

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showView(id) {
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === id));
    document.querySelectorAll('.tab').forEach((t) => {
      const on = t.dataset.view === id || (id === 'view-history' && t.dataset.view === 'view-prs');
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on);
    });
    if (id === 'view-prs') renderPRs();
    window.scrollTo(0, 0);
  }

  // ----- Log workout -----

  function renderExerciseSelect(selectedId) {
    const prev = selectedId ?? select.value;
    select.replaceChildren();
    const exercises = sortedExercises();
    for (const ex of exercises) {
      const opt = el('option', null, ex.name);
      opt.value = ex.id;
      select.append(opt);
    }
    const addOpt = el('option', null, '+ Add new exercise…');
    addOpt.value = NEW_EXERCISE;
    select.append(addOpt);

    const valid = [...select.options].some((o) => o.value === prev);
    select.value = valid ? prev : (exercises[0]?.id ?? NEW_EXERCISE);
    onExerciseChange();
  }

  function onExerciseChange() {
    const isNew = select.value === NEW_EXERCISE;
    newWrap.classList.toggle('hidden', !isNew);
    newName.required = isNew;
  }

  function addSetRow(weight = '', reps = '') {
    const row = setTpl.content.firstElementChild.cloneNode(true);
    row.querySelector('.set-weight').value = weight;
    row.querySelector('.set-reps').value = reps;
    row.querySelector('.remove-set').addEventListener('click', () => {
      if (setsList.children.length > 1) {
        row.remove();
        renumberSets();
      }
    });
    setsList.append(row);
    renumberSets();
    return row;
  }

  function renumberSets() {
    [...setsList.children].forEach((row, i) => {
      row.querySelector('.set-no').textContent = i + 1;
    });
  }

  function resetSets() {
    setsList.replaceChildren();
    addSetRow();
  }

  function showMsg(text, isError = false) {
    logMsg.textContent = text;
    logMsg.classList.toggle('error', isError);
    clearTimeout(showMsg.t);
    showMsg.t = setTimeout(() => { logMsg.textContent = ''; }, 3000);
  }

  $('add-set-btn').addEventListener('click', () => {
    // Pre-fill with the previous set's values to save typing.
    const last = setsList.lastElementChild;
    const w = last?.querySelector('.set-weight').value ?? '';
    const r = last?.querySelector('.set-reps').value ?? '';
    addSetRow(w, r).querySelector('.set-weight').focus();
  });

  select.addEventListener('change', () => {
    onExerciseChange();
    if (select.value === NEW_EXERCISE) newName.focus();
  });

  $('log-form').addEventListener('submit', (e) => {
    e.preventDefault();

    let exerciseId = select.value;
    if (exerciseId === NEW_EXERCISE) {
      const name = newName.value.trim();
      if (!name) return showMsg('Enter a name for the exercise.', true);
      const existing = data.exercises.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        exerciseId = existing.id;
      } else {
        exerciseId = uid();
        data.exercises.push({ id: exerciseId, name });
      }
    }

    const sets = [...setsList.children].map((row) => ({
      weight: parseFloat(row.querySelector('.set-weight').value.replace(',', '.')),
      reps: parseInt(row.querySelector('.set-reps').value, 10),
    }));
    if (sets.some((s) => !(s.weight >= 0) || !(s.reps >= 1))) {
      return showMsg('Fill in weight and reps for every set.', true);
    }

    data.sessions.push({
      id: uid(),
      exerciseId,
      date: dateInput.value || todayISO(),
      createdAt: Date.now(),
      sets,
    });
    saveData(data);

    newName.value = '';
    renderExerciseSelect(exerciseId);
    resetSets();
    showMsg('Workout saved 💪');
  });

  // ----- PRs -----

  function setLine(set) {
    return `${fmtKg(set.weight)} × ${set.reps}`;
  }

  function renderPRs() {
    const table = $('pr-table');
    table.replaceChildren();
    const exercises = sortedExercises().filter((ex) => sessionsFor(ex.id).length);
    $('pr-empty').classList.toggle('hidden', exercises.length > 0);
    if (!exercises.length) return;

    const head = el('div', 'pr-row head');
    head.setAttribute('role', 'row');
    for (const h of ['Exercise', 'Most weight', 'Most reps', 'Most recent']) {
      head.append(el('span', null, h));
    }
    table.append(head);

    for (const ex of exercises) {
      const { heaviest, mostReps, recent } = exerciseStats(sessionsFor(ex.id));
      const row = el('button', 'pr-row');
      row.type = 'button';
      row.setAttribute('role', 'row');

      row.append(el('span', 'pr-name', ex.name));

      const heavy = el('span');
      heavy.append(el('div', 'pr-big', fmtKg(heaviest.weight)),
                   el('div', 'pr-sub', `${heaviest.reps} reps`));
      row.append(heavy);

      const reps = el('span');
      reps.append(el('div', 'pr-big', `${mostReps.reps} reps`),
                  el('div', 'pr-sub', `@ ${fmtKg(mostReps.weight)}`));
      row.append(reps);

      const rec = el('span', 'pr-sets');
      rec.append(el('div', 'pr-sub', fmtDate(recent.date)));
      recent.sets.forEach((s) => rec.append(el('div', null, setLine(s))));
      row.append(rec);

      row.addEventListener('click', () => openHistory(ex.id));
      table.append(row);
    }
  }

  // ----- History -----

  function openHistory(exId) {
    currentExerciseId = exId;
    renderHistory();
    showView('view-history');
  }

  function renderHistory() {
    const ex = data.exercises.find((x) => x.id === currentExerciseId);
    if (!ex) return showView('view-prs');
    $('history-title').textContent = ex.name;

    const list = $('history-list');
    list.replaceChildren();
    const sessions = sessionsFor(ex.id).sort(compareSessions).reverse();
    for (const s of sessions) {
      const li = el('li', 'history-item');
      const body = el('div');
      body.append(el('div', 'history-date', fmtDate(s.date)));
      const setsEl = el('div', 'history-sets');
      s.sets.forEach((set, i) => setsEl.append(el('div', null, `Set ${i + 1}: ${setLine(set)}`)));
      body.append(setsEl);

      const del = el('button', 'icon-btn', '🗑');
      del.setAttribute('aria-label', 'Delete this workout');
      del.addEventListener('click', () => {
        if (!confirm(`Delete the workout from ${fmtDate(s.date)}?`)) return;
        data.sessions = data.sessions.filter((x) => x.id !== s.id);
        saveData(data);
        if (sessionsFor(ex.id).length) renderHistory();
        else showView('view-prs');
      });

      li.append(body, del);
      list.append(li);
    }
  }

  $('history-back').addEventListener('click', () => showView('view-prs'));

  $('rename-exercise').addEventListener('click', () => {
    const ex = data.exercises.find((x) => x.id === currentExerciseId);
    const name = prompt('New name:', ex.name)?.trim();
    if (!name) return;
    ex.name = name;
    saveData(data);
    renderHistory();
    renderExerciseSelect();
  });

  $('delete-exercise').addEventListener('click', () => {
    const ex = data.exercises.find((x) => x.id === currentExerciseId);
    if (!confirm(`Delete "${ex.name}" and all its workouts? This cannot be undone.`)) return;
    data.exercises = data.exercises.filter((x) => x.id !== ex.id);
    data.sessions = data.sessions.filter((s) => s.exerciseId !== ex.id);
    saveData(data);
    renderExerciseSelect();
    showView('view-prs');
  });

  // ----- Backup -----

  const dialog = $('menu-dialog');
  $('menu-btn').addEventListener('click', () => dialog.showModal());
  $('close-menu').addEventListener('click', () => dialog.close());

  $('export-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pr-strength-backup-${todayISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('import-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (!Array.isArray(imported.exercises) || !Array.isArray(imported.sessions)) throw new Error();
      if (!confirm('Replace all current data with this backup?')) return;
      data = imported;
      saveData(data);
      renderExerciseSelect();
      dialog.close();
      showView('view-prs');
    } catch {
      alert('That file is not a valid PR Strength backup.');
    }
  });

  // ----- Init -----

  document.querySelectorAll('.tab').forEach((t) =>
    t.addEventListener('click', () => showView(t.dataset.view)));

  dateInput.value = todayISO();
  renderExerciseSelect();
  resetSets();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
