# -*- coding: utf-8 -*-
"""
אימות נוסחת הנטו מול גיליון 'חישובים' באקסל של האתגר.
קורא הכול מהקבצים (אקסל + JSON) - אין כאן מספרים קשיחים של עובדים.
מריץ כמה השערות לנוסחה ומראה איזו מתאימה לנתוני הייחוס.

הרצה:
  pip install openpyxl
  python research/verify_reference.py "<נתיב לאקסל>" "<נתיב ל-JSON>"
"""
import sys, json, re, openpyxl

xlsx, rules_path = sys.argv[1], sys.argv[2]
R = json.load(open(rules_path, encoding="utf-8"))
NM = R["netMethod"]
wb = openpyxl.load_workbook(xlsx, data_only=True)

def sheet(name):
    rows = list(wb[name].iter_rows(values_only=True))
    h = rows[0]
    return [dict(zip(h, r)) for r in rows[1:] if any(r)]

catalog = {str(r["דגם (כינוי מסחרי)"]).strip(): r for r in sheet("קטלוג רכבים")}
occ = {r["עיסוק"]: r for r in sheet("עיסוקים")}
emps = {r["מזהה"]: r for r in sheet("עובדים לדוגמה")}
refs = sheet("חישובים")

def brackets_tax(x):
    t, lo = 0.0, 0.0
    for hi, rate in NM["brackets"]:
        top = x if hi is None else min(x, hi)
        if top > lo: t += (top - lo) * rate
        if hi is None or x <= hi: break
        lo = hi
    return t

def two_tier(x, p):
    x = min(x, p["ceiling"])
    return min(x, p["threshold"]) * p["lowRate"] + max(0, x - p["threshold"]) * p["highRate"]

def parse_option(text):
    """'ATTO 3 (2025)' / 'ויתור - אחזקת רכב 1500 ₪' / 'אין (אחזקה 1500 ₪)' / 'COROLLA CROSS'"""
    text = str(text).strip()
    m = re.search(r"(\d[\d,]*)\s*₪", text)
    if "ויתור" in text or "אין" in text:
        return {"type": "waiver", "maintenance": float(m.group(1).replace(",", ""))}
    name = re.sub(r"\s*\(\d{4}\)\s*$", "", text).strip()
    return {"type": "car", "car": catalog[name]}

DRIVE_ELECTRIC = "חשמלי"

def net(emp, opt, participation, H):
    """H = מילון השערות: אילו כללים להפעיל"""
    base = float(emp["שכר בסיס"]); comm = float(emp["עמלות"] or 0); bonus = float(emp["בונוס"] or 0)
    maint = opt.get("maintenance", 0) if opt["type"] == "waiver" else 0
    vou = float(opt["car"]["שווי שימוש חודשי"]) if opt["type"] == "car" else 0
    fam = 0
    if opt["type"] == "car" and opt["car"]["קבוצה"] == "משפחתי":
        # updated rules: the track price comes from the catalogue, per car (Carnival 6,000, Santa Fe 5,600)
        gap = max(0, opt["car"]["עלות חודשית לחברה (דמה)"] - R["budgets"][emp["קבוצה"]])
        fam = gap * R["familyTrack"]["gapSplitEmployee"]
    pens_base = base + comm + bonus if H["pension_on_all"] else base
    pension = pens_base * float(emp["פנסיה עובד %"]) / 100
    study = (pens_base if H["study_on_all"] else base) * float(emp["קרן השתלמות עובד %"]) / 100
    pc = NM["pensionCredit"]
    cap = 0.07 * pc["incomeCeiling"] if H["credit_cap_7pct"] else float(emp["פנסיה עובד %"]) / 100 * pc["incomeCeiling"]
    def calc(gross_up):
        cash = base + comm + bonus + maint + gross_up
        taxable = cash + vou
        tax = max(0.0, brackets_tax(taxable) - float(emp["נקודות זיכוי"]) * NM["creditPointValue"] - pc["rate"] * min(pension, cap))
        ins = two_tier(taxable, NM["nationalInsurance"]) + two_tier(taxable, NM["health"])
        return cash - tax - ins - pension - study - participation - fam, tax, ins
    g = 0.0
    if opt["type"] == "car" and opt["car"]["הנעה"] == DRIVE_ELECTRIC:
        target = R["electric"]["netBonus"]
        lo, hi = 0.0, target * 4
        n0 = calc(0)[0]
        for _ in range(80):  # חיפוש בינארי: איזה ברוטו נותן בדיוק +250 נטו
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if calc(mid)[0] - n0 < target else (lo, mid)
        g = lo
    n, t, i = calc(g)
    return round(n), round(t), round(i), round(g)

HYPOTHESES = {
    "1. נאיבי (רק מה שהיה כתוב ב-JSON לפני עדכון הכללים)":         dict(pension_on_all=False, study_on_all=False, credit_cap_7pct=False),
    "2. + תקרת זיכוי 7%":                     dict(pension_on_all=False, study_on_all=False, credit_cap_7pct=True),
    "3. + פנסיה על עמלות ובונוס":             dict(pension_on_all=True,  study_on_all=False, credit_cap_7pct=True),
    "4. + השתלמות על עמלות ובונוס (סופי)":    dict(pension_on_all=True,  study_on_all=True,  credit_cap_7pct=True),
}

for hname, H in HYPOTHESES.items():
    ok = total = 0
    lines = []
    for ref in refs:
        emp = emps[ref["מזהה"]]
        today = parse_option(emp["רכב היום"])
        alt = parse_option(ref["החלופה"])
        p_today = float(emp["השתתפות היום"] or 0)
        p_alt = float(alt["car"]["השתתפות עובד ברירת מחדל (דמה)"]) if alt["type"] == "car" else 0
        n1, t1, i1, _ = net(emp, today, p_today, H)
        n2, t2, i2, g = net(emp, alt, p_alt, H)
        pairs = [(n1, ref["נטו היום"]), (t1, ref["מס היום"]), (i1, ref["ביטוח לאומי+בריאות היום"]),
                 (n2, ref["נטו בחלופה"]), (t2, ref["מס בחלופה"]), (i2, ref["ביטוח לאומי+בריאות בחלופה"])]
        good = sum(1 for a, b in pairs if a == b); ok += good; total += len(pairs)
        lines.append(f"   {emp['שם']:<12} נטו היום {n1:>6} (ייחוס {ref['נטו היום']:>6}) | חלופה {n2:>6} (ייחוס {ref['נטו בחלופה']:>6}) | גילום {g:>4} (ייחוס {ref['החזר חשמל ברוטו']}) | {good}/6")
    print(f"\n{hname}:  {ok}/{total} התאמות")
    print("\n".join(lines))
