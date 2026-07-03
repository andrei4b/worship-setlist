/* db.js — minimal promise-based IndexedDB layer. No external deps. */
(function () {

const DB_NAME = 'worship-planner';
const DB_VERSION = 1;

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('songs')) {
        const songs = db.createObjectStore('songs', { keyPath: 'id' });
        songs.createIndex('title', 'title', { unique: false });
        songs.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('setlists')) {
        const setlists = db.createObjectStore('setlists', { keyPath: 'id' });
        setlists.createIndex('name', 'name', { unique: false });
        setlists.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return _dbPromise;
}

function tx(storeName, mode) {
  return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const Store = {
  async all(storeName) {
    const store = await tx(storeName, 'readonly');
    return reqToPromise(store.getAll());
  },
  async get(storeName, id) {
    const store = await tx(storeName, 'readonly');
    return reqToPromise(store.get(id));
  },
  async put(storeName, item) {
    const store = await tx(storeName, 'readwrite');
    await reqToPromise(store.put(item));
    return item;
  },
  async bulkPut(storeName, items) {
    const store = await tx(storeName, 'readwrite');
    for (const item of items) store.put(item);
    return new Promise((resolve, reject) => {
      store.transaction.oncomplete = () => resolve(items);
      store.transaction.onerror = () => reject(store.transaction.error);
    });
  },
  async delete(storeName, id) {
    const store = await tx(storeName, 'readwrite');
    await reqToPromise(store.delete(id));
  },
  async clear(storeName) {
    const store = await tx(storeName, 'readwrite');
    await reqToPromise(store.clear());
  }
};

function uid() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

const DB = {
  // Songs
  getSongs: () => Store.all('songs'),
  getSong: (id) => Store.get('songs', id),
  saveSong: (song) => Store.put('songs', song),
  bulkSaveSongs: (songs) => Store.bulkPut('songs', songs),
  deleteSong: (id) => Store.delete('songs', id),
  clearSongs: () => Store.clear('songs'),

  // Setlists
  getSetlists: () => Store.all('setlists'),
  getSetlist: (id) => Store.get('setlists', id),
  saveSetlist: (setlist) => Store.put('setlists', setlist),
  deleteSetlist: (id) => Store.delete('setlists', id),
  clearSetlists: () => Store.clear('setlists'),

  uid
};

window.DB = DB;

})();
