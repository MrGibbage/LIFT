'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
// These module-level variables hold all runtime navigation and circuit state.

/** @type {IDBDatabase|null} */
let db = null;

/** ID of the machine currently shown on the detail screen. @type {string|null} */
let currentMachineId = null;

/**
 * Circuit runtime state. null when not in circuit mode.
 * @type {{ circuitId: string, machineIds: string[], currentIndex: number }|null}
 */
let circuitState = null;

/** ID of the circuit being edited in the circuit editor. null = creating new. @type {string|null} */
let editingCircuitId = null;

/** Whether the management screen is currently in drag-to-reorder mode. */
let isReorderMode = false;

/** The <li> element currently being dragged in the circuit selected list. @type {HTMLElement|null} */
let _circuitDraggingEl = null;

// ── DOM Ready ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  registerServiceWorker();
  openDB().then(() => {
    loadGallery();
  });
});

// ── Service Worker ────────────────────────────────────────────────────────────

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────

const SCREENS = [
  'main-menu',
  'circuit-select',
  'detail-screen',
  'adjust-weight-screen',
  'management-screen',
  'circuit-editor',
];

/**
 * Show one screen, hide all others.
 * @param {string} screenId - the id attribute of the screen div to show
 */
function showScreen(screenId) {
  SCREENS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', id !== screenId);
  });
  // Scroll the newly visible screen to top
  const target = document.getElementById(screenId);
  if (target) {
    const main = target.querySelector('main');
    if (main) main.scrollTop = 0;
  }
}

function goToMainMenu() {
  circuitState = null;
  loadGallery();
  showScreen('main-menu');
}

function goToDetail(machineId) {
  currentMachineId = machineId;
  renderDetail();
  showScreen('detail-screen');
}

function goToAdjustWeight() {
  renderAdjustWeight();
  showScreen('adjust-weight-screen');
}

function goToManagement() {
  isReorderMode = false;
  loadManagement();
  showScreen('management-screen');
}

function goToCircuitSelect() {
  loadCircuitSelect();
  showScreen('circuit-select');
}

/**
 * Open the circuit editor.
 * @param {string|null} circuitId - null to create new, or an existing circuit id
 */
function goToCircuitEditor(circuitId = null) {
  editingCircuitId = circuitId;
  loadCircuitEditor();
  showScreen('circuit-editor');
}

// ── Button Wiring ─────────────────────────────────────────────────────────────

function initNavigation() {
  // Main menu
  document.getElementById('btn-start-circuit').addEventListener('click', goToCircuitSelect);
  document.getElementById('btn-manage').addEventListener('click', goToManagement);

  // Circuit select
  document.getElementById('btn-circuit-select-back').addEventListener('click', goToMainMenu);

  // Detail screen
  document.getElementById('btn-detail-back').addEventListener('click', () => {
    circuitState = null;
    goToMainMenu();
  });
  document.getElementById('btn-adjust-weight').addEventListener('click', goToAdjustWeight);
  document.getElementById('btn-complete').addEventListener('click', handleComplete);

  // Adjust weight
  document.getElementById('btn-adjust-back').addEventListener('click', () => {
    showScreen('detail-screen');
  });
  document.getElementById('btn-weight-save').addEventListener('click', handleSaveWeight);
  document.getElementById('btn-weight-cancel').addEventListener('click', () => {
    showScreen('detail-screen');
  });

  // Management
  document.getElementById('btn-management-back').addEventListener('click', goToMainMenu);
  document.getElementById('btn-add-machine').addEventListener('click', handleAddMachine);
  document.getElementById('btn-reorder').addEventListener('click', enterReorderMode);
  document.getElementById('btn-reorder-done').addEventListener('click', () => exitReorderMode(true));
  document.getElementById('btn-reorder-cancel').addEventListener('click', () => exitReorderMode(false));
  document.getElementById('btn-add-circuit').addEventListener('click', () => goToCircuitEditor(null));
  document.getElementById('btn-export').addEventListener('click', exportData);
  document.getElementById('import-file-input').addEventListener('change', (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = ''; // reset so same file can be re-selected
  });

  // File input label display
  document.getElementById('new-machine-image').addEventListener('change', (e) => {
    const name = e.target.files[0]?.name ?? 'No file chosen';
    document.getElementById('new-machine-image-name').textContent = name;
  });

  // Circuit editor
  document.getElementById('btn-circuit-editor-back').addEventListener('click', () => {
    goToManagement();
  });
  document.getElementById('btn-circuit-editor-cancel').addEventListener('click', () => {
    goToManagement();
  });
  document.getElementById('btn-circuit-editor-save').addEventListener('click', handleSaveCircuit);

  // Confirmation dialog
  document.getElementById('btn-confirm-cancel').addEventListener('click', () => {
    hideConfirm();
  });
}

// ── IndexedDB ─────────────────────────────────────────────────────────────────

/**
 * Open (or create) the liftDB database and upgrade schema if needed.
 * Sets the module-level `db` variable on success.
 * Implemented fully in Step 2.
 * @returns {Promise<void>}
 */
async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('liftDB', 1);

    request.onupgradeneeded = (event) => {
      const idb = event.target.result;

      const machinesStore = idb.createObjectStore('machines', { keyPath: 'id' });
      machinesStore.createIndex('name', 'name', { unique: false });

      const workoutsStore = idb.createObjectStore('workouts', { autoIncrement: true });
      workoutsStore.createIndex('machineId', 'machineId', { unique: false });

      idb.createObjectStore('circuits', { keyPath: 'id' });

      // Seed two test machines for development
      const today = new Date().toISOString().slice(0, 10);
      const now = Date.now();
      machinesStore.add({
        id: 'leg-press-' + now,
        name: 'Leg Press',
        weightLbs: 100,
        lastUsed: today,
        imageBlob: null,
        sortOrder: 0,
      });
      machinesStore.add({
        id: 'chest-press-' + (now + 1),
        name: 'Chest Press',
        weightLbs: 60,
        lastUsed: today,
        imageBlob: null,
        sortOrder: 1,
      });
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve();
    };

    request.onerror = (event) => {
      console.error('openDB failed:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Get all records from an object store, sorted by a key if needed.
 * @param {string} storeName
 * @returns {Promise<any[]>}
 */
async function getAllFromStore(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Put (insert or update) a record into an object store.
 * @param {string} storeName
 * @param {object} record
 * @returns {Promise<void>}
 */
async function putRecord(storeName, record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a record by its primary key.
 * @param {string} storeName
 * @param {string|number} key
 * @returns {Promise<void>}
 */
async function deleteRecord(storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all records from an object store (used during import).
 * @param {string} storeName
 * @returns {Promise<void>}
 */
async function clearStore(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get a single record by primary key.
 * @param {string} storeName
 * @param {string|number} key
 * @returns {Promise<any>}
 */
async function getRecord(storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ── Main Menu / Gallery ───────────────────────────────────────────────────────

/**
 * Load machines from DB and render the gallery grid.
 * Implemented in Step 3.
 */
async function loadGallery() {
  const machines = await getAllFromStore('machines');
  machines.sort((a, b) => a.sortOrder - b.sortOrder);
  renderGallery(machines);
}

/**
 * Render machine cards into #gallery-grid.
 * @param {object[]} machines - sorted array of machine records
 */
function renderGallery(machines) {
  const grid = document.getElementById('gallery-grid');
  const empty = document.getElementById('gallery-empty');
  grid.innerHTML = '';
  empty.classList.toggle('hidden', machines.length > 0);

  machines.forEach((machine) => {
    const card = document.createElement('div');
    card.className = 'machine-card';
    card.dataset.machineId = machine.id;

    const img = document.createElement('img');
    img.className = 'machine-card-image';
    img.alt = machine.name;
    img.src = machine.imageBlob
      ? URL.createObjectURL(machine.imageBlob)
      : 'icons/default-machine.svg';

    const label = document.createElement('span');
    label.className = 'machine-card-name';
    label.textContent = machine.name;

    card.appendChild(img);
    card.appendChild(label);
    card.addEventListener('click', () => goToDetail(machine.id));
    grid.appendChild(card);
  });
}

// ── Machine Detail ────────────────────────────────────────────────────────────

/**
 * Fetch the current machine from DB and render the detail screen.
 * Implemented in Step 4.
 */
async function renderDetail() {
  const machine = await getRecord('machines', currentMachineId);
  if (!machine) return;

  document.getElementById('detail-machine-name').textContent = machine.name;

  const img = document.getElementById('detail-machine-image');
  img.alt = machine.name;
  if (machine.imageBlob) {
    img.src = URL.createObjectURL(machine.imageBlob);
  } else {
    img.src = 'icons/default-machine.svg';
  }

  document.getElementById('detail-weight').textContent = machine.weightLbs;
  document.getElementById('detail-last-used').textContent = machine.lastUsed || '—';

  updateCompleteButton();
}

/**
 * Update #btn-complete label and behaviour based on circuit context.
 * Non-circuit mode implemented in Step 4. Circuit-aware routing stubbed for Step 9.
 */
function updateCompleteButton() {
  // Circuit-aware labels (Step 9) — for now always non-circuit mode
  document.getElementById('btn-complete').textContent = 'Complete & Return to Gallery';
}

/**
 * Called when the Complete button is tapped.
 * Logs the workout, updates lastUsed, then navigates appropriately.
 * Non-circuit routing implemented in Step 4. Circuit routing stubbed for Step 9.
 */
async function handleComplete() {
  const machine = await getRecord('machines', currentMachineId);
  if (!machine) return;

  await logWorkout(machine.id, machine.weightLbs);
  showToast('Workout logged');

  // Circuit-aware routing (Step 9) — for now always return to gallery
  goToMainMenu();
}

/**
 * Write a workout record to the workouts store and update machines.lastUsed.
 * @param {string} machineId
 * @param {number} weightLbs
 * Implemented in Step 4.
 */
async function logWorkout(machineId, weightLbs) {
  const today = todayISO();
  await putRecord('workouts', { machineId, weightLbs, date: today });
  const machine = await getRecord('machines', machineId);
  if (machine) {
    await putRecord('machines', { ...machine, lastUsed: today });
  }
}

// ── Weight Adjustment ─────────────────────────────────────────────────────────

/**
 * Populate the adjust-weight screen with the current machine's data.
 * Implemented in Step 5.
 */
async function renderAdjustWeight() {
  const machine = await getRecord('machines', currentMachineId);
  if (!machine) return;

  document.getElementById('adjust-machine-name').textContent = machine.name;
  document.getElementById('adjust-current-weight').textContent = machine.weightLbs;
  document.getElementById('weight-input').value = machine.weightLbs;
}

/**
 * Save the new weight to DB and navigate back to detail screen.
 * Implemented in Step 5.
 */
async function handleSaveWeight() {
  const input = document.getElementById('weight-input');
  const newWeight = parseFloat(input.value);

  if (!newWeight || newWeight <= 0) {
    showToast('Enter a weight greater than 0');
    input.focus();
    return;
  }

  const machine = await getRecord('machines', currentMachineId);
  if (!machine) return;

  await putRecord('machines', { ...machine, weightLbs: newWeight });
  showToast('Weight saved');
  goToDetail(currentMachineId);
}

// ── Management ────────────────────────────────────────────────────────────────

/**
 * Load and render the full management screen content.
 * Implemented in Step 6.
 */
async function loadManagement() {
  // Reset reorder-mode UI regardless of how we arrived here
  document.getElementById('reorder-banner').classList.add('hidden');
  document.getElementById('reorder-actions').classList.add('hidden');
  document.getElementById('btn-reorder').classList.remove('hidden');
  document.getElementById('section-add-machine').classList.remove('hidden');
  document.getElementById('section-circuits').classList.remove('hidden');
  document.getElementById('section-data').classList.remove('hidden');

  const machines = await getAllFromStore('machines');
  machines.sort((a, b) => a.sortOrder - b.sortOrder);

  const list = document.getElementById('machine-mgmt-list');
  const empty = document.getElementById('machine-mgmt-empty');
  list.innerHTML = '';
  empty.classList.toggle('hidden', machines.length > 0);

  machines.forEach((machine) => {
    const li = document.createElement('li');
    li.className = 'mgmt-item';
    li.dataset.machineId = machine.id;

    const img = document.createElement('img');
    img.className = 'mgmt-item-thumb';
    img.alt = machine.name;
    img.src = machine.imageBlob
      ? URL.createObjectURL(machine.imageBlob)
      : 'icons/default-machine.svg';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'mgmt-item-name';
    nameSpan.textContent = machine.name;

    const actions = document.createElement('div');
    actions.className = 'mgmt-item-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-secondary btn-sm';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => startInlineEdit(li, machine.id, nameSpan, editBtn));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-danger btn-sm';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      showConfirm(
        `Delete "${machine.name}"? This will also erase all workout history for this machine.`,
        async () => {
          await deleteMachine(machine.id);
          showToast('Machine deleted');
          loadManagement();
        }
      );
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    li.appendChild(img);
    li.appendChild(nameSpan);
    li.appendChild(actions);
    list.appendChild(li);
  });

  // Render circuits section
  const circuits = await getAllFromStore('circuits');
  const circuitList = document.getElementById('circuit-mgmt-list');
  const circuitEmpty = document.getElementById('circuit-mgmt-empty');
  circuitList.innerHTML = '';
  circuitEmpty.classList.toggle('hidden', circuits.length > 0);

  circuits.forEach((circuit) => {
    const li = document.createElement('li');
    li.className = 'mgmt-item';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'mgmt-item-name';
    nameSpan.textContent = circuit.name;

    const actions = document.createElement('div');
    actions.className = 'mgmt-item-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-secondary btn-sm';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => goToCircuitEditor(circuit.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-danger btn-sm';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      showConfirm(
        `Delete circuit "${circuit.name}"?`,
        () => deleteCircuit(circuit.id)
      );
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    li.appendChild(nameSpan);
    li.appendChild(actions);
    circuitList.appendChild(li);
  });
}

/**
 * Begin inline name editing on a management list item.
 * Replaces the name span with an input; swaps Edit → Save button.
 * @param {HTMLElement} li
 * @param {string} machineId
 * @param {HTMLElement} nameSpan
 * @param {HTMLButtonElement} editBtn
 */
function startInlineEdit(li, machineId, nameSpan, editBtn) {
  if (li.dataset.editing) return;
  li.dataset.editing = 'true';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'mgmt-item-name-input';
  input.value = nameSpan.textContent;
  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  const saveBtn = editBtn.cloneNode(false);
  saveBtn.textContent = 'Save';
  editBtn.replaceWith(saveBtn);

  const doSave = async () => {
    const newName = input.value.trim();
    if (!newName) {
      showToast('Name cannot be empty');
      input.focus();
      return;
    }
    await updateMachineName(machineId, newName);
  };

  saveBtn.addEventListener('click', doSave);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSave();
    if (e.key === 'Escape') loadManagement();
  });
}

/**
 * Handle "Add Machine" button: read form inputs and persist to DB.
 * Implemented in Step 6.
 */
async function handleAddMachine() {
  const nameInput = document.getElementById('new-machine-name');
  const imageInput = document.getElementById('new-machine-image');

  const name = nameInput.value.trim();
  if (!name) {
    showToast('Enter a machine name');
    nameInput.focus();
    return;
  }

  const machines = await getAllFromStore('machines');
  const maxSortOrder = machines.length > 0
    ? Math.max(...machines.map((m) => m.sortOrder))
    : -1;

  const id = slugify(name) + '-' + Date.now();
  const imageFile = imageInput.files[0] ?? null;

  await putRecord('machines', {
    id,
    name,
    weightLbs: 0,
    lastUsed: todayISO(),
    imageBlob: imageFile,
    sortOrder: maxSortOrder + 1,
  });

  nameInput.value = '';
  imageInput.value = '';
  document.getElementById('new-machine-image-name').textContent = 'No file chosen';

  showToast('Machine added');
  loadManagement();
}

/**
 * Update a machine's name in DB and refresh the list.
 * @param {string} machineId
 * @param {string} newName
 * Implemented in Step 6.
 */
async function updateMachineName(machineId, newName) {
  const machine = await getRecord('machines', machineId);
  if (!machine) return;
  await putRecord('machines', { ...machine, name: newName });
  showToast('Name updated');
  loadManagement();
}

/**
 * Delete a machine and all its associated workouts from DB.
 * Uses the machineId index on the workouts store to find and remove all related records.
 * @param {string} machineId
 * Implemented in Step 6.
 */
async function deleteMachine(machineId) {
  // Delete all workouts for this machine via the machineId index cursor
  await new Promise((resolve, reject) => {
    const tx = db.transaction('workouts', 'readwrite');
    const index = tx.objectStore('workouts').index('machineId');
    const req = index.openCursor(IDBKeyRange.only(machineId));
    req.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });

  await deleteRecord('machines', machineId);
}

// ── Reorder Mode ──────────────────────────────────────────────────────────────

/**
 * Enter reorder mode: show banner, show action bar, attach drag-and-drop handlers,
 * hide other management actions.
 * Implemented in Step 7.
 */
function enterReorderMode() {
  isReorderMode = true;

  document.getElementById('reorder-banner').classList.remove('hidden');
  document.getElementById('reorder-actions').classList.remove('hidden');
  document.getElementById('btn-reorder').classList.add('hidden');
  document.getElementById('section-add-machine').classList.add('hidden');
  document.getElementById('section-circuits').classList.add('hidden');
  document.getElementById('section-data').classList.add('hidden');

  const list = document.getElementById('machine-mgmt-list');
  list.querySelectorAll('li').forEach((li) => {
    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⠿';
    li.prepend(handle);
    const actions = li.querySelector('.mgmt-item-actions');
    if (actions) actions.classList.add('hidden');
  });

  attachReorderDragHandlers();
}

/**
 * Exit reorder mode.
 * @param {boolean} save - if true, persist the new sortOrder values to DB
 * Implemented in Step 7.
 */
async function exitReorderMode(save) {
  if (save) {
    const list = document.getElementById('machine-mgmt-list');
    const items = [...list.querySelectorAll('li')];
    await Promise.all(
      items.map(async (li, index) => {
        const machineId = li.dataset.machineId;
        const machine = await getRecord('machines', machineId);
        if (machine) {
          await putRecord('machines', { ...machine, sortOrder: index });
        }
      })
    );
    showToast('Order saved');
  }
  goToManagement();
}

/**
 * Attach touch-based drag-and-drop handlers to all drag handles in the machine list.
 * Uses touch events (touchstart/touchmove/touchend) for Android Chrome compatibility.
 * Reorders the DOM live as the user drags; saving happens only when Done is tapped.
 */
function attachReorderDragHandlers() {
  const list = document.getElementById('machine-mgmt-list');
  let draggingEl = null;

  list.querySelectorAll('.drag-handle').forEach((handle) => {
    handle.addEventListener('touchstart', (e) => {
      e.preventDefault();
      draggingEl = handle.closest('li');
      draggingEl.classList.add('dragging');
    }, { passive: false });

    handle.addEventListener('touchmove', (e) => {
      if (!draggingEl) return;
      e.preventDefault();
      const y = e.touches[0].clientY;
      const siblings = [...list.querySelectorAll('li:not(.dragging)')];
      let target = null;
      let before = true;
      for (const el of siblings) {
        const rect = el.getBoundingClientRect();
        if (y >= rect.top && y <= rect.bottom) {
          target = el;
          before = y < rect.top + rect.height / 2;
          break;
        }
      }
      if (!target) return;
      list.insertBefore(draggingEl, before ? target : target.nextSibling);
    }, { passive: false });

    handle.addEventListener('touchend', () => {
      if (!draggingEl) return;
      draggingEl.classList.remove('dragging');
      draggingEl = null;
    });
  });
}

// ── Circuit Select ────────────────────────────────────────────────────────────

/**
 * Load circuits from DB and render the circuit selection list.
 * Implemented in Step 9.
 */
async function loadCircuitSelect() {
  // TODO (Step 9): getAllFromStore('circuits'), render list items,
  // wire up tap → startCircuit(circuit.id)
  console.log('loadCircuitSelect: stub');
  const list = document.getElementById('circuit-select-list');
  const empty = document.getElementById('circuit-select-empty');
  list.innerHTML = '';
  empty.classList.remove('hidden');
}

/**
 * Set circuit state and navigate to the first machine.
 * @param {string} circuitId
 * Implemented in Step 9.
 */
async function startCircuit(circuitId) {
  // TODO (Step 9): find circuit, set circuitState = { circuitId, machineIds, currentIndex: 0 },
  // goToDetail(machineIds[0])
  console.log('startCircuit: stub', circuitId);
}

// ── Circuit Editor ────────────────────────────────────────────────────────────

/**
 * Load the circuit editor UI for a new or existing circuit.
 * Implemented in Step 8.
 */
async function loadCircuitEditor() {
  document.getElementById('circuit-editor-title').textContent =
    editingCircuitId ? 'Edit Circuit' : 'New Circuit';

  const allMachines = await getAllFromStore('machines');
  allMachines.sort((a, b) => a.sortOrder - b.sortOrder);

  const nameInput    = document.getElementById('circuit-name-input');
  const selectedList = document.getElementById('circuit-selected-list');
  const selectedEmpty = document.getElementById('circuit-selected-empty');
  const availableList = document.getElementById('circuit-available-list');

  selectedList.innerHTML  = '';
  availableList.innerHTML = '';

  const machineMap = new Map(allMachines.map((m) => [m.id, m]));
  let selectedIds = [];

  if (editingCircuitId) {
    const circuit = await getRecord('circuits', editingCircuitId);
    if (circuit) {
      nameInput.value = circuit.name;
      selectedIds = circuit.machineIds.filter((id) => machineMap.has(id));
    } else {
      nameInput.value = '';
    }
  } else {
    nameInput.value = '';
  }

  selectedIds.forEach((id) => {
    selectedList.appendChild(buildCircuitSelectedItem(machineMap.get(id)));
  });

  const selectedSet = new Set(selectedIds);
  allMachines.forEach((machine) => {
    if (!selectedSet.has(machine.id)) {
      availableList.appendChild(buildCircuitAvailableItem(machine));
    }
  });

  selectedEmpty.classList.toggle('hidden', selectedList.children.length > 0);
  attachCircuitDragHandlers();
}

/** Build a list item for the "In This Circuit" selected list. */
function buildCircuitSelectedItem(machine) {
  const li = document.createElement('li');
  li.className = 'mgmt-item';
  li.dataset.machineId = machine.id;

  const handle = document.createElement('span');
  handle.className = 'drag-handle';
  handle.textContent = '⠿';

  const img = document.createElement('img');
  img.className = 'mgmt-item-thumb';
  img.alt = machine.name;
  img.src = machine.imageBlob
    ? URL.createObjectURL(machine.imageBlob)
    : 'icons/default-machine.svg';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'mgmt-item-name';
  nameSpan.textContent = machine.name;

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn btn-danger btn-sm';
  removeBtn.textContent = '×';
  removeBtn.setAttribute('aria-label', `Remove ${machine.name}`);
  removeBtn.addEventListener('click', () => {
    li.remove();
    document.getElementById('circuit-available-list')
      .appendChild(buildCircuitAvailableItem(machine));
    const selectedList = document.getElementById('circuit-selected-list');
    document.getElementById('circuit-selected-empty')
      .classList.toggle('hidden', selectedList.children.length > 0);
  });

  li.appendChild(handle);
  li.appendChild(img);
  li.appendChild(nameSpan);
  li.appendChild(removeBtn);
  return li;
}

/** Build a list item for the "Available Machines" list. */
function buildCircuitAvailableItem(machine) {
  const li = document.createElement('li');
  li.className = 'mgmt-item';
  li.dataset.machineId = machine.id;

  const img = document.createElement('img');
  img.className = 'mgmt-item-thumb';
  img.alt = machine.name;
  img.src = machine.imageBlob
    ? URL.createObjectURL(machine.imageBlob)
    : 'icons/default-machine.svg';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'mgmt-item-name';
  nameSpan.textContent = machine.name;

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-secondary btn-sm';
  addBtn.textContent = '+';
  addBtn.setAttribute('aria-label', `Add ${machine.name}`);
  addBtn.addEventListener('click', () => {
    li.remove();
    const selectedList = document.getElementById('circuit-selected-list');
    selectedList.appendChild(buildCircuitSelectedItem(machine));
    attachCircuitDragHandlers();
    document.getElementById('circuit-selected-empty')
      .classList.toggle('hidden', selectedList.children.length > 0);
  });

  li.appendChild(img);
  li.appendChild(nameSpan);
  li.appendChild(addBtn);
  return li;
}

/**
 * Attach touch drag-and-drop to unregistered handles in #circuit-selected-list.
 * Uses _circuitDraggingEl (module-level) to avoid closure issues across calls.
 */
function attachCircuitDragHandlers() {
  const list = document.getElementById('circuit-selected-list');

  list.querySelectorAll('.drag-handle').forEach((handle) => {
    if (handle.dataset.dragAttached) return;
    handle.dataset.dragAttached = 'true';

    handle.addEventListener('touchstart', (e) => {
      e.preventDefault();
      _circuitDraggingEl = handle.closest('li');
      _circuitDraggingEl.classList.add('dragging');
    }, { passive: false });

    handle.addEventListener('touchmove', (e) => {
      if (!_circuitDraggingEl) return;
      e.preventDefault();
      const y = e.touches[0].clientY;
      const siblings = [...list.querySelectorAll('li:not(.dragging)')];
      let target = null;
      let before = true;
      for (const el of siblings) {
        const rect = el.getBoundingClientRect();
        if (y >= rect.top && y <= rect.bottom) {
          target = el;
          before = y < rect.top + rect.height / 2;
          break;
        }
      }
      if (!target) return;
      list.insertBefore(_circuitDraggingEl, before ? target : target.nextSibling);
    }, { passive: false });

    handle.addEventListener('touchend', () => {
      if (!_circuitDraggingEl) return;
      _circuitDraggingEl.classList.remove('dragging');
      _circuitDraggingEl = null;
    });
  });
}

/**
 * Save the circuit (new or updated) to DB.
 * Implemented in Step 8.
 */
async function handleSaveCircuit() {
  const nameInput = document.getElementById('circuit-name-input');
  const name = nameInput.value.trim();

  if (!name) {
    showToast('Enter a circuit name');
    nameInput.focus();
    return;
  }

  const selectedList = document.getElementById('circuit-selected-list');
  const machineIds = [...selectedList.querySelectorAll('li')]
    .map((li) => li.dataset.machineId);

  if (machineIds.length === 0) {
    showToast('Add at least one machine to the circuit');
    return;
  }

  const id = editingCircuitId ?? slugify(name) + '-' + Date.now();
  await putRecord('circuits', { id, name, machineIds });
  showToast('Circuit saved');
  goToManagement();
}

/**
 * Delete a circuit from DB (after confirmation).
 * @param {string} circuitId
 * Implemented in Step 8.
 */
async function deleteCircuit(circuitId) {
  await deleteRecord('circuits', circuitId);
  showToast('Circuit deleted');
  loadManagement();
}

// ── Export / Import ───────────────────────────────────────────────────────────

/**
 * Export all data to a downloadable JSON file.
 * Implemented in Step 10.
 */
async function exportData() {
  // TODO (Step 10): read all stores, convert imageBlob to Base64,
  // package as { version: 1, machines, workouts, circuits },
  // trigger download as lift-export-YYYY-MM-DD.json
  console.log('exportData: stub');
  showToast('Export coming in Step 10');
}

/**
 * Import data from a JSON file (destructive — replaces all existing data).
 * @param {File} file
 * Implemented in Step 11.
 */
async function importData(file) {
  // TODO (Step 11): parse JSON, showConfirm(), on confirm: clear all stores,
  // restore records (Base64 → Blob for images), refresh gallery
  console.log('importData: stub', file.name);
  showToast('Import coming in Step 11');
}

// ── UI Helpers ────────────────────────────────────────────────────────────────

/**
 * Show a brief toast/snackbar message.
 * @param {string} message
 */
function showToast(message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  // Remove after animation completes (2.5s show + 0.3s fade = 2.8s)
  setTimeout(() => toast.remove(), 2900);
}

/** Pending confirm callback — set by showConfirm, cleared on hide. */
let _confirmCallback = null;

/**
 * Show the confirmation dialog.
 * @param {string} message
 * @param {() => void} onConfirm - called if user taps Confirm
 */
function showConfirm(message, onConfirm) {
  document.getElementById('confirm-message').textContent = message;
  _confirmCallback = onConfirm;
  document.getElementById('confirm-overlay').classList.remove('hidden');

  // Wire up confirm button (replace listener to avoid duplicates)
  const btnOk = document.getElementById('btn-confirm-ok');
  const newBtn = btnOk.cloneNode(true);
  btnOk.parentNode.replaceChild(newBtn, btnOk);
  newBtn.addEventListener('click', () => {
    const cb = _confirmCallback;
    hideConfirm();
    if (cb) cb();
  });
}

function hideConfirm() {
  document.getElementById('confirm-overlay').classList.add('hidden');
  _confirmCallback = null;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Convert a string to a URL-safe slug.
 * @param {string} str
 * @returns {string}
 */
function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Return today's date as an ISO string (YYYY-MM-DD).
 * @returns {string}
 */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
