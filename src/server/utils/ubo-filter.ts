const HREF_PAYLOAD = /##.*\[\s*href[*^$~|]?=(["'])(.*?)\1/;
const HOSTNAME = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const NETWORK_HOST = /^\|\|([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})\^(?:\$[^\s]+)?$/i;

/** uBlock Origin filter list syntax */
export const isUboFilterLine = (line: string): boolean =>
  line.startsWith("!") ||
  line.startsWith("@@") ||
  line.includes("##") ||
  NETWORK_HOST.test(line);

export const uboLineToDomain = (line: string): string | null => {
  const networkHost = NETWORK_HOST.exec(line);
  if (networkHost) return networkHost[1].toLowerCase();

  const match = HREF_PAYLOAD.exec(line);
  if (!match) return null;
  const payload = match[2].replace(/^\/+/, "").toLowerCase();
  if (payload.includes("/")) return null;
  return HOSTNAME.test(payload) ? payload : null;
};
