import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const baseUrl = (process.env.PRODUCTION_BASE_URL || "").replace(/\/$/, "");
const account = process.env.PRODUCTION_SMOKE_ACCOUNT || "";
const password = process.env.PRODUCTION_SMOKE_PASSWORD || "";
const screenshotPath = process.env.BROWSER_SMOKE_SCREENSHOT || "";
const imageScreenshotPath = process.env.BROWSER_SMOKE_IMAGE_SCREENSHOT || "";
const executableCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium"
].filter(Boolean);
const executablePath = executableCandidates.find(existsSync);

if (!baseUrl || !account || !password) {
  throw new Error("PRODUCTION_BASE_URL, PRODUCTION_SMOKE_ACCOUNT, and PRODUCTION_SMOKE_PASSWORD are required.");
}
if (!executablePath) throw new Error("Chrome/Chromium was not found. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE.");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.error(`[browser-smoke] launching ${executablePath}`);
const browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-gpu"], timeout: 15000 });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(20000);
const pageErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));

try {
  console.error(`[browser-smoke] opening ${baseUrl}`);
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30000 });
  const accountInput = page.getByPlaceholder("输入您的账号");
  const passwordInput = page.getByPlaceholder("输入您的密码");
  await accountInput.waitFor({ state: "visible" });
  await accountInput.fill(account);
  await passwordInput.fill(password);
  assert(await accountInput.inputValue() === account, "Account input did not retain its value.");
  assert(await passwordInput.inputValue() === password, "Password input did not retain its value.");
  await page.getByRole("button", { name: /进入工作空间/ }).click();
  try {
    await page.locator(".app > aside").waitFor({ state: "visible", timeout: 60000 });
  } catch {
    const loginMessage = await page.locator(".login-message").textContent({ timeout: 1000 }).catch(() => "");
    throw new Error(`Login UI failed: ${loginMessage?.trim() || "workspace did not become visible"}`);
  }
  console.error("[browser-smoke] login visible");
  await page.getByText(/已同步\s*\d+\s*个项目工作区|项目工作区已同步/).waitFor({ state: "visible", timeout: 60000 });
  console.error("[browser-smoke] server workspaces synchronized");

  await page.getByRole("button", { name: /项目列表/ }).click();
  const projectCards = page.locator(".project-home-card");
  await projectCards.first().waitFor({ state: "visible", timeout: 30000 });
  const projectCount = await projectCards.count();
  assert(projectCount > 0, "No project cards were visible after login.");
  const firstProjectName = (await projectCards.first().locator("strong").textContent())?.trim() || "";
  assert(firstProjectName, "The first project name was empty.");
  console.error(`[browser-smoke] projects visible: ${projectCount}`);

  await projectCards.first().getByRole("button", { name: /进入概览/ }).click();
  await page.locator("#overview h1").filter({ hasText: firstProjectName }).waitFor({ state: "visible", timeout: 30000 });

  await page.getByRole("button", { name: /生图工作台/ }).first().click();
  await page.locator("#image-workbench .image-head h2", { hasText: "生图工作台" }).waitFor({ state: "visible", timeout: 30000 });
  await page.locator("#image-workbench textarea.image-prompt").waitFor({ state: "visible" });
  await page.locator("#image-workbench .image-settings-grid select").waitFor({ state: "visible" });
  await page.locator("#image-workbench .size-row input").first().waitFor({ state: "visible" });
  await page.locator("#image-workbench button.image-generate").waitFor({ state: "visible" });
  if (imageScreenshotPath) await page.screenshot({ path: imageScreenshotPath, fullPage: true });
  console.error("[browser-smoke] image workbench visible");

  await page.getByRole("button", { name: /素材库/ }).first().click();
  await page.locator(".asset-workspace-head h2", { hasText: "素材库" }).waitFor({ state: "visible", timeout: 30000 });
  const visibleMaterialCards = await page.locator(".material-card:visible").count();
  console.error(`[browser-smoke] materials visible: ${visibleMaterialCards}`);

  await page.getByRole("button", { name: /生成记录/ }).first().click();
  await page.locator("h2#tasks", { hasText: "生成记录" }).waitFor({ state: "visible", timeout: 30000 });
  const taskTableRows = page.locator("h2#tasks").locator("xpath=following::table[1]/tbody/tr");
  const completedTab = page.locator(".record-filter-tabs button").filter({ hasText: "已完成" });
  const allTab = page.locator(".record-filter-tabs button").filter({ hasText: "全部" });
  const completedCount = Number((await completedTab.locator("span").textContent()) || 0);
  await completedTab.click();
  assert((await completedTab.getAttribute("class"))?.includes("active"), "Completed task filter did not become active.");
  const completedRows = await taskTableRows.count();
  assert(completedCount === 0 || completedRows === Math.min(completedCount, 5), `Completed task rows did not match the filter count: ${completedRows}/${completedCount}.`);
  await allTab.click();
  assert((await allTab.getAttribute("class"))?.includes("active"), "All task filter did not become active.");
  const taskRows = await taskTableRows.count();
  assert(taskRows > 0, "The generation record table had no result or empty-state row.");
  console.error(`[browser-smoke] task rows visible: ${taskRows}`);

  if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true });
  assert(pageErrors.length === 0, `Browser page errors: ${pageErrors.join(" | ")}`);
  console.log(JSON.stringify({ ok: true, projectCount, firstProjectName, imageWorkbenchReady: true, visibleMaterialCards, taskRows, taskFilterReady: true, freshBrowserContext: true, screenshotPath: screenshotPath || undefined, imageScreenshotPath: imageScreenshotPath || undefined }));
} catch (error) {
  if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
  throw error;
} finally {
  await context.close();
  await browser.close();
}
