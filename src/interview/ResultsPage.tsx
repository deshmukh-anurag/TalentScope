import { useMemo, useState } from "react";
import { useQuery, getTestResults } from "wasp/client/operations";
import { Link } from "wasp/client/router";
import type { TestResult } from "wasp/entities";
import type { ReviewedAnswer } from "../shared/types";

// ---- helpers ---------------------------------------------------------------

const scoreColor = (score: number): string =>
  score >= 70 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : "text-rose-600";

const scoreStroke = (score: number): string =>
  score >= 70 ? "#059669" : score >= 50 ? "#d97706" : "#e11d48";

const levelBadge = (level: string): string =>
  level === "easy"
    ? "bg-emerald-100 text-emerald-800"
    : level === "medium"
      ? "bg-amber-100 text-amber-800"
      : "bg-rose-100 text-rose-800";

const formatDate = (d: Date | string) =>
  new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

// ---- small presentational components --------------------------------------

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-medium text-neutral-500">{label}</div>
      <div className="mt-1 text-3xl font-bold text-neutral-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-neutral-400">{hint}</div>}
    </div>
  );
}

function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - score / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={6} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={scoreStroke(score)}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${scoreColor(score)}`}>
        {score}
      </span>
    </div>
  );
}

// A dependency-free bar chart of scores over time (chronological).
function ScoreTrend({ scores }: { scores: number[] }) {
  if (scores.length < 2) return null;
  const w = 100;
  const h = 32;
  const barW = w / scores.length;
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-3 text-sm font-medium text-neutral-500">Score trend</div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" preserveAspectRatio="none">
        {scores.map((s, i) => (
          <rect
            key={i}
            x={i * barW + barW * 0.15}
            y={h - (s / 100) * h}
            width={barW * 0.7}
            height={(s / 100) * h}
            rx={0.6}
            fill={scoreStroke(s)}
            opacity={0.85}
          />
        ))}
      </svg>
      <div className="mt-2 flex justify-between text-xs text-neutral-400">
        <span>Oldest</span>
        <span>Latest</span>
      </div>
    </div>
  );
}

function QuestionRow({ a }: { a: ReviewedAnswer }) {
  return (
    <div className="border-t border-neutral-100 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-neutral-800">
          Q{a.questionIndex + 1}. {a.question.text}
        </p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${levelBadge(a.question.level)}`}>
          {a.question.level.toUpperCase()}
        </span>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600">
        {a.answer || <span className="italic text-neutral-400">No answer provided</span>}
      </p>
      <div className="mt-1 flex gap-4 text-xs text-neutral-400">
        <span>
          {a.timeTaken != null ? `${a.timeTaken}s` : "—"} / {a.question.timeLimit}s
        </span>
        {a.timedOut && <span className="text-rose-500">Timed out</span>}
      </div>
    </div>
  );
}

function InterviewCard({ result }: { result: TestResult }) {
  const [open, setOpen] = useState(false);
  const answers = (result.answers as unknown as ReviewedAnswer[]) ?? [];

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <ScoreRing score={result.totalScore} />
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">{result.profileName}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
              <span>{formatDate(result.createdAt)}</span>
              <span className="text-neutral-300">·</span>
              <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium capitalize text-primary-700">
                {result.mode} mode
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {result.skills.slice(0, 6).map((skill, i) => (
            <span key={i} className="rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-600">
              {skill}
            </span>
          ))}
        </div>
      </div>

      <div className="border-t border-neutral-100 px-6 py-4">
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          {open ? "Hide details" : `View summary & ${answers.length} answers`}
        </button>
        {open && (
          <div className="mt-4">
            <h4 className="text-sm font-semibold text-neutral-900">AI feedback</h4>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-neutral-700">{result.summary}</p>
            <h4 className="mt-5 text-sm font-semibold text-neutral-900">Question breakdown</h4>
            <div className="mt-1">
              {answers.map((a, i) => (
                <QuestionRow key={i} a={a} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- page ------------------------------------------------------------------

export const ResultsPage = () => {
  const { data: results, isLoading, error } = useQuery(getTestResults);

  const stats = useMemo(() => {
    if (!results || results.length === 0) return null;
    const scores = results.map((r) => r.totalScore);
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const best = Math.max(...scores);
    // results are newest-first; reverse for a chronological trend
    const chronological = [...scores].reverse();
    return { count: results.length, avg, best, chronological };
  }, [results]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
          <p className="mt-4 text-neutral-500">Loading your results…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
          Error loading results: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Your dashboard</h1>
        <p className="mt-2 text-neutral-600">Track your interview performance over time.</p>
      </div>

      {!results || results.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-2xl">
            📊
          </div>
          <p className="text-neutral-600">No interviews yet. Complete one to see your results here.</p>
          <Link
            to="/interview"
            className="mt-6 inline-block rounded-lg bg-primary-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-primary-700"
          >
            Start your first interview
          </Link>
        </div>
      ) : (
        <>
          {stats && (
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Interviews" value={String(stats.count)} />
              <StatCard label="Average score" value={`${stats.avg}`} hint="out of 100" />
              <StatCard label="Best score" value={`${stats.best}`} hint="out of 100" />
              <div className="lg:col-span-1 sm:col-span-2">
                <ScoreTrend scores={stats.chronological} />
              </div>
            </div>
          )}

          <div className="space-y-5">
            {results.map((result) => (
              <InterviewCard key={result.id} result={result} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
