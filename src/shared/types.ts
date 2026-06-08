// Shared domain types used across the client and server.
// Keeping these in one place keeps the interview pipeline type-safe end to end.

export type Difficulty = "easy" | "medium" | "hard";

export type InterviewMode = "text" | "voice";

export type SessionStatus = "active" | "completed" | "abandoned";

/** A single interview question as produced by the AI question generator. */
export interface InterviewQuestion {
  question: string;
  difficulty: Difficulty;
  /** Seconds the candidate has to answer (already adjusted for voice mode). */
  timeLimit: number;
  /** Original limit before any voice-mode adjustment, when applicable. */
  originalTimeLimit?: number;
}

/** Candidate details gathered from the resume + profile form. */
export interface CandidateProfile {
  name: string;
  email: string;
  phone?: string | null;
  skills: string[];
  experience?: string | null;
  education?: string | null;
  summary?: string | null;
}

/** A persisted answer to a single question. */
export interface AnswerRecord {
  questionIndex: number;
  question: InterviewQuestion;
  /** Null when the candidate submitted nothing. */
  answer: string | null;
  /** Seconds taken, or null for an empty submission. */
  timeTaken: number | null;
  timedOut: boolean;
}

/** Normalized shape returned to the results UI. */
export interface ReviewedAnswer {
  questionIndex: number;
  question: {
    text: string;
    level: Difficulty;
    timeLimit: number;
  };
  answer: string | null;
  timeTaken: number | null;
  timedOut: boolean;
}

/** Structured result of resume parsing. */
export interface ParsedResume {
  name: string | null;
  email: string | null;
  phone: string | null;
  skills: string[];
  experience: string | null;
  education: string | null;
  summary: string | null;
}

export interface MissingFields {
  name: boolean;
  email: boolean;
  phone: boolean;
  skills: boolean;
}

export interface ScoreBreakdown {
  score: number;
  rationale: string;
}

/** Envelope returned by the interview operations. */
export interface ApiResult<T> {
  success: boolean;
  message: string;
  data?: T;
}

export interface StartInterviewData {
  sessionId: string;
  question: InterviewQuestion;
  questionNumber: number;
  totalQuestions: number;
  timeLimit: number;
  questionStartTime: string;
  mode: InterviewMode;
  status: SessionStatus;
}

export interface SubmitAnswerData {
  sessionId: string;
  status: SessionStatus;
  question?: InterviewQuestion;
  questionNumber?: number;
  totalQuestions: number;
  questionStartTime?: string;
  answersSubmitted?: number;
}

export const DIFFICULTY_TIME_LIMITS: Record<Difficulty, number> = {
  easy: 20,
  medium: 60,
  hard: 120,
};
