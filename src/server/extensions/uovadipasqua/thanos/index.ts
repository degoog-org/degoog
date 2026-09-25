import type { Uovadipasqua } from "../../../types/extension";

export const uovadipasqua: Uovadipasqua = {
  id: "thanos",
  repeatOnQuery: false,
  triggers: [{ type: "search-query", pattern: "thanos" }],
  waitForResults: true,
};
