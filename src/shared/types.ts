// Shared domain types used across the client and server.
// Keeping these in one place keeps the interview pipeline type-safe end to end.
//
// These are declared as `type` aliases (not `interface`s) on purpose: Wasp
// operation payloads must be SuperJSON-serializable, which requires an implicit
// string index signature that TypeScript only grants to object-literal type
// aliases, not to interfaces.

export type Difficulty = "easy" | "medium" | "hard";

export type InterviewMode = "text" | "voice";

export type SessionStatus = "active" | "completed" | "abandoned";

/** A single interview question as produced by the AI question generator. */
export type InterviewQuestion = {
  question: string;
  difficulty: Difficulty;
  /** Seconds the candidate has to answer (already adjusted for voice mode). */
  timeLimit: number;
  /** Original limit before any voice-mode adjustment, when applicable. */
  originalTimeLimit?: number;
};

/** Candidate details gathered from the resume + profile form. */
export type CandidateProfile = {
  name: string;
  email: string;
  phone?: string | null;
  skills: string[];
  experience?: string | null;
  education?: string | null;
  summary?: string | null;
};

/** A persisted answer to a single question. */
export type AnswerRecord = {
  questionIndex: number;
  question: InterviewQuestion;
  /** Null when the candidate submitted nothing. */
  answer: string | null;
  /** Seconds taken, or null for an empty submission. */
  timeTaken: number | null;
  timedOut: boolean;
};

/** Normalized shape returned to the results UI. */
export type ReviewedAnswer = {
  questionIndex: number;
  question: {
    text: string;
    level: Difficulty;
    timeLimit: number;
  };
  answer: string | null;
  timeTaken: number | null;
  timedOut: boolean;
};

/** Structured result of resume parsing. */
export type ParsedResume = {
  name: string | null;
  email: string | null;
  phone: string | null;
  skills: string[];
  experience: string | null;
  education: string | null;
  summary: string | null;
};

export type MissingFields = {
  name: boolean;
  email: boolean;
  phone: boolean;
  skills: boolean;
};

export type ScoreBreakdown = {
  score: number;
  rationale: string;
};

/**
 * Envelope returned by the interview operations. A discriminated union on
 * `success` so that a `success` check narrows `data` to a present value.
 * Operations throw `HttpError` for failures, but the failure arm keeps the
 * envelope honest for any future non-throwing path.
 */
export type ApiResult<T> =
  | { success: true; message: string; data: T }
  | { success: false; message: string };

export type StartInterviewData = {
  sessionId: string;
  question: InterviewQuestion;
  questionNumber: number;
  totalQuestions: number;
  timeLimit: number;
  questionStartTime: string;
  mode: InterviewMode;
  status: SessionStatus;
};

/**
 * Result of submitting an answer — discriminated on `status` because a
 * completed interview has no "next question" while an active one always does.
 */
export type SubmitAnswerData =
  | {
      status: "active";
      sessionId: string;
      question: InterviewQuestion;
      questionNumber: number;
      totalQuestions: number;
      questionStartTime: string;
    }
  | {
      status: "completed";
      sessionId: string;
      totalQuestions: number;
      answersSubmitted: number;
    };

export const DIFFICULTY_TIME_LIMITS: Record<Difficulty, number> = {
  easy: 20,
  medium: 60,
  hard: 120,
};
