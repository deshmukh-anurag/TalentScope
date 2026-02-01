// AI utilities for generating interview questions and summaries
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const CANDIDATE_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-1.5-pro",
  "gemini-pro"
];

const DEFAULT_QUESTION_FALLBACK = [
  { question: "Tell me about yourself.", difficulty: "easy", timeLimit: 20 },
  { question: "What is a variable in JavaScript?", difficulty: "easy", timeLimit: 20 },
  { question: "Explain the difference between SQL and NoSQL databases.", difficulty: "medium", timeLimit: 60 },
  { question: "What is the event loop?", difficulty: "medium", timeLimit: 60 },
  { question: "Describe a challenging project you worked on.", difficulty: "hard", timeLimit: 120 },
  { question: "How would you design a simple API rate limiter?", difficulty: "hard", timeLimit: 120 }
];

async function callModelsWithPrompt(prompt: string) {
  for (const modelName of CANDIDATE_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = await response.text();
      return { modelName, text };
    } catch (err: any) {
      console.warn(`Model ${modelName} failed:`, err?.message || err);
    }
  }
  throw new Error("All candidate models failed or are not available for this API key.");
}

export const generateInterviewQuestions = async (profile: any) => {
  const createPrompt = (prof: any) => {
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

    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr: any) {
      throw new Error(`Failed to parse JSON from model ${modelName}: ${parseErr.message}`);
    }

    if (!Array.isArray(parsed)) {
      throw new Error(`Model ${modelName} returned JSON that is not an array.`);
    }

    const normalized = parsed.map((item: any, idx: number) => {
      if (!item || typeof item !== "object") {
        throw new Error(`Item ${idx} is not an object in model ${modelName} output.`);
      }
      const { question, difficulty, timeLimit } = item;
      if (!question || !difficulty || (timeLimit === undefined || timeLimit === null)) {
        throw new Error(`Missing keys in item ${idx} from model ${modelName}. Required: question, difficulty, timeLimit`);
      }

      const normalizedDifficulty = String(difficulty).toLowerCase();
      const normalizedTimeLimit = Number(timeLimit);

      if (![20, 60, 120].includes(normalizedTimeLimit)) {
        throw new Error(`Invalid timeLimit in item ${idx} from model ${modelName}. Allowed values: 20,60,120`);
      }

      return {
        question: String(question),
        difficulty: normalizedDifficulty,
        timeLimit: normalizedTimeLimit
      };
    });

    return normalized;
  } catch (error: any) {
    console.error("Error generating AI questions:", error?.message || error);
    return DEFAULT_QUESTION_FALLBACK;
  }
};

export const generateInterviewSummary = async (interviewResults: any[]) => {
  const createSummaryPrompt = (results: any[]) => {
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

    const summary = text.replace(/```(?:json)?\n?/g, "").replace(/```\n?/g, "").trim();
    return summary;
  } catch (error: any) {
    console.error("Error generating interview summary:", error?.message || error);
    return "Unable to generate interview summary. Please review the individual responses manually.";
  }
};

export const generateInterviewScore = async (interviewResults: any[]) => {
  const createScorePrompt = (results: any[]) => {
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
    const { modelName, text } = await callModelsWithPrompt(prompt);

    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr: any) {
      throw new Error(`Failed to parse JSON from model ${modelName}: ${parseErr.message}`);
    }

    if (!parsed || typeof parsed !== "object" || typeof parsed.score !== "number") {
      throw new Error(`AI response did not contain a valid 'score' number.`);
    }

    const scoreValue = Number(parsed.score);
    const boundedScore = Number.isFinite(scoreValue) ? Math.max(0, Math.min(100, Math.round(scoreValue))) : null;

    if (boundedScore === null) {
      throw new Error("Score is not a finite number.");
    }

    return {
      score: boundedScore,
      rationale: String(parsed.rationale || parsed.explanation || "No rationale provided.")
    };
  } catch (error: any) {
    console.error("Error generating interview score:", error?.message || error);
    return {
      score: 50,
      rationale: "Unable to generate an accurate score. This is a default value."
    };
  }
};
