import { expect, test } from "@playwright/test";

import { CHALLENGE, NOA_ATTO_REASON, REQUIREMENT_23_ROWS } from "./expected";
import {
  continueToOptions,
  employeeCredentials,
  normalizeMoney,
  openFormFromLanding,
  pickSampleEmployee,
  selectOption,
} from "./helpers";

test.skip(!employeeCredentials(), "Set E2E_EMPLOYEE_EMAIL and E2E_EMPLOYEE_PASSWORD (sign-in is required)");

test("landing through comparison shows requirement 23 and a matching waterfall", async ({
  page,
}) => {
  await openFormFromLanding(page);
  await pickSampleEmployee(page, CHALLENGE.employeeName);
  await continueToOptions(page);
  await selectOption(page, CHALLENGE.optionLabel);

  const comparison = page.getByRole("article", { name: `השוואה: ${CHALLENGE.optionLabel}` });
  await expect(comparison.getByRole("heading", { name: CHALLENGE.optionLabel })).toBeVisible();
  await expect(comparison.getByText("זכאי", { exact: true }).first()).toBeVisible();
  await expect(comparison.getByText(NOA_ATTO_REASON)).toBeVisible();

  // The requirement-23 table; the waterfall below has its own table with similar row names.
  const fields = comparison.getByRole("table", { name: "פירוט שדות ההשוואה" });
  for (const label of REQUIREMENT_23_ROWS) {
    await expect(fields.getByRole("row", { name: new RegExp(`^${label}`) })).toBeVisible();
  }

  // Two engine explanation lines. The block has no accessible name of its own.
  await expect(comparison.locator("div.border-s-4 > p")).toHaveCount(2);

  const waterfall = comparison.getByRole("region", { name: "גרף מפל" });
  await expect(waterfall.getByRole("button", { name: /הצגה בטבלה/ })).toBeVisible();
  const total = normalizeMoney(await waterfall.locator("header bdi").first().innerText());
  const delta = normalizeMoney(
    await fields.getByRole("row", { name: /^ההפרש/ }).locator("bdi").first().innerText(),
  );
  expect(total.length).toBeGreaterThan(0);
  expect(total).toBe(delta);
});
