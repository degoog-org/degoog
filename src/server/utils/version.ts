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
