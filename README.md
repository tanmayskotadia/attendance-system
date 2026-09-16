# Smart Attendance System

A full-stack, monorepo-based smart attendance management system built with **React**, **Express**, **Prisma 8**, **PostgreSQL**, and **face-api.js** (for facial recognition).

---

## ?? Architecture & Tech Stack

This project is a monorepo using npm workspaces:

- `apps/web`: The frontend, built with React, Vite, and Zustand. Uses `face-api.js` for client-side face detection and embeddings.
- `apps/api`: The backend, built with Node.js, Express, and Prisma 8 ORM.
- `packages/shared`: Shared TypeScript types and constants (like time slots and domain models) used by both the frontend and backend.

---

## ?? Local Development Setup Guide

If you are a new developer joining the project, follow these steps exactly to get your local environment running.

### 1. Prerequisites

- **Node.js**: v18 or higher (LTS recommended)
- **Docker**: For running a local PostgreSQL database (Recommended for local dev)
- **Git**

### 2. Clone and Install Dependencies

Clone the repository and install all dependencies from the root directory. This will automatically install packages for the web, api, and shared workspaces.

```bash
git clone https://github.com/tanmayskotadia/attendance-system.git
cd attendance-system
npm install
```

### 3. Database & Environment Configuration

You can start a local PostgreSQL database instantly using Docker.

1. From the root directory, start the database:
   ```bash
   docker compose up -d
   ```
2. Navigate to the API folder and copy the example environment file:
   ```bash
   cd apps/api
   
   # Linux/macOS
   cp .env.example .env
   
   # Windows (PowerShell)
   Copy-Item .env.example .env
   ```
   *(The `.env.example` is already pre-configured to connect to the Docker database).*

### 4. Initialize the Database (Prisma 8)

This project uses **Prisma 8** (currently in release candidate), which has a slightly different CLI than older versions of Prisma.

From the `apps/api` directory, run:

1. **Update the database schema:**
   ```bash
   npx prisma db update
   ```
   *(If prompted to confirm, type the database name as requested).*

2. Return to the root directory:
   ```bash
   cd ../..
   ```

### 5. Build the Shared Package

The monorepo has a shared TypeScript package (`packages/shared`) used by both frontend and backend. Build it once before starting dev (this also runs automatically after `npm install`):

```bash
npm run build -w @attendance/shared
```

### 6. Start the Development Servers

You can run both the frontend and backend simultaneously from the **root directory**:

```bash
npm run dev
```

- **Frontend:** [http://localhost:5173](http://localhost:5173)
- **Backend API:** [http://localhost:3000](http://localhost:3000)

### 7. First Login & Registration

There are no hardcoded default admin credentials. To create your first admin user:

1. While the servers are running, open a new terminal.
2. Send a POST request to the local API to register an admin user:

   **Linux/macOS (cURL):**
   ```bash
   curl -X POST http://localhost:3000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@example.com","password":"admin123","name":"Dr. RAJA M","role":"ADMIN"}'
   ```

   **Windows (PowerShell):**
   ```powershell
   Invoke-RestMethod -Method POST -Uri "http://localhost:3000/api/auth/register" -ContentType "application/json" -Body '{"email":"admin@example.com","password":"admin123","name":"Dr. RAJA M","role":"ADMIN"}'
   ```
3. You can now log into the frontend at [http://localhost:5173](http://localhost:5173) using the email and password you just created.

**Default admin credentials (production):**

| Field | Value |
|-------|-------|
| Email | `admin@example.com` |
| Password | `admin123` |

**Production app:** [https://attendance-system-api-omega.vercel.app/](https://attendance-system-api-omega.vercel.app/)

---

## ?? Production Deployment Guide

This project is configured to be easily deployed to **Vercel** (Frontend) and **Render** (Backend), using a **Neon** PostgreSQL database.

### 1. Database (Neon)
1. Create a new PostgreSQL database on Neon.
2. Get your connection string (e.g., `postgresql://user:pass@ep-cool-db.neon.tech/dbname?sslmode=require`).
3. Set this connection string in your local `apps/api/.env` file.
4. Run `npx prisma db update` from `apps/api` to push the tables to Neon.

### 2. Backend API (Render)
Create a new **Web Service** on Render connected to your GitHub repo.
- **Root Directory:** *(leave blank)*
- **Build Command:** `npm install --include=dev && npm run build -w @attendance/shared && npm run build -w @attendance/api`
- **Start Command:** `npm run start -w @attendance/api`
- **Environment Variables:**
  - `DATABASE_URL`: Your Neon connection string
  - `JWT_SECRET`: A secure random string

*Note your live Render URL once deployed (e.g., `https://attendance-api-xyz.onrender.com`).*

### 3. Frontend (Vercel)
Create a new project on Vercel connected to your GitHub repo. The project includes a `vercel.json` file that automatically configures the monorepo build, but ensure the following:
- **Framework Preset:** Vite (or Other)
- **Environment Variables:**
  - `VITE_API_URL`: Your Render backend URL **with `/api` appended** (e.g., `https://attendance-api-xyz.onrender.com/api`)

Once deployed, the frontend will communicate with the live backend, which stores data in your cloud database.

---

## ?? Face Recognition Note

The frontend uses `face-api.js` for facial recognition. 
- The model weights are stored in `apps/web/public/models/`.
- For the camera and facial recognition to work properly in production, the site **must** be served over HTTPS. Vercel handles this automatically.
