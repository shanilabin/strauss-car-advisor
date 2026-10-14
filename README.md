# יועץ הרכב של שטראוס

בוט AI בעברית שעונה לעובד: **"מה יקרה לנטו שלי אם אעבור לרכב חשמלי, אקח רכב אחר או אוותר על הרכב?"**
המודל משוחח ומסביר; **החישוב נעשה בקוד**, מאומת מול גיליון הייחוס של האתגר (36/36), ושווי השימוש נשלף ממאגר רשות המסים לפי המפתח הרשמי.

> האקתון AI קוד פתוח 2026 · אתגר שטראוס

## מבנה

| תיקייה | מה | טכנולוגיה |
|---|---|---|
| `api/` | מנוע נטו, סוכן, API | Python 3.12 · FastAPI · Pydantic · PydanticAI |
| `web/` | מסך עובד, מסך נציג, השוואה | Next.js 16 · Tailwind · shadcn/ui |
| `api/config/` | כללים, קטלוג, עיסוקים (נתונים, לא קוד) | JSON |
| `supabase/` | סכמת מסד הנתונים | Postgres · RLS · Realtime |
| `research/` | הוכחת נוסחת הנטו + המרת קבצי האתגר | Python |
| `data/source/` | קבצי האתגר המקוריים + מאגר רשות המסים | — |

פירוט מלא: [ARCHITECTURE.md](ARCHITECTURE.md) · תוכנית: [PLAN.md](PLAN.md) · משימות: [TASKS.md](TASKS.md) · הסבר מלא: [GUIDE.md](GUIDE.md)

## הרצה מקומית

דרישות: Node 22+, pnpm, [uv](https://docs.astral.sh/uv/).

```bash
# API (טרמינל 1)
cd api
cp .env.example .env.local      # וממלאות ערכים
uv sync
uv run uvicorn index:app --reload --port 8000
```

```bash
# Web (טרמינל 2)
cd web
cp .env.example .env.local
pnpm install
pnpm dev
```

פותחות http://localhost:3000. תיעוד ה-API: http://localhost:8000/docs

## בדיקות

```bash
cd api && uv run pytest
cd web && pnpm lint && pnpm typecheck
```

## עדכון הכללים
הכללים, הקטלוג והעיסוקים נמצאים ב-`api/config/`. בפיילוט מחליפים את הקבצים, לא את הקוד.
כדי לייצר אותם מחדש מקבצי האתגר:
```bash
uv run --project api --with openpyxl python research/build_config.py
```
