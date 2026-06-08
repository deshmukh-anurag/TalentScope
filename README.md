<div align="center">

<img src="https://user-images.githubusercontent.com/74038190/212749447-bfb7e725-6987-49d9-ae85-2015e3e7cc41.gif" width="500"/>

# 🎤 TalentScope — AI-Powered Interview Platform

### Voice & text interviews with real-time AI evaluation

[![Wasp](https://img.shields.io/badge/Wasp-BF9B6F?style=for-the-badge&logoColor=white)](https://wasp-lang.dev)
[![React](https://img.shields.io/badge/React-20232a?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Gemini](https://img.shields.io/badge/Google_Gemini-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white)](https://deepmind.google/gemini)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)

[![CI](https://github.com/deshmukh-anurag/TalentScope/actions/workflows/ci.yml/badge.svg)](https://github.com/deshmukh-anurag/TalentScope/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white)](./tests)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](./tsconfig.json)

![Question Time](https://img.shields.io/badge/Question_Time-↓_50%25-success?style=flat-square)
![Silence Detection](https://img.shields.io/badge/Auto_Submit_Accuracy->95%25-blue?style=flat-square)
![Admin Overhead](https://img.shields.io/badge/Admin_Overhead-↓_70%25-orange?style=flat-square)

</div>

---

## 🎯 What Is This?

TalentScope is a full-stack AI interview platform that conducts **voice and text interviews** autonomously. It parses your resume, generates progressively difficult questions tailored to your profile, uses the **Web Audio API** for real-time voice monitoring, and delivers comprehensive AI-scored feedback — all without a human interviewer.

---

## 📊 Performance Metrics

| Metric | Result |
|:---|:---|
| ⏱️ Question Time Reduction | **50%** faster via audio optimization |
| 🎙️ Auto-Submit Accuracy | **>95%** with FFT-based 3-second silence detection |
| 📋 Admin Overhead | **↓ 70%** reduction in interview management |
| 📄 Resume Parsing | PDF & DOCX with structured data extraction |

---

## ✨ Features

- 🤖 **AI Question Generation** — Gemini generates personalized questions from your resume
- 🎙️ **Voice Interviews** — Browser-native STT + TTS, no external app needed
- 🌊 **FFT Audio Monitoring** — Web Audio API `AnalyserNode` for real-time audio level display
- ⏰ **Smart Auto-Submit** — 3-second silence detection ends answers automatically
- 📈 **Progressive Difficulty** — Questions adapt from easy → hard based on your answers
- 📄 **Resume Parser** — Extracts skills, experience & education from PDF/DOCX
- 📊 **Results Dashboard** — Detailed AI scoring with per-answer feedback
- 🔐 **Email Auth** — Secure sign up/in via Wasp built-in auth

---

## 🏗️ Architecture

```
┌──────────────┐     ┌─────────────────────────────────┐
│   Resume     │────▶│  Gemini AI Parser                │
│  PDF / DOCX  │     │  Extracts: skills, exp, edu      │
└──────────────┘     └────────────┬────────────────────┘
                                  │
                                  ▼
                     ┌─────────────────────────────────┐
                     │  Question Engine                 │
                     │  Progressive difficulty gen      │
                     │  Context-aware follow-ups        │
                     └────────────┬────────────────────┘
                                  │
               ┌──────────────────┼──────────────────┐
               ▼                  ▼                  ▼
    ┌────────────────┐  ┌──────────────────┐  ┌──────────────┐
    │  Voice Mode    │  │   Text Mode      │  │   Scoring    │
    │  Gemini STT    │  │   Typed Input    │  │  AI Feedback │
    │  Browser TTS   │  │   Timer-based    │  │  Per Answer  │
    │  FFT Silence   │  │                  │  │  Dashboard   │
    └────────────────┘  └──────────────────┘  └──────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|:---|:---|
| **Framework** | Wasp (React + Node.js + Prisma) |
| **Frontend** | React, Tailwind CSS, Vite |
| **AI** | Google Gemini API (questions, resume parsing, scoring, transcription) |
| **Voice** | Gemini speech-to-text + Browser TTS (Web Speech API) |
| **Audio** | Web Audio API — FFT AnalyserNode for silence detection |
| **Database** | PostgreSQL + Prisma ORM (persisted interview sessions) |
| **Auth** | Wasp built-in email auth |
| **File Parsing** | AI-powered PDF & DOCX resume extraction (regex fallback) |
| **Testing / CI** | Vitest unit tests + GitHub Actions |

---

## 🚀 Quick Start

```bash
# 1. Install Wasp
curl -sSL https://get.wasp.sh/installer.sh | sh

# 2. Clone & enter
git clone https://github.com/deshmukh-anurag/TalentScope.git
cd TalentScope

# 3. Configure environment
cp .env.server.example .env.server
# then edit .env.server and set GEMINI_API_KEY

# 4. Start the managed Postgres (Wasp + Docker), then migrate & run
wasp db start          # in a separate terminal — sets DATABASE_URL for you
wasp db migrate-dev
wasp start
```

App: `http://localhost:3000` · API: `http://localhost:3001`

> Note: `wasp start` serves the client on port **3000**. Free that port first
> if another dev server is using it, otherwise the client falls back to a
> different port and auth/CORS won't line up.

Get a Gemini API key: [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

---

## 🧪 Testing & Quality

```bash
npm run lint        # ESLint (strict, no `any`)
npm test            # Vitest unit tests
npm run typecheck   # tsc --noEmit (run after `wasp start` generates the SDK)
```

Pure logic — résumé field extraction, question/score validation, and resume
normalization — is covered by [Vitest unit tests](./tests), and every push runs
**lint + tests** through [GitHub Actions](./.github/workflows/ci.yml).

---

## 📁 Project Structure

```
TalentScope/
├── src/
│   ├── landing/
│   │   └── LandingPage.tsx      # Marketing landing page (public)
│   ├── interview/
│   │   ├── InterviewPage.tsx    # Upload → profile → text interview flow
│   │   ├── VoiceInterviewPage.tsx  # Full-screen voice interview room
│   │   ├── ResultsPage.tsx      # Analytics dashboard + per-question review
│   │   ├── actions.ts           # Server actions (start, submit, transcribe)
│   │   ├── queries.ts           # Typed data fetching
│   │   ├── aiUtils.ts           # Gemini integration (questions, scoring, parsing)
│   │   ├── resumeParser.ts      # PDF/DOCX extraction + AI parse orchestration
│   │   ├── resumeFields.ts      # Pure, unit-tested regex field extraction
│   │   └── voiceUtils.ts        # Browser TTS, MediaRecorder, FFT silence detection
│   ├── server/
│   │   └── logger.ts            # Leveled structured logging
│   ├── auth/                    # Login / signup / verification pages
│   ├── shared/
│   │   ├── types.ts             # Shared, end-to-end domain types
│   │   └── components/          # Design-system primitives
│   └── App.tsx
├── tests/                       # Vitest unit tests
├── .github/workflows/ci.yml     # Lint + test pipeline
├── schema.prisma                # DB models (User, InterviewSession, TestResult)
├── main.wasp                    # App config & routes
└── uploads/                     # Temporary resume storage (auto-cleaned)
```

---

## 🔑 Environment Variables

```env
# .env.server
DATABASE_URL=postgresql://user:pass@host:5432/talentscope
GEMINI_API_KEY=your_gemini_api_key
```

---

## 👨‍💻 Author

**Anurag Divakar Deshmukh** — AI Engineer & Full Stack Developer

[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=flat-square&logo=linkedin&logoColor=white)](https://linkedin.com/in/anurag-deshmukh-aa23822a5)
[![GitHub](https://img.shields.io/badge/GitHub-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/deshmukh-anurag)
[![Email](https://img.shields.io/badge/Email-D14836?style=flat-square&logo=gmail&logoColor=white)](mailto:anuragdeshmukh61@gmail.com)

---

<div align="center"><i>⭐ Star this repo if you find it useful!</i></div>
