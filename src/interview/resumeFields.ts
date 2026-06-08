// Pure, dependency-free résumé field extraction.
//
// Kept separate from resumeParser.ts (which pulls in pdf-parse / mammoth) so it
// can be imported and unit-tested without those heavy, side-effecting modules.
import type { ParsedResume } from "../shared/types";

export const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
export const PHONE_RE = /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;

// A broad dictionary of common technical skills for the deterministic fallback.
// The AI parser handles the long tail; this just guarantees a sensible baseline.
export const SKILL_DICTIONARY = [
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

/**
 * Deterministic résumé parser. Used as a fallback and to backfill contact
 * details (email/phone) that regex extracts reliably.
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
