# LIFT — Developer Notes

Tips and gotchas for working on the app locally.

---

## Resetting the IndexedDB (re-seeding)

The two test machines (Leg Press, Chest Press) are seeded inside `openDB()`'s `onupgradeneeded` handler, which only fires once — when the database is first created. To get a clean slate with fresh seed data:

1. Open Chrome DevTools → Application → IndexedDB → `liftDB`
2. Click the delete icon (trash can) to drop the database
3. Reload the page — `onupgradeneeded` fires again and seeds are re-inserted

Alternatively, right-click `liftDB` in the sidebar and choose "Delete database".

If you need to add a new object store or index in a future step, bump the version number in `indexedDB.open('liftDB', N)` and handle migration logic in `onupgradeneeded` using `event.oldVersion`.

---

## Verifying the schema

Chrome DevTools → Application → IndexedDB → liftDB:

| Store    | Key           | Indexes       |
|----------|---------------|---------------|
| machines | `id` (keyPath) | `name`       |
| workouts | auto-increment | `machineId`  |
| circuits | `id` (keyPath) | —            |

---

## Service worker caching

The service worker (`sw.js`) uses a cache-first strategy. If you update `app.js` or `style.css` and don't see changes:

1. DevTools → Application → Service Workers → click **Unregister**
2. Hard reload (Ctrl+Shift+R)

Or tick "Update on reload" in the Service Workers panel during active development.
