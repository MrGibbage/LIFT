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
  // TODO (Step 4): getAllFromStore('machines'), find by currentMachineId, populate DOM,
  // call updateCompleteButton()
  console.log('renderDetail: stub', currentMachineId);
}

/**
 * Update #btn-complete label and behaviour based on circuit context.
 * Implemented in Step 4.
 */
function updateCompleteButton() {
  // TODO (Step 4):
  // - No circuit: "Complete & Return to Gallery"
  // - Circuit, not last: "Complete & Next: {nextMachineName}"
  // - Circuit, last: "Complete & Finish Circuit"
}

/**
 * Called when the Complete button is tapped.
 * Logs the workout, updates lastUsed, then navigates appropriately.
 * Implemented in Step 4.
 */
async function handleComplete() {
  // TODO (Step 4): logWorkout(), then route based on circuitState
  console.log('handleComplete: stub');
}

/**
 * Write a workout record to the workouts store and update machines.lastUsed.
 * @param {string} machineId
 * @param {number} weightLbs
 * Implemented in Step 4.
 */
async function logWorkout(machineId, weightLbs) {
  // TODO (Step 4): putRecord('workouts', { machineId, weightLbs, date: today })
  //               putRecord('machines', { ...machine, lastUsed: today })
  console.log('logWorkout: stub', machineId, weightLbs);
}

// ── Weight Adjustment ─────────────────────────────────────────────────────────

/**
 * Populate the adjust-weight screen with the current machine's data.
 * Implemented in Step 5.
 */
async function renderAdjustWeight() {
  // TODO (Step 5): populate #adjust-machine-name and #adjust-current-weight,
  // pre-fill #weight-input with current value
  console.log('renderAdjustWeight: stub', currentMachineId);
}

/**
 * Save the new weight to DB and navigate back to detail screen.
 * Implemented in Step 5.
 */
async function handleSaveWeight() {
  // TODO (Step 5): read #weight-input, validate > 0, putRecord('machines', ...),
  // showToast('Weight saved'), goToDetail(currentMachineId)
  console.log('handleSaveWeight: stub');
}

// ── Management ────────────────────────────────────────────────────────────────

/**
 * Load and render the full management screen content.
 * Implemented in Step 6.
 */
async function loadManagement() {
  // TODO (Step 6): load machines + circuits, render machine list and circuit list
  console.log('loadManagement: stub');
}

/**
 * Handle "Add Machine" button: read form inputs and persist to DB.
 * Implemented in Step 6.
 */
async function handleAddMachine() {
  // TODO (Step 6): read #new-machine-name and #new-machine-image,
  // generate id (slugify + timestamp), putRecord('machines', {...}),
  // refresh management screen, showToast('Machine added')
  console.log('handleAddMachine: stub');
}

/**
 * Update a machine's name in DB.
 * @param {string} machineId
 * @param {string} newName
 * Implemented in Step 6.
 */
async function updateMachineName(machineId, newName) {
  // TODO (Step 6)
  console.log('updateMachineName: stub', machineId, newName);
}

/**
 * Delete a machine and all its associated workouts from DB.
 * @param {string} machineId
 * Implemented in Step 6.
 */
async function deleteMachine(machineId) {
  // TODO (Step 6): deleteRecord('machines', id), delete all workouts with machineId index
  console.log('deleteMachine: stub', machineId);
}

// ── Reorder Mode ──────────────────────────────────────────────────────────────

/**
 * Enter reorder mode: show banner, show action bar, attach drag-and-drop handlers,
 * hide other management actions.
 * Implemented in Step 7.
 */
function enterReorderMode() {
  // TODO (Step 7)
  console.log('enterReorderMode: stub');
}

/**
 * Exit reorder mode.
 * @param {boolean} save - if true, persist the new sortOrder values to DB
 * Implemented in Step 7.
 */
async function exitReorderMode(save) {
  // TODO (Step 7)
  console.log('exitReorderMode: stub', save);
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
  // TODO (Step 8): if editingCircuitId, load existing circuit data into form;
  // load all machines into available list; render selected machines
  console.log('loadCircuitEditor: stub', editingCircuitId);
}

/**
 * Save the circuit (new or updated) to DB.
 * Implemented in Step 8.
 */
async function handleSaveCircuit() {
  // TODO (Step 8): read #circuit-name-input and ordered machine list,
  // putRecord('circuits', { id, name, machineIds }), goToManagement(), showToast()
  console.log('handleSaveCircuit: stub');
}

/**
 * Delete a circuit from DB (after confirmation).
 * @param {string} circuitId
 * Implemented in Step 8.
 */
async function deleteCircuit(circuitId) {
  // TODO (Step 8)
  console.log('deleteCircuit: stub', circuitId);
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
    hideConfirm();
    if (_confirmCallback) _confirmCallback();
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
