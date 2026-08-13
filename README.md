# 🌌 SPACE — Infinite Workspace & Visual Canvas

**SPACE** is an ultra-fast, interactive infinite canvas workspace built with a **Django 5** REST backend and a bespoke, zero-dependency **Vanilla CSS3 & ES6 JavaScript** frontend. 

It provides an expansive, fluid environment where you can organize ideas, write code snippets, manage checklists, sketch whiteboards, and link ideas together using dynamic connection paths.

---

## ✨ Features & Node Types

### 🧠 4 Specialized Node Types
* **📝 NOTE Node**: Live dual-mode Markdown viewer with instant double-click inline editor.
* **💻 CODE Node**: Code editor with line numbers, language selection (`JavaScript`, `Python`, `HTML/CSS`, `SQL`, `JSON`), and single-click copy-to-clipboard.
* **☑️ TODO Node**: Interactive checklist with strike-through completion, task addition, and deletion.
* **🎨 CANVAS Node**: Whiteboard sketchpad with a 5-color palette, custom stroke controls, and automatic base64/media image persistence.

---

## ⚡ God-Ultra UI & Productivity Suite

SPACE is equipped with **15 advanced canvas interactions & productivity tools**:

| Feature | Description | Shortcut / Action |
|---|---|---|
| **🔍 Spotlight Search** | Fuzzy search across all node titles and content with instant fly-to viewport focus | `Ctrl + K` or Right-Click → Search |
| **🐭 Context Menu** | Canvas-aware glassmorphic right-click menu with context-specific actions | Right-Click anywhere |
| **⊡ Zoom-to-Fit** | Auto-calculates canvas bounding box and scales viewport to fit all nodes smoothly | `Ctrl + 0` or Toolbar `⊡` button |
| **📷 Export PNG** | Renders full canvas into a high-resolution `.png` snapshot download | Toolbar `📷` or Right-Click |
| **{ } Export JSON** | Exports full canvas state (nodes + bloodline connections) to `.json` file | Toolbar `↓` or Sidebar `↓ Export JSON` |
| **↑ Import JSON** | Restores canvas nodes & bloodline links from any exported `.json` file | Toolbar `↑` or Sidebar `↑ Import JSON` |
| **⧉ Auto-Layout** | Force-directed graph layout engine that auto-arranges and spaces out nodes | Toolbar `⧉` or Sidebar action |
| **🔭 Focus Mode** | Isolates a node by centering it and blurring out non-focused canvas content | Double-click header or Context Menu |
| **🏷️ Tag System** | Inline `#tag` parsing with real-time interactive tag filter bar at bottom | Click tags on `#tag-bar` |
| **⊞ Glass Sidebar** | Floating collapsible panel with canvas node statistics and quick node templates | Click `⊞ Panel` tab |
| **💬 Connection Tooltip** | Hovering connection paths displays preview cards of source and target nodes | Mouseover connection SVG |
| **✨ Particle Flow** | Animated glowing particles traveling along connection paths to show data flow | Auto-animated along links |
| **⏸️ Animation Toggle** | Instantly toggle all SVG flow, particle, and hover animations on/off | Sidebar → Settings → Animation Toggle |
| **📍 Bookmarks / Waypoints** | Save canvas viewport positions to numbers 1–5 and teleport instantly | `Ctrl + 1..5` (Save/Go) |
| **📐 Grid Snapping** | All node drag and resize actions snap cleanly to a 20px grid | Automatic on Drag/Resize |
| **↺ Global Undo/Redo** | Action registry tracking node movement and resize history | `Ctrl + Z` / `Ctrl + Y` |

---

## 🎹 Keyboard Shortcuts Quick Reference

| Shortcut | Action |
|---|---|
| `Ctrl + K` / `Cmd + K` | Open Spotlight Search bar |
| `Ctrl + 0` / `Cmd + 0` | Zoom canvas to fit all nodes |
| `Ctrl + Z` / `Cmd + Z` | Undo last node drag or resize |
| `Ctrl + Y` / `Cmd + Y` | Redo last undone action |
| `Alt + N` / `Option + N` | Open Node Type Picker |
| `Ctrl + 1..5` | Teleport to or save Canvas Waypoint 1–5 |
| `Escape` | Exit Focus Mode / Close Spotlight / Cancel connection |
| `Mouse Wheel` | Zoom in/out anchored directly to cursor position |
| `Click + Drag Canvas` | Pan infinite canvas viewport |

---

## 🛠️ Technology Stack

* **Backend**: Django 5.2, Python 3.12/3.14, SQLite (Development) / PostgreSQL (Production), WhiteNoise
* **Frontend**: HTML5, Vanilla CSS3 (Glassmorphism, CSS Custom Properties, SVG Keyframe Animations), Vanilla ES6 JavaScript (zero heavy frameworks or bundles)
* **API Security**: Standard CSRF cookie verification (`X-CSRFToken`), secure file upload endpoints (`POST /upload/`)

---

## 🚀 Getting Started (Local Development)

### 1. Prerequisites
* Python 3.10+
* Git

### 2. Installation

```bash
# Clone the repository
git clone https://github.com/your-username/SPACE.git
cd SPACE

# Create and activate virtual environment
# Linux/macOS:
python3 -m venv venv
source venv/bin/activate

# Windows:
python -m venv venv
.\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Environment Setup
Create a `.env` file in the project root (you can copy `.env.example`):

```bash
cp .env.example .env
```

Set appropriate values inside `.env`:
```ini
SECRET_KEY=your-django-secret-key
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:8000,http://127.0.0.1:8000
CSRF_TRUSTED_ORIGINS=http://localhost:8000,http://127.0.0.1:8000
```

### 4. Run Migrations & Start Server

```bash
# Run database migrations
python manage.py migrate

# (Optional) Run unit test suite
python manage.py test core

# Start Django development server
python manage.py runserver
```

Open your browser at `http://127.0.0.1:8000` to access SPACE.

---

## ☁️ Deploying to Vercel

SPACE is fully pre-configured for one-click deployment on **Vercel Serverless Functions**.

### Method 1: Deploy via Vercel CLI

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy from the project directory:
   ```bash
   vercel
   ```

4. Set Environment Variables in your Vercel Project Settings:
   - `SECRET_KEY`: A random secret string.
   - `DEBUG`: `False`
   - `ALLOWED_HOSTS`: `.vercel.app`
   - `CSRF_TRUSTED_ORIGINS`: `https://your-vercel-app-name.vercel.app`

5. Deploy to production:
   ```bash
   vercel --prod
   ```

---

### Method 2: Deploy via GitHub Integration

1. Push your repository to **GitHub**.
2. Go to the [Vercel Dashboard](https://vercel.com/new) and import your GitHub repository.
3. Under **Environment Variables**, configure:
   - `SECRET_KEY` = `your-secret-key`
   - `DEBUG` = `False`
   - `ALLOWED_HOSTS` = `.vercel.app`
4. Click **Deploy**. Vercel will automatically build the static assets via `build_files.sh` and deploy the Python WSGI serverless function configured in `vercel.json`.

---

## 📂 Project Structure

```
SPACE/
├── build_files.sh         # Vercel deployment build script
├── vercel.json            # Vercel serverless function & routing configuration
├── .vercelignore          # Vercel deployment exclusion rules
├── requirements.txt       # Python dependencies (Django, CorsHeaders, WhiteNoise)
├── manage.py              # Django CLI entrypoint
├── core/                  # Core Django App (Models, Views, URLs, Serializers)
│   ├── models.py          # Entity (Node) and Bloodline (Connection) models
│   ├── views.py           # REST API endpoints & HTML template views
│   ├── urls.py            # API routing
│   └── tests.py           # Comprehensive backend unit test suite
├── space_project/         # Django Project Configuration
│   ├── settings.py        # Settings, WhiteNoise, Security & CORS/CSRF
│   ├── wsgi.py            # WSGI callable & Vercel serverless handler alias
│   └── urls.py            # Root URL routing
├── static/                # Static Assets
│   ├── css/style.css      # Glassmorphic Design System & God-Ultra styles
│   └── js/main.js         # Infinite Canvas Engine & 15 God-Ultra features
└── templates/
    └── index.html         # Main Canvas Single Page Application view
```

---

## 🧪 Running Tests

To verify backend API integrity and database model behavior:

```bash
python manage.py test core
```

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for details.
