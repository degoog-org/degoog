import { randomBytes } from "crypto";
import { signData, verifyData } from "./server-key";

const NONCE_TTL_MS = 60 * 60 * 1000;

export const generateSearchNonce = (): { n: string; s: string } => {
  const ts = Date.now().toString(16).padStart(12, "0");
  const rand = randomBytes(16).toString("hex");
  const n = ts + rand;
  return { n, s: signData(n) };
};

export const verifySearchNonce = (n: string, s: string): boolean => {
  if (!verifyData(n, s)) return false;
  const ts = parseInt(n.slice(0, 12), 16);
  return !isNaN(ts) && Date.now() - ts < NONCE_TTL_MS;
};
