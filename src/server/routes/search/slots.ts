import { Hono, type Context } from "hono";
import {
  DEFAULT_SEARCH_TYPE,
  type ScoredResult,
  SlotPanelPosition,
} from "../../../shared/search-types";
import { EVENT_STREAM_MIME } from "../../../shared/event-stream";
import { SlotStreamEvent } from "../../../shared/slot-stream";
import { getLocale, readObjectBody } from "../../utils/hono";
import { getClientIp } from "../../utils/net/request";
import { eventStream } from "../../utils/net/event-stream";
import { _applyRateLimit } from "../../utils/search";
import {
  GLANCE_PENDING,
  isSlotPanel,
  settleSlotPlugins,
  type SlotOutcome,
  type SlotRunInput,
  type SlotRunOptions,
} from "../../extensions/slots/run";
import { publicBodyLimit } from "../_guards";
import { guardApiKey } from "../../utils/security/api-key-guard";
import { isSealedResult } from "../../utils/net/proxy-sign";

const router = new Hono();

type SlotBody = { query?: string; type?: string; results?: ScoredResult[] };

type OutcomeBody = (outcomes: SlotOutcome[]) => Record<string, unknown>;

const SLOT_CALLS_PER_SEARCH = 4;
const SLOT_STREAM_NS = "slots:stream";
const INVALID_JSON = { error: "Invalid JSON" };
const MISSING_RESULTS = { error: "Missing results" };
const MISSING_GLANCE_INPUT = { error: "Missing query or results" };

const _guardSlotCall = async (c: Context): Promise<Response | null> =>
  (await _applyRateLimit(c, "slots:", SLOT_CALLS_PER_SEARCH)) ??
  (await guardApiKey(c, "apiKeySearchEnabled"));

const _sealedResults = (body: SlotBody): ScoredResult[] | undefined =>
  Array.isArray(body.results) ? body.results.filter(isSealedResult) : undefined;

const _requestedType = (raw: unknown): string =>
  typeof raw === "string" && raw.trim() ? raw.trim() : DEFAULT_SEARCH_TYPE;

const _hasQuery = (body: SlotBody): boolean =>
  typeof body.query === "string" && body.query.trim() !== "";

const _badResults = (body: SlotBody): boolean =>
  "results" in body && !Array.isArray(body.results);

const _wantsStream = (c: Context): boolean =>
  (c.req.header("Accept") ?? "").includes(EVENT_STREAM_MIME);

const _runInput = (
  c: Context,
  body: SlotBody,
  options: SlotRunOptions,
): SlotRunInput => ({
  ...options,
  query: (body.query ?? "").trim(),
  clientIp: getClientIp(c),
  results: "results" in body ? _sealedResults(body) : undefined,
  locale: getLocale(c),
  searchType: _requestedType(body.type),
});

const _panelsBody: OutcomeBody = (outcomes) => ({
  panels: outcomes.filter(isSlotPanel),
});

const _glanceBody: OutcomeBody = (outcomes) => ({
  panels: outcomes.filter(isSlotPanel),
  pending: outcomes.includes(GLANCE_PENDING),
});

const _streamSlots = (c: Context, input: SlotRunInput | null): Response =>
  eventStream(c.req.raw.signal, SLOT_STREAM_NS, async (send, signal) => {
    let pending = false;
    if (input) {
      await settleSlotPlugins({ ...input, signal }, (outcome, order) => {
        if (outcome === GLANCE_PENDING) {
          if (!pending) send(SlotStreamEvent.Pending, {});
          pending = true;
        } else if (outcome) {
          send(SlotStreamEvent.Panel, { ...outcome, order });
        }
      });
    }
    send(SlotStreamEvent.Done, { pending });
  });

const _respond = async (
  c: Context,
  input: SlotRunInput | null,
  toBody: OutcomeBody,
): Promise<Response> => {
  if (_wantsStream(c)) return _streamSlots(c, input);
  return c.json(toBody(input ? await settleSlotPlugins(input) : []));
};

router.post("/api/slots", publicBodyLimit, async (c) => {
  const blocked = await _guardSlotCall(c);
  if (blocked) return blocked;
  const body = await readObjectBody<SlotBody>(c);
  if (!body) return c.json(INVALID_JSON, 400);
  if (!_hasQuery(body)) return _respond(c, null, _panelsBody);
  if (_badResults(body)) return c.json(MISSING_RESULTS, 400);
  return _respond(
    c,
    _runInput(c, body, { excludePosition: SlotPanelPosition.AtAGlance }),
    _panelsBody,
  );
});

router.post("/api/slots/glance", publicBodyLimit, async (c) => {
  const blocked = await _guardSlotCall(c);
  if (blocked) return blocked;
  const body = await readObjectBody<SlotBody>(c);
  if (!body) return c.json(INVALID_JSON, 400);
  if (!_hasQuery(body) || _badResults(body)) {
    return c.json(MISSING_GLANCE_INPUT, 400);
  }
  return _respond(c, _runInput(c, body, { glance: true }), _glanceBody);
});

export default router;
