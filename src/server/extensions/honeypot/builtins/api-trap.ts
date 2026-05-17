import { registerTrap } from "../registry";
import { FAKE_RESULTS_JSON } from "../../../../shared/fake-results";

registerTrap({
  id: "api",
  paths: [
    "/api/degoog-search",
    "/api/supersearch",
    "/api/allengines",
    "/api/searchengines",
  ],
  respond: () =>
    new Response(FAKE_RESULTS_JSON, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }),
});
