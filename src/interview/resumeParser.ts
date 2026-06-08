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
import type { ParsedResume } from "../shared/types";

const log = createLogger("resume");

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const PHONE_RE = /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;

// A broad dictionary of common technical skills for the deterministic fallback.
// The AI parser handles the long tail; this just guarantees a sensible baseline.
const SKILL_DICTIONARY = [
  "JavaScript", "TypeScript", "Python", "Java", "C\\+\\+", "C#", "Go", "Rust",
  "Ruby", "PHP", "Swift", "Kotlin", "Scala", "R", "MATLAB", "Dart",
  "React", "Next\\.js", "Angular", "Vue", "Svelte", "Node\\.js", "Express",
  "NestJS", "Django", "Flask", "FastAPI", "Spring", "Spring Boot", "Rails",
  "Laravel", "ASP\\.NET", "GraphQL", "REST", "gRPC", "tRPC",
  "HTML", "CSS", "Tailwind", "Sass", "Redux", "Zustand",
  "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "SQLite", "DynamoDB",
  "Prisma", "Cassandra", "Elasticsearch", "Kafka", "RabbitMQ",
  "Docker", "Kubernetes", "AWS", "Azure", "GCP", "Terraform", "Ansible",
  "Jenkins", "CI/CD", "Git", "GitHub Actions", "Linux", "Nginx",
  "TensorFlow", "PyTorch", "Pandas", "NumPy", "scikit-learn", "Keras",
  "Machine Learning", "Deep Learning", "NLP", "Computer Vision", "LLM",
  "Jest", "Vitest", "Cypress", "Playwright", "Selenium", "Mocha",
  "Agile", "Scrum", "Microservices", "WebSockets", "OAuth", "JWT",
];

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

/**
 * Deterministic, dependency-free resume parser. Used as a fallback and to
 * backfill contact details (email/phone) that regex extracts reliably.
 */
export const parseResumeRegex = (text: string): ParsedResume => {
  const email = text.match(EMAIL_RE)?.[0] ?? null;
  const phone = text.match(PHONE_RE)?.[0] ?? null;

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  // The candidate's name is conventionally the first non-empty line, as long
  // as it isn't an email/phone/section header.
  const firstLine = lines[0] ?? "";
  const looksLikeName =
    firstLine.length > 0 &&
    firstLine.length < 60 &&
    !EMAIL_RE.test(firstLine) &&
    !PHONE_RE.test(firstLine);
  const name = looksLikeName ? firstLine : null;

  const found = new Set<string>();
  for (const pattern of SKILL_DICTIONARY) {
    const re = new RegExp(`\\b${pattern}\\b`, "i");
    const match = text.match(re);
    if (match) found.add(match[0].replace(/\\/g, ""));
  }

  return {
    name,
    email,
    phone,
    skills: Array.from(found).slice(0, 20),
    experience: null,
    education: null,
    summary: null,
  };
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
