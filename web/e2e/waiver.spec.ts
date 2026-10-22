import { expect, test } from "@playwright/test";

import { GROUP_B_WAIVER } from "./expected";
import { continueToOptions, employeeCredentials, openForm, pickSampleEmployee } from "./helpers";

test.skip(!employeeCredentials(), "Set E2E_EMPLOYEE_EMAIL and E2E_EMPLOYEE_PASSWORD (sign-in is required)");

test("group B field sales sees an ineligible waiver card", async ({ page }) => {
  await openForm(page);
  await pickSampleEmployee(page, GROUP_B_WAIVER.employeeName);
  await continueToOptions(page);

  const map = page.getByRole("region", { name: "מפת האפשרויות" });
  const waiver = map.getByRole("button", { name: GROUP_B_WAIVER.cardLabel });
  await waiver.scrollIntoViewIfNeeded();
  await expect(waiver).toBeVisible();
  await expect(waiver.getByText(GROUP_B_WAIVER.cardLabel, { exact: true })).toBeVisible();
  await expect(waiver.getByText(GROUP_B_WAIVER.badge, { exact: true })).toBeVisible();
  await expect(waiver.getByText("זכאי", { exact: true })).toHaveCount(0);
  await expect(waiver.getByText(GROUP_B_WAIVER.reason)).toBeVisible();
  await expect(waiver).not.toContainText("₪");
});
