import { describe, it, expect } from "vitest";
import { parseResumeRegex } from "../src/interview/resumeFields";

const SAMPLE = `Jane Doe
Senior Software Engineer
jane.doe@example.com | +1 (555) 123-4567

SKILLS
JavaScript, TypeScript, React, Node.js, PostgreSQL, Docker, AWS

EXPERIENCE
Built scalable services with Express and Kubernetes.`;

describe("parseResumeRegex", () => {
  it("extracts the email address", () => {
    expect(parseResumeRegex(SAMPLE).email).toBe("jane.doe@example.com");
  });

  it("extracts a phone number", () => {
    expect(parseResumeRegex(SAMPLE).phone).toBe("+1 (555) 123-4567");
  });

  it("uses the first line as the name", () => {
    expect(parseResumeRegex(SAMPLE).name).toBe("Jane Doe");
  });

  it("detects known technical skills", () => {
    const { skills } = parseResumeRegex(SAMPLE);
    expect(skills).toEqual(
      expect.arrayContaining(["TypeScript", "React", "Node.js", "PostgreSQL", "Docker", "AWS"])
    );
  });

  it("deduplicates skills and caps at 20", () => {
    const { skills } = parseResumeRegex("React React react REACT TypeScript");
    expect(skills.length).toBeLessThanOrEqual(20);
    const reactCount = skills.filter((s) => s.toLowerCase() === "react").length;
    expect(reactCount).toBe(1);
  });

  it("returns nulls for an empty résumé", () => {
    const result = parseResumeRegex("");
    expect(result.email).toBeNull();
    expect(result.phone).toBeNull();
    expect(result.name).toBeNull();
    expect(result.skills).toEqual([]);
  });

  it("does not treat an email-only first line as a name", () => {
    expect(parseResumeRegex("contact@me.com\nReal Name").name).toBeNull();
  });
});
