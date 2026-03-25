# ACE-Step Generation Setup Guide

## Status
✅ **UI Running**: http://localhost:5173
✅ **Backend Running**: http://localhost:3001
❌ **Generation**: Not working (ACE-Step not configured)

---

## The Issue
The backend is trying to generate music but can't find Python. It's looking for:
```
C:\Users\James\Documents\GitHub\ace-step-ui_NOXEdition\ACE-Step-1.5\env\Scripts\python.exe
```

This path doesn't exist yet, so generation fails with `ENOENT` (Error No ENTity).

---

## Solution: Set Up ACE-Step API (Recommended)

The easiest way is to run ACE-Step as a separate service (Gradio server), which the backend will use automatically.

### Option 1: Use start-all.bat (Easiest)
This handles everything for you:
```bash
Double-click start-all.bat
```

This will start:
1. ACE-Step API (port 8001)
2. Backend (port 3001)
3. Frontend (port 5173)

**Requirements:**
- ACE-Step1.5 folder exists ✅ (you have it)
- Python 3 installed
- Either Pinokio installed OR `uv` package manager

---

### Option 2: Manual ACE-Step Setup

#### Step 1: Install Python (if not already installed)
```bash
# Check if Python is installed
python --version

# If not, install from: https://www.python.org/
# Make sure to check "Add Python to PATH" during installation
```

#### Step 2: Create Virtual Environment in ACE-Step1.5
```bash
cd Ace-Step1.5
python -m venv env
env\Scripts\activate

# Or use PowerShell:
env\Scripts\Activate.ps1
```

#### Step 3: Install ACE-Step Dependencies
```bash
# With venv activated:
pip install -r requirements.txt

# Or if using uv:
uv pip install -r requirements.txt
```

#### Step 4: Start ACE-Step API
```bash
# Method A: Using Gradio/Web UI (Recommended)
python acestep/api_server.py

# Method B: Using uv
uv run acestep-api --port 8001
```

The ACE-Step API should start on http://localhost:8001

#### Step 5: Test Generation
The backend will automatically detect the running API and use it. Try generating music in the UI.

---

## Backup Source Setup (Python Spawn Fallback)

If Gradio isn't available, the backend falls back to direct Python spawning. This requires:

1. **Python venv in ACE-Step1.5:**
```bash
cd Ace-Step1.5
python -m venv env
env\Scripts\activate
pip install -r requirements.txt
```

2. **Deactivate venv** (keep it there though):
```bash
deactivate
```

3. **Restart the backend** - it will find `ACE-Step1.5\env\Scripts\python.exe` and use it

---

## Troubleshooting

### Python not found in PATH
```bash
# Find where Python is installed
where python

# If not found, reinstall Python and CHECK "Add to PATH"
```

### ACE-Step requirements not installed
```bash
cd Ace-Step1.5
env\Scripts\activate
pip install torch torchaudio transformers accelerate peft scipy librosa
deactivate
```

### Gradio server not starting
```bash
# Check if something is using port 8001
netstat -ano | findstr :8001

# If in use, kill it:
taskkill /PID <number> /F
```

### Still getting ENOENT errors
1. Make sure `Ace-Step1.5\env\Scripts\python.exe` exists
2. Check file permissions (can Node.js access it?)
3. Try running Python manually:
```bash
cd Ace-Step1.5
env\Scripts\python.exe --version
```

---

## Quick Checklist

- [ ] Python 3 installed (`python --version`)
- [ ] ACE-Step1.5 folder exists with models
- [ ] Virtual environment created: `ACE-Step1.5\env\Scripts\python.exe` exists
- [ ] Dependencies installed in venv
- [ ] ACE-Step API running on 8001 (test with curl/browser)
- [ ] Backend running on 3001
- [ ] Frontend running on 5173

---

## What's Working
- ✅ UI (React frontend)
- ✅ Backend API (Node.js/Express)
- ✅ Database (SQLite)
- ✅ Authentication
- ✅ File uploads
- ❌ Music generation (needs ACE-Step setup)

---

## What's Next
Once ACE-Step is configured, you'll be able to:
1. Generate music from text descriptions
2. Generate lyrics
3. Perform voice transformations
4. Create covers
5. Use all other AI features

---

## Commands Reference

```bash
# Start everything at once
start-all.bat

# OR start manually in 3 terminals:

# Terminal 1: ACE-Step API
cd Ace-Step1.5
python acestep/api_server.py

# Terminal 2: Backend
cd server
npm run dev

# Terminal 3: Frontend
npm run dev
```

---

## Environment Variables (Advanced)

If your Python is in a non-standard location, set it explicitly:

```bash
# In server/.env or system environment
PYTHON_PATH=C:\path\to\your\python.exe
```

---

## Need Help?
- Check ACE-Step documentation: https://github.com/GreenBuddies/ACE-Step-1.5
- Check backend logs in the terminal window
- Verify all three servers are running on the correct ports
- Ensure firewall isn't blocking ports 3001, 5173, 8001
