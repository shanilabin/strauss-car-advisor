# מקור לכל כלל (Provenance)

לכל שדה בקבצי הקונפיג רשום כאן **מאיפה הוא בא** ו**איך בדקנו אותו**. הבדיקה
`api/tests/config/test_provenance.py` נכשלת אם נוסף שדה לקונפיג בלי שורה כאן.

**סוגי מקור**
- **אתגר**: נלקח כמו שהוא מקובץ של המארגנות.
- **מאומת**: נלקח מהאתגר **ונבדק** מול נתונים: גיליון הייחוס (36/36) או מאגר רשות המסים.
- **נגזר**: האתגר לא קובע. החלטה שלנו, עם הנימוק. אלה הנקודות שבפיילוט צריך לאשר מול שטראוס.

**קבצי המקור** (בתיקייה `data/source/`, בלי שינוי)
| קיצור | קובץ |
|---|---|
| **R** | `challenge-rules.json` (הגרסה המעודכנת של המארגנות, 2026-10-14) |
| **X** | `challenge-data.xlsx`: הגיליונות "קטלוג רכבים", "עיסוקים", "עובדים לדוגמה", "חישובים" (גיליון הייחוס) |
| **C** | `value-of-use-2026.csv`: הקובץ המורחב של רשות המסים, 77,988 שורות |
| **P** | מסמך האתגר (PDF). לא בריפו |

**איך בודקים**
- **36/36**: `api/tests/reference/test_reference.py` מחשב את 6 העובדים לדוגמה ומשווה 6 ערכים לכל אחד לגיליון "חישובים": נטו, מס הכנסה, וביטוח לאומי + בריאות, היום ובחלופה. בנוסף נבדקים ההפרש והזכאות. את הנוסחה עצמה מצאנו קודם בהשוואת השערות: `research/verify_reference.py`.
- **מול המאגר**: `python -m strauss.config.check --csv ...` (רץ ב-CI) בודק שכל רכב בקטלוג קיים ב-C לפי המפתח המלא, עם אותו שווי שימוש.
- הקבצים ב-`api/config/` נבנים מ-R ו-X בסקריפט `research/build_config.py`. אין בו מספרים, רק המרה.

---

## rules.json

### גרסה ומטבע
| שדה | ערך | מקור | סוג | הערה |
|---|---|---|---|---|
| `version` | 2026-10-14.1 | תאריך R המעודכן + מספר גרסה שלנו | נגזר | נשמר עם כל השוואה (audit) |
| `effectiveFrom` | 2026-01-01 | תחילת שנת המס של שווי השימוש (C) | נגזר | |
| `currency` | ILS | | נגזר | |
| `note` | | R.note | אתגר | |

### קבוצות ותקציבים
| שדה | ערך | מקור | סוג | הערה |
|---|---|---|---|---|
| `groups[].code` | א, ב, ג, ד | R.groupOrder | אתגר | הסדר קובע מה "נמוכה יותר" |
| `groups[].budget` | 3,500 / 3,700 / 4,500 / 5,200 | R.budgets | מאומת | הפער במסלול המשפחתי (E-002, קרניבל 6,000 מול תקציב ב 3,700) נבדק ב-36/36 |
| `chooseFrom` | own_or_lower | R.chooseFrom (`own_group_or_lower`) | מאומת | נוסח הסיבה בגיליון: "הרכב מהקבוצה שלך או נמוכה ממנה" |
| `enforceBudget` | true | | נגזר | בקטלוג הנוכחי כל רכב בתוך תקציב הקבוצה שלו. הכלל שומר על קטלוג עתידי: רכב יקר מהתקציב לא מוצע |
| `unusedBudget` | not_paid | R.unusedBudget | אתגר | תקציב שלא נוצל לא הופך לכסף |

### רכב חשמלי
| שדה | ערך | מקור | סוג | הערה |
|---|---|---|---|---|
| `electric.netBonus` | 250 | R.electric.netBonus | מאומת | E-001 (ATTO 3, +661) ו-E-003 (MG4) כוללים אותו |
| `electric.method` | gross_up | R.electric.method | מאומת | גילום בחיפוש בינארי עד 0.000001 ₪, כך שהעובד רואה +250 בדיוק |
| `electric.drives` | ELECTRIC | P ("רכב חשמלי") | נגזר | פלאג-אין והיברידי לא מקבלים את ההחזר. אין בגיליון דוגמה לפלאג-אין |

### מסלול ברוכת ילדים
| שדה | ערך | מקור | סוג | הערה |
|---|---|---|---|---|
| `specialTracks[].id` | family | | נגזר | מזהה פנימי |
| `specialTracks[].label` | מסלול ברוכת ילדים | נוסח הסיבה בגיליון X "חישובים" | אתגר | |
| `specialTracks[].catalogGroup` | משפחתי | עמודת "קבוצה" ב-X "קטלוג רכבים" | אתגר | |
| `specialTracks[].cars` | CAR-19, CAR-20 | R.familyTrack.cars | אתגר | |
| `specialTracks[].requires.minChildren` | 4 | R.familyTrack.minChildren | מאומת | E-002 (5 ילדים) זכאי. תרחיש קצה 4 (3 ילדים) לא |
| `specialTracks[].requires.childMaxAge` | 23 | R.familyTrack.childMaxAge | אתגר | |
| `specialTracks[].gapSplitEmployee` | 0.5 | R.familyTrack.gapSplitEmployee | מאומת | E-002: חצי מהפער יורד מהנטו |

### ויתור על הרכב
| שדה | ערך | מקור | סוג | הערה |
|---|---|---|---|---|
| `waiver.allowedBy` | occupation | R.waiver.allowedBy + הטבלה ב-X "עיסוקים" | אתגר | |
| `waiver.maintenanceIsTaxable` | true | R.waiver | מאומת | E-005 (ויתור, אחזקה 2,000) |
| `waiver.maintenanceIsPensionable` | false | R.waiver | מאומת | E-005 |

### השתתפות העובד
| שדה | ערך | מקור | סוג | הערה |
|---|---|---|---|---|
| `participation.policy` | default_pending_rep | עמודת "השתתפות עובד ברירת מחדל (דמה)" ב-X "קטלוג רכבים" | נגזר | ברירת המחדל מוצגת כ**הערכה**, ונציג התחבורה מאשר אותה. שאלנו את המארגנות ולא קיבלנו תשובה |
| `participation.reducesValueOfUse` | false | R.netMethod.participation | מאומת | ניכוי מהנטו בלבד. מצאנו את זה קודם בהשוואת השערות, והמארגנות אישרו בעדכון |

### רכיבי שכר
| שדה | ערך | מקור | סוג | הערה |
|---|---|---|---|---|
| `payroll.pensionableComponents` | base, commissions, bonus | R.netMethod.contributionsBase = gross | מאומת | E-002 (עמלות 2,400). מצאנו בהשוואת השערות, והמארגנות אישרו בעדכון |
| `payroll.studyFundComponents` | base, commissions, bonus | R.netMethod.contributionsBase = gross | מאומת | כנ"ל |
| `payroll.studyFundCeiling` | null | R ("על כל הברוטו", בלי תקרה) | אתגר | בחוק יש תקרה פטורה ממס, אבל היא לא משנה את הניכוי של העובד באתגר |

### שיטת חישוב הנטו
| שדה | ערך | מקור | סוג | הערה |
|---|---|---|---|---|
| `netMethod.basis` | monthly | R.netMethod.basis | אתגר | |
| `netMethod.taxYear` | 2025 | R.netMethod.taxYear | אתגר | לוחות 2025 להמחשה, כמו באתגר |
| `netMethod.creditPointValue` | 242 | R.netMethod.creditPointValue | מאומת | 36/36 |
| `netMethod.brackets` | 7 מדרגות, 10%-50% | R.netMethod.brackets | מאומת | 36/36 |
| `netMethod.nationalInsurance.*` | סף 7,522, תקרה 50,695, 1.04% / 7% | R.netMethod.nationalInsurance | מאומת | שווי השימוש נכלל בבסיס. 36/36 |
| `netMethod.health.*` | סף 7,522, תקרה 50,695, 3.23% / 5.17% | R.netMethod.health | מאומת | 36/36 |
| `netMethod.pensionCredit.rate` | 0.35 | R.netMethod.pensionCredit | מאומת | 36/36 |
| `netMethod.pensionCredit.maxContributionRate` | 0.07 | R.netMethod.pensionCredit | מאומת | מצאנו בהשוואת השערות: הזיכוי זהה גם למי שמפריש 6%. המארגנות אישרו בעדכון |
| `netMethod.pensionCredit.incomeCeiling` | 9,500 | R.netMethod.pensionCredit | מאומת | 36/36 |
| `netMethod.rounding.during` | none | R.netMethod.rounding (עדכון 2026-10-14) | אתגר | בלי עיגול באמצע, כולל הגילום |
| `netMethod.rounding.display` | shekel | R.netMethod.rounding | מאומת | ההפרש מחושב בין הנטו המעוגלים, כמו בגיליון: 17,794 − 17,073 = 721 (E-006) |

### שווי שימוש (רשות המסים)
| שדה | ערך | מקור | סוג | הערה |
|---|---|---|---|---|
| `valueOfUse.taxYear` | 2026 | עמודת "שנת מס" ב-C | מאומת | |
| `valueOfUse.source` | | R.valueOfUse.source | אתגר | |
| `valueOfUse.driveField.*` | 0 בנזין, 1 היברידי, 2 פלאג-אין, 3 חשמלי | R.valueOfUse.driveField | מאומת | **כותרת העמודה ב-C שגויה** ("1-חשמלי.2-היברידי.3-פלג-אין"). הנתונים עצמם תואמים ל-R: ATTO 3 מסומן 3 |
| `valueOfUse.csv.encoding` | windows-1255 | C | מאומת | בקידוד הזה הכותרות והשמות בעברית נקראים נכון, וכל 77,988 השורות עוברות ולידציה |
| `valueOfUse.csv.columns.*` | שמות 19 העמודות | שורת הכותרת ב-C | מאומת | הטעינה נכשלת אם עמודה חסרה. **המפתח הוא 5 שדות**: שנת מס, שנת רישום, קוד סוג רכב, קוד תוצר, קוד דגם. ATTO 3 ו-TANG חולקים קוד תוצר וקוד דגם |

---

## catalog.json (מגיליון X "קטלוג רכבים")
| שדה | מקור | סוג | הערה |
|---|---|---|---|
| `catalog[].id` | "מזהה" | אתגר | |
| `catalog[].group` | "קבוצה" | אתגר | |
| `catalog[].makerName` | "תוצר" | אתגר | |
| `catalog[].makerCode` | "קוד תוצר", מרופד ל-5 ספרות | מאומת | כמו ב-C. נבדק מול המאגר |
| `catalog[].commercialName` | "דגם (כינוי מסחרי)" | אתגר | |
| `catalog[].modelCode` | "קוד דגם", מרופד ל-5 ספרות | מאומת | נבדק מול המאגר |
| `catalog[].modelDesc` | "תאור דגם" | אתגר | |
| `catalog[].regYear` | "שנת רישום" | מאומת | נבדק מול המאגר |
| `catalog[].vehicleTypeCode` | 1 לכולם | מאומת | אין עמודה כזו ב-X. כל 20 הרכבים נמצאו ב-C עם קוד סוג רכב 1 (פרטי) |
| `catalog[].drive` | "הנעה" | מאומת | תואם להנעה ב-C |
| `catalog[].listPrice` | "מחיר מחירון" | אתגר | |
| `catalog[].valueOfUse` | "שווי שימוש חודשי" | מאומת | **לבדיקה בלבד**: המנוע לוקח שווי שימוש מהמאגר לפי המפתח המלא. בדיקת הקונפיג משווה את שניהם |
| `catalog[].monthlyCost` | "עלות חודשית לחברה (דמה)" | אתגר | נתון דמה של האתגר |
| `catalog[].defaultParticipation` | "השתתפות עובד ברירת מחדל (דמה)" | אתגר | מוצג כהערכה עד אישור נציג (ראו `participation.policy`) |

## occupations.json (מגיליון X "עיסוקים")
| שדה | מקור | סוג |
|---|---|---|
| `occupations[].name` | "עיסוק" | אתגר |
| `occupations[].group` | "קבוצת זכאות" | אתגר |
| `occupations[].carRequired` | "רכב חובה" (כן/לא) | אתגר |
| `occupations[].waiverAllowed` | "מותר לוותר" (כן/לא) | אתגר |
| `occupations[].maintenance` | "אחזקת רכב בוויתור (₪)" | מאומת (E-005, וגם תרחיש קצה 1: 1,500 למפתח/ת תוכנה) |

## sample-employees.json ו-reference-results.json
מועתקים מהגיליונות "עובדים לדוגמה" ו"חישובים" כמו שהם. הם **נתוני בדיקה**: המנוע לא קורא אותם בזמן ריצה. `reference-results.json` הוא המקור של 36/36.

---

## מה **לא** בקונפיג, ולמה
- **הנוסחה עצמה** (סדר החישוב) נמצאת בקוד ב-`api/strauss/domain/`. היא אומתה ב-36/36, וכל מספר שהיא משתמשת בו מגיע מהטבלאות שלמעלה.
- **ספי תפעול** (כמה הודעות נשלחות למודל, מגבלת בקשות לתור, זמן המתנה) הם לא כללי עסק, ונמצאים בקוד ליד השימוש שלהם.
