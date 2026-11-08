// IndexedDB wrapper. Two stores:
//   nodes  – places and things (kind: 'place' | 'thing'), small thumbnail included
//   photos – array of full compressed photos per node id (first = cover)
const DB = (() => {
  let dbp;
  function open() {
    dbp ??= new Promise((resolve, reject) => {
      const req = indexedDB.open('things', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('nodes', { keyPath: 'id' });
        req.result.createObjectStore('photos');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  async function run(stores, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      const result = fn(tx);
      tx.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result);
      tx.onerror = () => reject(tx.error);
      // A full disk aborts the transaction without an error event.
      tx.onabort = () => reject(tx.error ?? new Error('The phone may be out of storage space.'));
    });
  }

  return {
    all: () => run('nodes', 'readonly', tx => tx.objectStore('nodes').getAll()),
    // Always an array.
    getPhotos: async id => {
      const v = await run('photos', 'readonly', tx => tx.objectStore('photos').get(id));
      return Array.isArray(v) ? v : v ? [v] : [];
    },
    // photos: array of full Blobs, or undefined to leave them unchanged.
    save: (node, photos) => run(['nodes', 'photos'], 'readwrite', tx => {
      tx.objectStore('nodes').put(node);
      if (photos) tx.objectStore('photos').put(photos, node.id);
    }),
    // Many nodes in ONE transaction. list: [{ node, photos }]
    saveMany: list => run(['nodes', 'photos'], 'readwrite', tx => {
      const nodes = tx.objectStore('nodes'), photos = tx.objectStore('photos');
      for (const { node, photos: p } of list) {
        nodes.put(node);
        if (p) photos.put(p, node.id);
      }
    }),
    // Nodes only (moves, renames): photos untouched.
    putMany: nodes => run('nodes', 'readwrite', tx => {
      const store = tx.objectStore('nodes');
      for (const n of nodes) store.put(n);
    }),
    removeMany: ids => run(['nodes', 'photos'], 'readwrite', tx => {
      for (const id of ids) {
        tx.objectStore('nodes').delete(id);
        tx.objectStore('photos').delete(id);
      }
    }),
  };
})();
