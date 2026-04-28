import React, { useEffect, useMemo, useRef, useState } from "react";
import { startInterview, submitAnswer, transcribeAudio } from "wasp/client/operations";
import {
  audioBlobToBase64,
  cancelSpeech,
  createVoiceRecorder,
  getMimeFromBlob,
  speak,
  unlockTts,
  type RecorderState,
  type VoiceRecorder
} from "./voiceUtils";

interface VoiceInterviewPageProps {
  profile: {
    name: string;
    email: string;
    phone: string;
    skills: string[] | string;
  };
  onComplete: (summary: { totalQuestions: number; sessionId: string }) => void;
  onExit: () => void;
}

type Phase =
  | "intro"          // brief intro screen, "Join Interview" CTA (also TTS unlock gesture)
  | "loading"        // generating questions
  | "speaking"       // AI is reading the question aloud
  | "answering"      // user is recording their answer
  | "transcribing"   // STT in flight
  | "submitting"     // sending to backend
  | "between"        // pause between questions
  | "done"
  | "error";

const phaseLabel = (phase: Phase, recState: RecorderState): string => {
  switch (phase) {
    case "intro":
      return "Ready when you are";
    case "loading":
      return "Preparing your interview...";
    case "speaking":
      return "Interviewer is speaking...";
    case "answering":
      if (recState === "calibrating") return "Calibrating mic...";
      if (recState === "speaking") return "Listening...";
      return "Waiting for your answer...";
    case "transcribing":
      return "Transcribing your answer...";
    case "submitting":
      return "Submitting...";
    case "between":
      return "Next question coming up...";
    case "done":
      return "Interview complete";
    case "error":
      return "Something went wrong";
  }
};

const fmtTime = (s: number): string => {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
};

export const VoiceInterviewPage: React.FC<VoiceInterviewPageProps> = ({
  profile,
  onComplete,
  onExit
}) => {
  const [phase, setPhase] = useState<Phase>("intro");
  const [error, setError] = useState<string>("");

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);

  const [timeLimit, setTimeLimit] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [questionStartTime, setQuestionStartTime] = useState<number>(0);

  const [transcript, setTranscript] = useState<string>("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [recState, setRecState] = useState<RecorderState>("idle");
  const [muted, setMuted] = useState(false);

  const recorderRef = useRef<VoiceRecorder | null>(null);
  const phaseRef = useRef<Phase>("intro");
  const submittingRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const submitFnRef = useRef<(reason: string) => Promise<void>>(async () => {});

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // -------- Timer --------
  useEffect(() => {
    if (phase !== "answering") {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // hit zero — force submit, but only once
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          // fire-and-forget; submitFnRef is the latest reference
          submitFnRef.current("timer_expired");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [phase]);

  // -------- Cleanup on unmount --------
  useEffect(() => {
    return () => {
      cancelSpeech();
      if (recorderRef.current?.isActive()) {
        recorderRef.current.stop().catch(() => {});
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // -------- Core flow helpers --------

  const startRecordingForCurrentQuestion = async () => {
    setTranscript("");
    setAudioLevel(0);
    submittingRef.current = false;

    const recorder = createVoiceRecorder(
      {
        onLevel: setAudioLevel,
        onStateChange: setRecState,
        onSpeechDetected: () => console.log("[flow] first speech detected"),
        onSilenceAfterSpeech: () => {
          console.log("[flow] silence trigger -> submit");
          submitFnRef.current("silence");
        }
      },
      { silenceMs: 2500, calibrationMs: 800 }
    );
    recorderRef.current = recorder;
    try {
      await recorder.start();
      setQuestionStartTime(Date.now());
      setPhase("answering");
    } catch (err: any) {
      console.error("[flow] mic start failed:", err);
      setError(
        err?.name === "NotAllowedError"
          ? "Microphone permission denied. Please allow mic access and reload."
          : "Could not access your microphone."
      );
      setPhase("error");
    }
  };

  const askQuestion = async (q: any, qNum: number, total: number, limit: number) => {
    setCurrentQuestion(q);
    setQuestionNumber(qNum);
    setTotalQuestions(total);
    setTimeLimit(limit);
    setTimeLeft(limit);
    setTranscript("");
    setPhase("speaking");
    console.log(`[flow] asking Q${qNum}/${total} (limit=${limit}s): ${q.question}`);

    // Read it aloud, then start recording.
    await speak(`Question ${qNum} of ${total}. ${q.question}`);
    if (phaseRef.current !== "speaking") {
      // user navigated away or errored mid-speech
      return;
    }
    await startRecordingForCurrentQuestion();
  };

  const submitCurrentAnswer = async (reason: string) => {
    if (submittingRef.current) {
      console.log(`[flow] submit skipped (already in progress) reason=${reason}`);
      return;
    }
    if (!sessionId) {
      console.warn("[flow] submit called without session");
      return;
    }
    if (phaseRef.current !== "answering") {
      console.log(`[flow] submit skipped, phase=${phaseRef.current} reason=${reason}`);
      return;
    }
    submittingRef.current = true;
    console.log(`[flow] submitting answer (reason=${reason})`);
    setPhase("transcribing");

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    let blob: Blob = new Blob([], { type: "audio/webm" });
    try {
      if (recorderRef.current?.isActive()) {
        blob = await recorderRef.current.stop();
      }
    } catch (err) {
      console.warn("[flow] stop error:", err);
    }

    let answerText = "";
    if (blob.size > 1024) {
      try {
        const base64 = await audioBlobToBase64(blob);
        const res = await transcribeAudio({
          audioBase64: base64,
          mimeType: getMimeFromBlob(blob)
        });
        answerText = (res?.transcript || "").trim();
        console.log(`[flow] transcript len=${answerText.length}`);
      } catch (err: any) {
        console.error("[flow] transcribe failed:", err?.message || err);
      }
    } else {
      console.warn(`[flow] blob too small (${blob.size}b) — skipping STT`);
    }

    setTranscript(answerText);
    setPhase("submitting");

    try {
      const resp = await submitAnswer({
        sessionId,
        answer: answerText,
        questionStartTime,
        timeLimit
      });
      if (!resp.success) {
        setError(resp.message || "Failed to submit answer");
        setPhase("error");
        return;
      }
      if (resp.data.status === "completed") {
        setPhase("done");
        await speak("Thank you. Your interview is now complete.");
        onComplete({ totalQuestions, sessionId });
        return;
      }
      // queue next
      const next = resp.data.question;
      setPhase("between");
      setTimeout(() => {
        askQuestion(
          next,
          resp.data.questionNumber,
          resp.data.totalQuestions,
          next.timeLimit
        );
      }, 800);
    } catch (err: any) {
      console.error("[flow] submitAnswer error:", err?.message || err);
      setError(err?.message || "Failed to submit answer");
      setPhase("error");
    } finally {
      submittingRef.current = false;
    }
  };

  // Keep the ref pointing at the latest closure so the timer callback always
  // calls the current version of submitCurrentAnswer.
  useEffect(() => {
    submitFnRef.current = submitCurrentAnswer;
  });

  // -------- Intro / kickoff --------

  const handleJoin = async () => {
    setError("");
    unlockTts(); // we're inside a click handler — TTS is now allowed
    setPhase("loading");
    try {
      const skillsArr = Array.isArray(profile.skills)
        ? profile.skills
        : profile.skills.split(",").map((s) => s.trim());
      const resp = await startInterview({
        profile: { ...profile, skills: skillsArr },
        voiceMode: true
      });
      if (!resp.success) {
        setError(resp.message || "Failed to start interview");
        setPhase("error");
        return;
      }
      setSessionId(resp.data.sessionId);
      const q = resp.data.question;
      await askQuestion(q, resp.data.questionNumber, resp.data.totalQuestions, q.timeLimit);
    } catch (err: any) {
      console.error("[flow] start error:", err?.message || err);
      setError(err?.message || "Failed to start interview");
      setPhase("error");
    }
  };

  const handleManualSubmit = () => {
    if (phase === "answering") submitCurrentAnswer("manual");
  };

  const handleSkip = () => {
    if (phase === "answering") {
      // submit whatever we have (even empty) and move on
      submitCurrentAnswer("skip");
    }
  };

  const handleEnd = () => {
    cancelSpeech();
    if (recorderRef.current?.isActive()) {
      recorderRef.current.stop().catch(() => {});
    }
    if (timerRef.current) clearInterval(timerRef.current);
    onExit();
  };

  const toggleMute = () => {
    if (!recorderRef.current) return;
    setMuted((m) => {
      const next = !m;
      // We can't truly mute without restarting the recorder mid-question,
      // so we just stop level updates visually and log a note.
      console.log(`[flow] mute=${next}`);
      return next;
    });
  };

  // -------- Derived UI bits --------

  const timerColor = useMemo(() => {
    if (timeLimit === 0) return "text-white";
    const pct = (timeLeft / timeLimit) * 100;
    if (pct > 50) return "text-emerald-400";
    if (pct > 25) return "text-amber-400";
    return "text-rose-400";
  }, [timeLeft, timeLimit]);

  const aiSpeaking = phase === "speaking";
  const userListening = phase === "answering" && recState === "speaking";

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col">
      {/* Top bar */}
      <div className="px-6 py-3 flex items-center justify-between border-b border-white/10 bg-black/30 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold tracking-wide">TalentScope · Voice Interview</span>
        </div>
        <div className="flex items-center gap-6 text-sm">
          {totalQuestions > 0 && (
            <span className="text-white/70">
              Question <b className="text-white">{questionNumber}</b> of {totalQuestions}
            </span>
          )}
          {phase === "answering" && (
            <span className={`font-mono text-lg font-bold ${timerColor}`}>
              {fmtTime(timeLeft)}
            </span>
          )}
          <button
            onClick={handleEnd}
            className="px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-sm font-medium"
          >
            Leave
          </button>
        </div>
      </div>

      {/* Main stage */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 p-6 overflow-auto">
        {/* AI tile */}
        <ParticipantTile
          name="AI Interviewer"
          subtitle={aiSpeaking ? "Speaking" : phase === "answering" ? "Listening" : "Idle"}
          accent="indigo"
          active={aiSpeaking}
          big
        >
          <div className="flex items-center justify-center h-full">
            <div
              className={`relative w-44 h-44 rounded-full flex items-center justify-center bg-gradient-to-br from-indigo-500 to-violet-700 shadow-2xl ${
                aiSpeaking ? "animate-pulse" : ""
              }`}
            >
              <span className="text-6xl font-bold">AI</span>
              {aiSpeaking && (
                <>
                  <span className="absolute inset-0 rounded-full ring-4 ring-indigo-400/40 animate-ping" />
                  <span className="absolute -inset-2 rounded-full ring-2 ring-indigo-400/20 animate-ping" />
                </>
              )}
            </div>
          </div>
        </ParticipantTile>

        {/* User tile */}
        <ParticipantTile
          name={profile.name || "You"}
          subtitle={
            phase === "answering"
              ? muted
                ? "Muted"
                : userListening
                ? "Speaking"
                : recState === "calibrating"
                ? "Calibrating"
                : "Listening"
              : "Idle"
          }
          accent="emerald"
          active={userListening}
          big
        >
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div
              className={`relative w-44 h-44 rounded-full flex items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-700 shadow-2xl transition-transform ${
                userListening ? "scale-105" : ""
              }`}
            >
              <span className="text-5xl font-bold">
                {(profile.name || "U").trim().charAt(0).toUpperCase()}
              </span>
              {userListening && (
                <span className="absolute inset-0 rounded-full ring-4 ring-emerald-400/40 animate-ping" />
              )}
            </div>
            {/* Audio level meter */}
            <div className="w-3/4 h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-[width] duration-100"
                style={{ width: `${Math.round((muted ? 0 : audioLevel) * 100)}%` }}
              />
            </div>
          </div>
        </ParticipantTile>
      </div>

      {/* Question + transcript panel */}
      <div className="px-6 pb-4">
        <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4 min-h-[110px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wider text-white/60">
              {phaseLabel(phase, recState)}
            </span>
            {currentQuestion?.difficulty && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  currentQuestion.difficulty === "easy"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : currentQuestion.difficulty === "medium"
                    ? "bg-amber-500/20 text-amber-300"
                    : "bg-rose-500/20 text-rose-300"
                }`}
              >
                {String(currentQuestion.difficulty).toUpperCase()}
              </span>
            )}
          </div>
          <div className="text-lg font-medium text-white">
            {currentQuestion?.question || (phase === "intro" ? "Ready to start your interview." : "...")}
          </div>
          {transcript && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <div className="text-xs uppercase tracking-wider text-white/50 mb-1">Your answer</div>
              <div className="text-sm text-white/85 whitespace-pre-wrap">{transcript}</div>
            </div>
          )}
          {error && (
            <div className="mt-3 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="px-6 pb-6 flex items-center justify-center gap-4">
        {phase === "intro" ? (
          <button
            onClick={handleJoin}
            className="px-8 py-3 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold shadow-lg flex items-center gap-2"
          >
            <span>Join Interview</span>
            <span aria-hidden>→</span>
          </button>
        ) : phase === "error" ? (
          <button
            onClick={handleEnd}
            className="px-8 py-3 rounded-full bg-rose-500 hover:bg-rose-600 text-white font-semibold"
          >
            Exit
          </button>
        ) : phase === "done" ? (
          <button
            onClick={handleEnd}
            className="px-8 py-3 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold"
          >
            View Results
          </button>
        ) : (
          <>
            <ControlButton
              label={muted ? "Unmute" : "Mute"}
              icon={muted ? "🔇" : "🎤"}
              onClick={toggleMute}
              disabled={phase !== "answering"}
              variant={muted ? "danger" : "default"}
            />
            <ControlButton
              label="Submit"
              icon="✓"
              onClick={handleManualSubmit}
              disabled={phase !== "answering"}
              variant="primary"
            />
            <ControlButton
              label="Skip"
              icon="⏭"
              onClick={handleSkip}
              disabled={phase !== "answering"}
            />
            <ControlButton label="End" icon="📞" onClick={handleEnd} variant="danger" />
          </>
        )}
      </div>
    </div>
  );
};

// --- Sub-components -------------------------------------------------

const accentRing: Record<string, string> = {
  indigo: "ring-indigo-400/60 shadow-indigo-500/20",
  emerald: "ring-emerald-400/60 shadow-emerald-500/20"
};

const ParticipantTile: React.FC<{
  name: string;
  subtitle: string;
  accent: "indigo" | "emerald";
  active: boolean;
  big?: boolean;
  children: React.ReactNode;
}> = ({ name, subtitle, accent, active, children }) => (
  <div
    className={`relative bg-black/40 rounded-2xl border border-white/10 overflow-hidden shadow-xl transition-shadow ${
      active ? `ring-2 ${accentRing[accent]} shadow-2xl` : ""
    }`}
  >
    <div className="absolute inset-0">{children}</div>
    <div className="absolute bottom-3 left-4 flex items-center gap-2 text-sm">
      <div
        className={`w-2 h-2 rounded-full ${
          active ? "bg-emerald-400 animate-pulse" : "bg-white/40"
        }`}
      />
      <span className="font-medium">{name}</span>
      <span className="text-white/60">· {subtitle}</span>
    </div>
    <div className="aspect-video w-full" />
  </div>
);

const ControlButton: React.FC<{
  label: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "primary" | "danger";
}> = ({ label, icon, onClick, disabled, variant = "default" }) => {
  const styles =
    variant === "primary"
      ? "bg-emerald-500 hover:bg-emerald-600"
      : variant === "danger"
      ? "bg-rose-500 hover:bg-rose-600"
      : "bg-white/10 hover:bg-white/20";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-1 px-5 py-2.5 rounded-xl font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${styles}`}
    >
      <span className="text-lg leading-none">{icon}</span>
      <span>{label}</span>
    </button>
  );
};
