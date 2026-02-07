// Interview actions for Wasp
import type { StartInterview, SubmitAnswer } from "wasp/server/operations";
import { HttpError } from "wasp/server";
import { generateInterviewQuestions, generateInterviewSummary, generateInterviewScore } from "./aiUtils";

// In-memory store for interview sessions (use Redis in production)
const interviewSessions = new Map<string, any>();

// Start interview action
export const startInterview: StartInterview<{ profile: any }, any> = async (args, context) => {
  try {
    const { profile } = args;
    const sessionId = Date.now().toString();

    // Generate all questions at the start
    const allQuestions = await generateInterviewQuestions(profile);

    // Create interview session
    const session = {
      sessionId,
      profile,
      questions: allQuestions,
      currentQuestionIndex: 0,
      answers: [],
      startTime: new Date(),
      status: 'active',
      userId: context.user?.id
    };

    // Store session
    interviewSessions.set(sessionId, session);

    // Return first question
    const firstQuestion = allQuestions[0];

    return {
      success: true,
      message: 'Interview started successfully',
      data: {
        sessionId,
        question: firstQuestion,
        questionNumber: 1,
        totalQuestions: allQuestions.length,
        timeLimit: firstQuestion.timeLimit,
        questionStartTime: new Date(),
        status: session.status
      }
    };

  } catch (error: any) {
    console.error('Error starting interview:', error);
    throw new HttpError(500, error.message || 'Failed to start interview');
  }
};

// Submit answer action
export const submitAnswer: SubmitAnswer<{ sessionId: string; answer: string; questionStartTime: number; timeLimit: number }, any> = async (args, context) => {
  try {
    const { sessionId, answer, questionStartTime, timeLimit } = args;

    const session = interviewSessions.get(sessionId);

    if (!session) {
      throw new HttpError(404, 'Interview session not found');
    }

    if (session.status !== 'active') {
      throw new HttpError(400, 'Interview session is not active');
    }

    const timeForthisQuestion = Math.floor((Date.now() - questionStartTime) / 1000);
    const currentQuestion = session.questions[session.currentQuestionIndex];
    
    // Save the answer only if it is submitted in time else save NULL
    if (timeForthisQuestion < timeLimit) {
      session.answers.push({
        questionIndex: session.currentQuestionIndex,
        question: currentQuestion,
        answer: answer,
        timeTaken: timeForthisQuestion
      });
    } else {
      session.answers.push({
        questionIndex: session.currentQuestionIndex,
        question: currentQuestion,
        answer: null,
        timeTaken: null
      });
    }

    // Move to next question
    session.currentQuestionIndex++;

    // Check if interview is complete
    if (session.currentQuestionIndex >= session.questions.length) {
      session.status = 'completed';
      session.endTime = new Date();
      
      const answerInfo = session.answers;
      const summary = await generateInterviewSummary(answerInfo);
      const profileDetails = session.profile;
      const scoreResult = await generateInterviewScore(answerInfo);
      const totalScore = scoreResult.score;
      const status = 'completed';

      const transformedAnswers = answerInfo.map((answer: any) => ({
        questionIndex: answer.questionIndex,
        question: {
          text: answer.question.question,
          level: answer.question.difficulty,
          timeLimit: answer.question.timeLimit
        },
        answer: answer.answer,
        timeTaken: answer.timeTaken
      }));

      // Save to database
      if (context.user) {
        await context.entities.TestResult.create({
          data: {
            userId: context.user.id,
            profileName: profileDetails.name,
            profileEmail: profileDetails.email,
            profilePhone: profileDetails.phone || null,
            skills: Array.isArray(profileDetails.skills) ? profileDetails.skills : profileDetails.skills.split(',').map((s: string) => s.trim()),
            answers: transformedAnswers,
            summary: summary,
            totalScore: totalScore,
            status: status
          }
        });
      }

      return {
        success: true,
        message: 'Interview completed successfully',
        data: {
          sessionId,
          status: 'completed',
          totalQuestions: session.questions.length,
          answersSubmitted: session.answers.length,
        }
      };
    }

    // Return next question
    const nextQuestion = session.questions[session.currentQuestionIndex];
    return {
      success: true,
      message: 'Answer submitted successfully',
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
    console.error('Error submitting answer:', error);
    throw new HttpError(500, error.message || 'Failed to submit answer');
  }
};
