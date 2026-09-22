# 🏆 SportLog — SRM Student Achievement Portal

A full-stack SRMIST sports-achievement portal using a vanilla JavaScript SPA, Express, SQLite, JWT authentication and bcrypt.

## Run locally

```bash
npm install
cp .env.example .env
npm start
```

Open **http://localhost:3000**.

For development with auto-reload:

```bash
npm run dev
```

Optional demo data:

```bash
npm run seed
```

Demo login: `RA2111003010001` / `Demo@1234`

## What was fixed

- Restored the missing `public/` frontend structure so Express actually serves the site.
- Restored the missing client-side `app.js` that powers signup, login, session restore, CRUD, filtering, stats, edit/delete and UI feedback.
- Fixed SPA routing order so browser routes work while API 404s remain JSON.
- Added HTML escaping on dynamic data to prevent stored XSS in rendered achievement content.
- Added consistent backend validation for registration numbers, sports, levels, categories, dates and field lengths.
- Normalized registration numbers and email addresses during signup/login.
- Made production JWT configuration fail fast instead of silently using a development secret.
- Corrected “Recent Medal Winners” to include actual medal positions only.
- Added a real test script and JavaScript syntax check.
- Added missing Docker/Render support files and `.env.example` expected by the documented deployment.
- Improved responsive interaction, loading states, error handling and modal keyboard behavior.

## Commands

| Command | Purpose |
|---|---|
| `npm start` | Production server |
| `npm run dev` | Development server |
| `npm run check` | Syntax-check backend and frontend |
| `npm test` | Run automated tests |
| `npm run seed` | Add demo data |
| `npm run reset-db` | Recreate the SQLite database |

## API

- `GET /health`
- `POST /auth/signup`
- `POST /auth/login`
- `GET /auth/me`
- `GET /achievements`
- `GET /achievements/:id`
- `POST /achievements`
- `PUT /achievements/:id`
- `DELETE /achievements/:id`
- `GET /stats`

Achievement filters: `student_name`, `sport`, `level`, `class`.

## Deployment

Docker:

```bash
docker compose up -d --build
```

Render reads `render.yaml` and uses the configured persistent disk for SQLite.

> Never commit `.env` or production secrets. The checked-in `.env.example` contains placeholders only.
