# ACE-Step UI - Startup Scripts Guide

## Available Startup Scripts

### 1. **launcher.bat** (Recommended for most users)
Simple launcher that:
- Checks Node.js is installed
- Verifies dependencies exist
- Starts backend AND frontend servers
- Opens the app in your browser

**Usage:**
```bash
Double-click launcher.bat
OR
launcher.bat
```

**Ports:**
- Frontend: http://localhost:5173
- Backend: http://localhost:3001

---

### 2. **start.bat** (Frontend + Backend only)
Starts just the UI backend and frontend servers, without ACE-Step API.

Use this if you have ACE-Step API running separately elsewhere.

**Usage:**
```bash
Double-click start.bat
OR
start.bat
```

**Ports:**
- Frontend: http://localhost:5173
- Backend: http://localhost:3001

---

### 3. **start-all.bat** (Everything)
Starts all three services:
1. ACE-Step API server
2. ACE-Step UI backend
3. ACE-Step UI frontend

**Prerequisites:**
- ACE-Step1.5 folder must exist in the same directory or set `ACESTEP_PATH` environment variable
- Python 3 installed (for ACE-Step API)
- Either `uv` package manager OR embedded Python in ACE-Step1.5

**Usage:**
```bash
Double-click start-all.bat
OR
start-all.bat
```

**Ports:**
- ACE-Step API: http://localhost:8001
- Backend: http://localhost:3001
- Frontend: http://localhost:5173

---

### 4. **setup.bat** (Initial Setup)
Run this FIRST if it's your first time:
- Installs all npm dependencies (frontend)
- Installs all server dependencies (includes native modules)
- Creates necessary .env files
- Creates data directories

**Usage:**
```bash
Double-click setup.bat
```

*You only need to run this once, or if you move the project.*

---

## Quick Start

### First Time?
```bash
1. setup.bat
2. launcher.bat
```

### Subsequent Times?
```bash
launcher.bat
```

---

## Troubleshooting

### "Port already in use" error
Some other process is using the port. Kill it:
```bash
REM Find process using port 3001
netstat -ano | findstr :3001

REM Kill the process (replace PID with actual number)
taskkill /PID 1234 /F

REM Or change the port in server/.env
```

### "Node.js not found"
Install Node.js 18+: https://nodejs.org/

### "tsx module not found"
```bash
cd server
npm install --legacy-peer-deps
cd ..
```

### "better-sqlite3 build failed"
Install build tools:
- **Python 3**: https://www.python.org/
- **Visual C++ Build Tools**: https://visualstudio.microsoft.com/visual-cpp-build-tools/

Then run:
```bash
cd server
npm install --legacy-peer-deps
```

### ACE-Step API not found (start-all.bat error)
Make sure ACE-Step1.5 folder exists in the project directory. It should look like:
```
ace-step-ui/
├── Ace-Step1.5/
├── launcher.bat
├── start-all.bat
└── ...
```

---

## Manual Setup (if batch scripts don't work)

```bash
REM Install frontend dependencies
npm install --legacy-peer-deps

REM Install server dependencies
cd server
npm install --legacy-peer-deps
cd ..

REM Terminal 1 - Backend
cd server
npm run dev

REM Terminal 2 - Frontend
npm run dev

REM Terminal 3 (optional) - ACE-Step API
cd ../Ace-Step1.5
uv run acestep-api --port 8001
```

---

## Environment Variables

### Frontend (.env)
```
VITE_API_URL=http://localhost:3001
FRONTEND_URL=http://localhost:5173
```

### Backend (server/.env)
```
PORT=3001
NODE_ENV=development
ACESTEP_PATH=./Ace-Step1.5
ACESTEP_API_URL=http://localhost:8001
DATABASE_PATH=./data/acestep.db
JWT_SECRET=ace-step-ui-local-secret
```

---

## Stopping the Application

**Method 1:** Close the terminal windows
**Method 2:** Press Ctrl+C in the terminal windows
**Method 3:** Use Command Prompt/PowerShell:
```bash
REM Kill by port
netstat -ano | findstr :3001
taskkill /PID <number> /F

netstat -ano | findstr :5173
taskkill /PID <number> /F
```

---

## File Structure
```
ace-step-ui/
├── launcher.bat              ← Start here (easy)
├── setup.bat                 ← Run first time only
├── start.bat                 ← Start without ACE-Step API
├── start-all.bat             ← Start everything
├── QUICKSTART.md             ← Quick reference
├── server/
│   ├── package.json
│   ├── src/
│   ├── .env                  ← Backend config
│   ├── data/                 ← SQLite database
│   └── public/               ← Static files
├── components/               ← React components
├── services/                 ← API services
├── Ace-Step1.5/             ← AI models (if present)
└── ...
```

---

## Ports Reference
| Service | Port | URL |
|---------|------|-----|
| ACE-Step API | 8001 | http://localhost:8001 |
| Backend API | 3001 | http://localhost:3001 |
| Frontend | 5173 | http://localhost:5173 |

---

## Notes
- **Frontend HMR**: Changes to React code auto-reload
- **Backend**: Requires manual restart for code changes
- **Database**: SQLite stored in `server/data/acestep.db`
- **Logs**: Check the terminal windows for server output/errors
