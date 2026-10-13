# -*- coding: utf-8 -*-
"""
Builds the config bundle (config/*.json) from the challenge's original files in data/source/.

Run from the repo root:
    uv run --project api --with openpyxl python research/build_config.py

The output is committed. In a pilot, Strauss replaces these JSON files with real data - not the code.
Everything here is a straight conversion, except the fields marked DERIVED, which were recovered by
reverse-engineering the reference sheet (see research/verify_reference.py and GUIDE.md, part D).
"""

import json
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "source"
OUT = ROOT / "config"

DRIVE_HE = {"בנזין": "PETROL", "היברידי": "HYBRID", "פלאג-אין": "PLUG_IN", "חשמלי": "ELECTRIC"}
YES = {"כן": True, "לא": False}


def sheet(wb: openpyxl.Workbook, name: str) -> list[dict]:
    rows = list(wb[name].iter_rows(values_only=True))
    header = [str(h).strip() for h in rows[0]]
    return [dict(zip(header, r, strict=False)) for r in rows[1:] if any(v is not None for v in r)]


def num(v: object) -> float | int:
    f = float(v)  # type: ignore[arg-type]
    return int(f) if f.is_integer() else f


def parse_current(raw: str, participation: float | int, catalog: list[dict]) -> dict:
    """'COROLLA CROSS' -> catalog car; 'אין (אחזקה 1500 ₪)' -> waiver with maintenance."""
    if raw.startswith("אין"):
        amount = int("".join(ch for ch in raw if ch.isdigit()))
        return {"kind": "waiver", "maintenance": amount}
    match = next(c for c in catalog if c["commercialName"] == raw.strip())
    return {"kind": "car", "catalogId": match["id"], "participation": participation}


def build_rules(src: dict) -> dict:
    nm = src["netMethod"]
    return {
        "version": "2026-10-13.1",
        "effectiveFrom": "2026-01-01",
        "currency": "ILS",
        "note": src["note"],
        "groups": [{"code": g, "budget": src["budgets"][g]} for g in src["groupOrder"]],
        "chooseFrom": "own_or_lower",
        "enforceBudget": True,
        "unusedBudget": src["unusedBudget"],
        "electric": {
            "netBonus": src["electric"]["netBonus"],
            "method": src["electric"]["method"],
            "drives": ["ELECTRIC"],
        },
        "specialTracks": [
            {
                "id": "family",
                "label": "מסלול ברוכת ילדים",
                "catalogGroup": "משפחתי",
                "requires": {
                    "minChildren": src["familyTrack"]["minChildren"],
                    "childMaxAge": src["familyTrack"]["childMaxAge"],
                },
                "gapSplitEmployee": src["familyTrack"]["gapSplitEmployee"],
            }
        ],
        "waiver": src["waiver"],
        "participation": {"policy": "default_pending_rep"},
        "payroll": {
            # DERIVED: pension and study fund are computed on commissions and bonus too (reference sheet).
            "pensionableComponents": ["base", "commissions", "bonus"],
            "studyFundComponents": ["base", "commissions", "bonus"],
            "studyFundCeiling": None,
        },
        "netMethod": {
            "basis": nm["basis"],
            "taxYear": nm["taxYear"],
            "creditPointValue": nm["creditPointValue"],
            "brackets": nm["brackets"],
            "nationalInsurance": nm["nationalInsurance"],
            "health": nm["health"],
            # DERIVED: the credit applies to contributions up to 7% of the (capped) pensionable income.
            "pensionCredit": {**nm["pensionCredit"], "maxContributionRate": 0.07},
        },
        "valueOfUse": {
            "taxYear": 2026,
            "source": src["valueOfUse"]["source"],
            # VERIFIED against the CSV: the header claims 1=electric/2=hybrid/3=plug-in, the data says otherwise.
            "driveField": {"0": "PETROL", "1": "HYBRID", "2": "PLUG_IN", "3": "ELECTRIC"},
            "csv": {
                "encoding": "windows-1255",
                "columns": {
                    "taxYear": "שנת מס",
                    "regYear": "שנת רישום",
                    "vehicleTypeCode": "קוד סוג רכב",
                    "makerCode": "קוד תוצר",
                    "makerName": "תוצר",
                    "modelCode": "קוד דגם",
                    "modelDesc": "תאור דגם",
                    "fuelType": "סוג דלק",
                    "commercialName": "כינוי מסחרי",
                    "automatic": "לא-0.כן-1 אוטומט",
                    "driveCode": "1-חשמלי.2-היברידי.3-פלג-אין",
                    "greenScore": "ציון ירוק",
                    "pollutionLevel": "דרגת זיהום",
                    "engineCc": "נפח מנוע",
                    "weight": "משקל",
                    "effectiveDate": "תאריך תחולה",
                    "listPrice": "מחיר מחירון",
                    "adjustedPrice": "מחיר מתואם",
                    "valueOfUse": "שווי שימוש",
                },
            },
        },
    }


def main() -> None:
    OUT.mkdir(exist_ok=True)
    src_rules = json.loads((SRC / "challenge-rules.json").read_text(encoding="utf-8"))
    wb = openpyxl.load_workbook(SRC / "challenge-data.xlsx", data_only=True)

    catalog = [
        {
            "id": r["מזהה"],
            "group": r["קבוצה"],
            "makerName": r["תוצר"],
            "makerCode": str(r["קוד תוצר"]).zfill(5),
            "commercialName": str(r["דגם (כינוי מסחרי)"]).strip(),
            "modelCode": str(r["קוד דגם"]).zfill(5),
            "modelDesc": str(r["תאור דגם"]).strip(),
            "regYear": int(r["שנת רישום"]),
            "vehicleTypeCode": 1,  # all catalog cars are private cars (type 1); verified against the CSV
            "drive": DRIVE_HE[r["הנעה"]],
            "listPrice": num(r["מחיר מחירון"]),
            "valueOfUse": num(r["שווי שימוש חודשי"]),  # for cross-checking only; the engine reads the DB
            "monthlyCost": num(r["עלות חודשית לחברה (דמה)"]),
            "defaultParticipation": num(r["השתתפות עובד ברירת מחדל (דמה)"]),
        }
        for r in sheet(wb, "קטלוג רכבים")
    ]

    occupations = [
        {
            "name": r["עיסוק"],
            "group": r["קבוצת זכאות"],
            "carRequired": YES[r["רכב חובה"]],
            "waiverAllowed": YES[r["מותר לוותר"]],
            "maintenance": num(r["אחזקת רכב בוויתור (₪)"]),
        }
        for r in sheet(wb, "עיסוקים")
    ]

    employees = [
        {
            "id": r["מזהה"],
            "name": r["שם"],
            "occupation": r["עיסוק"],
            "group": r["קבוצה"],
            "salary": {"base": num(r["שכר בסיס"]), "commissions": num(r["עמלות"] or 0), "bonus": num(r["בונוס"] or 0)},
            "deductions": {
                "pensionPct": num(r["פנסיה עובד %"]),
                "studyFundPct": num(r["קרן השתלמות עובד %"]),
                "creditPoints": num(r["נקודות זיכוי"]),
            },
            "childrenUnder23": int(r["ילדים עד 23"]),
            "current": parse_current(str(r["רכב היום"]), num(r["השתתפות היום"] or 0), catalog),
            "question": r["השאלה"],
        }
        for r in sheet(wb, "עובדים לדוגמה")
    ]

    reference = [
        {
            "employeeId": r["מזהה"],
            "today": r["היום"],
            "alternative": r["החלופה"],
            "eligible": r["זכאות"] == "כן",
            "reason": r["סיבה"],
            "netToday": num(r["נטו היום"]),
            "netAlternative": num(r["נטו בחלופה"]),
            "delta": num(r["הפרש"]),
            "taxToday": num(r["מס היום"]),
            "taxAlternative": num(r["מס בחלופה"]),
            "insuranceToday": num(r["ביטוח לאומי+בריאות היום"]),
            "insuranceAlternative": num(r["ביטוח לאומי+בריאות בחלופה"]),
            "electricGrossUp": num(r["החזר חשמל ברוטו"]),
            "trackEmployeeShare": num(r["חלק העובד במסלול המשפחתי"]),
            "why": r["למה"],
        }
        for r in sheet(wb, "חישובים")
    ]

    files = {
        "rules.json": build_rules(src_rules),
        "catalog.json": catalog,
        "occupations.json": occupations,
        "sample-employees.json": employees,
        "reference-results.json": reference,
    }
    for name, data in files.items():
        (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"config/{name}: {len(data)} entries")


if __name__ == "__main__":
    main()
