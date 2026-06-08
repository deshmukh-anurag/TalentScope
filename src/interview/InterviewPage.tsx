import React, { useState, useEffect, useRef } from "react";
import { startInterview, submitAnswer } from "wasp/client/operations";
import { api } from "wasp/client/api";
import { Link } from "wasp/client/router";
import { VoiceInterviewPage } from "./VoiceInterviewPage";
import type {
  CandidateProfile,
  InterviewQuestion,
  MissingFields,
  ParsedResume,
} from "../shared/types";

type InterviewMode = "text" | "voice" | null;
type Step = 1 | 2 | 3 | 4; // Upload, Profile, Interview, Complete

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

interface ProfileForm {
  name: string;
  email: string;
  phone: string;
  skills: string;
  experience: string;
  education: string;
}

interface UploadResponse {
  success: boolean;
  message?: string;
  data: { extractedData: ParsedResume; missingFields: MissingFields };
}

const EMPTY_PROFILE: ProfileForm = {
  name: "",
  email: "",
  phone: "",
  skills: "",
  experience: "",
  education: "",
};

const STEP_LABELS = ["Upload résumé", "Confirm profile", "Interview"];

function StepIndicator({ step }: { step: Step }) {
  return (
    <div className="mx-auto mb-8 flex max-w-md items-center justify-between">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const active = step === n;
        const done = step > n;
        return (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  done
                    ? "bg-primary-600 text-white"
                    : active
                      ? "bg-primary-600 text-white ring-4 ring-primary-100"
                      : "bg-neutral-200 text-neutral-500"
                }`}
              >
                {done ? "✓" : n}
              </div>
              <span className={`text-xs ${active ? "font-medium text-primary-700" : "text-neutral-400"}`}>
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className={`mx-2 h-0.5 flex-1 ${step > n ? "bg-primary-600" : "bg-neutral-200"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700">{message}</div>
  );
}

export const InterviewPage = () => {
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [interviewMode, setInterviewMode] = useState<InterviewMode>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Resume upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [missingFields, setMissingFields] = useState<Partial<MissingFields>>({});

  // Profile completion state
  const [profileData, setProfileData] = useState<ProfileForm>(EMPTY_PROFILE);

  // Interview state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<InterviewQuestion | null>(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [answer, setAnswer] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  const [timeLimit, setTimeLimit] = useState(0);
  const [questionStartTime, setQuestionStartTime] = useState<Date | null>(null);
  const [interviewComplete, setInterviewComplete] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Countdown timer for the text interview.
  useEffect(() => {
    if (currentStep === 3 && interviewMode === "text" && timeLeft > 0) {
      timerRef.current = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    } else if (timeLeft === 0 && currentStep === 3 && interviewMode === "text" && !interviewComplete) {
      void handleSubmitAnswer();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [timeLeft, currentStep, interviewMode, interviewComplete]);

  // ---- file handling ----

  const handleFileSelect = (file: File | null) => {
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Please upload a PDF or DOCX file.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("File size must be less than 5MB.");
      return;
    }
    setSelectedFile(file);
    setError("");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files[0] ?? null);
  };

  const handleResumeUpload = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("resume", selectedFile);
      // Wasp's `api` axios instance already targets the server with auth headers.
      const { data } = await api.post<UploadResponse>("/api/upload-resume", formData);

      if (!data.success) {
        setError(data.message || "Failed to parse résumé.");
        return;
      }
      const extracted: ParsedResume = data.data.extractedData;
      setMissingFields(data.data.missingFields ?? {});
      setProfileData({
        name: extracted.name ?? "",
        email: extracted.email ?? "",
        phone: extracted.phone ?? "",
        skills: extracted.skills.join(", "),
        experience: extracted.experience ?? "",
        education: extracted.education ?? "",
      });
      setCurrentStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload résumé. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ---- profile -> interview ----

  const buildProfile = (): CandidateProfile => ({
    name: profileData.name,
    email: profileData.email,
    phone: profileData.phone || null,
    skills: profileData.skills.split(",").map((s) => s.trim()).filter(Boolean),
    experience: profileData.experience || null,
    education: profileData.education || null,
  });

  const validateProfile = (): boolean => {
    const skills = profileData.skills.split(",").map((s) => s.trim()).filter(Boolean);
    if (!profileData.name || !profileData.email || skills.length === 0) {
      setError("Please fill in your name, email, and at least one skill before starting.");
      return false;
    }
    return true;
  };

  const handleStartTextInterview = async () => {
    if (!validateProfile()) return;
    setLoading(true);
    setError("");
    try {
      const res = await startInterview({ profile: buildProfile(), voiceMode: false });
      if (!res.success) {
        setError(res.message);
        return;
      }
      setSessionId(res.data.sessionId);
      setCurrentQuestion(res.data.question);
      setQuestionNumber(res.data.questionNumber);
      setTotalQuestions(res.data.totalQuestions);
      setTimeLimit(res.data.timeLimit);
      setTimeLeft(res.data.timeLimit);
      setQuestionStartTime(new Date(res.data.questionStartTime));
      setInterviewMode("text");
      setCurrentStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start interview. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleStartVoiceInterview = () => {
    if (!validateProfile()) return;
    setError("");
    setInterviewMode("voice");
    setCurrentStep(3);
  };

  const handleSubmitAnswer = async () => {
    if (!sessionId || !questionStartTime || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await submitAnswer({
        sessionId,
        answer,
        questionStartTime: questionStartTime.getTime(),
        timeLimit,
      });
      if (!res.success) {
        setError(res.message);
        return;
      }
      if (res.data.status === "completed") {
        setInterviewComplete(true);
        setCurrentStep(4);
      } else {
        setCurrentQuestion(res.data.question);
        setQuestionNumber(res.data.questionNumber);
        setTimeLimit(res.data.question.timeLimit);
        setTimeLeft(res.data.question.timeLimit);
        setQuestionStartTime(new Date(res.data.questionStartTime));
        setAnswer("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit answer. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resetForNewInterview = () => {
    setCurrentStep(1);
    setInterviewMode(null);
    setSelectedFile(null);
    setProfileData(EMPTY_PROFILE);
    setMissingFields({});
    setSessionId(null);
    setCurrentQuestion(null);
    setQuestionNumber(0);
    setTotalQuestions(0);
    setAnswer("");
    setTimeLeft(0);
    setTimeLimit(0);
    setQuestionStartTime(null);
    setInterviewComplete(false);
    setError("");
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const timerColor = () => {
    const pct = timeLimit > 0 ? (timeLeft / timeLimit) * 100 : 0;
    if (pct > 50) return "text-emerald-600";
    if (pct > 25) return "text-amber-600";
    return "text-rose-600";
  };

  // ---- Step 1: Upload ----
  if (currentStep === 1) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <StepIndicator step={1} />
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Start your AI interview</h1>
          <p className="mt-2 text-neutral-600">Upload your résumé and we&apos;ll tailor the questions to you.</p>
        </div>
        <ErrorBanner message={error} />
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div
            className={`rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
              dragOver ? "border-primary-400 bg-primary-50" : "border-neutral-300 hover:border-neutral-400"
            }`}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragOver(false);
            }}
          >
            <svg className="mx-auto h-12 w-12 text-neutral-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {selectedFile ? (
              <div className="mt-3">
                <p className="text-lg font-medium text-neutral-900">{selectedFile.name}</p>
                <p className="text-sm text-neutral-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            ) : (
              <div className="mt-3">
                <p className="text-lg font-medium text-neutral-900">Drop your résumé here or click to browse</p>
                <p className="text-sm text-neutral-500">Supports PDF and DOCX, up to 5MB</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx"
              onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-5 rounded-lg border border-neutral-300 px-5 py-2 font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              Choose file
            </button>
          </div>
          <div className="mt-6 flex justify-center">
            <button
              onClick={handleResumeUpload}
              disabled={!selectedFile || loading}
              className="rounded-lg bg-primary-600 px-8 py-3 font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {loading ? "Parsing résumé…" : "Continue"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Step 2: Profile ----
  if (currentStep === 2) {
    const field = (
      key: keyof ProfileForm,
      label: string,
      type = "text",
      placeholder = "",
      required = false,
    ) => (
      <div>
        <label className="mb-1.5 block text-sm font-medium text-neutral-700">
          {label} {required && missingFields[key as keyof MissingFields] && <span className="text-rose-500">*</span>}
        </label>
        <input
          type={type}
          value={profileData[key]}
          onChange={(e) => setProfileData({ ...profileData, [key]: e.target.value })}
          placeholder={placeholder}
          className="w-full rounded-lg border border-neutral-300 p-3 outline-none transition-shadow focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />
      </div>
    );

    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <StepIndicator step={2} />
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Confirm your profile</h1>
          <p className="mt-2 text-neutral-600">Review the details we extracted, then pick your interview format.</p>
        </div>
        <ErrorBanner message={error} />
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {field("name", "Full name", "text", "Jane Doe", true)}
              {field("email", "Email", "email", "jane@example.com", true)}
              {field("phone", "Phone", "tel", "+1 555 000 1234")}
              {field("education", "Education", "text", "B.Tech, Computer Science")}
            </div>
            {field("experience", "Experience", "text", "3 years as a Backend Engineer")}
            {field("skills", "Skills (comma separated)", "text", "React, Node.js, PostgreSQL", true)}
          </div>

          <div className="mt-8">
            <p className="mb-4 text-center text-sm text-neutral-500">Choose your interview format</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <button
                onClick={handleStartTextInterview}
                disabled={loading}
                className="group rounded-2xl border-2 border-neutral-200 bg-white p-5 text-left transition-all hover:border-primary-500 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="mb-2 text-3xl">⌨️</div>
                <div className="font-semibold text-neutral-900">Text interview</div>
                <div className="mt-1 text-xs text-neutral-500">Type your answers. Standard time limits.</div>
              </button>
              <button
                onClick={handleStartVoiceInterview}
                disabled={loading}
                className="group relative rounded-2xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-white p-5 text-left transition-all hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="absolute right-2 top-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                  New
                </span>
                <div className="mb-2 text-3xl">🎙️</div>
                <div className="font-semibold text-neutral-900">Voice interview</div>
                <div className="mt-1 text-xs text-neutral-500">Speak your answers. Half the time limit.</div>
              </button>
            </div>
            <div className="mt-6 flex justify-start">
              <button
                onClick={() => setCurrentStep(1)}
                className="rounded-lg bg-neutral-100 px-5 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-200"
              >
                Back
              </button>
            </div>
            {loading && <p className="mt-4 text-center text-sm text-neutral-500">Starting interview…</p>}
          </div>
        </div>
      </div>
    );
  }

  // ---- Step 3 (voice): full-screen takeover ----
  if (currentStep === 3 && interviewMode === "voice") {
    return (
      <VoiceInterviewPage
        profile={buildProfile()}
        onComplete={(summary) => {
          setSessionId(summary.sessionId);
          setTotalQuestions(summary.totalQuestions);
          setInterviewComplete(true);
          setCurrentStep(4);
        }}
        onExit={() => {
          setInterviewMode(null);
          setCurrentStep(2);
        }}
      />
    );
  }

  // ---- Step 3 (text) ----
  if (currentStep === 3) {
    const progress = totalQuestions > 0 ? (questionNumber / totalQuestions) * 100 : 0;
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-neutral-900">Interview in progress</h1>
              <p className="text-sm text-neutral-500">
                Question {questionNumber} of {totalQuestions}
              </p>
            </div>
            <div className="text-right">
              <div className={`font-mono text-3xl font-bold ${timerColor()}`}>{formatTime(timeLeft)}</div>
              <p className="text-xs text-neutral-400">time remaining</p>
            </div>
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full rounded-full bg-primary-600 transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <ErrorBanner message={error} />

        <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <span
            className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${
              currentQuestion?.difficulty === "easy"
                ? "bg-emerald-100 text-emerald-800"
                : currentQuestion?.difficulty === "medium"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-rose-100 text-rose-800"
            }`}
          >
            {currentQuestion?.difficulty?.toUpperCase() || "MEDIUM"}
          </span>
          <h2 className="mt-4 text-xl font-semibold text-neutral-900">
            {currentQuestion?.question || "Loading question…"}
          </h2>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <label className="mb-3 block text-sm font-medium text-neutral-700">Your answer</label>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={8}
            placeholder="Type your answer here…"
            className="w-full rounded-lg border border-neutral-300 p-4 outline-none transition-shadow focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          />
          <div className="mt-6 flex items-center justify-between">
            <span className="text-xs text-neutral-400">{answer.trim().length} characters</span>
            <button
              onClick={handleSubmitAnswer}
              disabled={loading}
              className="rounded-lg bg-primary-600 px-8 py-3 font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {loading ? "Submitting…" : questionNumber === totalQuestions ? "Finish interview" : "Submit answer"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Step 4: Complete ----
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <div className="rounded-2xl border border-neutral-200 bg-white p-10 shadow-sm">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <svg className="h-8 w-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Interview complete!</h1>
        <p className="mt-2 text-neutral-600">
          Your {totalQuestions} answers have been scored. Head to your dashboard for the full breakdown.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            to="/results"
            className="rounded-lg bg-primary-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-primary-700"
          >
            View results
          </Link>
          <button
            onClick={resetForNewInterview}
            className="rounded-lg border border-neutral-300 px-6 py-3 font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Start new interview
          </button>
        </div>
      </div>
    </div>
  );
};
