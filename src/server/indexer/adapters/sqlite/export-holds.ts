import type { Database } from "bun:sqlite";
import { randomBytes } from "crypto";
import { logger } from "../../../utils/logger";
import { safeSlug } from "../../shared/safe-type";

const AUTO_CHECKPOINT_PAGES = 1000;
const HOLD_MAX_MS = 30 * 60_000;

interface ExportHold {
  type: string;
  since: number;
}

export const setAutoCheck = (db: Database, pages: number): void => {
  try {
    db.exec(`PRAGMA wal_autocheckpoint = ${pages}`);
  } catch (err) {
    logger.warn("indexer", `could not set wal_autocheckpoint to ${pages}`, err);
  }
};

export class ExportHolds {
  private readonly _holds = new Map<string, ExportHold>();

  constructor(private readonly _dbs: Map<string, Database>) {}

  isHeld(key: string): boolean {
    for (const hold of this._holds.values()) if (hold.type === key) return true;
    return false;
  }

  fold(key: string): void {
    const db = this._dbs.get(key);
    if (!db) return;
    try {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch (err) {
      logger.warn("indexer", `checkpoint failed for type=${key}`, err);
    }
  }

  release(id: string): void {
    const hold = this._holds.get(id);
    if (!hold) return;
    this._holds.delete(id);
    if (this.isHeld(hold.type)) return;
    const db = this._dbs.get(hold.type);
    if (!db) return;
    setAutoCheck(db, AUTO_CHECKPOINT_PAGES);
    this.fold(hold.type);
  }

  dropStale(): void {
    const cutoff = Date.now() - HOLD_MAX_MS;
    for (const [id, hold] of this._holds) {
      if (hold.since > cutoff) continue;
      logger.warn("indexer", `export hold on type=${hold.type} outlived its download`);
      this.release(id);
    }
  }

  hold(type: string): string {
    this.dropStale();
    const key = safeSlug(type);
    const first = !this.isHeld(key);
    const id = randomBytes(8).toString("hex");
    this._holds.set(id, { type: key, since: Date.now() });
    const db = this._dbs.get(key);
    if (db && first) {
      setAutoCheck(db, 0);
      this.fold(key);
    }
    return id;
  }

  touch(id: string): void {
    const hold = this._holds.get(id);
    if (hold) hold.since = Date.now();
  }

  checkpoint(type: string): void {
    this.dropStale();
    const key = safeSlug(type);
    if (this.isHeld(key)) return;
    this.fold(key);
  }

  dropType(key: string): void {
    for (const [id, hold] of this._holds) {
      if (hold.type === key) this._holds.delete(id);
    }
  }
}
