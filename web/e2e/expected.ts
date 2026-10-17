/**
 * Hard-coded expectations for the e2e suite. Money checks that only compare
 * two figures on the same screen (waterfall total vs delta) do not live here.
 */

/**
 * The amount the rep types.
 * UX.md §6 ("למשל 350 ₪") and ARCHITECTURE.md (the rep updates participation to 350 ₪).
 */
export const REP_PARTICIPATION_ANSWER = "350";

/**
 * A different amount used only to prove a second answer is refused.
 * The API contract returns 409 already_answered (ARCHITECTURE.md testing table).
 */
export const REP_SECOND_ANSWER = "400";

/**
 * E-001 נועה לוי compared with ATTO 3. Her current participation is filled in
 * (api/config/sample-employees.json). The missing fact is the new car's
 * participation, which rules.json marks default_pending_rep until the rep confirms.
 * Catalog label: api/config/catalog.json CAR-10, "ATTO 3", registration year 2025.
 */
export const CHALLENGE = {
  employeeName: "נועה לוי",
  optionLabel: "ATTO 3 (2025)",
  optionField: "participation:CAR-10",
  /**
   * Fixed rep question template (engine), not model wording.
   * api/strauss/domain/missing.py QUESTIONS.participation, car = option label.
   */
  question: "מה סכום ההשתתפות של העובד ב-ATTO 3 (2025), וממתי הוא בתוקף?",
  /**
   * Context the rep is allowed to see. UX.md §6: occupation, group, requested car, current car.
   * Values: sample-employees.json E-001 and catalog CAR-09 / CAR-10.
   */
  context: {
    occupation: "מנהל/ת מוצר",
    group: "ג",
    requestedCar: "ATTO 3 (2025)",
    currentCar: "COROLLA CROSS (2025)",
  },
} as const;

/**
 * Group ב waiver card.
 *
 * E-003 רחל פרידמן is already on a waiver, so the engine does not offer "ויתור על הרכב"
 * as an alternative. The group ב sample who still has a car is E-002 דוד כהן
 * (נציג/ת מכירות שטח).
 *
 * ARCHITECTURE.md: waiver is allowed by occupation, and carRequired ⇒ !waiverAllowed.
 * api/config/occupations.json: that occupation has carRequired true and waiverAllowed false,
 * so the card is present and not eligible.
 * Reason text is the CAR_REQUIRED template the options card renders from the DTO
 * (api/strauss/domain/explain.py): "בתפקיד {occupation} הרכב הוא חובה, ולכן אי אפשר לוותר עליו".
 * UX.md §5: an ineligible card stays visible, without a money figure, with the reason.
 */
export const GROUP_B_WAIVER = {
  employeeName: "דוד כהן",
  cardLabel: "ויתור על הרכב",
  badge: "לא זכאי",
  reason: "בתפקיד נציג/ת מכירות שטח הרכב הוא חובה, ולכן אי אפשר לוותר עליו",
} as const;

/**
 * UX.md §5 stage 6, requirement 23. Labels match the comparison card rows.
 * The car title and the eligibility line are separate from this list.
 */
export const REQUIREMENT_23_ROWS = [
  "עלות לחברה ותקציב הקבוצה",
  "השתתפות העובד",
  "שווי שימוש",
  "החזר חשמל או אחזקת רכב",
  "נטו משוער היום",
  "נטו משוער בחלופה",
  "ההפרש",
] as const;

/**
 * Eligibility sentence for נועה לוי → ATTO 3.
 * api/config/reference-results.json, employee E-001.
 */
export const NOA_ATTO_REASON = "הרכב מהקבוצה שלך או נמוכה ממנה";
