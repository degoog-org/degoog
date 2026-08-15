import { describe, expect, test } from "bun:test";
import { parseFieldOptionsResponse } from "../../src/client/modules/modals/settings-modal/options-field-parse";

describe("parseFieldOptionsResponse", () => {
  test("accepts an object with an options array and optional strings", () => {
    expect(
      parseFieldOptionsResponse({
        options: [
          { value: "gemma3:e2b" },
          { value: "qwen3:8b", label: "Qwen 3 8B" },
        ],
        notice: "2 models",
        value: "qwen3:8b",
      }),
    ).toEqual({
      options: [
        { value: "gemma3:e2b" },
        { value: "qwen3:8b", label: "Qwen 3 8B" },
      ],
      notice: "2 models",
      value: "qwen3:8b",
    });
  });

  test("keeps only entries with a string value and optional string label", () => {
    expect(
      parseFieldOptionsResponse({
        options: [
          { value: "ok" },
          { value: 1 },
          "bare",
          { value: "also", label: 2 },
          { value: "named", label: "Named" },
          null,
        ],
        notice: 12,
        value: ["nope"],
      }),
    ).toEqual({
      options: [{ value: "ok" }, { value: "named", label: "Named" }],
    });
  });

  test("rejects non-objects and payloads without an options array", () => {
    expect(parseFieldOptionsResponse(null)).toBeNull();
    expect(parseFieldOptionsResponse("nope")).toBeNull();
    expect(parseFieldOptionsResponse({ notice: "x" })).toBeNull();
    expect(parseFieldOptionsResponse({ options: { value: "x" } })).toBeNull();
  });
});
