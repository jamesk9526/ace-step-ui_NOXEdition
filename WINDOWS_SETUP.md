# ACE-Step UI Complete Setup - Windows Guide

## Current Status Summary
```
✅ Node.js installed (v20.18.1)
✅ Project dependencies installed
✅ Frontend running (http://localhost:5173)
✅ Backend running (http://localhost:3001)
❌ Music generation (needs ACE-Step API)
```

---

## What You Have
- `Ace-Step1.5/` folder with models
- `launcher.bat` - starts UI + backend
- `start-all.bat` - starts everything including ACE-Step API
- Frontend (React) at port 5173
- Backend (Express) at port 3001

---

## The Missing Piece: ACE-Step API

Music generation requires ACE-Step API running on port 8001. The backend will automatically use it.

### Fastest Solution: Use start-all.bat

```bash
# Just double-click this file OR run from command prompt:
start-all.bat
```

This script will:
1. ✅ Detect your ACE-Step1.5 setup
2. ✅ Start ACE-Step API on port 8001
3. ✅ Start backend on port 3001
4. ✅ Start frontend on port 5173
5. ✅ Open http://localhost:5173 in browser

**What it needs:**
- Python 3 (must be in system PATH)
- OR `uv` package manager
- OR Pinokio (if you're using that)

---

## Step-by-Step: Manual ACE-Step Setup

### Step 1: Verify Python
```bash
# Open Command Prompt and check:
python --version

# Should show Python 3.x.x

# If not found, install from: https://www.python.org/
# IMPORTANT: Check "Add Python to PATH" during installation
```

### Step 2: Create Virtual Environment
```bash
# Open Command Prompt in the project folder
cd ace-step-ui_NOXEdition

# Create venv for ACE-Step
cd Ace-Step1.5
python -m venv env
```

This creates `Ace-Step1.5\env\` folder with Python.

### Step 3: Activate Virtual Environment
```bash
# PowerShell:
env\Scripts\Activate.ps1

# Or Command Prompt:
env\Scripts\activate.bat

# You should see (env) in your terminal prompt
```

### Step 4: Install Dependencies
With the venv activated, run:
```bash
pip install -r requirements.txt
```

Or if that fails:
```bash
pip install torch torchaudio transformers accelerate peft scipy librosa numpy
```

### Step 5: Start ACE-Step API
With venv still activated:
```bash
python acestep/api_server.py
```

You should see output like:
```
Loaded model: acestep-v15-turbo
Starting Gradio interface...
Running on http://127.0.0.1:7860/
```

### Step 6: Start Other Services
In separate terminals:

**Terminal 2 - Backend:**
```bash
cd ace-step-ui_NOXEdition\server
npm run dev
```

**Terminal 3 - Frontend:**
```bash
cd ace-step-ui_NOXEdition
npm run dev
```

### Step 7: Test Generation
Visit http://localhost:5173 and try generating music!

---

## Easier: Using Pinokio (if installed)

If you have Pinokio, it can handle ACE-Step setup automatically:

1. Open Pinokio
2. Add `Ace-Step-1.5` repository
3. Install it via Pinokio UI
4. Pinokio will create Python environment for you

Then just use `launcher.bat` or `start-all.bat` and Pinokio's Python will be found.

---

## Even Easier: Using UV Package Manager

If you have `uv` installed:

```bash
# In Ace-Step1.5 folder:
cd Ace-Step1.5
uv run acestep-api --port 8001
```

`uv` manages Python virtual environments automatically!

Get it from: https://astral.sh/blog/uv

---

## Troubleshooting

### Error: "python not found"
```bash
# Make sure Python is in system PATH
where python

# If not found:
# 1. Download Python from https://www.python.org/
# 2. Run installer
# 3. CHECK "Add Python to PATH" checkbox
# 4. Restart terminal
# 5. Verify: python --version
```

### Error: "env/Scripts/python.exe ENOENT"
This means the virtual environment wasn't created correctly:
```bash
cd Ace-Step1.5
# Delete old env if it exists
rmdir env /s /q

# Recreate it
python -m venv env
env\Scripts\activate
pip install -r requirements.txt
```

### Ports already in use
Check what's using the port:
```bash
netstat -ano | findstr :8001
netstat -ano | findstr :3001
netstat -ano | findstr :5173

# Kill process by PID:
taskkill /PID 1234 /F
```

### Requirements installation fails
Try installing packages individually:
```bash
env\Scripts\activate
pip install torch
pip install torchaudio
pip install transformers
pip install accelerate
pip install scipy
pip install librosa
```

Or use a simpler command:
```bash
pip install --upgrade pip
pip install -r requirements.txt --no-cache-dir
```

---

## Full Startup Sequence

**All at once (easiest):**
```bash
Double-click start-all.bat
```

**Manually (3 terminals):**

Terminal 1:
```bash
cd Ace-Step1.5
env\Scripts\activate
python acestep/api_server.py
```

Terminal 2:
```bash
cd server
npm run dev
```

Terminal 3:
```bash
npm run dev
```

---

## What Each Port Does

| Port | Service | URL |
|------|---------|-----|
| 8001 | ACE-Step API | http://localhost:8001 |
| 3001 | Backend API | http://localhost:3001 |
| 5173 | Frontend UI | http://localhost:5173 |

---

## After Setup Complete

You should have:
- ✅ ACE-Step API running (port 8001)
- ✅ Backend running (port 3001)
- ✅ Frontend running (port 5173)

Then you can:
1. Open http://localhost:5173
2. Create an account
3. Generate music!
4. Upload audio files
5. Transform voices
6. And more!

---

## Important Notes

- **Keep all 3 services running** - if one stops, that feature stops working
- **First-time setup** takes time - models are being loaded into memory
- **Generation takes time** - CPU/GPU intensive, may take 30+ seconds per song
- **Port conflicts** - if ports are in use, stop other apps or change ports in `.env`

---

## Files You Created/Updated
- ✅ `launcher.bat` - Simple start (UI + backend only)
- ✅ `start-all.bat` - Full start (including ACE-Step API)
- ✅ `setup.bat` - Install dependencies
- ✅ `diagnose-ports.bat` - Check/kill ports
- ✅ `QUICKSTART.md` - Quick reference
- ✅ `STARTUP_GUIDE.md` - Detailed startup info
- ✅ `ACESTEP_SETUP.md` - This guide

---

## Next Steps

1. **Option A (Easiest):** Double-click `start-all.bat` and follow prompts
2. **Option B (Manual):** Follow "Step-by-Step" section above
3. **Option C (Pinokio):** Use Pinokio to manage ACE-Step

Then test the UI at http://localhost:5173!
