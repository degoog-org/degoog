import { randomBytes } from "crypto";

const ID_BYTES = 12;

const _ids = new Map<string, string>();

export const rosterIdFor = (url: string): string => {
  let id = _ids.get(url);
  if (!id) {
    id = randomBytes(ID_BYTES).toString("hex");
    _ids.set(url, id);
  }
  return id;
};

export const clearRoster = (): void => {
  _ids.clear();
};
