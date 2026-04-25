import "server-only";

import { chromium, type Browser, type Page } from "playwright";

const WRS_REPORT_URL =
  process.env.WRS_REPORT_URL ??
  "http://wrs.ubservice.mn/ReportViewer_DetailView/66683522-e7a2-41ec-bce4-f5123a09485c";
const WRS_REPORT_LOGIN = process.env.WRS_REPORT_LOGIN ?? "5673461";
const WRS_REPORT_PASSWORD = process.env.WRS_REPORT_PASSWORD ?? WRS_REPORT_LOGIN;
const WRS_DEFAULT_BRANCH_NAME =
  "\u041c\u043e\u0440\u0438\u043d\u0433\u0438\u0439\u043d \u044d\u043d\u0433\u044d\u0440\u0438\u0439\u043d \u0442\u04e9\u0432\u043b\u04e9\u0440\u0441\u04e9\u043d \u0445\u043e\u0433\u0438\u0439\u043d \u0446\u044d\u0433";
const WRS_REQUIRED_BRANCH_NAME =
  process.env.WRS_REPORT_BRANCH_NAME?.trim() || WRS_DEFAULT_BRANCH_NAME;
const PARAMETER_CAPTION_SELECTOR = "label.dxbrv-params-caption[for]";
const SUBMIT_BUTTON_LABEL = "Submit";

type ParameterMap = {
  endDateId: string;
  startDateId: string;
  branchId: string;
};

type ReportHeader = {
  pageLabel: string | null;
  title: string;
};

type PreparedReportPage = {
  browser: Browser;
  branchName: string;
  page: Page;
};

type AggregatedVehicleTotal = {
  netWeightTotal: number;
  rowCount: number;
  samples: string[];
  vehicleLabel: string;
};

export type WrsReportResult = {
  requestedDate: string;
  branchName: string;
  title: string;
  pageLabel: string | null;
  totalPages: number | null;
  renderHeight: number;
  pages: string[];
};

export type WrsNormalizedVehicleTotal = {
  vehicleCode: string;
  vehicleLabel: string;
  branchName: string;
  requestedDate: string;
  netWeightTotal: number;
  source: "wrs_normalized";
  externalReference: string;
  rowCount: number;
  sampleRows: string[];
};

export type WrsNormalizedTotalsResult = {
  requestedDate: string;
  branchName: string;
  title: string;
  pageLabel: string | null;
  totalPages: number | null;
  extractedLineCount: number;
  totals: WrsNormalizedVehicleTotal[];
  ignoredSamples: string[];
};

function isValidDateValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeBranchName(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeLine(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function parseTotalPages(pageLabel: string | null) {
  if (!pageLabel) {
    return null;
  }

  const match = /of\s+(\d+)/i.exec(pageLabel);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

async function loginIfNeeded(page: Page) {
  if (!page.url().includes("/LoginPage")) {
    return;
  }

  const loginInput = page.locator('input[type="text"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  const submitButton = page.locator("button").first();

  await loginInput.fill(WRS_REPORT_LOGIN);
  await passwordInput.fill(WRS_REPORT_PASSWORD);
  await submitButton.click();

  await page.waitForURL((url) => !url.pathname.includes("/LoginPage"), {
    timeout: 60_000,
  });
  await page.waitForLoadState("domcontentloaded");
}

async function getParameterMap(page: Page): Promise<ParameterMap> {
  await page.waitForFunction(
    (selector) => document.querySelectorAll(selector).length >= 3,
    PARAMETER_CAPTION_SELECTOR,
    {
      timeout: 60_000,
    },
  );

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const ids = await page.evaluate((selector) =>
      Array.from(document.querySelectorAll(selector))
        .map((label) => label.getAttribute("for") ?? "")
        .filter(Boolean),
      PARAMETER_CAPTION_SELECTOR,
    );

    if (ids.length >= 3) {
      return {
        endDateId: ids[0] ?? "",
        startDateId: ids[1] ?? "",
        branchId: ids[2] ?? "",
      };
    }

    await page.waitForTimeout(1_500);
  }

  throw new Error("WRS report parameters could not be detected.");
}

async function waitForSubmitButtonEnabled(page: Page) {
  await page.waitForFunction(
    (buttonLabel) => {
      const submitButton = Array.from(document.querySelectorAll("button")).find(
        (button) => (button.textContent ?? "").trim() === buttonLabel,
      ) as HTMLButtonElement | undefined;

      return Boolean(submitButton && !submitButton.disabled);
    },
    SUBMIT_BUTTON_LABEL,
    {
      timeout: 30_000,
    },
  );
}

async function fillReportDate(page: Page, inputId: string, value: string) {
  const input = page.locator(`input#${inputId}`);
  await input.fill(value);
  await input.press("Tab");
}

async function selectBranch(page: Page, branchId: string) {
  const currentBranchId =
    (await page.evaluate((selector) => {
      const ids = Array.from(document.querySelectorAll(selector))
        .map((label) => label.getAttribute("for") ?? "")
        .filter(Boolean);

      return ids[2] ?? null;
    }, PARAMETER_CAPTION_SELECTOR)) ?? branchId;

  const branchInput = page.locator(`input#${currentBranchId}`);
  await branchInput.waitFor({
    state: "visible",
    timeout: 15_000,
  });

  const currentValue = (await branchInput.inputValue().catch(() => "")).trim();
  if (normalizeBranchName(currentValue) === normalizeBranchName(WRS_REQUIRED_BRANCH_NAME)) {
    return currentValue;
  }

  await waitForSubmitButtonEnabled(page);

  const comboBoxId = (await branchInput.getAttribute("parent-id"))?.trim() ?? "";
  const dropdownButton = comboBoxId
    ? page
        .locator(`[id="${comboBoxId}"] button[aria-label="Open or close the drop-down window"]`)
        .first()
    : page.locator('button[aria-label="Open or close the drop-down window"]').last();

  await dropdownButton.waitFor({
    state: "attached",
    timeout: 15_000,
  });
  try {
    await dropdownButton.click({
      timeout: 10_000,
    });
  } catch {
    await dropdownButton.evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
  }

  await page.waitForFunction(
    () => document.querySelectorAll('[role="option"]').length > 0,
    undefined,
    {
      timeout: 15_000,
    },
  );

  const optionTexts = await page.locator('[role="option"]').evaluateAll((elements) =>
    elements.map((element) => (element.textContent ?? "").trim()).filter(Boolean),
  );

  const requiredBranchName = normalizeBranchName(WRS_REQUIRED_BRANCH_NAME);
  let selectedIndex = optionTexts.findIndex(
    (item) => normalizeBranchName(item) === requiredBranchName,
  );
  if (selectedIndex < 0) {
    selectedIndex = optionTexts.findIndex((item) =>
      normalizeBranchName(item).includes(requiredBranchName),
    );
  }
  if (selectedIndex < 0) {
    throw new Error(`"${WRS_REQUIRED_BRANCH_NAME}" branch was not found in WRS.`);
  }

  const selectedOption = page.locator('[role="option"]').nth(selectedIndex);
  try {
    await selectedOption.click({
      timeout: 10_000,
    });
  } catch {
    await selectedOption.evaluate((option) => {
      (option as HTMLElement).click();
    });
  }

  await page.waitForFunction(
    ({ targetBranch, targetId }) => {
      const input = document.getElementById(targetId) as HTMLInputElement | null;
      return input?.value.trim() === targetBranch;
    },
    {
      targetBranch: WRS_REQUIRED_BRANCH_NAME,
      targetId: currentBranchId,
    },
    {
      timeout: 15_000,
    },
  );

  return WRS_REQUIRED_BRANCH_NAME;
}

async function waitForReportRender(page: Page) {
  await page.waitForFunction(
    (buttonLabel) => {
      const submitButton = Array.from(document.querySelectorAll("button")).find(
        (button) => (button.textContent ?? "").trim() === buttonLabel,
      ) as HTMLButtonElement | undefined;

      if (!submitButton || submitButton.disabled) {
        return false;
      }

      const pageLabel =
        document.querySelector('[role="status"][aria-label]')?.getAttribute("aria-label") ?? "";

      return /of\s+\d+/i.test(pageLabel);
    },
    SUBMIT_BUTTON_LABEL,
    {
      timeout: 120_000,
    },
  );
}

async function readReportHeader(page: Page): Promise<ReportHeader> {
  return page.evaluate(() => {
    const pageLabel =
      document.querySelector('[role="status"][aria-label]')?.getAttribute("aria-label") ?? null;

    return {
      title: document.title,
      pageLabel,
    };
  });
}

async function prepareWrsReportPage(requestedDate: string): Promise<PreparedReportPage> {
  if (!isValidDateValue(requestedDate)) {
    throw new Error("Invalid date value. Use YYYY-MM-DD.");
  }

  const browser = await chromium.launch({
    headless: true,
  });

  const page = await browser.newPage({
    viewport: {
      width: 1600,
      height: 1200,
    },
  });

  try {
    await page.goto(WRS_REPORT_URL, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await page.waitForTimeout(6_000);

    await loginIfNeeded(page);

    const { startDateId, endDateId, branchId } = await getParameterMap(page);

    await fillReportDate(page, startDateId, requestedDate);
    await fillReportDate(page, endDateId, requestedDate);

    const branchName = await selectBranch(page, branchId);

    await waitForSubmitButtonEnabled(page);
    const submitButton = page.locator("button").filter({ hasText: SUBMIT_BUTTON_LABEL }).first();
    await submitButton.click({
      force: true,
    });
    await page.waitForTimeout(2_000);

    await waitForReportRender(page);

    return {
      browser,
      branchName,
      page,
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

function parseNumericToken(token: string) {
  const normalized = token
    .replace(/\u00a0/g, " ")
    .replace(/[^\d,.\- ]/g, "")
    .replace(/\s+/g, "");

  if (!normalized) {
    return null;
  }

  let candidate = normalized;
  if (candidate.includes(",") && candidate.includes(".")) {
    candidate = candidate.replace(/,/g, "");
  } else if (candidate.includes(",") && !candidate.includes(".")) {
    candidate = /,\d{1,2}$/.test(candidate)
      ? candidate.replace(",", ".")
      : candidate.replace(/,/g, "");
  }

  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeVehicleCode(token: string) {
  return token.replace(/\s+/g, "").toUpperCase();
}

function looksLikeDateToken(token: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(token) || /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(token);
}

function looksLikeTimeToken(token: string) {
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test(token);
}

function splitCells(line: string) {
  return line
    .split(/\t+| {2,}| \| /)
    .map((item) => normalizeLine(item))
    .filter(Boolean);
}

function findVehicleCode(cells: string[]) {
  const candidates: Array<{ code: string; index: number; score: number }> = [];

  cells.slice(0, 4).forEach((cell, index) => {
    const normalized = normalizeVehicleCode(cell);
    if (!normalized) {
      return;
    }
    if (looksLikeDateToken(normalized) || looksLikeTimeToken(normalized)) {
      return;
    }
    if (/^(TOTAL|PAGE|SUBMIT|DATE|BRANCH)$/i.test(normalized)) {
      return;
    }

    const numeric = parseNumericToken(normalized);
    if (index === 0 && numeric !== null && Number.isInteger(numeric) && normalized.length <= 4) {
      return;
    }

    let score = 0;
    if (/[0-9]/.test(normalized)) {
      score += 4;
    }
    if (/[A-Z\u0410-\u042f\u04ae\u04e8]/u.test(normalized)) {
      score += 2;
    }
    if (/[-/]/.test(normalized)) {
      score += 1;
    }
    if (index === 0) {
      score += 1;
    }

    candidates.push({
      code: normalized,
      index,
      score,
    });
  });

  candidates.sort((left, right) => right.score - left.score || left.index - right.index);
  return candidates[0] ?? null;
}

function findVehicleLabel(cells: string[], codeIndex: number) {
  const candidate = cells[codeIndex + 1] || cells[codeIndex - 1] || cells[codeIndex];
  return normalizeLine(candidate);
}

function findNetWeightValue(cells: string[]) {
  const numericCells = cells
    .map((cell, index) => ({
      index,
      value: parseNumericToken(cell),
    }))
    .filter((item) => item.value !== null)
    .filter((item) => !(item.index === 0 && Number.isInteger(item.value!) && item.value! < 5000));

  if (!numericCells.length) {
    return null;
  }

  return numericCells[numericCells.length - 1]?.value ?? null;
}

async function extractReportTextLines(page: Page) {
  const lines = await page.evaluate(() => {
    const selectors = [
      "body",
      ".dxbrv-report-preview-content",
      ".dxbrv-document-surface",
      ".dx-scrollview-content",
    ];

    const rawSegments = selectors.flatMap((selector) =>
      Array.from(document.querySelectorAll(selector)).map(
        (element) => (element as HTMLElement).innerText || element.textContent || "",
      ),
    );

    return rawSegments.flatMap((segment) => segment.split(/\r?\n/));
  });

  return Array.from(new Set(lines.map((line) => normalizeLine(line)).filter(Boolean)));
}

function aggregateVehicleTotals(lines: string[], requestedDate: string, branchName: string) {
  const totals = new Map<string, AggregatedVehicleTotal>();
  const ignoredSamples: string[] = [];

  for (const line of lines) {
    const cells = splitCells(line);
    if (cells.length < 2) {
      continue;
    }

    const vehicle = findVehicleCode(cells);
    const netWeightValue = findNetWeightValue(cells);

    if (!vehicle || netWeightValue === null || netWeightValue <= 0) {
      if (
        ignoredSamples.length < 10 &&
        /[A-Z\u0410-\u042f\u04ae\u04e8]/u.test(line) &&
        /\d/.test(line)
      ) {
        ignoredSamples.push(line);
      }
      continue;
    }

    const current = totals.get(vehicle.code) ?? {
      netWeightTotal: 0,
      rowCount: 0,
      samples: [],
      vehicleLabel: findVehicleLabel(cells, vehicle.index),
    };

    current.netWeightTotal += netWeightValue;
    current.rowCount += 1;
    if (current.samples.length < 3) {
      current.samples.push(line);
    }
    if (!current.vehicleLabel) {
      current.vehicleLabel = findVehicleLabel(cells, vehicle.index);
    }

    totals.set(vehicle.code, current);
  }

  const normalizedTotals = Array.from(totals.entries())
    .map(([vehicleCode, total]) => ({
      vehicleCode,
      vehicleLabel: total.vehicleLabel || vehicleCode,
      branchName,
      requestedDate,
      netWeightTotal: Math.round(total.netWeightTotal * 100) / 100,
      source: "wrs_normalized" as const,
      externalReference: `${requestedDate}:${vehicleCode}`,
      rowCount: total.rowCount,
      sampleRows: total.samples,
    }))
    .sort((left, right) => left.vehicleCode.localeCompare(right.vehicleCode));

  return {
    ignoredSamples,
    totals: normalizedTotals,
  };
}

export async function fetchWrsDailyReport(requestedDate: string): Promise<WrsReportResult> {
  const { browser, branchName, page } = await prepareWrsReportPage(requestedDate);

  try {
    const pagePreviewLocator = page.locator(".dxbrv-report-preview-content-flex-item");
    const previewCount = await pagePreviewLocator.count();
    const screenshotLocator =
      previewCount > 0 ? pagePreviewLocator : page.locator(".dxbrv-document-surface");
    const screenshotCount = await screenshotLocator.count();

    if (!screenshotCount) {
      throw new Error("WRS preview pages could not be found.");
    }

    const reportPages: string[] = [];
    let renderHeight = 72;

    for (let index = 0; index < screenshotCount; index += 1) {
      const item = screenshotLocator.nth(index);
      const box = await item.boundingBox();
      const image = await item.screenshot({
        type: "png",
        animations: "disabled",
      });

      reportPages.push(`data:image/png;base64,${image.toString("base64")}`);
      renderHeight += Math.ceil(box?.height ?? 900) + 40;
    }

    const header = await readReportHeader(page);

    return {
      requestedDate,
      branchName,
      title: header.title,
      pageLabel: header.pageLabel,
      totalPages: parseTotalPages(header.pageLabel),
      renderHeight,
      pages: reportPages,
    };
  } finally {
    await browser.close();
  }
}

export async function fetchWrsDailyVehicleTotals(
  requestedDate: string,
): Promise<WrsNormalizedTotalsResult> {
  const { browser, branchName, page } = await prepareWrsReportPage(requestedDate);

  try {
    const header = await readReportHeader(page);
    const textLines = await extractReportTextLines(page);
    const aggregated = aggregateVehicleTotals(textLines, requestedDate, branchName);

    return {
      requestedDate,
      branchName,
      title: header.title,
      pageLabel: header.pageLabel,
      totalPages: parseTotalPages(header.pageLabel),
      extractedLineCount: textLines.length,
      totals: aggregated.totals,
      ignoredSamples: aggregated.ignoredSamples,
    };
  } finally {
    await browser.close();
  }
}
