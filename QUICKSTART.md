# ACE-Step UI - Quick Start Guide

## Prerequisites
- **Node.js 18+** (Download from https://nodejs.org/)
- **Python 3** (for ACE-Step music generation) - Download from https://www.python.org/
- **Visual C++ Build Tools** (for native module compilation)

## Installation & Running

### Easiest Way: Use start-all.bat
```bash
Double-click start-all.bat
```

This starts:
- ACE-Step API (music generation) at http://localhost:8001
- Backend at http://localhost:3001
- Frontend at http://localhost:5173

**Requirements:** Python 3 + ACE-Step1.5 folder

---

### Quick Setup: Just UI + Backend
```bash
Double-click launcher.bat
```

Access at: http://localhost:5173

⚠️ Note: Music generation won't work without ACE-Step API. See ACESTEP_SETUP.md for setup.

---

## What's Working
✅ UI loads at http://localhost:5173
✅ Backend API at http://localhost:3001  
✅ Database & file uploads
✅ Authentication & profile management

❌ Music generation requires ACE-Step setup (see ACESTEP_SETUP.md)

## Environment Variables
Frontend uses `.env`:
```
VITE_API_URL=http://localhost:3001
```

Backend uses `server/.env`:
```
PORT=3001
ACESTEP_API_URL=http://localhost:8001
```

## Stopping
Close the terminal windows or press Ctrl+C

## Next Steps
1. **To enable music generation:** Follow ACESTEP_SETUP.md
2. **For detailed startup options:** See STARTUP_GUIDE.md
3. **For troubleshooting:** See STARTUP_GUIDE.md or ACESTEP_SETUP.md
