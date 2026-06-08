// Interview actions for Wasp.
//
// Interview sessions are persisted in the `InterviewSession` table rather than
// held in process memory, so they survive server restarts and work correctly
// when more than one server instance is running.
import type { StartInterview, SubmitAnswer, TranscribeAudio } from "wasp/server/operations";
import { HttpError } from "wasp/server";
import type { Prisma } from "@prisma/client";
import {
  generateInterviewQuestions,
  generateInterviewSummary,
  generateInterviewScore,
  transcribeAudioClip,
} from "./aiUtils";
import { createLogger } from "../server/logger";
import type {
  AnswerRecord,
  ApiResult,
  CandidateProfile,
  InterviewMode,
  InterviewQuestion,
  ReviewedAnswer,
  StartInterviewData,
  SubmitAnswerData,
} from "../shared/types";

const log = createLogger("interview");

// Voice mode halves the per-question time limit since speaking is faster than typing.
const VOICE_TIME_DIVISOR = 2;
const MIN_TIME_LIMIT = 10;
// Grace window (seconds) for network transit / speech-to-text latency.
const ON_TIME_GRACE = 5;

const errMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

// Our typed domain objects use optional properties that Prisma's strict
// `InputJsonValue` rejects; serialize through `unknown` to store them as JSON.
const toJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

const applyVoiceModeTiming = (
  questions: InterviewQuestion[],
  voiceMode: boolean
): InterviewQuestion[] => {
  if (!voiceMode) return questions;
  return questions.map((q) => ({
    ...q,
    originalTimeLimit: q.timeLimit,
    timeLimit: Math.max(MIN_TIME_LIMIT, Math.round(q.timeLimit / VOICE_TIME_DIVISOR)),
  }));
};

const normalizeSkills = (skills: CandidateProfile["skills"] | string): string[] => {
  if (Array.isArray(skills)) return skills.map((s) => s.trim()).filter(Boolean);
  return String(skills || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
};

// Start interview action — generates questions and persists a new session row.
export const startInterview: StartInterview<
  { profile: CandidateProfile; voiceMode?: boolean },
  ApiResult<StartInterviewData>
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, "You must be signed in to start an interview.");

  try {
    const { profile, voiceMode = false } = args;
    const normalizedProfile: CandidateProfile = {
      ...profile,
      skills: normalizeSkills(profile.skills),
    };

    const baseQuestions = await generateInterviewQuestions(normalizedProfile);
    const questions = applyVoiceModeTiming(baseQuestions, voiceMode);
    const mode: InterviewMode = voiceMode ? "voice" : "text";

    const session = await context.entities.InterviewSession.create({
      data: {
        userId: context.user.id,
        profile: toJson(normalizedProfile),
        questions: toJson(questions),
        answers: toJson([]),
        currentQuestionIndex: 0,
        status: "active",
        mode,
      },
    });

    const firstQuestion = questions[0];
    log.info(`session ${session.id} started`, { mode, questions: questions.length });

    return {
      success: true,
      message: "Interview started successfully",
      data: {
        sessionId: session.id,
        question: firstQuestion,
        questionNumber: 1,
        totalQuestions: questions.length,
        timeLimit: firstQuestion.timeLimit,
        questionStartTime: new Date().toISOString(),
        mode,
        status: "active",
      },
    };
  } catch (error) {
    log.error("failed to start interview", errMessage(error));
    if (error instanceof HttpError) throw error;
    throw new HttpError(500, "Failed to start interview");
  }
};

// Submit answer action.
//
// We always persist whatever answer text was captured. Late submissions
// (recording stopped on timeout, transcript still arriving) are still saved
// with the real timeTaken — we do NOT discard an answer just because the
// wall-clock crossed the limit. Only truly empty submissions are stored null.
export const submitAnswer: SubmitAnswer<
  { sessionId: string; answer: string; questionStartTime: number; timeLimit: number },
  ApiResult<SubmitAnswerData>
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, "You must be signed in.");

  try {
    const { sessionId, answer, questionStartTime, timeLimit } = args;

    const session = await context.entities.InterviewSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new HttpError(404, "Interview session not found");
    if (session.userId !== context.user.id) throw new HttpError(403, "Not your interview session");
    if (session.status !== "active") throw new HttpError(400, "Interview session is not active");

    const questions = session.questions as unknown as InterviewQuestion[];
    const answers = (session.answers as unknown as AnswerRecord[]) ?? [];
    const index = session.currentQuestionIndex;
    const currentQuestion = questions[index];

    const timeForThisQuestion = Math.max(0, Math.floor((Date.now() - questionStartTime) / 1000));
    const trimmed = (answer || "").trim();
    const wasOnTime = timeForThisQuestion <= timeLimit + ON_TIME_GRACE;

    log.debug(
      `session ${sessionId} q${index + 1}: len=${trimmed.length} ` +
        `time=${timeForThisQuestion}/${timeLimit}s onTime=${wasOnTime}`
    );

    answers.push({
      questionIndex: index,
      question: currentQuestion,
      answer: trimmed.length > 0 ? trimmed : null,
      timeTaken: trimmed.length > 0 ? timeForThisQuestion : null,
      timedOut: !wasOnTime,
    });

    const nextIndex = index + 1;

    if (nextIndex >= questions.length) {
      // Interview finished — score it, persist a TestResult, close the session.
      const [summary, scoreResult] = await Promise.all([
        generateInterviewSummary(answers),
        generateInterviewScore(answers),
      ]);
      const profile = session.profile as unknown as CandidateProfile;

      const reviewedAnswers: ReviewedAnswer[] = answers.map((a) => ({
        questionIndex: a.questionIndex,
        question: {
          text: a.question.question,
          level: a.question.difficulty,
          timeLimit: a.question.timeLimit,
        },
        answer: a.answer,
        timeTaken: a.timeTaken,
        timedOut: a.timedOut === true,
      }));

      await context.entities.TestResult.create({
        data: {
          userId: context.user.id,
          profileName: profile.name,
          profileEmail: profile.email,
          profilePhone: profile.phone || null,
          skills: normalizeSkills(profile.skills),
          answers: toJson(reviewedAnswers),
          summary,
          totalScore: scoreResult.score,
          status: "completed",
          mode: session.mode,
        },
      });

      await context.entities.InterviewSession.update({
        where: { id: sessionId },
        data: {
          answers: toJson(answers),
          currentQuestionIndex: nextIndex,
          status: "completed",
          completedAt: new Date(),
        },
      });

      return {
        success: true,
        message: "Interview completed successfully",
        data: {
          sessionId,
          status: "completed",
          totalQuestions: questions.length,
          answersSubmitted: answers.length,
        },
      };
    }

    await context.entities.InterviewSession.update({
      where: { id: sessionId },
      data: { answers: toJson(answers), currentQuestionIndex: nextIndex },
    });

    const nextQuestion = questions[nextIndex];
    return {
      success: true,
      message: "Answer submitted successfully",
      data: {
        sessionId,
        status: "active",
        question: nextQuestion,
        questionNumber: nextIndex + 1,
        totalQuestions: questions.length,
        questionStartTime: new Date().toISOString(),
      },
    };
  } catch (error) {
    log.error("failed to submit answer", errMessage(error));
    if (error instanceof HttpError) throw error;
    throw new HttpError(500, "Failed to submit answer");
  }
};

// Transcribe an audio clip recorded in the browser. The client sends a base64
// payload + mime type; we fan out across audio-capable Gemini models in aiUtils.
export const transcribeAudio: TranscribeAudio<
  { audioBase64: string; mimeType?: string },
  { success: boolean; transcript: string }
> = async (args) => {
  try {
    const { audioBase64, mimeType } = args;
    if (!audioBase64) return { success: false, transcript: "" };
    const transcript = await transcribeAudioClip(audioBase64, mimeType || "audio/webm");
    return { success: true, transcript };
  } catch (error) {
    log.error("transcription failed", errMessage(error));
    return { success: false, transcript: "" };
  }
};
