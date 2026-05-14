import type { Uovadipasqua } from "../../../types";

export const uovadipasqua: Uovadipasqua = {
  id: "chucknorris",
  repeatOnQuery: true,
  clientStorage: {
    localStorageKey: "degoog:uovadipasqua:chucknorris",
  },
  triggers: [
    { type: "search-query", pattern: "chuck norris" },
    { type: "search-query", pattern: "chuck norris off" },
  ],
};
