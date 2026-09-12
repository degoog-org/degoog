import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { resolvePgConfig, resetPgConfig } from "../../src/server/indexer/db/pg-config";

const PG_ENV_KEYS = [
  "DEGOOG_POSTGRES",
  "DEGOOG_POSTGRES_HOST",
  "DEGOOG_POSTGRES_PORT",
  "DEGOOG_POSTGRES_USER",
  "DEGOOG_POSTGRES_PASSWORD",
  "DEGOOG_POSTGRES_DATABASE",
  "DEGOOG_POSTGRES_SSLMODE",
];

const originalEnv: Record<string, string | undefined> = {};
for (const key of PG_ENV_KEYS) originalEnv[key] = process.env[key];

const clearPgEnv = (): void => {
  for (const key of PG_ENV_KEYS) delete process.env[key];
  resetPgConfig();
};

beforeEach(clearPgEnv);

afterAll(() => {
  for (const key of PG_ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe("resolvePgConfig", () => {
  test("falls back to sqlite when nothing is set", () => {
    expect(resolvePgConfig()).toEqual({ mode: "sqlite" });
  });

  test("full url takes precedence over discrete vars", () => {
    process.env.DEGOOG_POSTGRES =
      "postgresql://degoog:changeme@degoog-postgres:5432/degoog";
    process.env.DEGOOG_POSTGRES_HOST = "some-other-host";
    process.env.DEGOOG_POSTGRES_PASSWORD = "irrelevant";

    const resolved = resolvePgConfig();
    expect(resolved).toEqual({
      mode: "url",
      url: "postgresql://degoog:changeme@degoog-postgres:5432/degoog",
    });
  });

  test("host-only path resolves to a config with defaults", () => {
    process.env.DEGOOG_POSTGRES_HOST = "cnpg-rw.svc.cluster.local";
    process.env.DEGOOG_POSTGRES_PASSWORD = "hunter2";

    const resolved = resolvePgConfig();
    expect(resolved).toEqual({
      mode: "config",
      config: {
        host: "cnpg-rw.svc.cluster.local",
        port: 5432,
        user: "degoog",
        database: "degoog",
        password: "hunter2",
        ssl: "require",
      },
    });
  });

  test("discrete vars override individual defaults", () => {
    process.env.DEGOOG_POSTGRES_HOST = "pg.internal";
    process.env.DEGOOG_POSTGRES_PORT = "6543";
    process.env.DEGOOG_POSTGRES_USER = "custom-user";
    process.env.DEGOOG_POSTGRES_DATABASE = "custom-db";
    process.env.DEGOOG_POSTGRES_PASSWORD = "secret";

    const resolved = resolvePgConfig();
    expect(resolved).toEqual({
      mode: "config",
      config: {
        host: "pg.internal",
        port: 6543,
        user: "custom-user",
        database: "custom-db",
        password: "secret",
        ssl: "require",
      },
    });
  });

  test("rejects a tcp host without a password", () => {
    process.env.DEGOOG_POSTGRES_HOST = "pg.internal";

    expect(() => resolvePgConfig()).toThrow("DEGOOG_POSTGRES_PASSWORD");
  });

  test("rejects a non-numeric port", () => {
    process.env.DEGOOG_POSTGRES_HOST = "pg.internal";
    process.env.DEGOOG_POSTGRES_PASSWORD = "secret";
    process.env.DEGOOG_POSTGRES_PORT = "not-a-port";

    expect(() => resolvePgConfig()).toThrow("DEGOOG_POSTGRES_PORT");
  });

  test("percent-unsafe characters in the password pass through untouched in config mode", () => {
    process.env.DEGOOG_POSTGRES_HOST = "pg.internal";
    process.env.DEGOOG_POSTGRES_PASSWORD = "p@ss:w/o?r#d";

    const resolved = resolvePgConfig();
    expect(resolved.mode).toBe("config");
    if (resolved.mode === "config") {
      expect(resolved.config.password).toBe("p@ss:w/o?r#d");
    }
  });

  test("unix socket host does not require a password", () => {
    process.env.DEGOOG_POSTGRES_HOST = "/var/run/postgresql";

    const resolved = resolvePgConfig();
    expect(resolved).toEqual({
      mode: "config",
      config: {
        host: "/var/run/postgresql",
        port: 5432,
        user: "degoog",
        database: "degoog",
      },
    });
  });

  test("unix socket host still accepts a password if provided", () => {
    process.env.DEGOOG_POSTGRES_HOST = "/var/run/postgresql";
    process.env.DEGOOG_POSTGRES_PASSWORD = "secret";

    const resolved = resolvePgConfig();
    expect(resolved).toEqual({
      mode: "config",
      config: {
        host: "/var/run/postgresql",
        port: 5432,
        user: "degoog",
        database: "degoog",
        password: "secret",
      },
    });
  });

  test("recognizes a boolean sslmode value", () => {
    process.env.DEGOOG_POSTGRES_HOST = "pg.internal";
    process.env.DEGOOG_POSTGRES_PASSWORD = "secret";
    process.env.DEGOOG_POSTGRES_SSLMODE = "true";

    const resolved = resolvePgConfig();
    expect(resolved.mode).toBe("config");
    if (resolved.mode === "config") {
      expect(resolved.config.ssl).toBe(true);
    }
  });

  test("recognizes a named sslmode value", () => {
    process.env.DEGOOG_POSTGRES_HOST = "pg.internal";
    process.env.DEGOOG_POSTGRES_PASSWORD = "secret";
    process.env.DEGOOG_POSTGRES_SSLMODE = "require";

    const resolved = resolvePgConfig();
    expect(resolved.mode).toBe("config");
    if (resolved.mode === "config") {
      expect(resolved.config.ssl).toBe("require");
    }
  });

  test("ignores an unrecognized sslmode value", () => {
    process.env.DEGOOG_POSTGRES_HOST = "pg.internal";
    process.env.DEGOOG_POSTGRES_PASSWORD = "secret";
    process.env.DEGOOG_POSTGRES_SSLMODE = "nonsense";

    const resolved = resolvePgConfig();
    expect(resolved.mode).toBe("config");
    if (resolved.mode === "config") {
      expect(resolved.config.ssl).toBe("require");
    }
  });

  test("rejects insecure named sslmode values", () => {
    process.env.DEGOOG_POSTGRES_HOST = "pg.internal";
    process.env.DEGOOG_POSTGRES_PASSWORD = "secret";
    process.env.DEGOOG_POSTGRES_SSLMODE = "prefer";

    expect(() => resolvePgConfig()).toThrow("not secure enough");
  });

  test("rejects false sslmode", () => {
    process.env.DEGOOG_POSTGRES_HOST = "pg.internal";
    process.env.DEGOOG_POSTGRES_PASSWORD = "secret";
    process.env.DEGOOG_POSTGRES_SSLMODE = "false";

    expect(() => resolvePgConfig()).toThrow("not secure enough");
  });
});
