import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function completeApplication(page: Page) {
  await page.getByRole("button", { name: "Start blank" }).click();

  await page.getByLabel("Applicant name").fill("Jordan Lee");
  await page.getByLabel("Email", { exact: true }).check();
  await page.getByLabel("Email address").fill("jordan.lee@example.test");
  await page.getByLabel("Safest time to make contact").selectOption("afternoon");
  await page.getByLabel(/I agree that the fictional program/).check();
  await page.getByRole("button", { name: /Save and continue/ }).click();

  await page.getByLabel("Adults in household").selectOption("2");
  await page.getByLabel("Children in household").selectOption("1");
  await page.getByLabel("Access or accommodation needs").fill("Step-free temporary housing is preferred.");
  await page.getByRole("button", { name: /Save and continue/ }).click();

  await page.getByLabel("Yes", { exact: true }).first().check();
  await page.getByLabel("Current safe place").fill("Harbor High School shelter");
  await page.getByLabel("Not sure").check();
  await page.getByRole("button", { name: /Save and continue/ }).click();

  await page.getByLabel("Level of property impact").selectOption("major");
  await page.getByLabel("Damage summary").fill("Flood water damaged the kitchen and first-floor walls.");
  await page.getByRole("button", { name: /Save and continue/ }).click();

  await page.getByLabel("Temporary housing").check();
  await page.getByLabel("Food").check();
  await page.getByRole("button", { name: /Save and continue/ }).click();

  await page.getByLabel("Evidence to use").nth(0).selectOption("evidence_photo_id");
  await page.getByLabel("Evidence to use").nth(1).selectOption("evidence_shelter_letter");
  await page.getByLabel("Evidence to use").nth(2).selectOption("evidence_damage_photo");
  await expect(page.getByText(/Accepted alternative/)).toBeVisible();
  await page.getByRole("button", { name: /Review application/ }).click();
  await expect(page.getByRole("heading", { name: "Read it once. Change anything." })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Relief paperwork/ })).toBeVisible();
});

test("manual golden path prepares but never submits a packet", async ({ page }) => {
  await completeApplication(page);
  await page.getByLabel("I confirm this statement.").check();
  await page.getByLabel("Your initials").fill("JL");
  await page.getByRole("button", { name: "Prepare packet locally" }).click();

  await expect(page.getByRole("heading", { name: "Packet prepared locally." })).toBeVisible();
  await expect(page.getByText(/^Nothing was submitted\. Use/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeVisible();

  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("article", { name: "Prepared application packet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeHidden();
  await expect(page.getByText("Recent agent activity")).toBeHidden();
});

test("standard and one-at-a-time modes preserve the same answer", async ({ page }) => {
  await page.getByRole("button", { name: "Start blank" }).click();
  await page.getByLabel("Applicant name").fill("Jordan Lee");
  await page.getByRole("button", { name: "One at a time" }).click();

  await expect(page.getByRole("heading", { name: /What name should appear/ })).toBeVisible();
  await expect(page.getByLabel("Your answer")).toHaveValue("Jordan Lee");
  await page.getByRole("button", { name: "Standard" }).click();
  await expect(page.getByLabel("Applicant name")).toHaveValue("Jordan Lee");
  await expect(page.getByText("Manual mode ready")).toBeVisible();
});

test("@a11y major screens have no serious or critical axe violations", async ({ page }) => {
  const welcomeResults = await new AxeBuilder({ page }).analyze();
  expect(welcomeResults.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);

  await completeApplication(page);
  const reviewResults = await new AxeBuilder({ page }).analyze();
  expect(reviewResults.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
});

test("narrow reflow has no horizontal page overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile project covers narrow reflow.");
  await page.getByRole("button", { name: "Start blank" }).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
