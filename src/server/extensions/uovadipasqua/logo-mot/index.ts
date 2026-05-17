import type { Uovadipasqua } from "../../../types";

export const uovadipasqua: Uovadipasqua = {
  id: "logo-mot",
  repeatOnQuery: true,
  clientStorage: {
    localStorageKey: "degoog:uovadipasqua:logo-mot",
  },
  triggers: [
    { type: "search-query", pattern: "animateme" },
    { type: "search-query", pattern: "animateme off" },
  ],
};
