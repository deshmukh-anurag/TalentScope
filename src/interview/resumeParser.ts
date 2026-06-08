// Resume text extraction + parsing.
//
// Parsing is AI-first (see aiUtils.parseResumeWithAI) with a deterministic
// regex fallback so the flow degrades gracefully when the model is unavailable
// or returns nothing. The regex parser is also a pure function, which makes it
// straightforward to unit test.
import pdf from "pdf-parse";
import mammoth from "mammoth";
import fs from "fs";
import { createLogger } from "../server/logger";
import { parseResumeWithAI } from "./aiUtils";
import { parseResumeRegex } from "./resumeFields";
import type { ParsedResume } from "../shared/types";

const log = createLogger("resume");

export const extractTextFromFile = async (
  filePath: string,
  mimetype: string
): Promise<string> => {
  if (mimetype === "application/pdf") {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    return data.text;
  }
  if (
    mimetype ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }
  throw new Error(`Unsupported file type: ${mimetype}`);
};

const errMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/**
 * Parse a resume's text. Prefers the AI parser and backfills any missing
 * fields with the deterministic parser; falls back entirely to regex if the
 * AI call fails.
 */
export const parseResume = async (text: string): Promise<ParsedResume> => {
  const regex = parseResumeRegex(text);
  try {
    const ai = await parseResumeWithAI(text);
    return {
      name: ai.name || regex.name,
      email: ai.email || regex.email,
      phone: ai.phone || regex.phone,
      skills: ai.skills.length > 0 ? ai.skills : regex.skills,
      experience: ai.experience || regex.experience,
      education: ai.education || regex.education,
      summary: ai.summary || regex.summary,
    };
  } catch (err) {
    log.warn("AI resume parse failed; using regex fallback", errMessage(err));
    return regex;
  }
};
