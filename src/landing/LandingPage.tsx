import { useAuth } from "wasp/client/auth";
import { Link } from "wasp/client/router";

const FEATURES = [
  {
    icon: "🧠",
    title: "Adaptive AI questions",
    body: "Gemini generates a progressive set of questions tailored to the skills and experience on your resume — from warm-ups to hard system-design.",
  },
  {
    icon: "🎙️",
    title: "Realistic voice mode",
    body: "Join a Google-Meet-style room where the AI reads each question aloud, listens, and auto-submits when you stop speaking. No buttons required.",
  },
  {
    icon: "📄",
    title: "Smart resume parsing",
    body: "Drop a PDF or DOCX and we extract your name, contact details, and skills automatically to personalise the interview.",
  },
  {
    icon: "⏱️",
    title: "Timed by difficulty",
    body: "Each question is timed by difficulty, just like the real thing — 20s for easy, up to 2 minutes for hard problems.",
  },
  {
    icon: "📊",
    title: "Instant scoring & feedback",
    body: "Get a 0–100 score plus a detailed written breakdown of strengths, gaps, and communication right after you finish.",
  },
  {
    icon: "📈",
    title: "Track your progress",
    body: "Every session is saved to your dashboard so you can watch your scores climb interview after interview.",
  },
];

const STEPS = [
  { n: "01", title: "Upload your resume", body: "We parse it instantly to understand your background." },
  { n: "02", title: "Confirm your profile", body: "Review the extracted skills and choose text or voice mode." },
  { n: "03", title: "Take the interview", body: "Answer AI-generated questions under realistic time pressure." },
  { n: "04", title: "Review your results", body: "See your score, summary, and per-question breakdown." },
];

const STATS = [
  { value: "6", label: "Tailored questions per session" },
  { value: "2", label: "Interview modes — text & voice" },
  { value: "0–100", label: "AI score with written feedback" },
  { value: "<60s", label: "Resume parsed to interview-ready" },
];

export function LandingPage() {
  const { data: user } = useAuth();
  const primaryHref = user ? "/interview" : "/signup";
  const primaryLabel = user ? "Go to your dashboard" : "Start practicing free";

  return (
    <div className="flex flex-col bg-white text-neutral-900">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary-50 via-white to-white">
        <div className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary-200/40 blur-3xl" />
        <div className="pointer-events-none absolute top-40 -left-24 h-72 w-72 rounded-full bg-violet-200/40 blur-3xl" />

        <div className="mx-auto grid max-w-screen-xl grid-cols-1 items-center gap-12 px-6 py-20 lg:grid-cols-2 lg:py-28">
          <div className="animate-fade-in-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white/70 px-3 py-1 text-sm font-medium text-primary-700 shadow-sm backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> AI-powered mock interviews
            </span>
            <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Ace your next
              <span className="bg-gradient-to-r from-primary-600 to-violet-600 bg-clip-text text-transparent">
                {" "}technical interview
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-neutral-600">
              TalentScope runs realistic, AI-driven interviews from your resume — by text or
              by voice — then scores your answers and tells you exactly how to improve.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to={primaryHref}
                className="rounded-lg bg-primary-600 px-6 py-3 font-semibold text-white shadow-lg shadow-primary-600/20 transition-all hover:-translate-y-0.5 hover:bg-primary-700"
              >
                {primaryLabel}
              </Link>
              <a
                href="#how-it-works"
                className="rounded-lg border border-neutral-300 px-6 py-3 font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
              >
                See how it works
              </a>
            </div>
            <p className="mt-4 text-sm text-neutral-500">No credit card required · Practice in minutes</p>
          </div>

          {/* Hero visual — a live "voice interview" card */}
          <div className="animate-fade-in-up [animation-delay:120ms]">
            <div className="relative mx-auto max-w-md rounded-3xl border border-neutral-200 bg-white p-6 shadow-2xl shadow-primary-900/10">
              <div className="flex items-center justify-between text-sm text-neutral-500">
                <span className="flex items-center gap-2 font-medium text-neutral-700">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
                  Voice Interview
                </span>
                <span className="font-mono text-primary-600">0:42</span>
              </div>
              <div className="my-6 flex items-center justify-center">
                <div className="relative flex h-32 w-32 animate-float items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-violet-600 text-3xl font-bold text-white shadow-xl">
                  AI
                  <span className="absolute inset-0 animate-ping rounded-full ring-4 ring-primary-400/30" />
                </div>
              </div>
              <div className="rounded-xl bg-neutral-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Question 3 · Medium
                </p>
                <p className="mt-1 font-medium text-neutral-800">
                  Explain how you would design a rate limiter for a public API.
                </p>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                  <div className="h-full w-3/5 rounded-full bg-gradient-to-r from-emerald-400 to-teal-400" />
                </div>
                <span className="text-xs font-medium text-neutral-500">Listening…</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats strip */}
        <div className="border-t border-neutral-100 bg-white/60 backdrop-blur">
          <div className="mx-auto grid max-w-screen-xl grid-cols-2 gap-6 px-6 py-8 md:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl font-bold text-primary-600 sm:text-3xl">{s.value}</div>
                <div className="mt-1 text-sm text-neutral-500">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-screen-xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to interview with confidence
          </h2>
          <p className="mt-4 text-lg text-neutral-600">
            A complete practice loop — from resume to score — powered by Google Gemini.
          </p>
        </div>
        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-primary-200 hover:shadow-lg"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-2xl transition-colors group-hover:bg-primary-100">
                {f.icon}
              </div>
              <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-neutral-50 py-20">
        <div className="mx-auto max-w-screen-xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">From resume to results in four steps</h2>
            <p className="mt-4 text-lg text-neutral-600">No setup. No scheduling. Just practice whenever you want.</p>
          </div>
          <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-4">
            {STEPS.map((step) => (
              <div key={step.n} className="relative">
                <div className="text-5xl font-extrabold text-primary-100">{step.n}</div>
                <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-screen-xl overflow-hidden rounded-3xl bg-gradient-to-br from-primary-600 to-violet-700 px-8 py-16 text-center shadow-2xl">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">Ready to impress your interviewer?</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-primary-100">
            Run your first AI interview today and turn nerves into preparation.
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              to={primaryHref}
              className="rounded-lg bg-white px-8 py-3 font-semibold text-primary-700 shadow-lg transition-all hover:-translate-y-0.5"
            >
              {primaryLabel}
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-neutral-200 py-8">
        <div className="mx-auto flex max-w-screen-xl flex-col items-center justify-between gap-4 px-6 text-sm text-neutral-500 sm:flex-row">
          <span>© {new Date().getFullYear()} TalentScope. Built with Wasp & Google Gemini.</span>
          <div className="flex gap-6">
            <a href="#how-it-works" className="hover:text-neutral-800">How it works</a>
            <Link to="/login" className="hover:text-neutral-800">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
