# ארכיטקטורה - יועץ הרכב של שטראוס

> המסמך הזה הוא **החוזה** בין שתי המפתחות. כל החלטה כאן סגורה. שינוי נעשה רק בהסכמת שתיכן, ומעדכנים את המסמך באותו PR.

---

## 0. עקרונות מנחים (מה השופטות צריכות לראות בקוד)

| # | עיקרון | איך זה נראה בקוד |
|---|---|---|
| 1 | **המודל מדבר, הקוד מחשב** | `domain/` לא מייבא שום דבר של AI, רשת או DB. ה-LLM מקבל רק תוצאות מוכנות |
| 2 | **ארכיטקטורה משושה (Ports & Adapters)** | הליבה מגדירה ממשקים (`ports/`), והמימושים (Supabase, CSV, זיכרון) מתחברים מבחוץ. החלפת DB לא נוגעת בלוגיקה |
| 3 | **הקונפיגורציה היא נתונים** | כל מספר עסקי נמצא ב-`config/` (JSON) ומאומת ב-Pydantic. בקוד אין "3500" או "0.35" |
| 4 | **חוזה תחילה (Contract-first)** | מודלי Pydantic ← OpenAPI ← טיפוסי TypeScript מיוצרים. אין כפילות ידנית של טיפוסים |
| 5 | **דטרמיניזם וביקורתיות** | `Decimal`, פונקציות טהורות, כל השוואה נשמרת עם גרסת קונפיג וגרסת מנוע |
| 6 | **לא מנחשים** | `missing_fields()` בקוד קובעת מה חסר ואת מי שואלים; Number Guard חוסם מספרים שלא הגיעו מהמנוע |
| 7 | **פרטיות כברירת מחדל** | תלוש מעובד בזיכרון ולא נשמר; ת"ז מוסתרת לפני שליחה למודל; RLS על כל טבלה |
| 8 | **שרידות** | שרשרת מודלים, ואם כולם נופלים, מצב טופס על אותו מנוע |

---

## 1. תמונת מערכת

```
                         ┌──────────────────────────── Vercel: strauss-web (Next.js 16) ─────────────────────────────┐
  עובד (נייד/מחשב) ────► │ /             דף פתיחה: "התחל שיחה" / "עובד לדוגמה"                                       │
                         │ /c/[id]       צ'אט ┃ כרטיס פרופיל ┃ מפת אפשרויות ┃ השוואה + גרף מפל ┃ פאנל מתחת למכסה   │
  נציג ────────────────► │ /rep          תור שאלות פתוחות ← מענה                                                    │
                         │ /admin        קונפיג פעיל ← העלאה ← דוח אימות ← הפעלה                                    │
                         └───────┬──────────────────────────────────────────────────────────────▲──────────────────┘
                                 │ fetch + JWT (טיפוסים מ-OpenAPI)                                │ Supabase Realtime
                                 │                                                               │ (messages, rep_questions,
                         ┌───────▼────────────── Vercel: strauss-api (FastAPI, Python 3.12) ─────┴──┐  conversations, agent_events)
                         │ http/      routers · auth (אימות JWT של Supabase) · שגיאות אחידות         │
                         │ services/  conversation · rep · options · payslip · config_admin          │
                         │ agent/     PydanticAI Agent · 7 כלים · Number Guard · FallbackModel       │
                         │ domain/    ★ ליבה טהורה: net · gross_up · eligibility · options ·         │
                         │            compare · waterfall · explain · missing                        │
                         │ config/    סכימת Pydantic לחבילת הקונפיג + אימות הצלבות                   │
                         │ ports/     ValueOfUseRepo · ConfigRepo · ConversationRepo · EventSink      │
                         │ adapters/  supabase_* · csv_* · memory_*                                   │
                         └───────┬───────────────────────────────────────────────┬──────────────────┘
                                 │ supabase-py (secret key, שרת בלבד)              │ HTTPS
                         ┌───────▼──────────── Supabase (Frankfurt) ──────┐   ┌────▼───────────────────────┐
                         │ Postgres + RLS + Realtime + Auth (anonymous)   │   │ Gemini 2.5 Flash           │
                         │ value_of_use (77,988) · config_versions ·      │   │  → OpenRouter :free        │
                         │ conversations · messages · rep_questions ·     │   │  → Groq                    │
                         │ comparisons · agent_events                     │   └────────────────────────────┘
                         └────────────────────────────────────────────────┘
```

**למה שני פרויקטי Vercel ולא אחד?** כל אחד מזוהה אוטומטית (Next.js / FastAPI) בלי הגדרות, עולה ונכשל בנפרד, ושייך לתיקייה של מפתחת אחת. Next.js מעביר `/api/*` ל-strauss-api באמצעות `rewrites`, כך שמהדפדפן זו כתובת אחת ואין בעיות CORS.

---

## 2. מבנה הריפו ובעלות על תיקיות

```
strauss-car-advisor/
├─ api/                          👩‍💻 א׳  ── Python (uv)
│  ├─ pyproject.toml             [tool.vercel] entrypoint = "index:app"
│  ├─ index.py                   נקודת הכניסה של Vercel (מייבא את strauss.http.app)
│  ├─ uv.lock
│  ├─ strauss/
│  │  ├─ domain/                 ★ טהור: אין I/O, אין AI, אין import מחוץ ל-domain/config
│  │  │  ├─ money.py             Decimal, עיגול, פורמט
│  │  │  ├─ models.py            Profile, Arrangement, Option, NetBreakdown, OptionResult, Comparison…
│  │  │  ├─ tax.py               מדרגות, ב"ל+בריאות, זיכויים
│  │  │  ├─ net.py               compute_net(profile, arrangement, cfg) → NetBreakdown
│  │  │  ├─ gross_up.py          solve_gross_up(...) - חיפוש בינארי
│  │  │  ├─ eligibility.py       check(profile, option, cfg) → Eligibility(reason_code, params)
│  │  │  ├─ options.py           enumerate_options(profile, cfg, vou) → list[Option]
│  │  │  ├─ compare.py           compare(profile, today, alt, cfg) → OptionResult
│  │  │  ├─ waterfall.py         פירוק ההפרש לצעדים שסכומם = ההפרש
│  │  │  ├─ explain.py           הסבר 2 שורות + "למה?" מתבניות
│  │  │  └─ missing.py           missing_fields(state) → [Missing(field, ask="employee"|"rep")]
│  │  ├─ config/  schema.py · loader.py · crosscheck.py
│  │  ├─ ports/   repositories.py (Protocols)
│  │  ├─ adapters/ supabase_repos.py · csv_value_of_use.py · memory_repos.py
│  │  ├─ agent/   agent.py · tools.py · deps.py · guard.py · models_chain.py · prompts/system.he.md
│  │  ├─ services/ conversation.py · rep.py · options.py · payslip.py · config_admin.py
│  │  ├─ http/    app.py · auth.py · errors.py · routers/{conversations,vehicles,rep,config,compare,payslip,health}.py
│  │  └─ ingest/  tax_authority_csv.py   (CLI: CSV → value_of_use)
│  ├─ tests/ unit/ · reference/ · property/ · agent/ · api/
│  └─ evals/  dataset.yaml · run_evals.py   (pydantic-evals)
├─ web/                          👩‍💻 ב׳  ── Next.js (pnpm)
│  ├─ app/  page.tsx · c/[id]/page.tsx · rep/page.tsx · admin/page.tsx · layout.tsx (dir="rtl")
│  ├─ components/ chat/ · profile/ · options/ · compare/ · rep/ · trace/ · admin/ · ui/ (shadcn)
│  ├─ lib/ api/{client.ts, schema.d.ts ← מיוצר} · supabase/ · format.ts · hooks/
│  └─ next.config.ts   rewrites: /api/:path* → API_URL/:path*
├─ config/                       👩‍💻 א׳  ── חבילת הקונפיג (נתונים עסקיים)
│  ├─ rules.json · catalog.json · occupations.json
│  ├─ sample-employees.json      6 העובדים (לדמו ולבדיקות)
│  ├─ reference-results.json     גיליון 'חישובים' (לבדיקות)
│  └─ schema/*.json              JSON Schema מיוצר מ-Pydantic (לעורך + admin)
├─ supabase/migrations/          👩‍💻 א׳  ── SQL
├─ research/                     הוכחת ההנדסה לאחור
├─ .github/workflows/ci.yml      👩‍💻 א׳
├─ ARCHITECTURE.md · PLAN.md · TASKS.md · GUIDE.md · SETUP.md · README.md · SUMMARY.md
└─ .env.example · .gitignore · Dockerfile (יום 6)
```

### 🔒 כללי בעלות (כדי שלא יהיו קונפליקטים)
| תיקייה | בעלים | השנייה רשאית? |
|---|---|---|
| `api/`, `config/`, `supabase/`, `.github/` | א׳ | **לא**. צריכה שינוי? פותחת Issue או מבקשת |
| `web/` | ב׳ | **לא** |
| `web/lib/api/schema.d.ts` | **מיוצר אוטומטית** | אף אחת לא עורכת ידנית. `pnpm gen:api` |
| מסמכי `*.md` בשורש | שתיהן | כל אחת עורכת רק את הסעיף שלה |

כיוון ששתי המפתחות לא נוגעות באותם קבצים, **קונפליקטים כמעט בלתי אפשריים**. נקודת המגע היחידה היא החוזה (OpenAPI), והוא מיוצר.

---

## 3. מודל התחום (Domain)

```python
# money: הכול Decimal; עיגול רק בהצגה (ROUND_HALF_UP לשקל)

class SalaryInput:        base, commissions=0, bonus=0
class Deductions:         pension_pct, study_fund_pct=0, credit_points
class VehicleKey:         tax_year, reg_year, vehicle_type_code, maker_code, model_code   # 5 השדות
class Vehicle:            key, maker_name, commercial_name, drive: Drive(PETROL|HYBRID|PLUG_IN|ELECTRIC),
                          list_price, value_of_use, source_row_ref
class CarArrangement:     vehicle, participation, catalog_id | None, participation_status: CONFIRMED|DEFAULT_PENDING|UNKNOWN
class WaiverArrangement:  maintenance
Arrangement = CarArrangement | WaiverArrangement          # discriminated union ("kind")

class Profile:            occupation, group, salary, deductions, children_under_23 | None,
                          current: Arrangement | None
class Option:             id, kind: CATALOG_CAR|WAIVER|SPECIAL_TRACK, catalog_id?, track_id?
class Eligibility:        eligible: bool, reason_code: str, params: dict          # הטקסט נבנה ב-explain
class NetBreakdown:       gross_cash, value_of_use, taxable_income, income_tax, national_insurance, health,
                          pension, study_fund, participation, track_employee_share, electric_gross_up,
                          maintenance, net
class OptionResult:       option, eligibility, cost_to_company, group_budget, participation(+status),
                          value_of_use, electric_refund_net, maintenance, net_today, net_option, delta,
                          waterfall: list[Step], explanation: [line1, line2], sources: list[Source],
                          complete: bool, missing: list[Missing]
class Comparison:         id, profile_snapshot, today: NetBreakdown, results: list[OptionResult],
                          best_option_id, config_version, engine_version
```

`complete=False` + `missing` = "חסר לי X, שאלתי את הנציג". התצוגה מראה את מה שיש, ומסמנת בבירור מה ממתין.

### אלגוריתמים
**נטו** (מאומת 36/36, ראו [GUIDE.md](GUIDE.md) חלק ג׳):
```
gross_cash   = Σ components + maintenance + electric_gross_up
pensionable  = Σ components ∈ cfg.payroll.pensionableComponents
pension      = pensionable × pension_pct
study_fund   = min(Σ studyFundComponents, ceiling?) × study_fund_pct
taxable      = gross_cash + value_of_use
income_tax   = max(0, brackets(taxable) − points × pointValue − rate × min(pension, maxRate × min(pensionable, incomeCeiling)))
ni, health   = two_tier(min(taxable, ceiling))
net          = gross_cash − income_tax − ni − health − pension − study_fund − participation − track_employee_share
```
**גילום**: חיפוש בינארי על `g ∈ [0, 4 × netBonus]` עד שההפרש קטן מ-0.005 ₪. מונוטוני, ולכן מתכנס תמיד, ועובד לכל טבלת מס.
**גרף מפל**: עוברים מ"היום" ל"חלופה" ומשנים **גורם אחד בכל פעם**, בסדר קבוע (שווי שימוש ← אחזקה ← החזר חשמל ← השתתפות ← חלק במסלול). מחשבים נטו אחרי כל צעד, כך שסכום הצעדים = ההפרש **בדיוק**, בלי שארית.
**זכאות** (בסדר הזה, הראשון שנכשל קובע את הסיבה): קבוצה קיימת ← עיסוק תואם לקבוצה ← אפשרות מהקבוצה או נמוכה (`chooseFrom`) ← עלות ≤ תקציב (חוץ ממסלול מיוחד) ← תנאי מסלול (ילדים) ← ויתור מותר לעיסוק.

---

## 4. חבילת הקונפיג (Config Bundle)

שלושה קבצים שנבדקים **יחד** ונשמרים כגרסה אחת:

```jsonc
// config/rules.json - הרחבה של קובץ האתגר; כל שדה חדש עם ברירת מחדל = ההתנהגות בגיליון
{
  "version": "2026-10-13.1", "effectiveFrom": "2026-01-01", "currency": "ILS",
  "groups": [ {"code":"א","budget":3500}, {"code":"ב","budget":3700}, {"code":"ג","budget":4500}, {"code":"ד","budget":5200} ],
  "chooseFrom": "own_or_lower",                    // own_or_lower | own_only | any
  "enforceBudget": true,                           // עלות רכב רגיל ≤ תקציב הקבוצה
  "unusedBudget": "not_paid",
  "electric": { "netBonus": 250, "method": "gross_up", "drives": ["ELECTRIC"] },   // gross_up | gross
  "specialTracks": [ { "id": "family", "label": "מסלול ברוכת ילדים", "catalogGroup": "משפחתי",
                       "requires": { "minChildren": 4, "childMaxAge": 23 }, "gapSplitEmployee": 0.5 } ],
  "waiver": { "allowedBy": "occupation", "maintenanceIsTaxable": true, "maintenanceIsPensionable": false },
  "participation": { "policy": "default_pending_rep" },   // default_pending_rep | always_ask_rep | default_confirmed
  "payroll": { "pensionableComponents": ["base","commissions","bonus"],
               "studyFundComponents":   ["base","commissions","bonus"], "studyFundCeiling": null },
  "netMethod": { "basis": "monthly", "taxYear": 2025, "creditPointValue": 242,
                 "brackets": [[7010,0.10],[10060,0.14],[16150,0.20],[22440,0.31],[46690,0.35],[60130,0.47],[null,0.50]],
                 "nationalInsurance": {"threshold":7522,"ceiling":50695,"lowRate":0.0104,"highRate":0.07},
                 "health":            {"threshold":7522,"ceiling":50695,"lowRate":0.0323,"highRate":0.0517},
                 "pensionCredit": {"rate":0.35,"incomeCeiling":9500,"maxContributionRate":0.07} },
  "valueOfUse": { "taxYear": 2026,
                  "driveField": {"0":"PETROL","1":"HYBRID","2":"PLUG_IN","3":"ELECTRIC"},
                  "csv": { "encoding": "windows-1255", "columns": { "taxYear":"שנת מס", "regYear":"שנת רישום", "...": "..." } } }
}
```
`catalog.json` (20 רכבים: id, group, 5 שדות מפתח, monthlyCost, defaultParticipation) · `occupations.json` (14 עיסוקים: name, group, carRequired, waiverAllowed, maintenance).

**בדיקות הצלבה (`crosscheck.py`)**, שרצות לפני כל הפעלה:
1. כל קבוצה בקטלוג ובעיסוקים קיימת ב-`groups` או ב-`specialTracks`.
2. **כל רכב בקטלוג נמצא במאגר רשות המסים** לפי 5 השדות.
3. המדרגות עולות; שיעורים בין 0 ל-1; `null` רק במדרגה האחרונה.
4. `carRequired ⇒ !waiverAllowed`; `waiverAllowed ⇒ maintenance > 0`.

התוצאה היא `ValidationReport { ok, errors[], warnings[], stats }`, שמוצג בעמוד admin.

---

## 5. הסוכן (Agent)

### תור (turn) אחד
```
POST /v1/conversations/{id}/messages {text}
 1. טעינת State: profile, status, היסטוריה (12 הודעות אחרונות), שאלות נציג פתוחות
 2. הסתרת ת"ז (regex 9 ספרות) בטקסט לפני המודל
 3. missing = missing_fields(state)                 ← דטרמיניסטי
 4. system prompt = prompts/system.he.md + בלוק STATE (פרופיל JSON + missing + config version)
 5. agent.run(...) עם deps (repos, cfg, conversation_id, event_sink)
       המודל קורא לכלים ← כל קריאה נכתבת ל-agent_events (פאנל "מתחת למכסה", Realtime)
 6. פלט מובנה: AgentReply { text, quick_replies[], show: comparison_id | options | null }
 7. Number Guard(text, allowed = מספרי פרופיל ∪ פלטי כלים בתור הזה ∪ קטלוג)
       נכשל? ניסיון חוזר אחד עם הערה ← נכשל שוב? הסבר מתבנית (explain.py)
 8. שמירת הודעת המשתמש + התשובה ← Realtime ← התשובה מופיעה בממשק
```
השרת **חסר מצב**: כל המצב ב-DB, ולכן כל instance של Vercel יכול לטפל בכל בקשה.

### הכלים
| כלי | קלט | פלט | הערה |
|---|---|---|---|
| `update_profile` | שדות חלקיים | פרופיל + missing | ולידציה ב-Pydantic; ערך חשוד (שכר 1,000,000) מחזיר שגיאה למודל |
| `find_vehicle` | טקסט חופשי, שנת רישום? | עד 5 מועמדים עם מפתח מלא | חיפוש trigram על שם מסחרי ותוצר |
| `lookup_value_of_use` | VehicleKey | Vehicle + מקור | לא נמצא ← אומר במפורש, לא מנחש |
| `list_options` | — | כל החלופות + זכאות + נטו | ממוין לפי `delta` |
| `check_eligibility` | option_id | Eligibility + סיבה | |
| `compare` | option_ids[] | Comparison (נשמר) | |
| `ask_representative` | field, question | question_id | מעביר את השיחה ל-`waiting_rep` |

### Number Guard
מחלץ מספרים מהטקסט (`\d{1,3}(,\d{3})*(\.\d+)?|\d+`, עם ₪ ו-%), מנרמל, ובודק שכל מספר ≥ 10 נמצא בקבוצת המותרים (גם בסבילות עיגול לשקל). מספרים קטנים כמו "2 שורות" או "קבוצה 3" מותרים.

### מכונת מצבים של שיחה
`collecting → ready → presented ⇄ (correction | change_option)` · כל מצב יכול לעבור ל-`waiting_rep`, ותשובת נציג מחזירה אותו לאן שהיה.

### זרימת נציג
```
עובד ─► agent ─► ask_representative ─► rep_questions(open) ──Realtime──► /rep
/rep ─► POST /v1/rep/questions/{id}/answer {value}
        ├─ rep_service: מחיל את התשובה על הפרופיל (למשל participation_status=CONFIRMED, participation=350)
        ├─ הודעת system_event "הנציג עדכן: השתתפות 350 ₪"
        └─ מריץ תור "resume" של הסוכן ← חישוב מחדש ← הודעת בוט חדשה
                     ──Realtime──► מסך העובד מתעדכן (גם אם פתוח, גם אחרי רענון)
```

### שרשרת מודלים
`FallbackModel(gemini-2.5-flash → openrouter/<free model> → groq/<model>)`, נשלטת ממשתנה סביבה `LLM_CHAIN`. retries של ה-SDK = 0, כדי שהמעבר יהיה מיידי. אם כולם נכשלים: `503 {mode:"form"}`, והממשק עובר למצב טופס.

---

## 6. מסד הנתונים

```sql
value_of_use      (tax_year, reg_year, vehicle_type_code, maker_code, model_code,  -- PK (5)
                   maker_name, commercial_name, model_desc, drive_code, fuel_type, automatic,
                   green_score, list_price, adjusted_price, value_of_use, effective_date)
                   + GIN trigram index על commercial_name, maker_name
config_versions   (id, version UNIQUE, bundle JSONB, report JSONB, is_active, created_at, created_by)
                   + unique partial index WHERE is_active
conversations     (id UUID, user_id UUID → auth.users, status, profile JSONB, config_version, created_at, updated_at)
messages          (id, conversation_id, role[user|assistant|system_event], content, payload JSONB, created_at)
rep_questions     (id, conversation_id, field, question, context JSONB, status[open|answered],
                   answer JSONB, answered_by, answered_at, created_at)
comparisons       (id, conversation_id, input JSONB, result JSONB, config_version, engine_version, created_at)
agent_events      (id, conversation_id, turn_id, kind[tool_call|tool_result|guard|model], name, data JSONB, created_at)
```

**RLS (Row Level Security):**
| טבלה | עובד (anonymous) | נציג (`app_metadata.role='rep'`) | שרת (secret key) |
|---|---|---|---|
| value_of_use, config_versions (active) | קריאה | קריאה | הכול |
| conversations, messages, comparisons, agent_events | **רק שלו** (`user_id = auth.uid()`) | קריאה | הכול |
| rep_questions | רק שלו | קריאה + עדכון | הכול |

**כל הכתיבות עוברות דרך ה-API.** הדפדפן רק קורא ומאזין ל-Realtime.

---

## 7. ה-API (חוזה)

Prefix `/v1` · Auth: `Authorization: Bearer <Supabase JWT>` · שגיאות: `{error:{code, message_he, details}}`

| Method | Path | תפקיד | מי |
|---|---|---|---|
| GET | `/health` | גרסאות + DB + מודל זמין? | כולם |
| POST | `/v1/conversations` | שיחה חדשה (אופציה: `sample_employee_id`) | עובד |
| GET | `/v1/conversations/{id}` | מצב מלא: profile, status, messages, open questions | עובד/נציג |
| POST | `/v1/conversations/{id}/messages` | תור סוכן | עובד |
| PATCH | `/v1/conversations/{id}/profile` | תיקון נתונים ← חישוב מחדש | עובד |
| GET | `/v1/conversations/{id}/options` | מפת כל האפשרויות | עובד |
| POST | `/v1/conversations/{id}/compare` | השוואה לחלופות נבחרות | עובד |
| POST | `/v1/compare` | השוואה **חסרת מצב** (מצב טופס, בדיקות) | כולם |
| GET | `/v1/vehicles/search?q=&reg_year=` | חיפוש רכב | כולם |
| GET | `/v1/vehicles/value-of-use?…5 שדות` | שווי שימוש | כולם |
| GET | `/v1/catalog` · `/v1/occupations` | מהקונפיג הפעיל | כולם |
| POST | `/v1/payslip/parse` | תמונה/PDF ← שדות (לא נשמר) | עובד |
| GET | `/v1/rep/questions?status=open` | תור הנציג | נציג |
| POST | `/v1/rep/questions/{id}/answer` | מענה + המשך השיחה | נציג |
| GET | `/v1/config/active` | הקונפיג הפעיל + דוח | נציג |
| POST | `/v1/config/validate` | אימות בלי הפעלה | נציג |
| POST | `/v1/config/activate` | גרסה חדשה פעילה | נציג |

**OpenAPI** זמין ב-`/docs` (Swagger) וב-`/openapi.json`. בצד הווב, `pnpm gen:api` מייצר ממנו את `schema.d.ts`, והלקוח (`openapi-fetch`) מוקלד לגמרי.

---

## 8. הממשק (web)

| נושא | החלטה |
|---|---|
| ספריות | Next.js 16 App Router · TypeScript strict · Tailwind 4 · shadcn/ui · Recharts · TanStack Query · `@supabase/supabase-js` · `openapi-fetch` · `qrcode.react` |
| שפה | `<html lang="he" dir="rtl">` · פונט Heebo (`next/font`) · `Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS',maximumFractionDigits:0})` |
| מצב שרת | TanStack Query; אירוע Realtime ← `invalidateQueries` (מקור אמת אחד: ה-API) |
| זהות | בטעינה: `signInAnonymously()` אם אין session; נציג: email+password |
| פריסה | Mobile-first: בנייד הצ'אט במסך מלא וההשוואה כ-sheet; במחשב 3 עמודות (פרופיל · צ'אט · השוואה) |
| נגישות | ניווט מקלדת, ניגודיות AA, `aria-live` להודעות בוט |
| מצב טופס | אותם רכיבי פרופיל/השוואה בלי הצ'אט, ונכנס אוטומטית כשה-API מחזיר `mode:"form"` |

**רכיבים מרכזיים:** `ChatPanel` · `ProfileCard` (עריכה inline) · `OptionsMap` (כרטיסים ממוינים, תג "הכי משתלם") · `ComparisonTable` (כל שדות דרישה 23) · `WaterfallChart` · `WhyPopover` (מקור לכל מספר) · `RepQueue` · `UnderTheHood` (agent_events חי) · `ConfigAdmin` · `DemoQR`.

---

## 9. בדיקות - פירמידה

| שכבה | כלי | מה | ב-CI? |
|---|---|---|---|
| ייחוס | pytest | 36 מספרים מ-`reference-results.json` | ✅ |
| יחידה | pytest | כל פונקציה ב-domain, כל סיבת זכאות, ingest, crosscheck | ✅ |
| תכונה | Hypothesis | אלפי פרופילים אקראיים: מונוטוניות, גילום=+250±0.005, דטרמיניזם, מס≥0, סכום מפל=הפרש | ✅ |
| סוכן | PydanticAI `TestModel`/`FunctionModel` | זרימת כלים ו-Number Guard **בלי LLM אמיתי, בלי עלות** | ✅ |
| API | pytest + `httpx` | חוזים, הרשאות, שגיאות | ✅ |
| חוזה | `pnpm gen:api && git diff --exit-code` | ה-TS תואם ל-API | ✅ |
| קצה לקצה | Playwright | תסריט האתגר מלא באתר | ידני / לפני הגשה |
| איכות בוט | pydantic-evals | 10-20 שיחות מדומות ← דוח | ידני (מכסת LLM) |

---

## 10. CI/CD וזרימת עבודה

```
branch  a/<task-id>-<slug>  |  b/<task-id>-<slug>
   └─ PR → CI (ruff · mypy · pytest | eslint · tsc · build | contract) → Vercel Preview URL
        └─ Squash merge ל-main → Vercel Production (שני הפרויקטים)
```
- **קומיטים**: Conventional Commits (`feat(engine): gross-up solver`).
- **PR קטן**: עד 400 שורות; תיאור + צילום מסך בממשק.
- **פורמט אוטומטי**: ruff format / prettier ב-pre-commit, כדי שלא יהיו קונפליקטים של רווחים.
- **סודות**: רק ב-Vercel Env + `.env.local`. ה-CI לא צריך מפתחות, כי בבדיקות אין LLM אמיתי.

---

## 11. ביצועים ושרידות

| נושא | פתרון |
|---|---|
| זמן חישוב | חלופה אחת < 1ms; מפת 20 חלופות כולל גילום < 20ms |
| שליפת שווי שימוש | PK על 5 שדות, < 5ms; cache בזיכרון ל-instance חם |
| קונפיג | נטען פעם אחת ל-instance, ומתרענן כשמשתנה `active version` (בדיקה כל 30 שניות) |
| LLM | 1-3 קריאות לתור; היסטוריה קצוצה ל-12 הודעות + STATE, כך שהטוקנים נשארים קבועים |
| 429 / נפילה | FallbackModel, ואחריו מצב טופס |
| עומס | השרת חסר מצב, ו-Vercel מגדיל לבד. צוואר הבקבוק היחיד הוא מכסת ה-LLM החינמית, ובפיילוט עוברים למודל בתשלום (משתנה סביבה) |

---

## 12. אבטחה ופרטיות
- מפתח סודי של Supabase ומפתחות LLM: **רק** ב-strauss-api. הדפדפן מחזיק רק את המפתח הציבורי (publishable).
- תלוש: מתקבל ב-multipart, מעובד בזיכרון, **לא נשמר בשום מקום**; העובד מאשר כל שדה לפני שימוש.
- ת"ז ושמות מלאים: מוסתרים לפני שליחה למודל.
- RLS: עובד רואה רק את השיחה שלו.
- הגבלת קצב פשוטה ב-API (לפי user_id), כדי לשמור על המכסה בדמו פתוח עם QR.
- `SUMMARY.md` יפרט מה נדרש לפיילוט: SSO ארגוני, מודל עם הסכם פרטיות או מקומי, ו-Docker ברשת שטראוס.

---

## 13. רישום החלטות (ADR בקצרה)
| החלטה | חלופה שנדחתה | למה |
|---|---|---|
| Python למנוע ולסוכן | TypeScript בלבד | Decimal + Pydantic + Hypothesis + PydanticAI = הסטנדרט לפיננסי ו-AI |
| Next.js לממשק | Streamlit | מראה של מוצר, RTL, Realtime, נייד |
| שני פרויקטי Vercel | פרויקט אחד | זיהוי אוטומטי, בעלות נפרדת, אפס קונפליקטים |
| ריפו ציבורי | פרטי | Vercel Hobby חוסם deploy משותפת שנייה בריפו פרטי |
| Supabase Realtime | polling | עדכון מיידי בלי שרת WebSocket משלנו |
| כתיבות רק דרך API | כתיבה ישירה מהדפדפן | כל לוגיקה ובדיקה במקום אחד |
| הסבר מתבנית + Number Guard | הסבר חופשי של המודל | אפס מספרים מומצאים |
| Anonymous auth | בלי זהות | RLS אמיתי גם בדמו |
