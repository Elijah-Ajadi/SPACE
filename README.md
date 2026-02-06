# SPACE Project

A modern Django-based web application for Alucard's Space.

## Project Description

SPACE is a full-stack platform designed to provide a rich user experience with a focus on visual excellence and dynamic interactions. It features a robust backend powered by Django and a responsive frontend.

## Installation Steps

### Prerequisites
- Python 3.10 or higher
- `pip` (Python package manager)
- Virtual Environment (recommended)

---

### Linux / macOS

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd SPACE
   ```

2. **Create and activate a virtual environment:**
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables:**
   Create a `.env` file in the root directory:
   ```bash
   cp .env.example .env  # Or create it manually
   ```
   Add your `SECRET_KEY` and other settings to `.env`.

5. **Run migrations:**
   ```bash
   python manage.py migrate
   ```

6. **Start the development server:**
   ```bash
   python manage.py runserver
   ```

---

### Windows

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd SPACE
   ```

2. **Create and activate a virtual environment:**
   ```bash
   python -m venv venv
   .\venv\Scripts\activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables:**
   Create a `.env` file in the root directory and add your `SECRET_KEY` and other settings.

5. **Run migrations:**
   ```bash
   python manage.py migrate
   ```

6. **Start the development server:**
   ```bash
   python manage.py runserver
   ```

## Usage

Access the application at `http://127.0.0.1:8000/`.
