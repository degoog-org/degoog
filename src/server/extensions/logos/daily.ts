import { useCache } from "../../utils/cache/cache";
import { logger } from "../../utils/logger";
import { asBoolean } from "../../utils/settings/plugin-settings";
import { getInstanceSettings } from "../../utils/settings/server-settings";
import { SETTINGS_SCHEMA } from "../../utils/settings/settings-schema";
import { fetchLogoImage, fetchLogoManifest } from "./fetch";
import { parseManifestDay, type ManifestLogo } from "./manifest";

export const LOGO_DAY_STATUS = {
  OK: "ok",
  NONE: "none",
  FAILED: "failed",
} as const;

export interface StoredLogo extends ManifestLogo {
  commit: string;
  contentType: string;
}

export type LogoDay =
  | { status: typeof LOGO_DAY_STATUS.OK; logo: StoredLogo }
  | { status: typeof LOGO_DAY_STATUS.NONE }
  | { status: typeof LOGO_DAY_STATUS.FAILED };

export interface TodaysLogo {
  date: string;
  logo: StoredLogo;
}

export interface LogoImage {
  logo: StoredLogo;
  bytes: Uint8Array<ArrayBuffer>;
}

interface LoadedDay {
  day: LogoDay;
  image?: Uint8Array;
}

const CACHE_NAMESPACE = "logos";
const IMAGE_CACHE_NAMESPACE = "logos-image";
const DAY_MS = 24 * 60 * 60 * 1000;
const FAILURE_RETRY_MS = 60 * 60 * 1000;
const ROLLOVER_GRACE_MS = 60 * 60 * 1000;
const MIN_TTL_MS = 1000;
const FAILED_DAY: LogoDay = { status: LOGO_DAY_STATUS.FAILED };

const _days = useCache<LogoDay>(CACHE_NAMESPACE, DAY_MS);
const _images = useCache<string>(IMAGE_CACHE_NAMESPACE, DAY_MS);
const _inFlight = new Map<string, Promise<LogoDay>>();
let _mayHoldLogos = true;
let _decoded: { key: string; bytes: Uint8Array<ArrayBuffer> } | null = null;

export const logoDateKey = (now: Date = new Date()): string =>
  `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

export const msUntilTomorrow = (now: Date = new Date()): number => {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(MIN_TTL_MS, tomorrow.getTime() - now.getTime());
};

export const isDailyLogoEnabled = async (): Promise<boolean> => {
  const raw = (await getInstanceSettings()).logosEnabled;
  return raw === undefined || raw === ""
    ? SETTINGS_SCHEMA.logosEnabled.default
    : asBoolean(raw);
};

const _imageKey = (date: string, logo: StoredLogo): string => `${date}:${logo.id}:${logo.commit}`;

const _forgetLogos = async (): Promise<void> => {
  if (!_mayHoldLogos) return;
  _mayHoldLogos = false;
  _decoded = null;
  try {
    await Promise.all([_days.clear(), _images.clear()]);
  } catch (err) {
    logger.warn("logos", "could not drop the cached logos", err);
  }
};

export const enabledOrForgetLogos = async (): Promise<boolean> => {
  if (await isDailyLogoEnabled()) return true;
  await _forgetLogos();
  return false;
};

const _pickOne = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

const _loadDay = async (date: string): Promise<LoadedDay> => {
  try {
    const day = parseManifestDay(await fetchLogoManifest(), date);
    if (!day) throw new Error("manifest.json is not in the expected shape");
    if (!day.logos.length) return { day: { status: LOGO_DAY_STATUS.NONE } };
    const logo = _pickOne(day.logos);
    const image = await fetchLogoImage(day.commit, logo.image);
    return {
      day: {
        status: LOGO_DAY_STATUS.OK,
        logo: { ...logo, commit: day.commit, contentType: image.contentType },
      },
      image: image.bytes,
    };
  } catch (err) {
    logger.warn("logos", `could not load the logo for ${date}`, err);
    return { day: FAILED_DAY };
  }
};

const _keepsWorkingLogo = async (date: string, day: LogoDay): Promise<boolean> =>
  day.status === LOGO_DAY_STATUS.FAILED &&
  (await _days.get(date))?.status === LOGO_DAY_STATUS.OK;

const _remember = async (date: string, { day, image }: LoadedDay): Promise<LogoDay> => {
  if (!(await enabledOrForgetLogos())) return day;
  if (await _keepsWorkingLogo(date, day)) return day;
  const ttl =
    day.status === LOGO_DAY_STATUS.FAILED
      ? FAILURE_RETRY_MS
      : msUntilTomorrow() + ROLLOVER_GRACE_MS;
  _mayHoldLogos = true;
  if (day.status === LOGO_DAY_STATUS.OK && image) {
    await _images.set(_imageKey(date, day.logo), Buffer.from(image).toString("base64"), ttl);
  }
  await _days.set(date, day, ttl);
  return day;
};

const _fetchDay = (date: string): Promise<LogoDay> => {
  const running = _inFlight.get(date);
  if (running) return running;
  const task = _loadDay(date)
    .then((loaded) => _remember(date, loaded))
    .catch((err: unknown) => {
      logger.warn("logos", `could not store the logo for ${date}`, err);
      return FAILED_DAY;
    })
    .finally(() => _inFlight.delete(date));
  _inFlight.set(date, task);
  return task;
};

export const readLogoDay = (date: string = logoDateKey()): Promise<LogoDay | null> =>
  _days.get(date);

export const isLogoDayLoading = (date: string = logoDateKey()): boolean =>
  _inFlight.has(date);

export const todaysLogo = async (): Promise<TodaysLogo | null> => {
  if (!(await enabledOrForgetLogos())) return null;
  const date = logoDateKey();
  const day = await readLogoDay(date);
  if (!day) {
    void _fetchDay(date);
    return null;
  }
  return day.status === LOGO_DAY_STATUS.OK ? { date, logo: day.logo } : null;
};

export const readLogoImage = async (date: string, id: string): Promise<LogoImage | null> => {
  if (!(await enabledOrForgetLogos())) return null;
  const day = await readLogoDay(date);
  if (day?.status !== LOGO_DAY_STATUS.OK || day.logo.id !== id) return null;
  const key = _imageKey(date, day.logo);
  if (_decoded?.key === key) return { logo: day.logo, bytes: _decoded.bytes };
  const data = await _images.get(key);
  if (!data) return null;
  _decoded = { key, bytes: new Uint8Array(Buffer.from(data, "base64")) };
  return { logo: day.logo, bytes: _decoded.bytes };
};

export const refreshTodaysLogo = (): Promise<LogoDay> => _fetchDay(logoDateKey());
