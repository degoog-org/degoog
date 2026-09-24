import { getBase } from "../../utils/net/base-url";
import { authHeaders, jsonHeaders } from "../../utils/net/request";
import { confirmModal } from "../../modules/modals/confirm-modal/confirm";
import { initFileUpload } from "../../utils/file-upload/file-upload";
import { flashError, flashSuccess } from "../shared/flash-msg";
import {
  BackupError,
  MAX_SETTINGS_BACKUP_BYTES,
} from "../../../shared/settings-backup";

const t = window.scopedT("core");

const REVOKE_DELAY_MS = 60_000;
const RELOAD_DELAY_MS = 900;
const JSON_TYPE = "application/json";
const TOO_LARGE_STATUS = 413;

const KEY = {
  Exporting: "settings-page.server.backup.exporting",
  Exported: "settings-page.server.backup.exported",
  ExportFailed: "settings-page.server.backup.export-failed",
  ExportTooLarge: "settings-page.server.backup.export-too-large",
  Importing: "settings-page.server.backup.importing",
  ImportButton: "settings-page.server.backup.import-button",
  ImportConfirm: "settings-page.server.backup.import-confirm",
  ImportFailed: "settings-page.server.backup.import-failed",
  ImportInvalid: "settings-page.server.backup.import-invalid",
  ImportEmpty: "settings-page.server.backup.import-empty",
  ImportTooLarge: "settings-page.server.backup.import-too-large",
  Imported: "settings-page.server.backup.imported",
  ImportedExtensions: "settings-page.server.backup.imported-extensions",
  ImportedPartial: "settings-page.server.backup.imported-partial",
  ImportedReloading: "settings-page.server.backup.imported-reloading",
} as const;

const ERROR_KEYS: Record<BackupError, string> = {
  [BackupError.TooLarge]: KEY.ImportTooLarge,
  [BackupError.InvalidJson]: KEY.ImportInvalid,
  [BackupError.Unrecognised]: KEY.ImportInvalid,
  [BackupError.Empty]: KEY.ImportEmpty,
  [BackupError.WriteFailed]: KEY.ImportFailed,
};

type ImportResponse = {
  applied?: number;
  instanceApplied?: number;
  reposAdded?: number;
  extensionsInstalled?: number;
  extensionsFailed?: string[];
  aliasesRestored?: number;
  shortcutsRestored?: number;
  failedStages?: string[];
  error?: string;
  code?: BackupError;
};
type ParsedFile =
  | { ok: true; backup: object }
  | { ok: false; reason: BackupError };

const _status = (text: string): void => {
  const el = document.getElementById("settings-backup-status");
  if (el) el.textContent = text;
};

const _fail = (messageKey: string): void => {
  _status(t(messageKey));
  flashError(t(messageKey));
};

const _fallbackFilename = (): string =>
  `degoog-settings-${new Date().toISOString().slice(0, 10)}.json`;

const _filenameFrom = (disposition: string | null, fallback: string): string => {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch (err) {
      console.debug("[settings] undecodable backup filename, using the plain one", err);
    }
  }
  return disposition?.match(/filename="([^"]+)"/i)?.[1] ?? fallback;
};

const _saveBlob = (blob: Blob, filename: string): void => {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(href);
  }, REVOKE_DELAY_MS);
};

const _bindExport = (getToken: () => string | null): void => {
  const btn = document.getElementById(
    "settings-backup-export",
  ) as HTMLButtonElement | null;
  if (!btn) return;

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    _status(t(KEY.Exporting));
    try {
      const res = await fetch(`${getBase()}/api/settings/export`, {
        headers: authHeaders(getToken),
      });
      if (res.status === TOO_LARGE_STATUS) {
        _fail(KEY.ExportTooLarge);
        return;
      }
      if (!res.ok) throw new Error(`export failed: ${res.status}`);
      const blob = await res.blob();
      const filename = _filenameFrom(
        res.headers.get("Content-Disposition"),
        _fallbackFilename(),
      );
      _saveBlob(
        blob.type ? blob : new Blob([blob], { type: JSON_TYPE }),
        filename,
      );
      _status(t(KEY.Exported));
      flashSuccess(t(KEY.Exported));
    } catch (err) {
      console.warn("[settings] settings export failed", err);
      _fail(KEY.ExportFailed);
    } finally {
      btn.disabled = false;
    }
  });
};

const _parseBackup = async (file: File): Promise<ParsedFile> => {
  if (file.size > MAX_SETTINGS_BACKUP_BYTES)
    return { ok: false, reason: BackupError.TooLarge };
  try {
    const parsed: unknown = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return { ok: false, reason: BackupError.Unrecognised };
    return { ok: true, backup: parsed };
  } catch (err) {
    console.debug("[settings] backup file is not JSON", err);
    return { ok: false, reason: BackupError.InvalidJson };
  }
};

const _keyFor = (code?: BackupError): string =>
  ERROR_KEYS[code as BackupError] ?? KEY.ImportFailed;

const _countFailed = (data: ImportResponse): number =>
  (data.failedStages?.length ?? 0) + (data.extensionsFailed?.length ?? 0);

const _importedText = (data: ImportResponse): string => {
  const count = String(data.applied ?? 0);
  const repos = data.reposAdded ?? 0;
  const extensions = data.extensionsInstalled ?? 0;
  const failed = _countFailed(data);
  if (failed > 0)
    return t(KEY.ImportedPartial, { count, failed: String(failed) });
  if (!repos && !extensions) return t(KEY.Imported, { count });
  return t(KEY.ImportedExtensions, {
    count,
    repos: String(repos),
    extensions: String(extensions),
  });
};

const _announce = (data: ImportResponse): void => {
  const text = _importedText(data);
  _status(text);
  if (_countFailed(data) > 0) flashError(text);
  else flashSuccess(t(KEY.ImportedReloading));
};

const _bindImport = (getToken: () => string | null): void => {
  const panel = document.getElementById("settings-server-backup");
  const btn = document.getElementById(
    "settings-backup-import",
  ) as HTMLButtonElement | null;
  if (!panel || !btn) return;

  const upload = initFileUpload(panel, (file) => {
    btn.disabled = !file;
    _status("");
  });
  if (!upload) return;

  btn.addEventListener("click", async () => {
    const file = upload.file();
    if (!file) return;

    const parsed = await _parseBackup(file);
    if (!parsed.ok) {
      _fail(ERROR_KEYS[parsed.reason]);
      return;
    }

    const confirmed = await confirmModal({
      title: t(KEY.ImportButton),
      message: t(KEY.ImportConfirm),
    });
    if (!confirmed) return;

    btn.disabled = true;
    _status(t(KEY.Importing));
    try {
      const res = await fetch(`${getBase()}/api/settings/import`, {
        method: "POST",
        headers: jsonHeaders(getToken),
        body: JSON.stringify(parsed.backup),
      });
      const data = (await res.json().catch(() => ({}))) as ImportResponse;
      if (!res.ok) {
        _fail(_keyFor(data.code));
        return;
      }
      upload.reset();
      _announce(data);
      if (_countFailed(data) === 0) {
        setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
      }
    } catch (err) {
      console.warn("[settings] settings import failed", err);
      _fail(KEY.ImportFailed);
    } finally {
      btn.disabled = !upload.file();
    }
  });
};

export const initBackupControls = (getToken: () => string | null): void => {
  _bindExport(getToken);
  _bindImport(getToken);
};
