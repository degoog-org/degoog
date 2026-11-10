import { mock } from "bun:test";

mock.module("../../src/server/extensions/logos/fetch", () => ({
  fetchLogoManifest: async () => ({ commit: "0000000", logos: {} }),
  fetchLogoImage: async () => {
    throw new Error("tests never download logos from dedoodles");
  },
}));
