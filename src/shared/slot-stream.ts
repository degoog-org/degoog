import type { SlotPanel } from "./search-types";

export enum SlotStreamEvent {
  Panel = "panel",
  Pending = "pending",
  Done = "done",
}

export type OrderedSlotPanel = SlotPanel & { order: number };

export interface SlotStreamDone {
  pending: boolean;
}
