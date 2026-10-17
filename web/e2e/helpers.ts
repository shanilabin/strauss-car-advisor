import { expect, type Page, type Response } from "@playwright/test";

export const REALTIME_TIMEOUT_MS = 20_000;
/** The live model has to call compare before a rep question exists. */
export const AGENT_TIMEOUT_MS = 90_000;

type OpenQuestion = {
  id: string;
  field: string;
  question?: string;
};

type QuestionsBody = {
  open_questions?: OpenQuestion[];
  state?: { open_questions?: OpenQuestion[] };
};

export function repEmail(): string {
  return process.env.E2E_REP_EMAIL || "rep@demo.local";
}

export function repPassword(): string | undefined {
  const value = process.env.E2E_REP_PASSWORD;
  return value && value.length > 0 ? value : undefined;
}

/** Strip bidi marks and spaces so two DTO-formatted shekel strings can be compared. */
export function normalizeMoney(text: string): string {
  return text.replace(/[\s\u00a0\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "");
}

export async function openForm(page: Page): Promise<void> {
  await page.goto("/form");
  await expect(page.getByRole("heading", { name: "מצב טופס" })).toBeVisible();
}

export async function openFormFromLanding(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: "נסו עם עובד לדוגמה" }).click();
  await expect(page).toHaveURL(/\/form\/?$/);
  await expect(page.getByRole("heading", { name: "מצב טופס" })).toBeVisible();
}

/** Picks a sample employee. Returns the conversation id from the create response. */
export async function pickSampleEmployee(page: Page, name: string): Promise<string> {
  const created = page.waitForResponse(isCreateConversation);
  const button = page.getByRole("button", { name: new RegExp(escapeRegExp(name)) });
  await expect(button).toBeEnabled();
  await button.click();
  const body = (await (await created).json()) as { id?: unknown };
  if (typeof body.id !== "string" || body.id.length === 0) {
    throw new Error("Create conversation response had no id");
  }
  await expect(page.getByText(new RegExp(`עובד נבחר:\\s*${escapeRegExp(name)}`))).toBeVisible();
  await expect(page.getByRole("region", { name: "פרופיל עובד" })).toBeVisible();
  return body.id;
}

export async function continueToOptions(page: Page): Promise<void> {
  const next = page.getByRole("button", { name: "המשך לאפשרויות" });
  await expect(next).toBeEnabled();
  await next.click();
  await expect(page.getByRole("region", { name: "מפת האפשרויות" })).toBeVisible();
}

export async function selectOption(page: Page, label: string): Promise<void> {
  const map = page.getByRole("region", { name: "מפת האפשרויות" });
  const card = map.getByRole("button", { name: new RegExp(escapeRegExp(label)) });
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByRole("article", { name: `השוואה: ${label}` })).toBeVisible();
}

/**
 * The main comparison column, not the copy embedded in a chat bubble.
 * The column card is the one with "החלף רכב".
 */
export function comparisonArticle(page: Page, label: string) {
  return page.getByRole("article", { name: `השוואה: ${label}` }).filter({
    has: page.getByRole("button", { name: /החלף רכב/ }),
  });
}

/** Resolves with the open-question id once a conversation payload includes `field`. */
export function waitForOpenQuestionId(
  page: Page,
  conversationId: string,
  field: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (id: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      page.off("response", onResponse);
      resolve(id);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      page.off("response", onResponse);
      reject(new Error(`Timed out waiting for open question ${field}`));
    }, timeoutMs);

    const onResponse = (response: Response) => {
      if (settled || !response.ok()) return;
      const method = response.request().method();
      if (method !== "GET" && method !== "POST") return;
      let pathname: string;
      try {
        pathname = new URL(response.url()).pathname;
      } catch {
        return;
      }
      const isGet = method === "GET" && pathname.endsWith(`/v1/conversations/${conversationId}`);
      const isPost =
        method === "POST" && pathname.endsWith(`/v1/conversations/${conversationId}/messages`);
      if (!isGet && !isPost) return;
      void response
        .json()
        .then((body: unknown) => {
          const id = questionIdFromBody(body, field);
          if (!id) return;
          finish(id);
        })
        .catch(() => undefined);
    };

    page.on("response", onResponse);
  });
}

function questionIdFromBody(body: unknown, field: string): string | null {
  if (!body || typeof body !== "object") return null;
  const payload = body as QuestionsBody;
  const list = payload.open_questions ?? payload.state?.open_questions;
  const match = list?.find((question) => question.field === field);
  return match?.id ?? null;
}

function isCreateConversation(response: Response): boolean {
  if (response.request().method() !== "POST" || !response.ok()) return false;
  try {
    return /\/v1\/conversations\/?$/.test(new URL(response.url()).pathname);
  } catch {
    return false;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
