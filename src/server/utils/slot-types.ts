import {
  DEFAULT_SEARCH_TYPE,
  parseTypeList,
  slotRunsOn,
} from "../../shared/search-types";
import { SLOT_SEARCH_TYPES_KEY, type SlotPlugin } from "../types";
import { getSettings } from "./plugin-settings";

export const baseSlotTypes = (slot: SlotPlugin): string[] => {
  const declared = parseTypeList(slot.searchTypes);
  return declared.length > 0 ? declared : [DEFAULT_SEARCH_TYPE];
};

export const slotTypes = async (
  slot: SlotPlugin,
  settingsId: string,
): Promise<string[]> => {
  const raw = await getSettings(settingsId);
  const chosen = parseTypeList(raw[SLOT_SEARCH_TYPES_KEY]);
  return chosen.length > 0 ? chosen : baseSlotTypes(slot);
};

export const slotShowsOn = async (
  slot: SlotPlugin,
  settingsId: string,
  type: string,
): Promise<boolean> => slotRunsOn(await slotTypes(slot, settingsId), type);
