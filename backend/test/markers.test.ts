import { describe, expect, it } from "vitest";
import { validateMarkers } from "../src/admin/markers";

describe("validateMarkers", () => {
  it("accepts a consistent set and an empty one", () => {
    expect(validateMarkers({ introStartSec: 5, introEndSec: 80, creditsStartSec: 2400 }, 2700)).toBeNull();
    expect(validateMarkers({ introStartSec: null, introEndSec: null, creditsStartSec: null })).toBeNull();
  });
  it("rejects an intro that ends before it starts", () => {
    expect(validateMarkers({ introStartSec: 90, introEndSec: 90 })).toMatch(/after/);
  });
  it("needs both intro bounds", () => {
    expect(validateMarkers({ introStartSec: 5, introEndSec: null })).toMatch(/both/);
  });
  it("rejects credits before the intro ends or past the runtime", () => {
    expect(validateMarkers({ introStartSec: 5, introEndSec: 80, creditsStartSec: 60 })).toMatch(/after the intro/);
    expect(validateMarkers({ creditsStartSec: 3000 }, 2700)).toMatch(/past the end/);
  });
  it("rejects non-integers and negatives", () => {
    expect(validateMarkers({ introStartSec: -1, introEndSec: 5 })).toMatch(/whole number/);
    expect(validateMarkers({ creditsStartSec: 1.5 })).toMatch(/whole number/);
  });
});
