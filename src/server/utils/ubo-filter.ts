const HREF_PAYLOAD = /##.*href[*^$~|]?=(["'])(.*?)\1/;
const HOSTNAME = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

/** uBlock Origin filter list syntax */
export const isUboFilterLine = (line: string): boolean =>
  line.startsWith("!") || line.startsWith("@@") || line.includes("##");

export const uboLineToDomain = (line: string): string | null => {
  const match = HREF_PAYLOAD.exec(line);
  if (!match) return null;
  const payload = match[2].replace(/^\/+/, "").toLowerCase();
  if (payload.includes("/")) return null;
  return HOSTNAME.test(payload) ? payload : null;
};
