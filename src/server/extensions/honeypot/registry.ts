import type { Context } from "hono";

export interface HoneypotTrap {
  id: string;
  paths: string[];
  respond: (c: Context) => Response | Promise<Response>;
}

const _traps: HoneypotTrap[] = [];

export const registerTrap = (trap: HoneypotTrap): void => {
  _traps.push(trap);
};

export const getTraps = (): HoneypotTrap[] => [..._traps];
