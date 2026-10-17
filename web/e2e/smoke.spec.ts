import { expect, test } from "@playwright/test";

import { CHALLENGE, NOA_ATTO_REASON, REQUIREMENT_23_ROWS } from "./expected";
import {
  continueToOptions,
  normalizeMoney,
  openFormFromLanding,
  pickSampleEmployee,
  selectOption,
} from "./helpers";

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

  for (const label of REQUIREMENT_23_ROWS) {
    await expect(comparison.getByRole("row", { name: new RegExp(`^${label}`) })).toBeVisible();
  }

  // Two engine explanation lines. The block has no accessible name of its own.
  await expect(comparison.locator("div.border-s-4 > p")).toHaveCount(2);

  const waterfall = comparison.getByRole("region", { name: "גרף מפל" });
  await expect(waterfall.getByRole("button", { name: "פירוק לפי סדר" })).toBeVisible();
  const total = normalizeMoney(await waterfall.locator("header bdi").first().innerText());
  const delta = normalizeMoney(
    await comparison.getByRole("row", { name: /^ההפרש/ }).locator("bdi").first().innerText(),
  );
  expect(total.length).toBeGreaterThan(0);
  expect(total).toBe(delta);
});
