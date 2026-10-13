# פתיחת חשבונות והתקנות - יום 1

> זמן משוער: 45-60 דקות. הכול חינם, ואף שירות לא צריך כרטיס אשראי.
> **מפתחת א׳** = הבעלים של החשבונות המשותפים (Vercel, Supabase) · **מפתחת ב׳** = מצטרפת

## ⚠ שלושה כללי ברזל על סודות (מפתחות API, סיסמאות)
1. **אף פעם** לא בצ'אט, במייל, בוואטסאפ, בקוד או ב-Git.
2. שומרות במנהל סיסמאות (Bitwarden חינמי / Google Password Manager) ומעבירות ביניכן רק דרכו או בעל-פה.
3. בקוד הסודות נמצאים רק בקובץ `.env.local`, שנמצא ב-`.gitignore`. בענן הם נמצאים ב-Environment Variables של Vercel.

---

## שלב 0 - התקנות במחשב (כל אחת אצלה)
| כלי | איך | בדיקה |
|---|---|---|
| Git | https://git-scm.com/download/win | `git --version` |
| Node.js 22 LTS | https://nodejs.org | `node --version` |
| pnpm | בטרמינל: `npm install -g pnpm` | `pnpm --version` |
| uv (מנהל Python) | ב-PowerShell: `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 \| iex"` | `uv --version` |
| Python 3.12 | בטרמינל: `uv python install 3.12` (uv מנהל את זה, אין צורך להתקין בנפרד) | `uv python list` |
| VS Code | https://code.visualstudio.com + תוספים: Python, Ruff, ESLint, Prettier, Tailwind CSS IntelliSense | — |

הגדרת Git (חשוב! **המייל חייב להיות אותו מייל של חשבון GitHub**, אחרת Vercel חוסם):
```bash
git config --global user.name "השם שלך"
git config --global user.email "המייל-של-GitHub"
```

---

## שלב 1 - GitHub (שתיכן)
1. כל אחת נרשמת ב-https://github.com/signup.
2. מפעילות אימות דו-שלבי: Settings → Password and authentication → Two-factor authentication.
3. **מפתחת א׳** יוצרת ריפו: New repository →
   - Name: `strauss-car-advisor`
   - **Public** ← חובה. בתוכנית החינמית Vercel **חוסם deploy** מקומיטים של משתתפת שנייה בריפו פרטי ([דיון רשמי בקהילת Vercel](https://community.vercel.com/t/hobby-account-private-repo-collaborators-deployment-blocked/1030)). ממילא מגישות קוד מקור, אז הוא יהיה ציבורי בסוף.
   - V Add a README · .gitignore: None (ניצור שלנו) · License: MIT
4. מוסיפה את מפתחת ב׳: Settings → Collaborators → Add people.
5. **הגנה על main**: Settings → Branches → Add branch ruleset →
   - Target: `main`
   - V Require a pull request before merging
   - V Require status checks to pass (נוסיף את ה-CI ביום 1 אחרי שהוא רץ פעם אחת)
   - V Block force pushes

---

## שלב 2 - Google AI Studio / Gemini (שתיכן - כל אחת מפתח משלה)
1. https://aistudio.google.com → התחברות עם חשבון Google.
2. Get API key → Create API key → Create in new project.
3. שומרות במנהל הסיסמאות בשם `GEMINI_API_KEY (שם שלי)`.
4. **מפתחת א׳** יוצרת מפתח **שלישי** בפרויקט נפרד בשם `strauss-prod`. זה המפתח של האתר החי, ככה הניסויים שלכן לא שורפים את המכסה של הדמו.

> המכסה החינמית נקבעת **לכל פרויקט**, כך ששלושה פרויקטים נותנים פי 3 מכסה.
> ⚠ בתוכנית החינמית גוגל רשאית להשתמש בקלט לאימון, לכן מכניסות **רק נתונים פיקטיביים**.

---

## שלב 3 - מפתחות גיבוי למודלים (מפתחת א׳)
**OpenRouter**
1. https://openrouter.ai → Sign in with Google/GitHub.
2. Keys → Create Key → שם: `strauss` → שומרות כ-`OPENROUTER_API_KEY`.
3. לא מטעינות קרדיט. נשתמש רק במודלים שמסתיימים ב-`:free`.

**Groq**
1. https://console.groq.com → התחברות.
2. API Keys → Create API Key → שומרות כ-`GROQ_API_KEY`.

---

## שלב 4 - Supabase (מפתחת א׳ יוצרת, ב׳ מצטרפת)
1. https://supabase.com → Start your project → **Continue with GitHub**.
2. New organization: שם `strauss-hackathon`, Plan: **Free**.
3. New project:
   - Name: `strauss-car-advisor`
   - Database Password: **Generate** ← שומרות מיד במנהל הסיסמאות
   - Region: **Central EU (Frankfurt)** ← הכי קרוב לישראל
4. מחכות כ-2 דקות שהפרויקט יעלה.
5. **הפעלת כניסה אנונימית** (כך כל עובד בדמו מקבל זהות בלי הרשמה):
   Authentication → Sign In / Providers → **Allow anonymous sign-ins** → ON → Save.
6. **משתמש לנציג**: Authentication → Users → Add user → Create new user →
   - Email: `rep@demo.local` · Password: חזקה, ושומרות אותה · V Auto Confirm User
   - (את התפקיד `rep` נגדיר בקוד המיגרציה, לא בממשק)
7. אוספות את הערכים (Project Settings → API / API Keys / Data API) ושומרות במנהל הסיסמאות:
   | שם במשתנה | איפה | סודי? |
   |---|---|---|
   | `SUPABASE_URL` | Project URL | לא |
   | `SUPABASE_PUBLISHABLE_KEY` (נקרא גם anon) | API Keys | לא, מיועד לדפדפן |
   | `SUPABASE_SECRET_KEY` (נקרא גם service_role) | API Keys | **סודי מאוד**, רק לשרת |
8. הזמנת מפתחת ב׳: Organization Settings → Team → Invite → המייל שלה → Role: Developer.

---

## שלב 5 - Vercel (מפתחת א׳ בלבד)
> בתוכנית החינמית יש לכל פרויקט **בעלים אחד**. מפתחת ב׳ לא צריכה חשבון Vercel: היא דוחפת ל-GitHub, ו-Vercel מעלה לבד (בגלל שהריפו ציבורי).

1. https://vercel.com/signup → **Hobby** → Continue with GitHub.
2. Add New → Project → Import `strauss-car-advisor` → **עוד לא לוחצות Deploy**. נייבא **שני פרויקטים מאותו ריפו** ביום 1, אחרי שהשלד יהיה בריפו:
   | פרויקט Vercel | Root Directory | Framework |
   |---|---|---|
   | `strauss-web` | `web` | Next.js (מזוהה לבד) |
   | `strauss-api` | `api` | FastAPI (מזוהה לבד) |
3. אחרי הייבוא, בכל פרויקט: Settings → Functions → Function Region → **Frankfurt (fra1)**, כדי להיות ליד מסד הנתונים.
4. Settings → Environment Variables (אחרי שהשלד עולה, לפי `.env.example`).

---

## שלב 6 - בדיקת סיום
- [ ] שתיכן רואות את הריפו ויכולות לדחוף branch
- [ ] 3 מפתחות Gemini, OpenRouter ו-Groq במנהל הסיסמאות
- [ ] פרויקט Supabase פעיל, כניסה אנונימית מופעלת, משתמש נציג קיים, מפתחת ב׳ הוזמנה
- [ ] חשבון Vercel של מפתחת א׳ מחובר ל-GitHub
- [ ] `git config user.email` = המייל ב-GitHub, אצל שתיכן

**כשהכול מסומן, תכתבו לי "חשבונות מוכנים". אני אקים את השלד (משימה 0 ב-[TASKS.md](TASKS.md)) ואגיד לכן בדיוק איזה ערך להדביק איפה.**
