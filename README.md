# Auto Oche

A voice-assisted local darts scorer for 501 double-out. It supports a solo game or a two-player hot-seat match, manual scoring in every browser, and spoken scoring in Chrome and Edge.

## Run locally

With GNU Make available, run `make dev` from the repository root. It opens the API and React development servers in separate PowerShell windows. Open the frontend URL shown there (normally `http://localhost:5173`).

Alternatively, start the API from `backend` with `.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload`, then start the React app from `frontend` with `pnpm dev` (or `npm run dev` if pnpm is not installed).

Speak a visit total such as `one hundred and forty`, or dart calls separated by commas such as `triple twenty, triple twenty, bull`. The scorer is deliberately push-to-talk; it never listens continuously.

Completed match history and an in-progress match live in browser storage. The backend is stateless so the same Docker image can run on Render's free web service.

## Verification

Run Python tests from `backend` with `pytest`, and build the client from `frontend` with `npm run build`.
