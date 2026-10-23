/* db.js — Firestore-backed storage layer (previously IndexedDB).
 *
 * window.DB keeps the exact same method names/signatures it always has, so
 * songs.js/setlists.js don't need to change how they call storage — every
 * read is scoped to the signed-in user's group, and every write is stamped
 * with groupId (and ownerId/createdBy where relevant) automatically, using
 * window.Auth (loaded before this file — see index.html).
 *
 * Note: unlike the old IndexedDB layer, saveSong/saveSetlist/bulkSaveSongs
 * mutate the object(s) passed in (adding groupId/ownerId/createdBy) before
 * writing. No current caller relies on the object staying unmutated, and
 * the UI permission-gating work needs sl.ownerId visible on in-memory
 * setlists right after a save, not just after a re-fetch.
 */
(function () {

const fs = firebase.firestore();

function requireGroup() {
  const groupId = Auth.currentGroupId();
  if (!groupId) throw new Error('Not in a group yet');
  return groupId;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function queryAll(collectionName) {
  const groupId = requireGroup();
  const snap = await fs.collection(collectionName).where('groupId', '==', groupId).get();
  return snap.docs.map(d => d.data());
}

async function getOne(collectionName, id) {
  const doc = await fs.collection(collectionName).doc(id).get();
  return doc.exists ? doc.data() : undefined;
}

async function putOne(collectionName, item) {
  item.groupId = requireGroup();
  await fs.collection(collectionName).doc(item.id).set(item);
  return item;
}

async function bulkPut(collectionName, items) {
  const groupId = requireGroup();
  for (const batchItems of chunk(items, 400)) {
    const batch = fs.batch();
    batchItems.forEach(item => {
      item.groupId = groupId;
      batch.set(fs.collection(collectionName).doc(item.id), item);
    });
    await batch.commit();
  }
  return items;
}

async function deleteOne(collectionName, id) {
  await fs.collection(collectionName).doc(id).delete();
}

async function clearAll(collectionName) {
  const groupId = requireGroup();
  const snap = await fs.collection(collectionName).where('groupId', '==', groupId).get();
  for (const batchDocs of chunk(snap.docs, 400)) {
    const batch = fs.batch();
    batchDocs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
}

function uid() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

// Songs have no per-user ownership (only role gates writes), just an
// audit-trail "who first added this" field.
function stampCreator(song) {
  if (!song.createdBy) {
    const user = Auth.currentUser();
    song.createdBy = user ? user.uid : null;
  }
  return song;
}

// Set once on first save and never overwritten afterward, so an admin
// editing someone else's setlist doesn't silently become its owner.
function stampOwner(setlist) {
  if (!setlist.ownerId) {
    const user = Auth.currentUser();
    setlist.ownerId = user ? user.uid : null;
  }
  return setlist;
}

const DB = {
  // Songs
  getSongs: () => queryAll('songs'),
  getSong: (id) => getOne('songs', id),
  saveSong: (song) => putOne('songs', stampCreator(song)),
  bulkSaveSongs: (songs) => bulkPut('songs', songs.map(stampCreator)),
  deleteSong: (id) => deleteOne('songs', id),
  clearSongs: () => clearAll('songs'),

  // Setlists
  getSetlists: () => queryAll('setlists'),
  getSetlist: (id) => getOne('setlists', id),
  saveSetlist: (setlist) => putOne('setlists', stampOwner(setlist)),
  deleteSetlist: (id) => deleteOne('setlists', id),
  clearSetlists: () => clearAll('setlists'),

  uid
};

window.DB = DB;

})();
