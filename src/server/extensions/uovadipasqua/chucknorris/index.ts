import type { Uovadipasqua } from "../../../types";
import { outgoingFetch } from "../../../utils/outgoing";

const CHUCK_API = "https://api.chucknorris.io/jokes/random";

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
  routes: [
    {
      method: "get",
      path: "/joke",
      handler: async () => {
        const res = await outgoingFetch(CHUCK_API);
        if (!res.ok) return new Response(null, { status: 502 });
        const data = await res.json() as { value?: string };
        return Response.json({ value: data.value ?? null });
      },
    },
  ],
};
