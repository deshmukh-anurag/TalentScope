import { describe, it, expect } from "vitest";
import {
  stripCodeFences,
  normalizeQuestions,
  parseScore,
  normalizeParsedResume,
} from "../src/interview/aiUtils";

describe("stripCodeFences", () => {
  it("removes ```json fences", () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it("removes bare ``` fences", () => {
    expect(stripCodeFences("```\nhello\n```")).toBe("hello");
  });
  it("leaves unfenced text untouched", () => {
    expect(stripCodeFences("  plain  ")).toBe("plain");
  });
});

describe("normalizeQuestions", () => {
  it("normalizes valid questions and lowercases difficulty", () => {
    const result = normalizeQuestions([
      { question: "What is a closure?", difficulty: "Easy", timeLimit: 20 },
      { question: "Design a cache.", difficulty: "HARD", timeLimit: 120 },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].difficulty).toBe("easy");
    expect(result[1].difficulty).toBe("hard");
  });

  it("rejects non-array input", () => {
    expect(() => normalizeQuestions({})).toThrow();
  });

  it("rejects invalid time limits", () => {
    expect(() =>
      normalizeQuestions([{ question: "q", difficulty: "easy", timeLimit: 45 }])
    ).toThrow();
  });

  it("rejects unknown difficulty levels", () => {
    expect(() =>
      normalizeQuestions([{ question: "q", difficulty: "trivial", timeLimit: 20 }])
    ).toThrow();
  });
});

describe("parseScore", () => {
  it("rounds and keeps a valid score", () => {
    expect(parseScore({ score: 82.4, rationale: "good" })).toEqual({
      score: 82,
      rationale: "good",
    });
  });

  it("clamps scores above 100", () => {
    expect(parseScore({ score: 140 }).score).toBe(100);
  });

  it("clamps negative scores to 0", () => {
    expect(parseScore({ score: -5 }).score).toBe(0);
  });

  it("falls back to a default rationale", () => {
    expect(parseScore({ score: 50 }).rationale).toBe("No rationale provided.");
  });

  it("throws on a non-numeric score", () => {
    expect(() => parseScore({ score: "high" })).toThrow();
  });
});

describe("normalizeParsedResume", () => {
  it("trims, dedupes, and caps skills", () => {
    const result = normalizeParsedResume({
      name: "  Jane  ",
      email: "jane@x.com",
      skills: ["React", "react", " Node ", ""],
    });
    expect(result.name).toBe("Jane");
    expect(result.skills).toEqual(["React", "Node"]);
  });

  it("coerces empty strings to null", () => {
    const result = normalizeParsedResume({ name: "   ", email: "" });
    expect(result.name).toBeNull();
    expect(result.email).toBeNull();
    expect(result.skills).toEqual([]);
  });

  it("throws on non-object input", () => {
    expect(() => normalizeParsedResume("nope")).toThrow();
  });
});
