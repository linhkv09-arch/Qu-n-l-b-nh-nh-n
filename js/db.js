/* ============================================================
 * db.js — Tầng lưu trữ dữ liệu bằng IndexedDB
 * Lưu toàn bộ bệnh nhân, lần khám, ca phẫu thuật và ảnh
 * ngay trên máy (trong trình duyệt), không cần internet.
 * ============================================================ */

const DB = (function () {
  const DB_NAME = "qlbn_tmh";
  const DB_VERSION = 1;
  const STORES = ["patients", "visits", "surgeries", "meta"];
  let _db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("patients")) {
          const s = db.createObjectStore("patients", { keyPath: "id" });
          s.createIndex("createdAt", "createdAt");
          s.createIndex("name", "name");
        }
        if (!db.objectStoreNames.contains("visits")) {
          const s = db.createObjectStore("visits", { keyPath: "id" });
          s.createIndex("patientId", "patientId");
          s.createIndex("date", "date");
          s.createIndex("followUpDate", "followUpDate");
        }
        if (!db.objectStoreNames.contains("surgeries")) {
          const s = db.createObjectStore("surgeries", { keyPath: "id" });
          s.createIndex("patientId", "patientId");
          s.createIndex("date", "date");
          s.createIndex("followUpDate", "followUpDate");
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      };
      req.onsuccess = function (e) {
        _db = e.target.result;
        resolve(_db);
      };
      req.onerror = function (e) {
        reject(e.target.error);
      };
    });
  }

  function tx(store, mode) {
    return open().then((db) => db.transaction(store, mode).objectStore(store));
  }

  function reqToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ---- Generic CRUD ----
  async function put(store, obj) {
    const os = await tx(store, "readwrite");
    await reqToPromise(os.put(obj));
    return obj;
  }

  async function get(store, id) {
    const os = await tx(store, "readonly");
    return reqToPromise(os.get(id));
  }

  async function del(store, id) {
    const os = await tx(store, "readwrite");
    return reqToPromise(os.delete(id));
  }

  async function all(store) {
    const os = await tx(store, "readonly");
    return reqToPromise(os.getAll());
  }

  async function byIndex(store, indexName, value) {
    const os = await tx(store, "readonly");
    const idx = os.index(indexName);
    return reqToPromise(idx.getAll(value));
  }

  async function clear(store) {
    const os = await tx(store, "readwrite");
    return reqToPromise(os.clear());
  }

  // ---- Meta (cấu hình nhỏ, vd: bộ đếm mã BN) ----
  async function getMeta(key, fallback) {
    const r = await get("meta", key);
    return r ? r.value : fallback;
  }
  async function setMeta(key, value) {
    return put("meta", { key, value });
  }

  // ---- Estimate storage usage ----
  async function estimate() {
    if (navigator.storage && navigator.storage.estimate) {
      try {
        return await navigator.storage.estimate();
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  return {
    open,
    put,
    get,
    del,
    all,
    byIndex,
    clear,
    getMeta,
    setMeta,
    estimate,
    STORES,
    DB_NAME,
  };
})();
