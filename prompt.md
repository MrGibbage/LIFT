# LIFT — Logging Individual Fitness Targets
## Mobile-First Workout Tracker PWA

---

## IMPORTANT: Instructions for the LLM

This file is the single source of truth for the LIFT project. You **must** keep it up to date as work progresses. Specifically:

- After completing any todo item, mark it `[x]` and add a brief note of what was done (files created/changed, key decisions made).
- If a decision is made during a session that affects architecture, data model, UX flow, or file structure, add it to the relevant section below.
- If a new task is discovered mid-session, add it to the todo list in the right place.
- Each new chat session will start by reading this file. Make sure a fresh LLM can get fully up to speed from this file alone.
- Do not remove completed items — mark them done so progress is visible.
- **After completing each step, always offer the user a concrete list of things they can manually test in the browser to verify the step works correctly.**

---

## Project Goal

A fully offline, installable PWA for personal gym use. Tracks weight settings on ~12 weight machines. No backend — all data lives in IndexedDB on the device. Hosted on the user's homelab (HTTPS required for PWA install). Optimized for Android Chrome.

**Tech stack:** HTML5, CSS3, Vanilla JS (ES6+, no frameworks), IndexedDB, PWA (manifest + service worker).

---

## Data Model (IndexedDB database: `liftDB`)

### Object Store: `machines`
- `id` — string, keyPath (e.g. `'leg-press-01'`, generated as slugified name + timestamp)
- `name` — string
- `weightLbs` — number
- `lastUsed` — string (ISO date, e.g. `'2026-04-08'`)
- `imageBlob` — Blob/File (photo of machine; nullable — falls back to default icon)
- `sortOrder` — number (used for gallery ordering)
- Index on `name`

### Object Store: `workouts`
- Key: auto-increment integer
- `machineId` — string (FK → machines.id)
- `weightLbs` — number
- `date` — string (ISO date)
- Index on `machineId`

### Object Store: `circuits`
- `id` — string, keyPath (slugified name + timestamp)
- `name` — string
- `machineIds` — array of machine id strings, in circuit order

---

## Screens & Navigation

Navigation is handled by showing/hiding `<div>` sections (no routing library). A `.hidden` CSS class toggles visibility. State (current machine, current circuit, circuit position) is held in JS module-level variables.

### 1. Main Menu / Dashboard (`#main-menu`)
- Gallery grid of all machines (image + name on each card)
- Tapping a machine card → Machine Detail screen (no circuit context)
- **"Start Circuit" button** → Circuit Selection modal/screen
- **"Manage" button** → Management screen

### 2. Circuit Selection (`#circuit-select` or modal overlay)
- Lists all saved circuits by name
- Tapping a circuit → immediately navigates to the first machine in that circuit (sets circuit context in state)
- "Cancel" returns to Main Menu

### 3. Machine Detail / Logging (`#detail-screen`)
- Large machine image (or default icon if none), machine name, current weight (lbs), last used date
- **"Adjust Weight" button** → Weight Adjustment screen
- **"Back" button** → Main Menu (clears circuit context)
- **Complete buttons** — context-dependent:
  - **Not in circuit mode:**
    - "Complete & Return to Gallery" — logs workout, updates lastUsed, navigates to Main Menu
  - **In circuit mode, not last machine:**
    - "Complete & Next: {next machine name}" — logs workout, updates lastUsed, navigates to next machine in circuit
  - **In circuit mode, last machine:**
    - "Complete & Finish Circuit" — logs workout, updates lastUsed, navigates to Main Menu, clears circuit state
- Logging a workout: writes a new record to `workouts` store with `machineId`, `weightLbs` (current weight), `date` (today ISO)

### 4. Weight Adjustment (`#adjust-weight-screen`)
- Shows machine name and current weightLbs
- Single `<input type="number">` — user types the new weight directly (no +/- buttons)
- **"Save"** — updates `machines.weightLbs` in DB, navigates back to Machine Detail
- **"Cancel"** — navigates back to Machine Detail, no change

### 5. Management (`#management-screen`)
- **"Back"** button → Main Menu
- **Add Machine** section: name text field + file input for image + "Add" button
- **Machine List**: shows all machines with:
  - Edit name (inline or small edit form)
  - Delete (confirmation dialog required)
  - Thumbnail image
- **"Reorder Machines" button** → enters Reorder Mode (see below)
- **Circuit Management** section: list of circuits, each with edit/delete options; "Add Circuit" button
- **Export Data** button
- **Import Data** button (with confirmation: "This will erase all existing data. Continue?")

### 5a. Reorder Mode (within Management screen)
- Triggered by "Reorder Machines" button
- Shows machine list with drag-and-drop handles
- A clear visual mode indicator (e.g. banner: "Reorder Mode — drag to rearrange")
- **"Done Reordering"** button saves new `sortOrder` values to DB and exits reorder mode
- **"Cancel"** exits without saving
- No other management actions available while in reorder mode (prevents accidental taps)

### 6. Circuit Editor (`#circuit-editor` or modal)
- Name input field
- Machine list (all machines) with checkboxes or add buttons to build the circuit
- Drag-and-drop to set circuit order (within the selected machines list)
- **"Save Circuit"** → writes to `circuits` store, returns to Management
- **"Cancel"** → returns to Management

---

## PWA Configuration

- `manifest.json`: name "LIFT", short_name "LIFT", display: standalone, start_url: "/", theme_color and background_color to match dark theme
- `sw.js`: service worker using cache-first strategy for all app shell assets (HTML, CSS, JS, icons, default image)
- Icons: generate at minimum 192×192 and 512×512 (PNG). Store in `/icons/` directory.
- Default machine image: a clean SVG or PNG placeholder (dumbbell/barbell icon or similar gym graphic). Store as `/icons/default-machine.svg` or similar.

---

## Import / Export

### Export
- Reads all records from `machines`, `workouts`, and `circuits`
- Converts `imageBlob` fields to Base64 strings
- Packages as single JSON object: `{ version: 1, machines: [...], workouts: [...], circuits: [...] }`
- Triggers browser download as `lift-export-{YYYY-MM-DD}.json`

### Import
- File input accepts `.json`
- On selection: parse JSON, show confirmation dialog ("This will erase all existing data. Continue?")
- On confirm: clear all three object stores, convert Base64 strings back to Blobs, write all records to DB, refresh UI
- On cancel: do nothing

---

## UX Details

- **Dark theme**, modern and professional — choose a clean accent color that looks good (e.g. a muted blue or green)
- **Toast / snackbar** notifications for success actions (e.g. "Workout logged", "Weight saved", "Circuit saved")
- **Confirmation dialogs** required for:
  - Deleting a machine (note: also deletes all its workout history)
  - Deleting a circuit
  - Importing data (destructive)
- Optimized for **Android Chrome** touch targets (min 48px tap targets)
- All screens scroll vertically if content overflows — no horizontal scroll

---

## File Structure

```
/LIFT
  index.html
  style.css
  app.js
  manifest.json
  sw.js
  DEV.md             (developer notes: DB reset, schema reference, SW caching tips)
  /icons
    icon-192.png
    icon-512.png
    default-machine.svg   (or .png)
```

---

## Deployment

- Hosted on user's homelab (specific server TBD — likely Synology or a homelab web server)
- Must be served over HTTPS for PWA install to work on Android
- No build step — plain static files

---

## Plan of Action / Todo List

Each step is intended to be a separate focused chat session. Mark items `[x]` when complete and note what was done.

### Phase 1 — Foundation

- [x] **Step 1: Project scaffold**
  - Created `index.html` with all 6 screen divs (`#main-menu`, `#circuit-select`, `#detail-screen`, `#adjust-weight-screen`, `#management-screen`, `#circuit-editor`), toast container, confirm dialog overlay, and full PWA meta tags
  - Created `style.css` with dark theme (`#121212` bg, `#4db6ac` teal accent), mobile-first layout, `.hidden` class, 2-col gallery grid, 48px touch targets, management list items, reorder banner, toast animation, confirm dialog
  - Created `app.js` with DOMContentLoaded entry, `showScreen()` navigation helper, all button listeners wired, all major functions stubbed with TODO comments and step references (`slugify`, `todayISO`, `showToast`, `showConfirm` helpers fully implemented)
  - Created `manifest.json` (name "LIFT", standalone, dark theme colors, SVG icons)
  - Created `sw.js` (cache-first strategy, install/activate/fetch handlers, app shell list)
  - Created `/icons/default-machine.svg` (dumbbell icon, teal on dark), `/icons/icon-192.svg` and `/icons/icon-512.svg` (LIFT lettermark with dumbbell accent)
  - Navigation stubs all wired; app loads and transitions between screens without errors

- [x] **Step 2: IndexedDB setup**
  - Implemented `openDB()`: opens `liftDB` v1, creates `machines` (keyPath `id`, index on `name`), `workouts` (autoIncrement, index on `machineId`), and `circuits` (keyPath `id`) stores in `onupgradeneeded`
  - Seeds two test machines (Leg Press / Chest Press) on first open via the upgrade handler
  - Implemented `getAllFromStore`, `putRecord`, `deleteRecord`, `clearStore` as promise wrappers around the IDB request pattern
  - Verify DB is created correctly in Chrome DevTools (Application → IndexedDB → liftDB)

### Phase 2 — Core Screens

- [x] **Step 3: Main Menu gallery**
  - `loadGallery()` fetches all machines from DB via `getAllFromStore('machines')`, sorts by `sortOrder`, calls `renderGallery()`
  - `renderGallery()` clears `#gallery-grid`, toggles `#gallery-empty` empty state, builds `.machine-card` elements using safe DOM methods (no innerHTML for user data); converts `imageBlob` → `URL.createObjectURL()` or falls back to `icons/default-machine.svg`
  - Card tap wired to `goToDetail(machine.id)`
  - Manage button was already wired to `goToManagement()` in Step 1

- [x] **Step 4: Machine Detail screen**
  - Added `getRecord(storeName, key)` IDB helper (used by renderDetail, handleComplete, logWorkout, and later Step 5)
  - `renderDetail()` fetches machine by `currentMachineId`, populates `#detail-machine-name`, `#detail-machine-image` (imageBlob → createObjectURL or default SVG), `#detail-weight`, `#detail-last-used`, calls `updateCompleteButton()`
  - `updateCompleteButton()` sets btn-complete text to "Complete & Return to Gallery"; circuit-aware labels stubbed for Step 9
  - `handleComplete()` calls `logWorkout()`, shows toast "Workout logged", navigates to Main Menu; circuit routing stubbed for Step 9
  - `logWorkout(machineId, weightLbs)` writes `{ machineId, weightLbs, date }` to workouts store, updates `machines.lastUsed` to today
  - Back button (`btn-detail-back`) already wired in Step 1 → clears circuitState, goToMainMenu()

- [x] **Step 5: Weight Adjustment screen**
  - `renderAdjustWeight()` fetches machine by `currentMachineId`, populates `#adjust-machine-name`, `#adjust-current-weight`, and pre-fills `#weight-input` with current weight
  - `handleSaveWeight()` reads and parses `#weight-input`, validates > 0 (shows toast and refocuses on failure), updates `machines.weightLbs` via `putRecord`, shows "Weight saved" toast, calls `goToDetail(currentMachineId)` to re-render detail screen with refreshed data
  - Cancel and Back buttons already wired in Step 1 → `showScreen('detail-screen')` (no DB change)

### Phase 3 — Management

- [x] **Step 6: Machine management (add/edit/delete)**
  - `loadManagement()` fetches and sorts machines, renders `.mgmt-item` list items (thumbnail, name, Edit/Delete buttons), toggles `#machine-mgmt-empty`
  - Add Machine: reads `#new-machine-name` (required) and `#new-machine-image` (optional file), generates `id = slugify(name) + '-' + Date.now()`, sets `sortOrder` to `max + 1`, writes via `putRecord`, clears form, refreshes list, shows "Machine added" toast
  - Edit name: `startInlineEdit()` helper swaps the name `<span>` for a styled `<input>` and changes Edit button to Save; Enter key also triggers save; Escape cancels (re-renders list); `updateMachineName()` validates non-empty, updates record, shows "Name updated" toast
  - Delete: Delete button calls `showConfirm()` with warning about workout history; on confirm, `deleteMachine()` opens a cursor on the `machineId` index of the workouts store to delete all matching workout records, then `deleteRecord('machines', id)`; shows "Machine deleted" toast

- [x] **Step 7: Machine reorder mode**
  - `enterReorderMode()`: sets `isReorderMode = true`, shows `#reorder-banner` and `#reorder-actions`, hides `#btn-reorder` / `#section-add-machine` / `#section-circuits` / `#section-data`, prepends `⠿` drag handle to each `<li>` and hides its Edit/Delete actions, calls `attachReorderDragHandlers()`
  - `exitReorderMode(save)`: if save, reads DOM order of `#machine-mgmt-list`, writes updated `sortOrder` (= DOM index) for each machine via `Promise.all`, shows "Order saved" toast; always calls `goToManagement()` to re-render cleanly
  - `attachReorderDragHandlers()`: touch-event drag-and-drop (touchstart/touchmove/touchend on each `.drag-handle`); on touchmove iterates sibling `<li>` bounding rects to find target, uses `insertBefore` to reorder DOM live; `.dragging` CSS class (0.5 opacity + teal outline) applied during drag; no HTML5 drag API used (unreliable on Android touch)

### Phase 4 — Circuits

- [x] **Step 8: Circuit editor**
  - `loadCircuitEditor()`: sets title, fetches machines, pre-fills form when editing, renders selected/available lists
  - `buildCircuitSelectedItem()` / `buildCircuitAvailableItem()`: DOM builders; + moves machine to selected, × moves it back to available
  - `attachCircuitDragHandlers()`: touch drag-and-drop on `#circuit-selected-list`, same pattern as Step 7; uses module-level `_circuitDraggingEl` to avoid closure issues; `data-drag-attached` flag prevents duplicate listeners when new items are added
  - `handleSaveCircuit()`: validates name + ≥1 machine; generates id for new; `putRecord('circuits', ...)`, "Circuit saved" toast, `goToManagement()`
  - `deleteCircuit(circuitId)`: `deleteRecord`, "Circuit deleted" toast, `loadManagement()`
  - `loadManagement()` extended: fetches circuits, renders `#circuit-mgmt-list` with Edit (→ `goToCircuitEditor`) and Delete (→ `showConfirm` → `deleteCircuit`) buttons; toggles `#circuit-mgmt-empty`

- [ ] **Step 9: Circuit flow (runtime)**
  - "Start Circuit" button on Main Menu → Circuit Selection screen
  - Selecting a circuit sets circuit state (circuitId, machineIds array, currentIndex = 0)
  - Machine Detail shows correct context-aware Complete buttons
  - Circuit advances through machines in order
  - Last machine → "Complete & Finish Circuit" clears circuit state

### Phase 5 — Data Portability

- [ ] **Step 10: Export**
  - Read all stores, serialize blobs to Base64, package as JSON, trigger download

- [ ] **Step 11: Import**
  - File input, parse JSON, confirmation dialog, clear stores, restore data (Base64 → Blob)

### Phase 6 — Polish & Deployment

- [ ] **Step 12: PWA finalization**
  - Finalize `manifest.json` (icons, colors, name)
  - Finalize `sw.js` (cache all app shell assets, handle install/activate/fetch)
  - Test PWA install prompt on Android Chrome

- [ ] **Step 13: Polish**
  - Toast/snackbar component wired to all relevant actions
  - Confirmation dialog component
  - Review all touch targets (min 48px)
  - Test full circuit flow end-to-end
  - Test import/export round-trip

- [ ] **Step 14: Homelab deployment**
  - Determine hosting location (Synology, nginx container, etc.)
  - Deploy static files
  - Confirm HTTPS
  - Install PWA on Android phone
  - Smoke test all features on device

---

## Decisions Log

| Date | Decision |
|------|----------|
| 2026-04-08 | Weight unit: pounds only |
| 2026-04-08 | No sets/reps — weight-only logging |
| 2026-04-08 | No workout history view — current weight + last used date is sufficient |
| 2026-04-08 | Machine sort order is manual; managed via drag-and-drop reorder mode on Management screen |
| 2026-04-08 | Weight adjustment is a free-form number input, not +/- steppers (each machine has different increments) |
| 2026-04-08 | Circuit feature added: named circuits with ordered machine lists; managed on Management screen |
| 2026-04-08 | Complete buttons are context-aware: solo vs. circuit (mid) vs. circuit (last machine) |
| 2026-04-08 | PWA: full install with manifest + service worker; hosted on homelab over HTTPS |
| 2026-04-08 | Target device: Android Chrome (personal use only) |
| 2026-04-08 | Default machine image: generic gym icon (SVG) in /icons/ |
| 2026-04-08 | Confirmations required for: machine delete, circuit delete, import |
| 2026-04-08 | No color scheme preference — LLM to choose modern dark theme with clean accent color |
