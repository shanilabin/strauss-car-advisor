/**
 * Dev-only fixture: Noa Levi (E-001) vs BYD ATTO 3, shaped like the API schema.
 * Numbers match api/config/reference-results.json and api/strauss/http/stub_data.json.
 * Do not import from production routes.
 */
import type { components } from "@/lib/api/schema";

type Comparison = components["schemas"]["Comparison"];
type OptionResult = components["schemas"]["OptionResult"];

const todayBreakdown: components["schemas"]["NetBreakdown"] = {
  gross_cash: 18500,
  value_of_use: 4070,
  taxable_income: 22570,
  income_tax: 3443.15,
  national_insurance: 1131.59,
  health: 1020.94,
  pension: 1110,
  study_fund: 462.5,
  participation: 300,
  track_employee_share: 0,
  electric_gross_up: 0,
  maintenance: 0,
  net: 11031.82,
};

/** ATTO 3 OptionResult — requirement-23 fields populated from the engine DTO. */
export const noaLeviAttoResult: OptionResult = {
  option: {
    id: "CAR-10",
    kind: "CATALOG_CAR",
    label: "BYD ATTO 3 (2025)",
    catalog_id: "CAR-10",
    drive: "ELECTRIC",
  },
  eligibility: {
    eligible: true,
    reason_code: "OK_OWN_OR_LOWER",
    reason: "הרכב מהקבוצה שלך או נמוכה ממנה",
    params: {
      car_group: "ג",
      employee_group: "ג",
    },
  },
  complete: true,
  cost_to_company: 4100,
  group_budget: 4500,
  participation: 300,
  participation_status: "DEFAULT_PENDING",
  value_of_use: 3130,
  electric_refund_net: 250,
  breakdown: {
    gross_cash: 18939.91,
    value_of_use: 3130,
    taxable_income: 22069.91,
    income_tax: 3282.92,
    national_insurance: 1096.58,
    health: 995.09,
    pension: 1110,
    study_fund: 462.5,
    participation: 300,
    track_employee_share: 0,
    electric_gross_up: 439.91,
    maintenance: 0,
    net: 11692.82,
  },
  net_today: 11032,
  net_option: 11693,
  delta: 661,
  waterfall: [
    {
      key: "value_of_use",
      label: "שווי שימוש נמוך יותר",
      delta: 411,
      net_after: 11443,
    },
    {
      key: "electric_refund",
      label: "החזר חשמל (מגולם)",
      delta: 250,
      net_after: 11693,
    },
  ],
  explanation: [
    "שווי השימוש יורד מ-4,070 ל-3,130 ₪ בחודש, ולכן המס שלך יורד.",
    "בנוסף מקבלים החזר חשמל של 250 ₪ נטו. ביחד: 661+ ₪ בחודש.",
  ],
  sources: [
    {
      field: "value_of_use",
      kind: "VALUE_OF_USE_DB",
      label: "מאגר שווי שימוש 2026, רשות המסים",
      ref: "2026/2025/1/01014/00003",
    },
    {
      field: "electric_refund_net",
      kind: "CONFIG",
      label: "החזר חשמל נטו",
      ref: "rules.electric.netBonus",
    },
    {
      field: "participation",
      kind: "CONFIG",
      label: "השתתפות ברירת מחדל - ממתינה לאישור נציג",
      ref: "catalog[CAR-10].defaultParticipation",
    },
    {
      field: "cost_to_company",
      kind: "CONFIG",
      label: "עלות חודשית לחברה",
      ref: "catalog[CAR-10].monthlyCost",
    },
    {
      field: "group_budget",
      kind: "CONFIG",
      label: "תקציב קבוצה ג",
      ref: "rules.groups[ג].budget",
    },
  ],
};

export const noaLeviComparison: Comparison = {
  id: "cmp-fixture-noa-atto",
  context: {
    payroll_tax_year: 2025,
    value_of_use_tax_year: 2026,
    config_version: "2026-10-13.1",
    config_hash: "fixture-dev-only",
    engine_version: "fixture",
  },
  profile_snapshot: {
    revision: 3,
    occupation: "מנהל/ת מוצר",
    group: "ג",
    salary: {
      base: 18500,
      commissions: 0,
      bonus: 0,
    },
    deductions: {
      pension_pct: 6,
      study_fund_pct: 2.5,
      credit_points: 2.75,
    },
    children_under_23: 2,
    current: {
      kind: "car",
      vehicle: {
        key: {
          tax_year: 2026,
          reg_year: 2025,
          vehicle_type_code: 1,
          maker_code: "00413",
          model_code: "00296",
        },
        maker_name: "טויוטה יפן",
        commercial_name: "COROLLA CROSS",
        model_desc: "ZVG12L-KHXGBW",
        drive: "HYBRID",
        list_price: 182990,
        value_of_use: 4070,
      },
      catalog_id: "CAR-09",
      participation: 300,
      participation_status: "CONFIRMED",
    },
  },
  today: todayBreakdown,
  results: [noaLeviAttoResult],
  best_option_id: "CAR-10",
};
