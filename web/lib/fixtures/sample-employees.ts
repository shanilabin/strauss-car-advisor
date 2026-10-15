/**
 * Demo sample-employee picker entries for /form.
 * Ids match api/config/sample-employees.json (POST /v1/conversations sample_employee_id).
 * Names/occupations only — no money amounts. There is no list-samples API endpoint.
 */
export type SampleEmployeeEntry = {
  id: string;
  name: string;
  occupation: string;
  question: string;
};

export const SAMPLE_EMPLOYEES: SampleEmployeeEntry[] = [
  {
    id: "E-001",
    name: "נועה לוי",
    occupation: "מנהל/ת מוצר",
    question: "אם אעבור מהקורולה קרוס ל-BYD Atto 3 החשמלי - כמה זה ישנה לי בנטו?",
  },
  {
    id: "E-002",
    name: "דוד כהן",
    occupation: "נציג/ת מכירות שטח",
    question: "יש לי 5 ילדים. אם אקח קרניבל במסלול ברוכת ילדים - מה יקרה לנטו?",
  },
  {
    id: "E-003",
    name: "רחל פרידמן",
    occupation: "מפתח/ת תוכנה",
    question: "היום אני מקבלת אחזקת רכב. אם אקח MG4 חשמלי - כמה אפסיד או ארוויח בנטו?",
  },
  {
    id: "E-004",
    name: "יוסי מזרחי",
    occupation: "מנהל/ת אזור מכירות",
    question: "אם אחליף את הטוסון ב-EV3 - מה ההפרש בנטו?",
  },
  {
    id: "E-005",
    name: "מיכל אברהם",
    occupation: "מנהל/ת פיתוח",
    question: "אם אוותר על הרכב ואקבל אחזקה - כמה אקבל בנטו?",
  },
  {
    id: "E-006",
    name: "אלי שמעון",
    occupation: "מנהל/ת מחלקה",
    question: "אם אעבור מהאוקטביה לטסלה מודל 3 - מה יקרה לנטו?",
  },
];
