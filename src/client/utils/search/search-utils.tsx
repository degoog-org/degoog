import { CommandGlance } from "./command-glance";
import {
  orderedChildren,
  placeByOrder,
  placeSlotPanel,
} from "../../modules/renderer/render-slots";
import { placeKnowledgePanel } from "../../modules/renderer/sidebar/render-sidebar";
import { isCurrentSearch, state } from "../../state";
import { getBase } from "../net/base-url";
import { searchAuthHeaders } from "../net/request";
import { clear, render } from "../../../shared/ui/tribute/dom";
import { SlotPanel as SlotPanelView } from "../../../shared/ui/components/search/slot-panel";
import {
  isImageSearchType,
  type ScoredResult,
  SlotPanelPosition,
} from "../../../shared/search-types";
import { EVENT_STREAM_MIME } from "../../../shared/event-stream";
import {
  type OrderedSlotPanel,
  type SlotStreamDone,
  SlotStreamEvent,
} from "../../../shared/slot-stream";
import { FetchEventStream } from "./streaming/fetch-event-stream";
import { runScriptsInContainer } from "./search-helpers";
import { SkeletonGlance } from "../../animations/skeleton/skeleton-glance";

const SLOTS_PATH = "/api/slots";
const GLANCE_PATH = "/api/slots/glance";

let glanceAbortController: AbortController | null = null;
let slotsAbortController: AbortController | null = null;
let knowledgePanels: OrderedSlotPanel[] = [];

interface SlotStreamHandlers {
  onPanel: (panel: OrderedSlotPanel) => void;
  onPending?: () => void;
}

const _skipSlotPanels = (type: string): boolean => isImageSearchType(type);

const _glanceBox = (): HTMLElement | null =>
  document.getElementById("at-a-glance");

export const currentKnowledgePanels = (): OrderedSlotPanel[] => [
  ...knowledgePanels,
];

function _keepKnowledgePanel(panel: OrderedSlotPanel): void {
  knowledgePanels = [
    ...knowledgePanels.filter((kept) => kept.order !== panel.order),
    panel,
  ].sort((a, b) => a.order - b.order);
}

export const abortGlancePanels = (): void => {
  if (glanceAbortController) {
    glanceAbortController.abort();
    glanceAbortController = null;
  }
};

export const abortSlotFetch = (): void => {
  if (slotsAbortController) {
    slotsAbortController.abort();
    slotsAbortController = null;
  }
};

export const abortSlotPanels = (): void => {
  abortSlotFetch();
  knowledgePanels = [];
};

const _slotRequestBody = (
  query: string,
  results?: ScoredResult[],
): Record<string, unknown> => {
  const base = { query: query.trim(), type: state.currentType };
  return results !== undefined ? { ...base, results } : base;
};

const _readSlotStream = (
  path: string,
  query: string,
  results: ScoredResult[] | undefined,
  signal: AbortSignal,
  { onPanel, onPending }: SlotStreamHandlers,
): Promise<SlotStreamDone | null> =>
  new Promise((resolve) => {
    const source = new FetchEventStream(`${getBase()}${path}`, {
      body: _slotRequestBody(query, results),
      headers: { ...searchAuthHeaders(), Accept: EVENT_STREAM_MIME },
      signal,
    });
    function finish(done: SlotStreamDone | null): void {
      source.close();
      resolve(done);
    }
    signal.addEventListener("abort", () => finish(null), { once: true });
    source.addEventListener(SlotStreamEvent.Panel, (e) =>
      onPanel(JSON.parse(e.data) as OrderedSlotPanel),
    );
    source.addEventListener(SlotStreamEvent.Pending, () => onPending?.());
    source.addEventListener(SlotStreamEvent.Done, (e) =>
      finish(JSON.parse(e.data) as SlotStreamDone),
    );
    source.addEventListener("error", () => finish(null));
  });

function _showGlanceSkeleton(): void {
  const glanceEl = _glanceBox();
  if (glanceEl && orderedChildren(glanceEl).length === 0) {
    render(<SkeletonGlance />, glanceEl);
  }
}

function _placeGlancePanel(panel: OrderedSlotPanel, placed: Set<Element>): void {
  const glanceEl = _glanceBox();
  if (!glanceEl) return;
  if (orderedChildren(glanceEl).length === 0) clear(glanceEl);
  const el = placeByOrder(
    glanceEl,
    <SlotPanelView title={panel.title} html={panel.html} />,
    panel.order,
  );
  if (!el) return;
  placed.add(el);
  runScriptsInContainer(el as HTMLElement);
}

function _sweepGlance(placed: Set<Element>): void {
  const glanceEl = _glanceBox();
  if (!glanceEl) return;
  if (placed.size === 0) {
    clear(glanceEl);
    return;
  }
  for (const child of Array.from(glanceEl.children)) {
    if (!placed.has(child)) glanceEl.removeChild(child);
  }
}

export async function streamGlancePanels(
  query: string,
  results?: ScoredResult[],
): Promise<void> {
  abortGlancePanels();
  if (results !== undefined && results.length === 0) {
    const glanceEl = _glanceBox();
    if (glanceEl) clear(glanceEl);
    return;
  }
  const controller = new AbortController();
  glanceAbortController = controller;
  const seq = state.searchSeq;
  const placed = new Set<Element>();
  const live = (): boolean =>
    isCurrentSearch(seq) && !_skipSlotPanels(state.currentType);
  await _readSlotStream(GLANCE_PATH, query, results, controller.signal, {
    onPanel: (panel) => {
      if (live()) _placeGlancePanel(panel, placed);
    },
    onPending: () => {
      if (live()) _showGlanceSkeleton();
    },
  });
  if (controller.signal.aborted || !live()) return;
  if (results !== undefined) _sweepGlance(placed);
}

function _placeStreamedPanel(panel: OrderedSlotPanel): void {
  if (panel.position !== SlotPanelPosition.KnowledgePanel) {
    placeSlotPanel(panel);
    return;
  }
  _keepKnowledgePanel(panel);
  placeKnowledgePanel(panel);
}

export async function streamSlotPanels(
  query: string,
  results?: ScoredResult[],
): Promise<void> {
  if (results === undefined) {
    abortSlotPanels();
    slotsAbortController = new AbortController();
  } else if (!slotsAbortController) {
    slotsAbortController = new AbortController();
  }
  const seq = state.searchSeq;
  await _readSlotStream(SLOTS_PATH, query, results, slotsAbortController.signal, {
    onPanel: (panel) => {
      if (!isCurrentSearch(seq) || _skipSlotPanels(state.currentType)) return;
      _placeStreamedPanel(panel);
    },
  });
}

export const buildCommandGlance = (cmdData: {
  type: string;
  results?: ScoredResult[];
}): JSX.Element | null => {
  if (cmdData.type !== "engine") return null;
  if (cmdData.results && cmdData.results.length > 0) {
    return (
      <CommandGlance
        snippet={cmdData.results[0].snippet}
        resultCount={cmdData.results.length}
      />
    );
  }
  return <CommandGlance resultCount={cmdData.results?.length ?? 0} />;
};
