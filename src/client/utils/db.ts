import { DB_NAME, DB_VERSION, STORE_NAME } from "../constants";

const _deleteDB = (): Promise<void> =>
  new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });

const _openOnce = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("idb open blocked"));
  });

const _openDB = async (): Promise<IDBDatabase> => {
  let db = await _openOnce();
  if (!db.objectStoreNames.contains(STORE_NAME)) {
    db.close();
    await _deleteDB();
    db = await _openOnce();
  }
  return db;
};

const _runTx = async <T>(
  mode: IDBTransactionMode,
  exec: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> => {
  try {
    const db = await _openDB();
    return await new Promise<T | null>((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const req = exec(store);
        req.onsuccess = () => resolve((req.result as T) ?? null);
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  } catch {
    return null;
  }
};

export const idbGet = <T>(key: string): Promise<T | null> =>
  _runTx<T>("readonly", (store) => store.get(key) as IDBRequest<T>);

export const idbSet = async (key: string, value: unknown): Promise<void> => {
  await _runTx<undefined>(
    "readwrite",
    (store) => store.put(value, key) as unknown as IDBRequest<undefined>,
  );
};
