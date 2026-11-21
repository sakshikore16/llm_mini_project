# Aura — AI learning companion

Aura is a full-stack, study-only AI tutor built with React, TypeScript, Express, and Gemini 3.5 Flash-Lite. It streams model responses and can answer questions grounded in uploaded study materials. Unrelated general-assistant requests are redirected back to learning.

## Features

- Streaming Gemini conversations and Learn, Study, Quiz, Explore, and Code modes. Starter actions ask learners to name their topic before the tutor begins.
- Code task selector for generation, code explanations, debugging/correction, and security review.
- Prompt techniques include tutor role prompting, zero-shot, few-shot, and step-by-step learner-facing explanations. The Evaluation Lab compares zero-shot, few-shot, and step-by-step outputs side by side for the same task.
- Ten-problem Python benchmark with expected check cases, model response timing, and learner-recorded pass/review/fail results. Benchmark records stay in browser localStorage.
- Run generated Python snippets or edited code in a browser Web Worker powered by Pyodide. Runs have an eight-second timeout and bounded visible output; the code is not executed on the Aura server.
- Upload up to 6 PDF, DOCX, TXT, Markdown, CSV, source-code, PNG, JPEG, WebP, or GIF files per chat. Images are sent to Gemini for vision; document text is extracted server-side.
- Document answers receive source labels such as `[Source: lecture-notes.pdf]` so learners can trace material used in a response.
- Local conversation history, search, delete, copy response, and light/dark themes.
- API key stays server-side; files are processed in memory and are not persisted.
- Rate limits for chat and upload requests, file size limits, responsive UI, and single-service production hosting.

PDFs must contain selectable text. Scanned pages need OCR before upload. Study documents and source files are text-extracted and bounded to 18,000 characters each; this is lightweight retrieval context, not a vector database. Image inputs go directly to Gemini. Python execution is opt-in and happens in a browser worker using Pyodide; the first run downloads the runtime from jsDelivr and needs internet access. The runner is a learning convenience, not a hardened security sandbox. Review code before running it and do not use it for untrusted code. The server never executes learner code.

## Code evaluation workflow

Open **Code evaluation lab** from the sidebar. Generate solutions for the ten included Python problems, review each solution, run its Python block in the in-app browser runner against the listed checks, then mark it Pass, Needs review, or Fail. Aura records each generation time and keeps the learner-reviewed results in browser localStorage. The Prompt comparison tab sends one task with zero-shot, few-shot, and step-by-step instructions so you can compare response structure and latency. The code runner does not automatically judge correctness; the learner checks expected cases and records the result.

## Run locally

1. Use Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and create a Gemini API key at [Google AI Studio](https://aistudio.google.com/apikey). Set `GEMINI_API_KEY` in `.env`. Do not commit `.env`.
4. Run `npm run dev` and open the Vite URL. The API runs on port 4000.

The default model is `gemini-3.5-flash-lite`. To choose another available Gemini model, set `GEMINI_MODEL`. A compatible non-Gemini provider can be configured with `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`; clear `GEMINI_API_KEY` when switching providers.

## Deploy

The included `render.yaml` deploys Aura as one Render web service on the free compute plan. Create the service from the repository, then add `GEMINI_API_KEY` under **Environment** in Render before deployment. Free Render services spin down when idle and their local filesystem is ephemeral, so conversations remain in each browser but uploaded files are temporary. The service serves the Vite build and API from the same origin. For another Node host, use:

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Secret environment variable: `GEMINI_API_KEY`

Never put the API key in a `VITE_` variable or client-side code. The host needs outbound HTTPS access to Google’s Gemini API. The key belongs to the host operator; users do not need to supply a key.

## Architecture

```text
React + Vite
   ├── /api/chat   → Express → Gemini OpenAI-compatible chat completions (SSE)
   ├── /api/upload → Express → PDF/DOCX/text extraction + image data handling
   └── localStorage → browser conversation history
```

## Portfolio discussion

The project demonstrates system prompt design, mode-specific tutoring, pretrained-model inference, streaming, multimodal input, document ingestion, source attribution, rate limiting, environment-based secrets, and production frontend/API hosting. To extend it for multiple real users, add authentication, durable user-scoped conversations, background document processing, OCR, embeddings and a vector store, abuse monitoring, and per-user quotas.
