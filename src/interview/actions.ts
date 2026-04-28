// Interview actions for Wasp
import type { StartInterview, SubmitAnswer, TranscribeAudio } from "wasp/server/operations";
import { HttpError } from "wasp/server";
import {
  generateInterviewQuestions,
  generateInterviewSummary,
  generateInterviewScore,
  transcribeAudioClip
} from "./aiUtils";

// In-memory store for interview sessions (use Redis in production)
const interviewSessions = new Map<string, any>();

// Voice mode halves the per-question time limit since speaking is faster than typing.
const VOICE_TIME_DIVISOR = 2;
const MIN_TIME_LIMIT = 10;

const applyVoiceModeTiming = (questions: any[], voiceMode: boolean) => {
  if (!voiceMode) return questions;
  return questions.map((q) => ({
    ...q,
    originalTimeLimit: q.timeLimit,
    timeLimit: Math.max(MIN_TIME_LIMIT, Math.round(q.timeLimit / VOICE_TIME_DIVISOR))
  }));
};

// Start interview action
export const startInterview: StartInterview<{ profile: any; voiceMode?: boolean }, any> = async (
  args,
  context
) => {
  try {
    const { profile, voiceMode = false } = args;
    const sessionId = Date.now().toString();

    const baseQuestions = await generateInterviewQuestions(profile);
    const allQuestions = applyVoiceModeTiming(baseQuestions, voiceMode);

    const session = {
      sessionId,
      profile,
      questions: allQuestions,
      currentQuestionIndex: 0,
      answers: [],
      startTime: new Date(),
      status: "active",
      mode: voiceMode ? "voice" : "text",
      userId: context.user?.id
    };

    interviewSessions.set(sessionId, session);

    const firstQuestion = allQuestions[0];

    console.log(
      `[startInterview] session=${sessionId} mode=${session.mode} questions=${allQuestions.length}`
    );

    return {
      success: true,
      message: "Interview started successfully",
      data: {
        sessionId,
        question: firstQuestion,
        questionNumber: 1,
        totalQuestions: allQuestions.length,
        timeLimit: firstQuestion.timeLimit,
        questionStartTime: new Date(),
        mode: session.mode,
        status: session.status
      }
    };
  } catch (error: any) {
    console.error("Error starting interview:", error);
    throw new HttpError(500, error.message || "Failed to start interview");
  }
};

// Submit answer action.
// IMPORTANT: We always persist whatever answer text was captured. Late submissions
// (recording stopped on timeout, transcript still arriving) are still saved with the
// real timeTaken — we do NOT discard the answer just because the wall-clock crossed
// the limit. Only truly empty submissions are stored as null.
export const submitAnswer: SubmitAnswer<
  { sessionId: string; answer: string; questionStartTime: number; timeLimit: number },
  any
> = async (args, context) => {
  try {
    const { sessionId, answer, questionStartTime, timeLimit } = args;

    const session = interviewSessions.get(sessionId);
    if (!session) throw new HttpError(404, "Interview session not found");
    if (session.status !== "active") throw new HttpError(400, "Interview session is not active");

    const timeForthisQuestion = Math.max(0, Math.floor((Date.now() - questionStartTime) / 1000));
    const currentQuestion = session.questions[session.currentQuestionIndex];
    const trimmed = (answer || "").trim();
    const wasOnTime = timeForthisQuestion <= timeLimit + 5; // 5s grace for transit/STT

    console.log(
      `[submitAnswer] session=${sessionId} q=${session.currentQuestionIndex + 1} ` +
        `len=${trimmed.length} time=${timeForthisQuestion}/${timeLimit}s onTime=${wasOnTime}`
    );

    session.answers.push({
      questionIndex: session.currentQuestionIndex,
      question: currentQuestion,
      answer: trimmed.length > 0 ? trimmed : null,
      timeTaken: trimmed.length > 0 ? timeForthisQuestion : null,
      timedOut: !wasOnTime
    });

    session.currentQuestionIndex++;

    if (session.currentQuestionIndex >= session.questions.length) {
      session.status = "completed";
      session.endTime = new Date();

      const answerInfo = session.answers;
      const summary = await generateInterviewSummary(answerInfo);
      const profileDetails = session.profile;
      const scoreResult = await generateInterviewScore(answerInfo);
      const totalScore = scoreResult.score;

      const transformedAnswers = answerInfo.map((a: any) => ({
        questionIndex: a.questionIndex,
        question: {
          text: a.question.question,
          level: a.question.difficulty,
          timeLimit: a.question.timeLimit
        },
        answer: a.answer,
        timeTaken: a.timeTaken,
        timedOut: a.timedOut === true
      }));

      if (context.user) {
        await context.entities.TestResult.create({
          data: {
            userId: context.user.id,
            profileName: profileDetails.name,
            profileEmail: profileDetails.email,
            profilePhone: profileDetails.phone || null,
            skills: Array.isArray(profileDetails.skills)
              ? profileDetails.skills
              : profileDetails.skills.split(",").map((s: string) => s.trim()),
            answers: transformedAnswers,
            summary,
            totalScore,
            status: "completed",
            mode: session.mode || "text"
          }
        });
      }

      return {
        success: true,
        message: "Interview completed successfully",
        data: {
          sessionId,
          status: "completed",
          totalQuestions: session.questions.length,
          answersSubmitted: session.answers.length
        }
      };
    }

    const nextQuestion = session.questions[session.currentQuestionIndex];
    return {
      success: true,
      message: "Answer submitted successfully",
      data: {
        sessionId,
        question: nextQuestion,
        questionNumber: session.currentQuestionIndex + 1,
        totalQuestions: session.questions.length,
        questionStartTime: new Date(),
        status: session.status
      }
    };
  } catch (error: any) {
    console.error("Error submitting answer:", error);
    throw new HttpError(500, error.message || "Failed to submit answer");
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
    if (!audioBase64) {
      return { success: false, transcript: "" };
    }
    const transcript = await transcribeAudioClip(audioBase64, mimeType || "audio/webm");
    return { success: true, transcript };
  } catch (error: any) {
    console.error("Error transcribing audio:", error?.message || error);
    return { success: false, transcript: "" };
  }
};
