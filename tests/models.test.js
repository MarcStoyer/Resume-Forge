import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { MODELS, MODEL_IDS, getModel, webSearchTool, relativeCost, DEFAULT_AI_SETTINGS } from "../src/lib/models.js";
import { setActiveModels, modelFor } from "../src/lib/models.js";

describe("model catalogue", () => {
  test("every model has an id, label and prices", () => {
    for (const m of MODELS) {
      assert.ok(m.id && m.label, `incomplete: ${JSON.stringify(m)}`);
      assert.equal(typeof m.inPrice, "number");
      assert.equal(typeof m.outPrice, "number");
    }
  });

  test("the defaults name real models", () => {
    for (const id of Object.values(DEFAULT_AI_SETTINGS)) {
      assert.ok(MODEL_IDS.includes(id), `default ${id} is not in the catalogue`);
    }
  });

  test("getModel falls back rather than returning undefined", () => {
    assert.ok(getModel("claude-does-not-exist").id);
  });

  test("Sonnet 5 is cheaper than the Sonnet 4.6 this app used to default to", () => {
    const s5 = getModel("claude-sonnet-5");
    const s46 = getModel("claude-sonnet-4-6");
    assert.ok(s5.inPrice < s46.inPrice && s5.outPrice < s46.outPrice);
  });
});

describe("webSearchTool", () => {
  test("uses the 2026 variant on models that support it", () => {
    assert.equal(webSearchTool("claude-sonnet-5").type, "web_search_20260209");
    assert.equal(webSearchTool("claude-opus-5").type, "web_search_20260209");
  });

  test("falls back to the original variant on Haiku 4.5", () => {
    // Sending the newer type to a model that doesn't accept it is a 400, so
    // this pairing has to track the selected model, not be hardcoded.
    assert.equal(webSearchTool("claude-haiku-4-5").type, "web_search_20250305");
  });
});

describe("relativeCost", () => {
  test("the default model costs 1x itself", () => {
    assert.equal(relativeCost(DEFAULT_AI_SETTINGS.writing), 1);
  });
  test("Haiku is cheaper and Opus dearer than the default", () => {
    assert.ok(relativeCost("claude-haiku-4-5") < 1);
    assert.ok(relativeCost("claude-opus-5") > 1);
  });
});

describe("active model registry", () => {
  test("resolves the configured model per tier", () => {
    setActiveModels({ extraction: "claude-haiku-4-5", writing: "claude-opus-5" });
    assert.equal(modelFor("extraction"), "claude-haiku-4-5");
    assert.equal(modelFor("writing"), "claude-opus-5");
  });

  test("an unknown tier falls back to the writing model", () => {
    setActiveModels({ writing: "claude-opus-5" });
    assert.equal(modelFor("nonsense"), "claude-opus-5");
  });

  test("a retired/unknown model id degrades to the default instead of being sent", () => {
    setActiveModels({ extraction: "claude-retired-9", writing: "claude-sonnet-5" });
    assert.equal(modelFor("extraction"), DEFAULT_AI_SETTINGS.extraction);
  });

  test("null settings reset to defaults", () => {
    setActiveModels(null);
    assert.equal(modelFor("writing"), DEFAULT_AI_SETTINGS.writing);
  });
});
