# Smart Attendance System

A face-recognition based attendance system built with React, Express, Prisma 8, and PostgreSQL.

**Live Demo:** [https://attendance-system-api-omega.vercel.app/](https://attendance-system-api-omega.vercel.app/)

---

## Prerequisites

Make sure you have these installed before starting:

| Tool | Version | Check |
|------|---------|-------|
| **Node.js** | v18+ (LTS) | `node --version` |
| **npm** | v8+ | `npm --version` |
| **Docker** | Any recent | `docker --version` |
| **Git** | Any recent | `git --version` |

> **Windows:** Docker Desktop must be running before Step 3.

---

## Setup Guide

### 1. Clone the Repository

```bash
git clone https://github.com/tanmayskotadia/attendance-system.git
cd attendance-system
```

---

### 2. Install Dependencies

From the **root directory**, run:

```bash
npm install
```

This installs packages for all three workspaces (`apps/api`, `apps/web`, `packages/shared`) and automatically builds the shared package.

---

### 3. Start the Local Database

```bash
docker compose up -d
```

This starts a PostgreSQL 15 container with:

| Setting | Value |
|---------|-------|
| Host | `localhost` |
| Port | `5432` |
| Username | `user` |
| Password | `password` |
| Database | `mydb` |

Verify it is running: `docker compose ps`

---

### 4. Configure Environment Variables

```bash
cd apps/api
```

**Linux / macOS:**
```bash
cp .env.example .env
```

**Windows (PowerShell):**
```powershell
Copy-Item .env.example .env
```

The default `.env` is already configured for Docker — no changes needed for local development:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/mydb"
PORT=3000
JWT_SECRET="change-me"

# Optional — leave blank to skip Gmail email features
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_REDIRECT_URI="http://localhost:3000/api/gmail/callback"
FRONTEND_URL="http://localhost:5173"
```

> For production, always change `JWT_SECRET` to a long, random string.

Return to root:
```bash
cd ../..
```

---

### 5. Initialize the Database Schema

This project uses **Prisma 8** (RC). Run this from the `apps/api` directory:

```bash
cd apps/api
npx prisma db update
cd ../..
```

> If prompted, type the database name (`mydb`) to confirm.

---

### 6. Download Face Recognition Models

The face scanner needs model weight files (~20 MB). Download them once:

```bash
cd apps/web
node download-models.cjs
cd ../..
```

This saves the models to `apps/web/public/models/`. Skip this step if the folder already has files.

---

### 7. Start the Development Servers

From the **root directory**:

```bash
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3000 |
| Health check | http://localhost:3000/health |

---

### 8. Create Your First Admin User

No default credentials exist. Register an admin via the API while the servers are running.

**Linux / macOS:**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123","name":"Admin","role":"ADMIN"}'
```

**Windows (PowerShell):**
```powershell
Invoke-RestMethod -Method POST `
  -Uri "http://localhost:3000/api/auth/register" `
  -ContentType "application/json" `
  -Body '{"email":"admin@example.com","password":"admin123","name":"Admin","role":"ADMIN"}'
```

---

### 9. Log In

Open [http://localhost:5173](http://localhost:5173) and log in with the credentials you just created.

**Setup complete!**

---

## Production Deployment

Deploy using **Vercel** (frontend) + **Render** (backend) + **Neon** (database).

### 1. Database — Neon

1. Create a project at [neon.tech](https://neon.tech).
2. Copy the connection string (e.g., `postgresql://user:pass@ep-xxx.neon.tech/db?sslmode=require`).
3. Temporarily set it as `DATABASE_URL` in `apps/api/.env`.
4. Run: `cd apps/api && npx prisma db update && cd ../..`

### 2. Backend — Render

Create a **Web Service** connected to your GitHub repo:

| Setting | Value |
|---------|-------|
| Build Command | `npm install --include=dev && npm run build -w @attendance/shared && npm run build -w @attendance/api` |
| Start Command | `npm run start -w @attendance/api` |

Set these environment variables in Render:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Neon connection string |
| `JWT_SECRET` | Long random string |
| `FRONTEND_URL` | Your Vercel URL (add after frontend deploy) |

### 3. Frontend — Vercel

Import your repo on [vercel.com](https://vercel.com). The `vercel.json` in the root auto-configures the build. Add one environment variable:

| Key | Value |
|-----|-------|
| `VITE_API_URL` | `https://your-render-url.onrender.com/api` |

After deploying, create an admin user using the production URL (same curl command, replacing `localhost:3000` with your Render URL).

---

## Troubleshooting

**Cannot connect to database**
- Run `docker compose up -d` and verify with `docker compose ps`.
- Check `DATABASE_URL` in `apps/api/.env` matches the Docker credentials.

**Face scanner not working**
- Run `node download-models.cjs` from `apps/web` to download model files.
- Webcam requires `localhost` in dev or HTTPS in production. Grant camera permissions in the browser.

**`@attendance/shared` not found**
- Run `npm run build -w @attendance/shared` from the root, or re-run `npm install`.

**Unauthorized / Invalid token**
- JWT tokens expire after **8 hours** — log in again.
- Ensure `JWT_SECRET` in `.env` has not changed since the token was issued.

**`npx prisma db update` fails**
- Make sure you are inside `apps/api`, not the root.
- Confirm the Docker container is running and PostgreSQL version is 15+
