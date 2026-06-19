import type { AsyncTtlCache } from "../../../utils/cache";
import { logger } from "../../../utils/logger";

const NS = "transport:cookie-cache";

export const COOKIE_JAR_HEADER =
  "# Netscape HTTP Cookie File\n# Stored by Degoog transport cache\n\n";

export interface CurlStdoutParts {
  bodyText: string;
  status: number;
  cookieJarText: string | null;
}

export const emptyCookieJar = (): string => COOKIE_JAR_HEADER;

export const cookieJarFromCookieHeader = (
  origin: string,
  cookieHeader: string,
): string => {
  const parsed = new URL(origin);
  const secure = parsed.protocol === "https:" ? "TRUE" : "FALSE";
  const rows: string[] = [];

  for (const chunk of cookieHeader.split(";")) {
    const splitAt = chunk.indexOf("=");
    if (splitAt <= 0) continue;
    const name = chunk.slice(0, splitAt).trim();
    const value = chunk.slice(splitAt + 1).trim();
    if (!name) continue;
    rows.push(
      [parsed.hostname, "FALSE", "/", secure, "0", name, value].join("\t"),
    );
  }

  return `${COOKIE_JAR_HEADER}${rows.join("\n")}\n`;
};

export const appendCurlCookieStdoutDelimiters = (
  args: string[],
  statusDelimiter: string,
  cookieDelimiter: string,
): void => {
  args.push(
    "-b",
    "-",
    "-c",
    "-",
    "-w",
    `\n${statusDelimiter}%{http_code}\n${cookieDelimiter}\n`,
  );
};

export const parseCurlStdoutWithCookieJar = (
  stdout: string,
  statusDelimiter: string,
  cookieDelimiter: string,
): CurlStdoutParts => {
  let head = stdout;
  let cookieJarText: string | null = null;

  const cookieIdx = stdout.lastIndexOf(cookieDelimiter);
  if (cookieIdx >= 0) {
    head = stdout.slice(0, cookieIdx);
    cookieJarText = stdout
      .slice(cookieIdx + cookieDelimiter.length)
      .replace(/^\n/, "");
  }

  const statusIdx = head.lastIndexOf(statusDelimiter);
  if (statusIdx < 0) {
    return { bodyText: head, status: 502, cookieJarText };
  }

  const bodyText = head.slice(0, statusIdx).replace(/\n$/, "");
  const status = parseInt(head.slice(statusIdx + statusDelimiter.length), 10);

  return {
    bodyText,
    status: status >= 100 && status <= 599 ? status : 502,
    cookieJarText,
  };
};

export const getCookieJar = async (
  cache: AsyncTtlCache<string>,
  key: string,
): Promise<string> => {
  try {
    const jar = await cache.get(key);
    return jar ?? emptyCookieJar();
  } catch (error) {
    logger.warn(NS, `failed to read cookie jar key=${key}`, error);
    return emptyCookieJar();
  }
};

export const saveCookieJar = async (
  cache: AsyncTtlCache<string>,
  key: string,
  jar: string | null,
  ttlMs?: number,
): Promise<void> => {
  if (!jar) return;
  try {
    await cache.set(key, jar, ttlMs);
  } catch (error) {
    logger.warn(NS, `failed to write cookie jar key=${key}`, error);
  }
};
