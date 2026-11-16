import { describe, expect, test } from "bun:test";
import { makeSettleWatch } from "../../src/server/search/engine-emit";

describe("makeSettleWatch", () => {
  test("settles once every other engine is done while an emitter is still running", () => {
    let fired = 0;
    const watch = makeSettleWatch(() => fired++);
    const emitter = watch.engine("emitter");
    const steady = watch.engine("steady");
    emitter.emitting();
    expect(fired).toBe(0);
    steady.done();
    expect(fired).toBe(1);
    emitter.done();
    expect(fired).toBe(1);
  });

  test("never settles when the emitter finishes before the others", () => {
    let fired = 0;
    const watch = makeSettleWatch(() => fired++);
    const emitter = watch.engine("emitter");
    const steady = watch.engine("steady");
    emitter.emitting();
    emitter.done();
    steady.done();
    expect(fired).toBe(0);
  });
});
