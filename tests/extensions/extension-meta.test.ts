import { describe, test, expect } from "bun:test";
import { buildExtensionMeta } from "../../src/server/extensions/extension-meta";
import { ExtensionStoreType, type SettingField } from "../../src/server/types";

describe("buildExtensionMeta", () => {
  const schema: SettingField[] = [
    { key: "token", label: "Token", type: "text", secret: true },
    { key: "name", label: "Name", type: "text" },
  ];

  test("masks secret fields and keeps non-secret values", async () => {
    const meta = await buildExtensionMeta({
      id: "transport-foo",
      displayName: "Foo",
      description: "",
      type: ExtensionStoreType.Transport,
      schema,
      rawSettings: { token: "supersecret", name: "bar" },
      checkDocs: false,
    });
    expect(meta.settings.token).toBe("__SET__");
    expect(meta.settings.name).toBe("bar");
    expect(meta.configurable).toBe(true);
  });

  test("configurable is false when schema is empty", async () => {
    const meta = await buildExtensionMeta({
      id: "transport-bare",
      displayName: "Bare",
      description: "",
      type: ExtensionStoreType.Transport,
      schema: [],
      rawSettings: {},
      checkDocs: false,
    });
    expect(meta.configurable).toBe(false);
    expect(meta.extensionDocsAvailable).toBeUndefined();
  });

  test("preserves disabled flag and merges extra fields", async () => {
    const meta = await buildExtensionMeta({
      id: "interceptor-x",
      displayName: "X",
      description: "d",
      type: "interceptor",
      schema,
      rawSettings: { disabled: "true", name: "n" },
      checkDocs: false,
      extra: { source: "plugin", isClientExposed: true },
    });
    expect(meta.settings.disabled).toBe("true");
    expect(meta.source).toBe("plugin");
    expect(meta.isClientExposed).toBe(true);
  });
});
