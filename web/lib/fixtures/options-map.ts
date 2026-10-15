/**
 * Dev-only fixture: a realistic Options / Comparison payload shaped like the API schema.
 * Mix of eligible and ineligible cars plus the waiver option. Numbers are sample DTO values.
 * Do not import from production routes.
 */
import type { components } from "@/lib/api/schema";

type Comparison = components["schemas"]["Comparison"];
type OptionResult = components["schemas"]["OptionResult"];

const context: components["schemas"]["CalculationContext"] = {
  payroll_tax_year: 2025,
  value_of_use_tax_year: 2026,
  config_version: "2026-10-13.1",
  config_hash: "fixture-options-map",
  engine_version: "fixture",
};

const today: components["schemas"]["NetBreakdown"] = {
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

const profileSnapshot: components["schemas"]["Profile-Output"] = {
  revision: 1,
  occupation: "מנהל/ת מוצר",
  group: "ג",
  salary: { base: 18500, commissions: 0, bonus: 0 },
  deductions: { pension_pct: 6, study_fund_pct: 2.5, credit_points: 2.75 },
  children_under_23: 2,
  current: {
    kind: "car",
    catalog_id: "CAR-09",
    participation: 300,
    participation_status: "CONFIRMED",
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
  },
};

function eligibleCar(partial: {
  id: string;
  label: string;
  drive: components["schemas"]["Drive"];
  delta: number;
  net_option: number;
  cost_to_company: number;
  value_of_use: number;
  electric_refund_net?: number;
}): OptionResult {
  return {
    option: {
      id: partial.id,
      kind: "CATALOG_CAR",
      label: partial.label,
      catalog_id: partial.id,
      drive: partial.drive,
    },
    eligibility: {
      eligible: true,
      reason_code: "OK_OWN_OR_LOWER",
      reason: "הרכב מהקבוצה שלך או נמוכה ממנה",
      params: { car_group: "ג", employee_group: "ג" },
    },
    complete: true,
    cost_to_company: partial.cost_to_company,
    group_budget: 4500,
    participation: 300,
    participation_status: "DEFAULT_PENDING",
    value_of_use: partial.value_of_use,
    electric_refund_net: partial.electric_refund_net ?? null,
    net_today: 11032,
    net_option: partial.net_option,
    delta: partial.delta,
    explanation: ["הסבר לדוגמה מהמנוע.", "שורה שנייה מהמנוע."],
    sources: [],
  };
}

function ineligibleCar(partial: {
  id: string;
  label: string;
  drive: components["schemas"]["Drive"];
  reason: string;
  reason_code: string;
}): OptionResult {
  return {
    option: {
      id: partial.id,
      kind: "CATALOG_CAR",
      label: partial.label,
      catalog_id: partial.id,
      drive: partial.drive,
    },
    eligibility: {
      eligible: false,
      reason_code: partial.reason_code,
      reason: partial.reason,
      params: { car_group: "ד", employee_group: "ג" },
    },
    complete: true,
    explanation: [partial.reason],
    sources: [],
  };
}

const waiver: OptionResult = {
  option: {
    id: "waiver",
    kind: "WAIVER",
    label: "ויתור על הרכב",
  },
  eligibility: {
    eligible: true,
    reason_code: "WAIVER_OK",
    reason: "העיסוק שלך מאפשר לוותר על הרכב ולקבל אחזקת רכב",
  },
  complete: true,
  cost_to_company: 2000,
  group_budget: 4500,
  maintenance: 2000,
  net_today: 11032,
  net_option: 14231,
  delta: 3199,
  explanation: [
    "בלי רכב לא נוסף לשכר שלך שווי שימוש, ולכן המס יורד.",
    "במקום הרכב מקבלים אחזקת רכב ולא משלמים השתתפות.",
  ],
  sources: [],
};

/** Unsorted on purpose — OptionsMap must sort by delta (eligible first). */
export const optionsMapFixtureResults: OptionResult[] = [
  eligibleCar({
    id: "CAR-10",
    label: "BYD ATTO 3 (2025)",
    drive: "ELECTRIC",
    delta: 661,
    net_option: 11693,
    cost_to_company: 4100,
    value_of_use: 3130,
    electric_refund_net: 250,
  }),
  ineligibleCar({
    id: "CAR-14",
    label: "TESLA MODEL 3 (2025)",
    drive: "ELECTRIC",
    reason_code: "HIGHER_GROUP",
    reason: "הרכב מקבוצה ד, גבוהה מהקבוצה שלך (ג)",
  }),
  eligibleCar({
    id: "CAR-08",
    label: "HYUNDAI IONIQ 5 (2025)",
    drive: "ELECTRIC",
    delta: 420,
    net_option: 11452,
    cost_to_company: 4300,
    value_of_use: 3400,
    electric_refund_net: 250,
  }),
  eligibleCar({
    id: "CAR-06",
    label: "MG4 (2025)",
    drive: "ELECTRIC",
    delta: 510,
    net_option: 11542,
    cost_to_company: 3550,
    value_of_use: 2430,
    electric_refund_net: 250,
  }),
  eligibleCar({
    id: "CAR-05",
    label: "NIRO (2025)",
    drive: "HYBRID",
    delta: 280,
    net_option: 11312,
    cost_to_company: 3600,
    value_of_use: 2950,
  }),
  eligibleCar({
    id: "CAR-02",
    label: "YARIS CROSS HSD (2025)",
    drive: "HYBRID",
    delta: 150,
    net_option: 11182,
    cost_to_company: 3400,
    value_of_use: 3350,
  }),
  ineligibleCar({
    id: "CAR-15",
    label: "BMW iX1 (2025)",
    drive: "ELECTRIC",
    reason_code: "OVER_BUDGET",
    reason: "עלות הרכב לחברה גבוהה מתקציב הקבוצה שלך",
  }),
  eligibleCar({
    id: "CAR-01",
    label: "PICANTO (2025)",
    drive: "PETROL",
    delta: 90,
    net_option: 11122,
    cost_to_company: 2650,
    value_of_use: 2690,
  }),
  ineligibleCar({
    id: "CAR-16",
    label: "AUDI Q4 (2025)",
    drive: "ELECTRIC",
    reason_code: "HIGHER_GROUP",
    reason: "הרכב מקבוצה ד, גבוהה מהקבוצה שלך (ג)",
  }),
  waiver,
];

export const optionsMapFixture: Comparison = {
  id: "cmp-fixture-options-map",
  context,
  profile_snapshot: profileSnapshot,
  today,
  results: optionsMapFixtureResults,
  best_option_id: "waiver",
};
