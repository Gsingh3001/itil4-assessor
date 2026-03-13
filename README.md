# ITSM Maturity Assessor — v10

## Setup

```bash
npm install
npm run dev
```
Open http://localhost:5173

## Login
- Username: `Admin` / Password: `Admin` (full admin access)
- Create additional users via Admin → User Management

## What's New in v10
- **Excel-driven question bank** — `public/question-bank.xlsx` (816 questions, 34 practices)
- **Competency levels** — Beginner / Practitioner / Expert per practice
- **Branching engine** — inline follow-up questions for Partial/No answers
- **5-dimensional scoring** — PE, PC, MM, CI, TI with weighted overall score
- **Dimensional report** — per-dimension radar and bar breakdown per practice

## Deployment (Vercel)
Push to GitHub → Import in Vercel → Deploy. `vercel.json` handles SPA routing.

## Question Bank
The question bank lives at `public/question-bank.xlsx`. Consultants can replace this file 
to customise questions without touching any code. The app falls back gracefully to a 
skeleton QB if the file is missing.

## Scoring Formula
```
dimScore = 1 + (earnedPoints / maxPoints) × 4   → [1.0–5.0]
overall  = PE×20% + PC×25% + MM×25% + CI×20% + TI×10%
```

## Structure
```
itil-v10/
├── public/
│   └── question-bank.xlsx     ← 816 questions, 34 practices
├── src/
│   ├── main.jsx
│   └── App.jsx                ← ~1600 lines, single-file app
├── index.html
├── package.json
├── vite.config.js
└── vercel.json
```
