# ארכיטקטורה - יועץ הרכב של שטראוס

> המסמך הזה הוא **החוזה** בין שתי המפתחות. כל החלטה כאן סגורה. שינוי נעשה רק בהסכמת שתיכן, ומעדכנים את המסמך באותו PR.
> גרסה 2 (14/10): עודכנה לפי סקירת הארכיטקטורה. ההחלטות מסוכמות בסעיף 13.

---

## 0. עקרונות מנחים (מה השופטות צריכות לראות בקוד)

| # | עיקרון | איך זה נראה בקוד |
|---|---|---|
| 1 | **המודל מדבר, הקוד מחשב** | `domain/` לא מייבא שום דבר של AI, רשת או DB. ה-LLM מקבל רק תוצאות מוכנות |
| 2 | **כל מספר על המסך מגיע מהמנוע** | נטו, מס, הפרש ושווי שימוש מוצגים **בכרטיסים שנבנים מה-DTO של המנוע**. הבוט כותב רק מילים. Number Guard הוא שכבת הגנה משנית |
| 3 | **ארכיטקטורה משושה (Ports & Adapters)** | הליבה מגדירה ממשקים (`ports/`), והמימושים (Supabase, CSV, זיכרון) מתחברים מבחוץ |
| 4 | **הקונפיגורציה היא נתונים** | כל מספר עסקי נמצא ב-`api/config/*.json`, מאומת ב-Pydantic ובבדיקות ההצלבה ב-CI. בקוד אין "3500" או "0.35" |
| 5 | **חוזה תחילה (Contract-first)** | מודלי Pydantic ← OpenAPI ← טיפוסי TypeScript מיוצרים. אין כפילות ידנית |
| 6 | **שחזוריות** | `Decimal`, פונקציות טהורות. כל השוואה נשמרת עם `config_hash`, `engine_version` ושנות המס, כך שאותו קלט נותן תמיד אותה תוצאה |
| 7 | **לא מנחשים** | `missing_fields()` בקוד קובעת מה חסר ואת מי שואלים. חוסר מוצג במפורש, לא מוסתר |
| 8 | **מינימום הרשאות** | עובד רואה רק את השיחה שלו. נציג רואה רק את השאלות ואת ההקשר המינימלי שלהן, בלי שכר ובלי שיחה |
| 9 | **שרידות** | Gemini ← OpenRouter, ואם שניהם נופלים, מצב טופס על אותו מנוע |

---

## 1. תמונת מערכת

```
                         ┌──────────────────── Vercel: strauss-web (Next.js 16) ─────────────────────┐
  עובד (נייד/מחשב) ────► │ /          דף פתיחה: "התחל שיחה" / "עובד לדוגמה"                         │
                         │ /c/[id]    צ'אט ┃ כרטיס פרופיל ┃ מפת אפשרויות ┃ השוואה + גרף מפל ┃ trace │
                         │ /form      מצב טופס (אותו מנוע, בלי AI)                                  │
  נציג ────────────────► │ /rep       תור שאלות פתוחות ← מענה                                       │
                         └───────┬──────────────────────────────────────────────▲─────────────────┘
                                 │ /api/* (rewrite) + JWT                         │ Supabase Realtime
                                 │                                                │ (messages, rep_questions,
                         ┌───────▼──────── Vercel: strauss-api (FastAPI) ─────────┴─┐ conversations)
                         │ http/      routers · auth (JWT + בעלות + תפקיד) · שגיאות  │
                         │ services/  conversation · rep · options · payslip⭐       │
                         │ agent/     PydanticAI · 7 כלים · Number Guard · Fallback │
                         │ domain/    ★ ליבה טהורה: net · gross_up · eligibility ·  │
                         │            options · compare · waterfall · explain ·     │
                         │            missing                                       │
                         │ config/    *.json + סכימת Pydantic + crosscheck + hash   │
                         │ ports/ · adapters/ (supabase · csv · memory)             │
                         └───────┬───────────────────────────────────────┬──────────┘
                                 │ secret key (שרת בלבד)                   │ HTTPS
                         ┌───────▼───────── Supabase (Frankfurt) ──┐  ┌──▼──────────────────────┐
                         │ Postgres + RLS + Realtime + Auth        │  │ Gemini 2.5 Flash         │
                         │ value_of_use (77,988) · conversations · │  │  → OpenRouter :free      │
                         │ messages · rep_questions · comparisons ·│  │  → (נפילה) מצב טופס      │
                         │ agent_events                            │  └──────────────────────────┘
                         └─────────────────────────────────────────┘
```

**שני פרויקטי Vercel:** כל אחד מזוהה אוטומטית, עולה ונכשל בנפרד, ושייך לתיקייה של מפתחת אחת. Next.js מעביר `/api/*` ל-strauss-api באמצעות `rewrites`, כך שמהדפדפן זו כתובת אחת ואין CORS.
**הקונפיג נארז עם השרת:** `api/config/` נמצא בתוך תיקיית השורש של strauss-api, ולכן הוא נארז ב-deploy בוודאות.

---

## 2. מבנה הריפו ובעלות על תיקיות

```
strauss-car-advisor/
├─ api/                          👩‍💻 א׳  ── Python (uv)
│  ├─ pyproject.toml             [tool.vercel] entrypoint = "index:app"
│  ├─ index.py                   נקודת הכניסה של Vercel (מייבא את strauss.http.app)
│  ├─ config/                    ★ חבילת הקונפיג (נתונים עסקיים)
│  │  ├─ rules.json · catalog.json · occupations.json
│  │  ├─ sample-employees.json   6 העובדים (לדמו ולבדיקות)
│  │  ├─ reference-results.json  גיליון 'חישובים' (לבדיקות)
│  │  └─ PROVENANCE.md           מאיפה הגיע כל כלל: אתגר / מאומת / נגזר
│  ├─ strauss/
│  │  ├─ domain/                 ★ טהור: אין I/O, אין AI
│  │  │  ├─ money.py · models.py · tax.py · net.py · gross_up.py
│  │  │  ├─ eligibility.py · options.py · compare.py · waterfall.py
│  │  │  └─ explain.py · missing.py
│  │  ├─ config/   schema.py · loader.py · crosscheck.py
│  │  ├─ ports/    repositories.py (Protocols)
│  │  ├─ adapters/ supabase_repos.py · csv_value_of_use.py · memory_repos.py
│  │  ├─ agent/    agent.py · tools.py · deps.py · guard.py · models_chain.py · prompts/system.he.md
│  │  ├─ services/ conversation.py · rep.py · options.py · payslip.py⭐
│  │  ├─ http/     app.py · auth.py · errors.py · routers/{conversations,vehicles,rep,compare,config,payslip,health}.py
│  │  └─ ingest/   tax_authority_csv.py   (CLI: CSV → value_of_use)
│  ├─ tests/ unit/ · reference/ · property/ · agent/ · api/
│  └─ evals/  dataset.yaml · run_evals.py · REPORT.md   (pydantic-evals)
├─ web/                          👩‍💻 ב׳  ── Next.js (pnpm)
│  ├─ app/  page.tsx · c/[id]/page.tsx · form/page.tsx · rep/page.tsx · layout.tsx
│  ├─ components/ chat/ · profile/ · options/ · compare/ · rep/ · trace/ · ui/ (shadcn)
│  ├─ lib/ api/{client.ts, schema.d.ts ← מיוצר} · supabase/ · format.ts · hooks/
│  └─ next.config.ts   rewrites: /api/:path* → API_URL/:path*
├─ supabase/migrations/          👩‍💻 א׳  ── SQL
├─ research/                     👩‍💻 א׳  ── הוכחת ההנדסה לאחור + המרת קבצי האתגר
├─ data/source/                  קבצי האתגר המקוריים + מאגר רשות המסים
├─ .github/workflows/ci.yml      👩‍💻 א׳
└─ *.md · .gitignore · .gitattributes · Dockerfile (יום 6)
```

### 🔒 כללי בעלות (כדי שלא יהיו קונפליקטים)
| תיקייה | בעלים | השנייה רשאית? |
|---|---|---|
| `api/`, `supabase/`, `research/`, `data/`, `.github/` | א׳ | **לא**. צריכה שינוי? מבקשת |
| `web/` | ב׳ | **לא** |
| `web/lib/api/schema.d.ts` | **מיוצר אוטומטית** | אף אחת לא עורכת ידנית. `pnpm gen:api` |
| מסמכי `*.md` בשורש | שתיהן | כל אחת עורכת רק את הסעיף שלה |

---

## 3. מודל התחום (Domain)

```python
# money: הכול Decimal; עיגול רק בהצגה (ROUND_HALF_UP לשקל)

class SalaryInput:        base, commissions=0, bonus=0
class Deductions:         pension_pct, study_fund_pct=0, credit_points
class VehicleKey:         tax_year, reg_year, vehicle_type_code, maker_code, model_code   # 5 השדות
class Vehicle:            key, maker_name, commercial_name, drive: Drive(PETROL|HYBRID|PLUG_IN|ELECTRIC),
                          list_price, value_of_use, source_row_ref
class CarArrangement:     vehicle, participation, catalog_id | None,
                          participation_status: CONFIRMED|DEFAULT_PENDING|UNKNOWN
class WaiverArrangement:  maintenance
Arrangement = CarArrangement | WaiverArrangement          # discriminated union ("kind")

class Profile:            revision: int,                  # עולה בכל שינוי; מגן מפני תשובת נציג מיושנת
                          occupation, group, salary, deductions, children_under_23 | None,
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
class CalculationContext: payroll_tax_year, value_of_use_tax_year, config_version, config_hash, engine_version
class Comparison:         id, context: CalculationContext, profile_snapshot, today: NetBreakdown,
                          results: list[OptionResult], best_option_id
```

`complete=False` + `missing` = "חסר לי X, שאלתי את הנציג". התצוגה מראה את מה שיש, ומסמנת בבירור מה ממתין.

**שתי שנות מס, בכוונה:** לוחות המס הם של 2025 ושווי השימוש של 2026. כך הוגדר באתגר (בקובץ הכללים: "לוחות 2025 להמחשה"; המאגר: "הקובץ המורחב 2026"). שתי השנים מופיעות ב-`CalculationContext` ומוצגות בכל השוואה.

### אלגוריתמים
**נטו** (מאומת 36/36 מול גיליון הייחוס, ראו [GUIDE.md](GUIDE.md) חלק ג׳):
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

**גילום** (`gross_up.py`), בלי הנחה שהפתרון בטווח קבוע:
1. `lo = 0`, `hi = netBonus`. כל עוד `Δnet(hi) < netBonus`: מכפילים את `hi`, עד 20 הכפלות.
2. לא נמצא טווח? מחזירים `GrossUpUnsolvable` (שגיאה מפורשת, ואף פעם לא מספר).
3. חיפוש בינארי בתוך `[lo, hi]`, עד 100 איטרציות או עד `|Δnet − netBonus| < 0.005`.
4. בדיקות: Hypothesis על אלפי פרופילים + מקרי קצה (שכר מינימלי, מעל תקרת ב"ל, מדרגה עליונה).

**גרף מפל: פירוק לפי סדר (sequential attribution).** עוברים מ"היום" ל"חלופה" ומשנים גורם אחד בכל פעם, **בסדר קבוע ומתועד**: שווי שימוש ← אחזקה ← החזר חשמל ← השתתפות ← חלק במסלול. אחרי כל צעד מחשבים נטו מחדש, כך שסכום הצעדים = ההפרש בדיוק.
⚠ התרומה של כל צעד תלויה בסדר, כי המדרגות לא ליניאריות. הגרף מציין "פירוק לפי סדר", ובדיקה מוודאת שהצעדים מכסים את כל ההבדלים בין החלופות.

**מדיניות עיגול (לפי כללי המארגנים, `rules.netMethod.rounding`):** **אין עיגול במהלך החישוב**, גם לא בגילום: כל רכיב ב-`NetBreakdown` ו-הנטו הם `Decimal` מדויקים, והגילום מביא בדיוק +250 נטו. עיגול רק בתצוגה: ה-API שולח כסף לאגורות, והממשק מציג שקלים. **המספרים הגדולים** (`net_today`, `net_option`, `delta` וצעדי המפל) הם **בשקלים שלמים**: כל נטו מעוגל לשקל, וההפרש מחושב **בין הנטו המעוגלים**, כך ש-`net_today + delta = net_option` וסכום הצעדים = `delta` בדיוק, על המסך. זו גם השיטה של גיליון הייחוס (אלי: 17,794 − 17,073 = **721**, ולא 721.70 ← 722).

**זכאות** (בסדר הזה, הראשון שנכשל קובע את הסיבה): קבוצה קיימת ← עיסוק תואם לקבוצה ← אפשרות מהקבוצה או נמוכה (`chooseFrom`) ← עלות ≤ תקציב (חוץ ממסלול מיוחד) ← תנאי מסלול (ילדים) ← ויתור מותר לעיסוק.

---

## 4. חבילת הקונפיג (Config Bundle)

שלושה קבצים ב-`api/config/` שנבדקים **יחד**. **אין עורך קונפיג במסד הנתונים.** שינוי כלל = Pull Request: ה-CI מאמת אותו, ואחרי מיזוג העלייה לאוויר אוטומטית. זה עונה על דרישת האתגר "קובץ הגדרות שאפשר לעדכן בלי לגעת בקוד", ובנוסף כל שינוי עובר סקירה ונשמר בהיסטוריה.

```jsonc
// api/config/rules.json - הרחבה של קובץ האתגר; כל שדה חדש עם ברירת מחדל = ההתנהגות בגיליון
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
                  "csv": { "encoding": "windows-1255", "columns": { "taxYear":"שנת מס", "...": "..." } } }
}
```
`catalog.json` (20 רכבים: id, group, 5 שדות מפתח, monthlyCost, defaultParticipation) · `occupations.json` (14 עיסוקים: name, group, carRequired, waiverAllowed, maintenance).

**גרסה ושחזור:** `loader.py` מחשב `config_hash` (SHA-256 של שלושת הקבצים, אחרי נרמול JSON). ה-hash נשמר בכל השוואה, כך ששינוי כללים לא משנה בדיעבד השוואה שכבר נשמרה. שיחה שנמשכת אחרי deploy חדש מחושבת לפי הכללים החדשים, וזה מוצג בתוצאה.

**בדיקות הצלבה (`crosscheck.py`)**, שרצות ב-CI ובעליית השרת:
1. כל קבוצה בקטלוג ובעיסוקים קיימת ב-`groups` או ב-`specialTracks`.
2. **כל רכב בקטלוג נמצא במאגר רשות המסים** לפי 5 השדות (מול ה-CSV ב-CI).
3. המדרגות עולות; שיעורים בין 0 ל-1; `null` רק במדרגה האחרונה.
4. `carRequired ⇒ !waiverAllowed`; `waiverAllowed ⇒ maintenance > 0`.

**מקור לכל כלל ([`api/config/PROVENANCE.md`](api/config/PROVENANCE.md)):** לכל שדה ב-rules.json, בקטלוג ובעיסוקים רשום אם הוא **מהאתגר** (איזה קובץ ואיזה שדה), **מאומת** (נבדק מול גיליון הייחוס 36/36 או מול מאגר רשות המסים), או **נגזר** (החלטה שלנו איפה שהאתגר שותק, עם נימוק). `tests/config/test_provenance.py` נכשל אם נוסף שדה בלי מקור, כך שאין הנחה סמויה.

---

## 5. הסוכן (Agent)

### תור (turn) אחד
```
POST /v1/conversations/{id}/messages {text}
 1. אימות: JWT תקין + השיחה שייכת למשתמש
 2. טעינת State: profile (+revision), status, 12 הודעות אחרונות, שאלות נציג פתוחות
 3. הסתרת ת"ז (regex 9 ספרות) בטקסט לפני המודל
 4. missing = missing_fields(state)                 ← דטרמיניסטי
 5. system prompt = prompts/system.he.md + בלוק STATE (פרופיל + missing). הוראות המערכת מופרדות מתוכן המשתמש
 6. agent.run(...) עם deps (repos, cfg, conversation_id, trace)
       conversation_id מגיע מה-deps, **לא** מהמודל, ולכן כלי לא יכול לגעת בשיחה אחרת
 7. פלט מובנה: AgentReply { text, quick_replies[], cards: [ComparisonRef | OptionsRef | MissingRef] }
       text = מילים בלבד. כל מספר מוצג מתוך `cards`, שהממשק בונה מה-DTO
 8. Number Guard (הגנה משנית): מספר ≥ 10 ב-text שלא מופיע בפלטי הכלים או במצב השיחה (מספר שרק העובד הציע לא נחשב) ← ניסיון חוזר אחד ← אחרת טקסט מתבנית
 9. שמירת ההודעות + trace של התור ← התשובה (כולל trace) חוזרת לממשק, וההודעה מגיעה גם ב-Realtime
```
השרת **חסר מצב**: כל המצב ב-DB, ולכן כל instance יכול לטפל בכל בקשה.

### הכלים
| כלי | קלט | פלט | הערה |
|---|---|---|---|
| `update_profile` | שדות חלקיים | נשמר + מה עוד חסר | ולידציה ב-Pydantic; עיסוק חייב להיות מהטבלה (אחרת ניסיון חוזר עם השם הקרוב) או מסומן במפורש "לא ברשימה" ← נציג; פנסיה ונקודות זיכוי נשמרים יחד |
| `find_vehicle` | טקסט חופשי, שנת רישום?, שווי שימוש מהתלוש? | עד 5 מועמדים עם מפתח מלא | חיפוש trigram. לדגם אחד יש לרוב עשרות גרסאות: גרסה שנמצאת בקטלוג החברה מוצגת קודם (רכבי חברה באים מהקטלוג); אחרת שורת שווי השימוש בתלוש מאתרת את הגרסה המדויקת. יותר מ-5 ← הבוט מבקש פרט נוסף במקום להציג רשימה חתוכה |
| `set_current_car` | מפתח מלא (מתוצאת find_vehicle) + השתתפות? | נשמר / חסר | שווי השימוש נשלף מהמאגר לפי המפתח, אף פעם לא מהמודל; מפתח לא קיים ← ניסיון חוזר |
| `list_options` | — | כל החלופות + זכאות + נטו | **נכשל אם הפרופיל חסר**, ומחזיר את רשימת החוסרים |
| `check_eligibility` | option_id | Eligibility + סיבה | |
| `compare` | option_ids[] | Comparison (נשמר) | **נכשל אם הפרופיל חסר** |
| `ask_representative` | field (מתוך `ask_rep_field` שהכלים החזירו) | נשלח | פותח שאלה עם `profile_revision`; השיחה ← `waiting_rep`. **נוסח השאלה נבנה בשרת מתבנית קבועה, לא בידי המודל**, ולכן שכר לא יכול לדלוף לנציג; שאלה אחת לכל שדה בתור |

### מכונת מצבים של שיחה
`collecting → ready → presented ⇄ (correction | change_option)` · כל מצב יכול לעבור ל-`waiting_rep`, ותשובת נציג מחזירה אותו לאן שהיה. התרשים יופיע ב-README.

### זרימת נציג (חד-פעמית ובטוחה)
```
עובד ─► agent ─► ask_representative ─► rep_questions(status=open, profile_revision=N) ──Realtime──► /rep
/rep ─► POST /v1/rep/questions/{id}/answer {value, idempotency_key}
        1. UPDATE rep_questions SET status='answered', answer=…, resolved_at=now()
             WHERE id=… AND status='open' RETURNING *        ← אטומי: רק המענה הראשון עובר
           לא חזרה שורה? ← 409 "כבר נענתה" (לחיצה כפולה לא מייצרת עדכון שני)
        2. מחיל את התשובה על **השדה הספציפי** בפרופיל הנוכחי (לא דורס שדות אחרים), revision += 1
           אם העובד שינה בינתיים את החלופה שעליה נשאלה השאלה ← התשובה נשמרת אבל לא מוחלת, והבוט מציין זאת
        3. הודעת system_event "הנציג עדכן: השתתפות 350 ₪"
        4. "resume" אחד, דטרמיניסטי: המנוע מחשב מחדש ← הודעת בוט חדשה עם הכרטיס המעודכן (בלי קריאה למודל)
        תשובה שאינה סכום (השתתפות) או עיסוק מהטבלה ← 422 לפני שנכתב משהו
                     ──Realtime──► מסך העובד מתעדכן (גם אם פתוח, גם אחרי רענון)
```

### שרשרת מודלים
`FallbackModel(4 מודלי Gemini → Groq gpt-oss-120b → OpenRouter)`, נשלטת ממשתנה סביבה `LLM_CHAIN` (ברירת המחדל ב-`settings.py`). המכסה החינמית של Gemini היא כ-20 בקשות ביום **לכל מודל**, ותור לוקח 2-4 בקשות, ולכן משרשרים כמה מודלים לפני שעוברים לספק אחר. ה-retries של ה-SDK כבויים, כך שמודל חסום מעביר מיד לבא. כל בקשה מוגבלת ל-30 שניות, ו-thinking נמוך שומר על תור של שניות בודדות. אם כולם נכשלים: `503 {mode:"form"}`, והממשק עובר למצב טופס.

---

## 6. מסד הנתונים

```sql
value_of_use      (tax_year, reg_year, vehicle_type_code, maker_code, model_code,  -- PK (5)
                   maker_name, commercial_name, model_desc, drive_code, fuel_type, automatic,
                   green_score, list_price, adjusted_price, value_of_use, effective_date)
                   + GIN trigram index על commercial_name, maker_name
conversations     (id UUID, user_id UUID → auth.users, status, profile JSONB, profile_revision INT,
                   created_at, updated_at)
messages          (id, conversation_id, role[user|assistant|system_event], content, payload JSONB, created_at)
rep_questions     (id, conversation_id, field, question, context JSONB,     -- context = המינימום הנחוץ לנציג
                   profile_revision INT, status[open|answered], answer JSONB,
                   answered_by, resolved_at, created_at)
comparisons       (id, conversation_id, input JSONB, result JSONB, config_version, config_hash,
                   engine_version, payroll_tax_year, value_of_use_tax_year, created_at)
agent_events      (id, conversation_id, turn_id, kind[tool_call|tool_result|guard|model], name, data JSONB, created_at)
```

**RLS (Row Level Security), לפי מינימום הרשאות:**
| טבלה | עובד (anonymous) | נציג (`app_metadata.role='rep'`) | שרת (secret key) |
|---|---|---|---|
| value_of_use | קריאה | קריאה | הכול |
| conversations, messages, comparisons, agent_events | **רק שלו** (`user_id = auth.uid()`) | **אין גישה** | הכול |
| rep_questions | רק שלו | **קריאה בלבד** | הכול |

**הנציג רואה רק את `rep_questions`.** ה-`context` כולל רק את מה שצריך כדי לענות (למשל: עיסוק, קבוצה, הרכב המבוקש), בלי שכר, בלי הפרשות ובלי השיחה.
**כל הכתיבות עוברות דרך ה-API**, שמאמת בכל endpoint: JWT, בעלות על השיחה ותפקיד. הדפדפן רק קורא ומאזין ל-Realtime. בלוגים אין מידע אישי.
**לפיילוט** (ב-SUMMARY): שיוך שאלות לנציג או לתור מסוים, ו-SSO ארגוני.

---

## 7. ה-API (חוזה)

Prefix `/v1` · Auth: `Authorization: Bearer <Supabase JWT>` · שגיאות: `{error:{code, message_he, details}}`

| Method | Path | תפקיד | מי |
|---|---|---|---|
| GET | `/health` | גרסאות, config_hash, חיבורים | כולם |
| POST | `/v1/conversations` | שיחה חדשה (אופציה: `sample_employee_id`) | עובד |
| GET | `/v1/conversations/{id}` | מצב מלא: profile, status, messages, open questions | בעלים |
| POST | `/v1/conversations/{id}/messages` | תור סוכן ← `AgentReply` + trace | בעלים |
| PATCH | `/v1/conversations/{id}/profile` | תיקון נתונים ← חישוב מחדש | בעלים |
| GET | `/v1/conversations/{id}/options` | מפת כל האפשרויות | בעלים |
| POST | `/v1/conversations/{id}/compare` | השוואה לחלופות נבחרות | בעלים |
| POST | `/v1/compare` | השוואה **חסרת מצב** (מצב טופס, בדיקות) | כולם |
| GET | `/v1/vehicles/search?q=&reg_year=` | חיפוש רכב | כולם |
| GET | `/v1/vehicles/value-of-use?…5 שדות` | שווי שימוש | כולם |
| GET | `/v1/catalog` · `/v1/occupations` | מהקונפיג | כולם |
| GET | `/v1/config` | הכללים הפעילים + hash + מקורות (לחלון "למה?") | כולם |
| POST | `/v1/payslip/parse` ⭐ | תמונה/PDF ← שדות (לא נשמר) | עובד |
| GET | `/v1/rep/questions?status=open` | תור הנציג (הקשר מינימלי) | נציג |
| POST | `/v1/rep/questions/{id}/answer` | מענה חד-פעמי + המשך השיחה | נציג |

**OpenAPI** זמין ב-`/docs` וב-`/openapi.json`. בצד הווב, `pnpm gen:api` מייצר ממנו את `schema.d.ts`, והלקוח (`openapi-fetch`) מוקלד לגמרי.

---

## 8. הממשק (web)

| נושא | החלטה |
|---|---|
| ספריות | Next.js 16 App Router · TypeScript strict · Tailwind 4 · shadcn/ui (RTL) · Recharts · TanStack Query · `@supabase/supabase-js` · `openapi-fetch` |
| שפה | `<html lang="he" dir="rtl">` · Heebo · `Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS',maximumFractionDigits:0})` |
| **מספרים** | **כל מספר מוצג מרכיב שמקבל DTO** (`ComparisonCard`, `OptionCard`, `WaterfallChart`). טקסט הבוט מוצג כטקסט בלבד |
| מצב שרת | TanStack Query; אירוע Realtime ← `invalidateQueries` (מקור אמת אחד: ה-API) |
| זהות | בטעינה: `signInAnonymously()` אם אין session; נציג: email+password |
| פריסה | Mobile-first: בנייד הצ'אט במסך מלא וההשוואה כ-sheet; במחשב 3 עמודות |
| נגישות | ניווט מקלדת, ניגודיות AA, `aria-live` להודעות בוט |
| מצב טופס | `/form`: אותם רכיבים בלי הצ'אט; נכנס אוטומטית כשה-API מחזיר `mode:"form"` |

**רכיבים מרכזיים:** `ChatPanel` · `ProfileCard` (עריכה inline) · `OptionsMap` · `ComparisonCard` (כל שדות דרישה 23, כולל שנות המס) · `WaterfallChart` (עם "פירוק לפי סדר") · `WhyPopover` (מקור לכל מספר) · `RepQueue` · `AgentActions` ("הצג פעולות AI" בתוך הודעת בוט, מתוך `MessageOut.trace`) · `DemoQR`⭐.

**העיצוב המחייב:** [docs/ui/STRAUSS_UI_FINAL_SPEC.md](docs/ui/STRAUSS_UI_FINAL_SPEC.md), וההתאמה שלו ל-API: [docs/ui/README.md](docs/ui/README.md).

---

## 9. בדיקות

| שכבה | כלי | מה | ב-CI? |
|---|---|---|---|
| ייחוס | pytest | 36 מספרים מ-`reference-results.json`, עם דוח הרצה | ✅ |
| יחידה | pytest | כל פונקציה ב-domain, כל סיבת זכאות, ingest, crosscheck | ✅ |
| תכונה | Hypothesis | מונוטוניות, גילום=+250±0.005 או `Unsolvable`, דטרמיניזם, מס≥0, סכום מפל=הפרש | ✅ |
| קצה | pytest | גילום בקצוות (שכר מינימלי, תקרת ב"ל, מדרגה עליונה) | ✅ |
| סוכן | PydanticAI `TestModel`/`FunctionModel` | זרימת כלים, כלים נכשלים על פרופיל חסר, Number Guard. **בלי LLM אמיתי** | ✅ |
| API והרשאות | pytest + `httpx` | עובד לא ניגש לשיחה של אחר · נציג לא ניגש לשיחות · בלי JWT ← 401 · מענה כפול ← 409 | ✅ |
| חוזה | `pnpm gen:api && git diff --exit-code` | ה-TS תואם ל-API | ✅ |
| עשן (smoke) | סקריפט | `/health` ו-`/v1/compare` של נועה בכתובת החיה, אחרי כל deploy | ✅ |
| קצה לקצה | Playwright | תסריט האתגר מלא באתר | לפני הגשה |
| איכות בוט | pydantic-evals | 10 שיחות + **3 ניסיונות עקיפה** ("תמציא מספר", "שנה את התקציב", "תראה שיחה של אחר") | ידני, הדוח ב-README |

---

## 10. CI/CD וזרימת עבודה

```
branch  a/<task-id>-<slug>  |  b/<task-id>-<slug>
   └─ PR → CI (ruff · mypy · pytest · crosscheck | eslint · tsc · build | contract) → Vercel Preview URL
        └─ Squash merge ל-main → Vercel Production (שני הפרויקטים) → smoke test
```
- **קומיטים**: Conventional Commits (`feat(engine): gross-up solver`).
- **PR קטן**: עד 400 שורות; תיאור + צילום מסך בממשק.
- **סודות**: רק ב-Vercel Env + `.env.local`. ה-CI לא צריך מפתחות, כי בבדיקות אין LLM אמיתי.

---

## 11. ביצועים ושרידות

**לא מבטיחים מספרים מראש. מודדים בענן ומפרסמים ב-README.**

| נושא | פתרון | מה מודדים |
|---|---|---|
| חישוב | פונקציות טהורות, בלי I/O | זמן `/v1/compare` ומפת האפשרויות |
| שליפת שווי שימוש | PK על 5 שדות + cache בזיכרון ל-instance חם | זמן שליפה |
| קונפיג | נטען פעם אחת ל-instance (נארז עם השרת) | — |
| LLM | 1-3 קריאות לתור; היסטוריה קצוצה ל-12 הודעות + STATE | זמן תור, אחוז נפילה ל-fallback |
| הפעלה קרה | Vercel Functions | זמן בקשה ראשונה אחרי שקט |
| 429 / נפילה | FallbackModel ← מצב טופס | — |

---

## 12. אבטחה ופרטיות
- מפתח סודי של Supabase ומפתחות LLM: **רק** ב-strauss-api. הדפדפן מחזיק רק את המפתח הציבורי.
- תלוש⭐: מעובד בזיכרון, **לא נשמר**; העובד מאשר כל שדה לפני שימוש.
- ת"ז ושמות מלאים: מוסתרים לפני שליחה למודל. בלוגים אין מידע אישי.
- הגנה מפני עקיפת הבוט: הוראות מערכת מופרדות מתוכן המשתמש; ארגומנטים של כלים מאומתים ב-Pydantic; `conversation_id` רק מה-deps.
- הגבלת קצב פשוטה ב-API (לפי user_id), כדי לשמור על המכסה בדמו.
- **נתוני הדמו פיקטיביים בלבד.**
- `SUMMARY.md` יפרט מה נדרש לפיילוט: SSO ארגוני, שיוך נציגים, מודל עם הסכם פרטיות או מקומי, ו-Docker ברשת שטראוס.

---

## 13. רישום החלטות (ADR בקצרה)
| החלטה | חלופה שנדחתה | למה |
|---|---|---|
| Python למנוע ולסוכן | TypeScript בלבד | Decimal + Pydantic + Hypothesis + PydanticAI = הסטנדרט לפיננסי ו-AI |
| PydanticAI | LangGraph | סוכן אחד עם נקודת אדם אחת; הזרימה בקוד. LangGraph מתאים לריבוי סוכנים ותהליכים ארוכים |
| Next.js לממשק | Streamlit | מראה של מוצר, RTL, Realtime, נייד |
| שני פרויקטי Vercel | Vercel Services (פרויקט אחד) | התנהגות ידועה ומתועדת; Services חדש ולא נבדק אצלנו |
| ריפו ציבורי | פרטי | Vercel Hobby חוסם deploy משותפת שנייה בריפו פרטי |
| **מספרים מה-DTO בלבד** | מספרים בטקסט הבוט + Number Guard | Guard בודק שמספר קיים, לא שהוא בהקשר הנכון *(סקירה P0.3)* |
| **מענה נציג אטומי + revision** | עדכון פשוט | אין כפילויות ואין דריסה של תיקון חדש *(P0.4)* |
| **נציג רואה רק שאלות** | נציג רואה שיחות | מינימום הרשאות *(P0.5)* |
| **גילום עם הרחבת טווח + Unsolvable** | טווח קבוע | אין הנחה סמויה *(P0.2)* |
| **קונפיג בקבצים + CI, בלי admin** | עורך קונפיג במסד הנתונים | פחות קוד, אותה דרישה, כל שינוי נסקר *(P2)* |
| **שרשרת: 4 מודלי Gemini ← Groq ← OpenRouter** | ספק אחד או שניים | נמדד: המכסה החינמית של Gemini היא כ-20 בקשות ביום לכל מודל, ותור הוא 2-4 בקשות |
| **resume אחרי מענה נציג בלי LLM** | תור סוכן נוסף | המספרים ממילא מהמנוע; עובד גם כשכל המודלים חסומים, ולא מבזבז מכסה |
| **trace בתשובת ה-API** | trace ב-Realtime | Realtime רק איפה שצריך: הודעות ונציג *(P2)* |
| Supabase Realtime להודעות ולנציג | polling | עדכון מיידי בלי שרת WebSocket משלנו |
| Anonymous auth | בלי זהות | RLS אמיתי גם בדמו |
