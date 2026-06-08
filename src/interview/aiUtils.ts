// AI utilities for generating interview questions and summaries
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createLogger } from "../server/logger";
import type {
  AnswerRecord,
  CandidateProfile,
  Difficulty,
  InterviewQuestion,
  ParsedResume,
  ScoreBreakdown,
} from "../shared/types";

const log = createLogger("ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const CANDIDATE_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-1.5-pro",
  "gemini-pro"
];

const DEFAULT_QUESTION_FALLBACK: InterviewQuestion[] = [
  { question: "Tell me about yourself.", difficulty: "easy", timeLimit: 20 },
  { question: "What is a variable in JavaScript?", difficulty: "easy", timeLimit: 20 },
  { question: "Explain the difference between SQL and NoSQL databases.", difficulty: "medium", timeLimit: 60 },
  { question: "What is the event loop?", difficulty: "medium", timeLimit: 60 },
  { question: "Describe a challenging project you worked on.", difficulty: "hard", timeLimit: 120 },
  { question: "How would you design a simple API rate limiter?", difficulty: "hard", timeLimit: 120 }
];

const errMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

async function callModelsWithPrompt(prompt: string): Promise<{ modelName: string; text: string }> {
  for (const modelName of CANDIDATE_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = await response.text();
      return { modelName, text };
    } catch (err) {
      log.warn(`model ${modelName} failed`, errMessage(err));
    }
  }
  throw new Error("All candidate models failed or are not available for this API key.");
}

/** Strip markdown code fences that models sometimes wrap JSON in. */
export const stripCodeFences = (text: string): string =>
  text.replace(/```(?:json)?\n?/g, "").replace(/```\n?/g, "").trim();

// Transcribe a base64-encoded audio clip via Gemini's inline audio support.
// We try a few models because the same API key doesn't always have access
// to every audio-capable model — the first one that works wins.
const TRANSCRIBE_MODELS = [
  "gemini-2.5-flash",
  "gemini-1.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-pro"
];

const TRANSCRIBE_PROMPT =
  "You are a strict speech-to-text transcriber. Transcribe the user's spoken " +
  "answer in the audio clip exactly as they said it, in English. " +
  "Return ONLY the raw transcript text — no quotes, no markdown, no labels, " +
  "no commentary. If the clip is silent or unintelligible, return an empty string.";

export const transcribeAudioClip = async (
  base64Audio: string,
  mimeType: string = "audio/webm"
): Promise<string> => {
  if (!base64Audio || base64Audio.length < 100) {
    log.warn("transcribe: empty/short audio payload");
    return "";
  }

  const audioPart = {
    inlineData: { mimeType, data: base64Audio }
  };

  let lastErr: unknown = null;
  for (const modelName of TRANSCRIBE_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        { text: TRANSCRIBE_PROMPT },
        audioPart
      ]);
      const text = (await result.response.text()).trim();
      log.debug(`transcribe ok via ${modelName} (${text.length} chars)`);
      return text;
    } catch (err) {
      lastErr = err;
      log.warn(`transcribe: ${modelName} failed`, errMessage(err));
    }
  }
  log.error("transcribe: all models failed", errMessage(lastErr));
  return "";
};

export const generateInterviewQuestions = async (
  profile: CandidateProfile
): Promise<InterviewQuestion[]> => {
  const createPrompt = (prof: CandidateProfile) => {
    return `Based on this candidate profile:
Skills: ${prof.skills && Array.isArray(prof.skills) ? prof.skills.join(", ") : "MERN STACK"}
Experience: ${prof.experience || "Undergraduate"}
Education: ${prof.education || "Bachelor of technology"}

Generate exactly 6 progressive technical interview questions suitable for this candidate. The questions should be structured as follows:
- 2 "Easy" questions that can be answered within 20 seconds.
- 2 "Medium" questions that can be answered within 60 seconds.
- 2 "Hard" questions that can be answered within 120 seconds.

Return ONLY a raw JSON array of objects (no markdown, no backticks). Each object must have three keys:
1. "question": The text of the question.
2. "difficulty": A string ("Easy", "Medium", or "Hard").
3. "timeLimit": An integer representing the time limit in seconds (20, 60, or 120).

Example format:
[{"question":"...", "difficulty":"Easy", "timeLimit":20}, ...]`;
  };

  try {
    const prompt = createPrompt(profile);
    const { modelName, text } = await callModelsWithPrompt(prompt);

    const parsed: unknown = JSON.parse(stripCodeFences(text));
    return normalizeQuestions(parsed, modelName);
  } catch (error) {
    log.error("error generating AI questions", errMessage(error));
    return DEFAULT_QUESTION_FALLBACK;
  }
};

const VALID_DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

/** Validate + normalize a model's raw question JSON into typed questions. */
export const normalizeQuestions = (parsed: unknown, source = "model"): InterviewQuestion[] => {
  if (!Array.isArray(parsed)) {
    throw new Error(`${source} returned JSON that is not an array.`);
  }

  return parsed.map((item, idx): InterviewQuestion => {
    if (!item || typeof item !== "object") {
      throw new Error(`Item ${idx} is not an object in ${source} output.`);
    }
    const { question, difficulty, timeLimit } = item as Record<string, unknown>;
    if (!question || !difficulty || timeLimit === undefined || timeLimit === null) {
      throw new Error(
        `Missing keys in item ${idx} from ${source}. Required: question, difficulty, timeLimit`
      );
    }

    const normalizedDifficulty = String(difficulty).toLowerCase();
    const normalizedTimeLimit = Number(timeLimit);

    if (!VALID_DIFFICULTIES.includes(normalizedDifficulty as Difficulty)) {
      throw new Error(`Invalid difficulty in item ${idx} from ${source}.`);
    }
    if (![20, 60, 120].includes(normalizedTimeLimit)) {
      throw new Error(`Invalid timeLimit in item ${idx} from ${source}. Allowed: 20,60,120`);
    }

    return {
      question: String(question),
      difficulty: normalizedDifficulty as Difficulty,
      timeLimit: normalizedTimeLimit,
    };
  });
};

export const generateInterviewSummary = async (
  interviewResults: AnswerRecord[]
): Promise<string> => {
  const createSummaryPrompt = (results: AnswerRecord[]) => {
    const questionsAndAnswers = results
      .map((item) => {
        return `Question ${item.questionIndex + 1} (${item.question.difficulty}): ${item.question.question}
Answer: ${item.answer || "No answer provided"}
Time Taken: ${item.timeTaken ? `${item.timeTaken} seconds` : "N/A"}
Time Limit: ${item.question.timeLimit} seconds`;
      })
      .join("\n\n");

    return `Based on the following interview responses, generate a comprehensive summary:

${questionsAndAnswers}

Provide a detailed analysis including:
1. Overall performance assessment
2. Technical strengths demonstrated
3. Areas for improvement
4. Communication skills evaluation
5. Problem-solving approach

Return the summary in a clear, professional format suitable for interview feedback.`;
  };

  try {
    const prompt = createSummaryPrompt(interviewResults);
    const { text } = await callModelsWithPrompt(prompt);
    return stripCodeFences(text);
  } catch (error) {
    log.error("error generating interview summary", errMessage(error));
    return "Unable to generate interview summary. Please review the individual responses manually.";
  }
};

export const generateInterviewScore = async (
  interviewResults: AnswerRecord[]
): Promise<ScoreBreakdown> => {
  const createScorePrompt = (results: AnswerRecord[]) => {
    const questionsAndAnswers = results
      .map((item) => {
        return `Question ${item.questionIndex + 1} (${item.question.difficulty}): ${item.question.question}
Answer: ${item.answer || "No answer provided"}
Time Taken: ${item.timeTaken ? `${item.timeTaken} seconds` : "N/A"}
Time Limit: ${item.question.timeLimit} seconds`;
      })
      .join("\n\n");

    return `Based on the following interview responses, generate a numerical score from 0-100:

${questionsAndAnswers}

Consider the following factors when scoring:
1. Technical accuracy of answers
2. Completeness of responses
3. Time management (answers within time limits)
4. Clarity and communication
5. Problem-solving approach

Return ONLY a JSON object in this exact format (no markdown, no backticks):
{"score": [numerical value between 0-100], "rationale": "[brief explanation]"}`;
  };

  try {
    const prompt = createScorePrompt(interviewResults);
    const { text } = await callModelsWithPrompt(prompt);
    return parseScore(JSON.parse(stripCodeFences(text)));
  } catch (error) {
    log.error("error generating interview score", errMessage(error));
    return {
      score: 50,
      rationale: "Unable to generate an accurate score. This is a default value."
    };
  }
};

/** Validate + clamp a model's raw score JSON into a 0-100 breakdown. */
export const parseScore = (parsed: unknown): ScoreBreakdown => {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI response did not contain a valid score object.");
  }
  const obj = parsed as Record<string, unknown>;
  const scoreValue = Number(obj.score);
  if (!Number.isFinite(scoreValue)) {
    throw new Error("AI response did not contain a valid 'score' number.");
  }
  return {
    score: Math.max(0, Math.min(100, Math.round(scoreValue))),
    rationale: String(obj.rationale || obj.explanation || "No rationale provided."),
  };
};

// Cap resume text sent to the model — keeps us well within token limits while
// still covering the meaningful content of virtually every resume.
const MAX_RESUME_CHARS = 12000;

/**
 * Extract structured fields from raw resume text using Gemini.
 * Throws on failure so callers can fall back to deterministic parsing.
 */
export const parseResumeWithAI = async (text: string): Promise<ParsedResume> => {
  const prompt = `You are an expert technical recruiter parsing a candidate's resume.
Extract the candidate's details from the resume text below.

Return ONLY a raw JSON object (no markdown, no backticks) with EXACTLY these keys:
{
  "name": string | null,          // candidate's full name
  "email": string | null,
  "phone": string | null,
  "skills": string[],             // technical & professional skills, deduplicated, most relevant first, max 20
  "experience": string | null,    // short summary of seniority/years, e.g. "3 years as a Backend Engineer"
  "education": string | null,     // highest qualification, e.g. "B.Tech in Computer Science"
  "summary": string | null        // a concise 1-2 sentence professional summary
}

If a field cannot be determined, use null (or [] for skills). Do not invent data.

Resume text:
"""
${text.slice(0, MAX_RESUME_CHARS)}
"""`;

  const { text: raw } = await callModelsWithPrompt(prompt);
  return normalizeParsedResume(JSON.parse(stripCodeFences(raw)));
};

/** Coerce a model's raw resume JSON into a well-formed ParsedResume. */
export const normalizeParsedResume = (parsed: unknown): ParsedResume => {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Resume parse response was not a JSON object.");
  }
  const obj = parsed as Record<string, unknown>;
  const str = (v: unknown): string | null => {
    const s = typeof v === "string" ? v.trim() : "";
    return s.length > 0 ? s : null;
  };
  const skills = Array.isArray(obj.skills)
    ? Array.from(
        new Set(
          obj.skills
            .map((s) => (typeof s === "string" ? s.trim() : ""))
            .filter((s) => s.length > 0)
        )
      ).slice(0, 20)
    : [];

  return {
    name: str(obj.name),
    email: str(obj.email),
    phone: str(obj.phone),
    skills,
    experience: str(obj.experience),
    education: str(obj.education),
    summary: str(obj.summary),
  };
};
