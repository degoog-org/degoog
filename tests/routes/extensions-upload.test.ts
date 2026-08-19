import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { ExtensionStoreType, type ExtensionMeta } from "../../src/server/types";

const ENGINES_MOD = "../../src/server/extensions/engines/registry";
const UPLOADS_MOD = "../../src/server/utils/plugin-uploads";

const UPLOAD_ID = "fake-upload-engine";
const UPLOAD_URL = `http://localhost/api/extensions/${UPLOAD_ID}/upload`;

const FAKE_META: ExtensionMeta = {
  id: UPLOAD_ID,
  displayName: "Fake upload engine",
  description: "",
  type: ExtensionStoreType.Engine,
  configurable: true,
  settings: {},
  settingsSchema: [
    {
      key: "logo",
      label: "Logo",
      type: "file",
      accept: ".png",
      minSizeKb: "1",
      maxSizeKb: "2",
    },
    {
      key: "anything",
      label: "Anything",
      type: "file",
    },
    {
      key: "colour",
      label: "Colour",
      type: "text",
    },
  ],
};

const enginesReal = { ...(await import(ENGINES_MOD)) };
const uploadsReal = { ...(await import(UPLOADS_MOD)) };

const SAVED_ENV_KEYS = [
  "DEGOOG_DANGEROUSLY_NO_PASSWORD",
  "DEGOOG_PUBLIC_INSTANCE",
  "DEGOOG_SETTINGS_PASSWORDS",
] as const;

const savedEnv = new Map<string, string | undefined>();
let router: { request: (req: Request | string) => Response | Promise<Response> };

const restoreEnv = (): void => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

const bytes = (kb: number): Uint8Array<ArrayBuffer> => new Uint8Array(kb * 1024).fill(1);

const upload = (form: FormData): Promise<Response> =>
  Promise.resolve(router.request(new Request(UPLOAD_URL, { method: "POST", body: form })));

const fileForm = (key: string, file: File): FormData => {
  const form = new FormData();
  form.set("key", key);
  form.set("file", file);
  return form;
};

const png = (kb: number): File =>
  new File([bytes(kb)], "logo.png", { type: "image/png" });

describe("POST /api/extensions/:id/upload", () => {
  beforeAll(async () => {
    for (const key of SAVED_ENV_KEYS) savedEnv.set(key, process.env[key]);
    delete process.env.DEGOOG_PUBLIC_INSTANCE;
    delete process.env.DEGOOG_SETTINGS_PASSWORDS;
    process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD = "true";

    mock.module(ENGINES_MOD, () => ({
      ...enginesReal,
      getEngineExtensionMeta: async () => [FAKE_META],
    }));
    mock.module(UPLOADS_MOD, () => ({
      ...uploadsReal,
      savePluginUpload: async (_id: string, name: string) => ({
        name,
        path: `/plugins/fake/uploads/${name}`,
      }),
    }));

    router = (await import("../../src/server/routes/extensions")).default;
  });

  afterAll(() => {
    mock.module(ENGINES_MOD, () => enginesReal);
    mock.module(UPLOADS_MOD, () => uploadsReal);
    restoreEnv();
  });

  test("rejects unauthenticated callers", async () => {
    process.env.DEGOOG_SETTINGS_PASSWORDS = "hunter2";
    delete process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD;
    try {
      const res = await upload(fileForm("logo", png(2)));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "You shall not pass!" });
    } finally {
      delete process.env.DEGOOG_SETTINGS_PASSWORDS;
      process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD = "true";
    }
  });

  test("rejects a body that is not form data", async () => {
    const res = await router.request(
      new Request(UPLOAD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid upload" });
  });

  test("rejects a missing key", async () => {
    const form = new FormData();
    form.set("file", png(2));
    const res = await upload(form);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing file or key" });
  });

  test("rejects a file field that is not a file", async () => {
    const form = new FormData();
    form.set("key", "logo");
    form.set("file", "not-a-file");
    const res = await upload(form);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing file or key" });
  });

  test("rejects an unknown extension", async () => {
    const res = await router.request(
      new Request("http://localhost/api/extensions/nope-engine/upload", {
        method: "POST",
        body: fileForm("logo", png(2)),
      }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Extension not found" });
  });

  test("rejects an unknown file field", async () => {
    const res = await upload(fileForm("colour", png(2)));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Unknown file field" });
  });

  test("rejects a file the field does not accept", async () => {
    const gif = new File([bytes(2)], "logo.gif", { type: "image/gif" });
    const res = await upload(fileForm("logo", gif));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "File type not allowed" });
  });

  test("rejects a file above the configured maximum", async () => {
    const res = await upload(fileForm("logo", png(3)));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "File exceeds 2 KB" });
  });

  test("rejects a file below the configured minimum", async () => {
    const tiny = new File([new Uint8Array(16)], "logo.png", { type: "image/png" });
    const res = await upload(fileForm("logo", tiny));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "File smaller than 1 KB" });
  });

  test("falls back to a hard maximum when the field has no limit", async () => {
    const big = new File([bytes(6 * 1024)], "huge.png", { type: "image/png" });
    const res = await upload(fileForm("anything", big));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "File exceeds 5120 KB" });
  });

  test("stores an accepted file", async () => {
    const res = await upload(fileForm("logo", png(2)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      path: "/plugins/fake/uploads/logo.png",
    });
  });
});
