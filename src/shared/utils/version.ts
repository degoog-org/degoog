import appPkg from "../../../package.json";

const _parseSemver = (v: string): [number, number, number] => {
  const clean = v.split("-")[0] ?? "";
  const parts = clean.split(".").map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
};

export const getAppVersion = (): string => appPkg.version.split("-")[0] ?? "";

export const isVersionAtLeast = (current: string, required: string): boolean => {
  const [cMaj, cMin, cPatch] = _parseSemver(current);
  const [rMaj, rMin, rPatch] = _parseSemver(required);
  if (cMaj !== rMaj) return cMaj > rMaj;
  if (cMin !== rMin) return cMin > rMin;
  return cPatch >= rPatch;
};

const _parseDev = (v: string): number | null => {
  const idx = v.indexOf("-dev");
  if (idx === -1) return null;
  const tail = v.slice(idx + 4).replace(/^[-.]/, "");
  const n = parseFloat(tail);
  return Number.isFinite(n) ? n : 0;
};

export const compareVersions = (a: string, b: string): number => {
  const bSemver = _parseSemver(b);
  const base = _parseSemver(a).map((x, i) => x - bSemver[i]);
  const diff = base.find((d) => d !== 0);
  if (diff !== undefined) return diff > 0 ? 1 : -1;

  const aDev = _parseDev(a);
  const bDev = _parseDev(b);
  if (aDev === null && bDev === null) return 0;
  if (aDev === null) return 1;
  if (bDev === null) return -1;
  return aDev === bDev ? 0 : aDev > bDev ? 1 : -1;
};

export const isUpdateAvailable = (current: string, newest: string): boolean =>
  compareVersions(newest, current) > 0;
