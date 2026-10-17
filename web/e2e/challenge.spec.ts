import { expect, test, type Page } from "@playwright/test";

import {
  CHALLENGE,
  REP_PARTICIPATION_ANSWER,
  REP_SECOND_ANSWER,
} from "./expected";
import {
  AGENT_TIMEOUT_MS,
  REALTIME_TIMEOUT_MS,
  comparisonArticle,
  continueToOptions,
  openForm,
  pickSampleEmployee,
  repEmail,
  repPassword,
  selectOption,
  waitForOpenQuestionId,
} from "./helpers";

/**
 * Challenge script: נועה's ATTO 3 participation is the catalog default, so the
 * employee screen waits for the rep. /form reaches that badge without the model.
 * Opening the rep question still needs one chat turn, because POST /compare does
 * not ask the rep — the compare tool does. Assertions use the fixed question
 * template and the comparison card, not the model's wording.
 */
test.describe("rep participation challenge", () => {
  test.skip(
    !repPassword(),
    "E2E_REP_PASSWORD is not set. The rep challenge needs it in the environment; it is never committed.",
  );

test("rep confirms a missing participation and a second answer is blocked", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(180_000);

  const repContext = await browser.newContext({
    baseURL,
    locale: "he-IL",
    viewport: { width: 1280, height: 800 },
  });
  const rep = await repContext.newPage();

  try {
    await runChallenge(page, rep);
  } catch (error) {
    await rep
      .screenshot({ path: testInfo.outputPath("rep-failure.png"), fullPage: true })
      .catch(() => undefined);
    throw error;
  } finally {
    await repContext.close();
  }
});
});

async function runChallenge(employee: Page, rep: Page): Promise<void> {
  const password = repPassword();
  if (!password) return;

  await openForm(employee);
  const conversationId = await pickSampleEmployee(employee, CHALLENGE.employeeName);
  await continueToOptions(employee);
  await selectOption(employee, CHALLENGE.optionLabel);

  const formComparison = employee.getByRole("article", { name: `השוואה: ${CHALLENGE.optionLabel}` });
  await expect(formComparison.getByText("ממתין לנציג", { exact: true }).first()).toBeVisible();

  const questionIdPromise = waitForOpenQuestionId(
    employee,
    conversationId,
    CHALLENGE.optionField,
    AGENT_TIMEOUT_MS,
  );

  await employee.goto(`/c/${conversationId}`);
  const chat = employee.getByRole("region", { name: "השיחה עם היועץ" });
  const draft = chat.getByRole("textbox", { name: "כתיבת הודעה" });
  await expect(draft).toBeEnabled();
  await draft.fill("תשווה בבקשה ל-ATTO 3");
  await chat.getByRole("button", { name: "שליחת הודעה" }).click();

  await expect(employee.getByText(CHALLENGE.question).first()).toBeVisible({
    timeout: AGENT_TIMEOUT_MS,
  });
  const questionId = await questionIdPromise;

  const alternatives = employee.getByRole("complementary", { name: "רשימת חלופות" });
  const attoInList = alternatives.getByRole("button", { name: CHALLENGE.optionLabel });
  if (await attoInList.count()) {
    await attoInList.first().click();
  }

  const comparison = comparisonArticle(employee, CHALLENGE.optionLabel);
  await expect(comparison.getByText("ממתין לנציג", { exact: true }).first()).toBeVisible();

  await rep.goto("/rep/login");
  await rep.getByLabel("אימייל").fill(repEmail());
  await rep.getByLabel("סיסמה").fill(password);
  await rep.getByRole("button", { name: "כניסה" }).click();
  await expect(rep.getByRole("heading", { name: "תור הנציג" })).toBeVisible();

  await selectRepQuestion(rep, questionId);
  const panel = rep.getByRole("region").filter({ hasText: CHALLENGE.question });
  await expect(panel.getByRole("heading", { name: CHALLENGE.question })).toBeVisible();
  const definitions = panel.getByRole("definition");
  await expect(definitions.nth(0)).toHaveText(CHALLENGE.context.occupation);
  await expect(definitions.nth(1)).toHaveText(CHALLENGE.context.group);
  await expect(definitions.nth(2)).toHaveText(CHALLENGE.context.requestedCar);
  await expect(definitions.nth(3)).toHaveText(CHALLENGE.context.currentCar);

  const answerForm = panel.locator("form");
  await answerForm.getByLabel("תשובה").fill(REP_PARTICIPATION_ANSWER);
  const submit = answerForm.getByRole("button");
  await submit.click();
  await expect(submit).toBeDisabled();

  await expect(comparison.getByText("ממתין לנציג", { exact: true })).toHaveCount(0, {
    timeout: REALTIME_TIMEOUT_MS,
  });
  await expect(employee.getByRole("status").filter({ hasText: "ממתין לנציג" })).toHaveCount(0);
  const participation = comparison.getByRole("row", { name: /^השתתפות העובד/ });
  await expect(participation).toContainText(REP_PARTICIPATION_ANSWER);
  await expect(participation.getByText("מאושר", { exact: true })).toBeVisible();

  const secondStatus = await rep.evaluate(
    async ({ id, value }) => {
      const raw = localStorage.getItem("strauss-rep-auth");
      if (!raw) return 0;
      const parsed: unknown = JSON.parse(raw);
      const token =
        parsed && typeof parsed === "object" && "access_token" in parsed
          ? (parsed as { access_token?: unknown }).access_token
          : null;
      if (typeof token !== "string") return 0;
      const response = await fetch(`/api/v1/rep/questions/${id}/answer`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value }),
      });
      return response.status;
    },
    { id: questionId, value: REP_SECOND_ANSWER },
  );
  expect(secondStatus).toBe(409);
}

async function selectRepQuestion(rep: Page, questionId: string): Promise<void> {
  const deadline = Date.now() + REALTIME_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const response = await rep.waitForResponse(
      (candidate) =>
        candidate.request().method() === "GET" &&
        candidate.ok() &&
        candidate.url().includes("/v1/rep/questions"),
      { timeout: Math.max(1_000, deadline - Date.now()) },
    );
    const list = (await response.json()) as { id: string; created_at: string }[];
    const sorted = [...list].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const index = sorted.findIndex((question) => question.id === questionId);
    if (index < 0) continue;
    const nav = rep.getByRole("navigation", { name: "שאלות פתוחות" });
    const item = nav.getByRole("button").nth(index);
    await expect(item).toBeVisible();
    await item.click();
    return;
  }
  throw new Error("The open participation question did not show up in the rep queue");
}
