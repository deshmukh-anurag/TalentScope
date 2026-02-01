# TalentScope - AI Interview Platform

An intelligent interview platform built with Wasp that uses AI to conduct technical interviews, parse resumes, and generate comprehensive feedback.

## Features

- 🤖 AI-powered interview questions based on candidate profile
- 📄 Resume parsing (PDF, DOC, DOCX)
- ⏱️ Timed questions with difficulty levels
- 📊 Automated scoring and feedback
- 🔐 Secure authentication with email
- 📈 Interview results dashboard

## Tech Stack

- **Framework**: Wasp (React + Node.js + Prisma)
- **Database**: PostgreSQL
- **AI**: Google Gemini API
- **Styling**: Tailwind CSS
- **Authentication**: Wasp Auth (Email)

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- Wasp CLI (`curl -sSL https://get.wasp.sh/installer.sh | sh`)
- Google Gemini API key

## Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/deshmukh-anurag/TalentScope.git
cd TalentScope/talentscope
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up PostgreSQL

Option A: Using Docker
```bash
docker run --name postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres
docker exec -it postgres psql -U postgres -c "CREATE DATABASE talentscope;"
```

Option B: Use a hosted PostgreSQL (Neon, Supabase, Railway, etc.)

### 4. Configure environment variables

Create a `.env.server` file:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/talentscope
GEMINI_API_KEY=your_gemini_api_key_here
```

Get your Gemini API key from: https://makersuite.google.com/app/apikey

### 5. Run database migrations

```bash
wasp db migrate-dev
```

### 6. Start the development server

```bash
wasp start
```

The app will be available at:
- Frontend: http://localhost:3000
- Backend: http://localhost:3001

## Usage

1. **Sign Up**: Create an account using email
2. **Upload Resume**: Upload your resume (PDF/DOC/DOCX)
3. **Complete Profile**: Review and complete extracted information
4. **Take Interview**: Answer AI-generated technical questions
5. **View Results**: Check your interview score and feedback

## Project Structure

```
talentscope/
├── src/
│   ├── interview/          # Interview pages, actions, queries
│   │   ├── InterviewPage.tsx
│   │   ├── ResultsPage.tsx
│   │   ├── actions.ts
│   │   ├── queries.ts
│   │   └── aiUtils.ts
│   ├── auth/               # Authentication pages
│   ├── shared/             # Shared components
│   └── App.tsx
├── schema.prisma           # Database schema
├── main.wasp              # Wasp configuration
└── package.json
```

## API Endpoints

The backend automatically provides these endpoints through Wasp actions/queries:

- `uploadResume` - Parse resume file
- `startInterview` - Initialize interview session
- `submitAnswer` - Submit answer and get next question
- `getTestResults` - Retrieve interview results

## Converting from MERN

This project was migrated from a MERN stack application to Wasp. Key changes:

- MongoDB → PostgreSQL with Prisma
- Express routes → Wasp actions/queries
- Manual auth → Wasp built-in auth
- Separate frontend/backend → Integrated Wasp fullstack

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes (keep messages short: 5-6 words)
4. Push to GitHub
5. Open a Pull Request

## License

MIT License

## Support

For issues and questions, please open an issue on GitHub.
