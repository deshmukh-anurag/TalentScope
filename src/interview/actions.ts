// Interview actions for Wasp
import type { UploadResume, StartInterview, SubmitAnswer } from "wasp/server/operations";
import { HttpError } from "wasp/server";
import { generateInterviewQuestions, generateInterviewSummary, generateInterviewScore } from "./aiUtils";
import pdf from "pdf-parse";
import mammoth from "mammoth";

// In-memory store for interview sessions (use Redis in production)
const interviewSessions = new Map<string, any>();

// Parse resume data using regex patterns
const parseResumeData = (text: string) => {
  const extractedData: any = {
    name: null,
    email: null,
    phone: null,
    skills: [],
    summary: null,
  };

  // Extract email
  const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
  if (emailMatch) extractedData.email = emailMatch[0];

  // Extract phone
  const phoneMatch = text.match(/(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  if (phoneMatch) extractedData.phone = phoneMatch[0];

  // Extract name (usually first line or near contact info)
  const lines = text.split('\n').filter((line: string) => line.trim());
  if (lines.length > 0) {
    extractedData.name = lines[0].trim();
  }

  // Extract skills
  const skillsSection = text.match(/(?:skills|technologies|technical skills)[\s\S]*?(?=\n\n|\n[A-Z]|$)/i);
  if (skillsSection) {
    const skillsText = skillsSection[0];
    const skills = skillsText.match(/\b(?:JavaScript|Python|Java|React|Node\.js|HTML|CSS|SQL|MongoDB|Express|Angular|Vue|Docker|AWS|Git)\b/gi);
    if (skills) extractedData.skills = [...new Set(skills)];
  }

  return extractedData;
};

// Upload resume action
export const uploadResume: UploadResume<{ fileData: string; mimeType: string }, any> = async (args, context) => {
  try {
    const { fileData, mimeType } = args;
    
    if (!fileData || !mimeType) {
      throw new HttpError(400, "No file data provided");
    }

    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!allowedMimeTypes.includes(mimeType)) {
      throw new HttpError(400, "Invalid file format. Please upload PDF, DOC, or DOCX");
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(fileData, 'base64');
    
    let extractedText = '';
    
    if (mimeType === 'application/pdf') {
      const data = await pdf(buffer);
      extractedText = data.text;
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    }

    const parsedData = parseResumeData(extractedText);

    return {
      success: true,
      message: 'Resume parsed successfully',
      data: {
        extractedData: parsedData,
        missingFields: {
          name: !parsedData.name,
          email: !parsedData.email,
          phone: !parsedData.phone,
          skills: parsedData.skills.length === 0
        }
      }
    };

  } catch (error: any) {
    console.error('Error parsing resume:', error);
    throw new HttpError(500, error.message || 'Failed to parse resume');
  }
};

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
