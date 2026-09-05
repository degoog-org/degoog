import { logger } from "../../utils/logger";

export const PG_DEFAULT_PORT = 5432;
export const PG_DEFAULT_DATABASE = "degoog";
export const PG_DEFAULT_USER = "degoog";

export type PgSslMode = "require" | "allow" | "prefer" | "verify-full" | boolean;

export interface PgConnectionConfig {
  host: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: PgSslMode;
}

export type PgResolved =
  | { mode: "url"; url: string }
  | { mode: "config"; config: PgConnectionConfig }
  | { mode: "sqlite" };

const isSocketPath = (host: string): boolean => host.startsWith("/");

const parseSsl = (value: string | undefined): PgSslMode | undefined => {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  if (["require", "allow", "prefer", "verify-full"].includes(normalized)) {
    return normalized as PgSslMode;
  }
  logger.warn(
    "indexer",
    `unrecognized DEGOOG_POSTGRES_SSLMODE value "${value}", ignoring`,
  );
  return undefined;
};

let _resolved: PgResolved | null = null;

const _resolve = (): PgResolved => {
  const url = process.env.DEGOOG_POSTGRES;
  if (url) return { mode: "url", url };

  const host = process.env.DEGOOG_POSTGRES_HOST;
  if (!host) return { mode: "sqlite" };

  const socket = isSocketPath(host);
  const user = process.env.DEGOOG_POSTGRES_USER || PG_DEFAULT_USER;
  const database = process.env.DEGOOG_POSTGRES_DATABASE || PG_DEFAULT_DATABASE;
  const password = process.env.DEGOOG_POSTGRES_PASSWORD;

  if (!socket && !password) {
    logger.error(
      "indexer",
      "DEGOOG_POSTGRES_HOST is set but DEGOOG_POSTGRES_PASSWORD is missing, falling back to SQLite",
    );
    return { mode: "sqlite" };
  }

  const portRaw = process.env.DEGOOG_POSTGRES_PORT;
  const port = portRaw ? Number(portRaw) : PG_DEFAULT_PORT;
  if (Number.isNaN(port)) {
    logger.error(
      "indexer",
      `DEGOOG_POSTGRES_PORT "${portRaw}" is not a valid number, falling back to SQLite`,
    );
    return { mode: "sqlite" };
  }

  const ssl = parseSsl(process.env.DEGOOG_POSTGRES_SSLMODE);

  const config: PgConnectionConfig = {
    host,
    port,
    user,
    database,
    ...(password ? { password } : {}),
    ...(ssl !== undefined ? { ssl } : {}),
  };

  return { mode: "config", config };
};

export const resolvePgConfig = (): PgResolved => {
  if (!_resolved) _resolved = _resolve();
  return _resolved;
};

export const resetPgConfig = (): void => {
  _resolved = null;
};
