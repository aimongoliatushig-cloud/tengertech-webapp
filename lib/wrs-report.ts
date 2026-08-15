import "server-only";

import { readFile } from "node:fs/promises";

import { chromium, type Browser, type Page } from "playwright";

const DEFAULT_WRS_REPORT_URL =
  "http://wrs.ubservice.mn/ReportViewer_DetailView/66683522-e7a2-41ec-bce4-f5123a09485c";
const WRS_REPORT_URL = process.env.WRS_REPORT_URL?.trim() || DEFAULT_WRS_REPORT_URL;
const WRS_REPORT_LOGIN = process.env.WRS_REPORT_LOGIN?.trim() || "5673461";
const WRS_REPORT_PASSWORD = process.env.WRS_REPORT_PASSWORD?.trim() || WRS_REPORT_LOGIN;
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

export type WrsWeightReportRow = {
  sequence: number;
  ticketNumber: string;
  vehicleCode: string;
  carrierName: string;
  fromLocation: string;
  district: string;
  wasteType: string;
  sourceName: string;
  reportDate: string;
  reportTime: string;
  vehicleWeightKg: number;
  garbageWeightKg: number;
  totalWeightKg: number;
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

export type WrsWeightRowsResult = {
  startDate: string;
  endDate: string;
  branchName: string;
  title: string;
  pageLabel: string | null;
  totalPages: number | null;
  rows: WrsWeightReportRow[];
  tripCount: number;
  vehicleCount: number;
  totalVehicleWeightKg: number;
  totalGarbageWeightKg: number;
  totalCombinedWeightKg: number;
  generatedAt: string;
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

  await loginInput.fill(WRS_REPORT_LOGIN);
  await passwordInput.fill(WRS_REPORT_PASSWORD);

  await page
    .waitForFunction(
      () => {
        const loadingPanel = document.getElementById("applicationLoadingPanel");
        if (!loadingPanel) {
          return true;
        }
        const style = window.getComputedStyle(loadingPanel);
        const rect = loadingPanel.getBoundingClientRect();
        return (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.pointerEvents === "none" ||
          rect.width === 0 ||
          rect.height === 0
        );
      },
      undefined,
      { timeout: 10_000 },
    )
    .catch(() => undefined);

  const loginButton = page
    .locator(
      "button.xaf-primary-toolbar-btn:visible:not([disabled]), button.dxbl-btn-primary:visible:not([disabled])",
    )
    .first();

  const clicked = await loginButton
    .click({ timeout: 5_000 })
    .then(() => true)
    .catch(() => false);

  if (!clicked) {
    await page
      .locator("button.xaf-primary-toolbar-btn, button.dxbl-btn-primary")
      .first()
      .evaluate((button) => (button as HTMLButtonElement).click());
  }

  await page
    .waitForURL((url) => !url.pathname.includes("/LoginPage"), {
      timeout: 30_000,
    })
    .catch(() => {
      throw new Error(
        "WRS серверийн нэвтрэх хуудас бүрэн ачаалагдсангүй. WRS серверийн Blazor холболтыг шалгаад дахин оролдоно уу.",
      );
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
        (button) => {
          const style = window.getComputedStyle(button);
          const rect = button.getBoundingClientRect();
          return (
            (button.textContent ?? "").trim() === buttonLabel &&
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0
          );
        },
      ) as HTMLButtonElement | undefined;

      return Boolean(submitButton && !submitButton.disabled);
    },
    SUBMIT_BUTTON_LABEL,
    {
      timeout: 30_000,
    },
  );
}

async function clickSubmitButton(page: Page) {
  await waitForSubmitButtonEnabled(page);
  await page.evaluate((buttonLabel) => {
    const submitButton = Array.from(document.querySelectorAll("button")).find((button) => {
      const style = window.getComputedStyle(button);
      const rect = button.getBoundingClientRect();
      return (
        (button.textContent ?? "").trim() === buttonLabel &&
        !button.disabled &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    }) as HTMLButtonElement | undefined;

    if (!submitButton) {
      throw new Error("WRS Submit button is not available.");
    }

    submitButton.click();
  }, SUBMIT_BUTTON_LABEL);
}

async function fillReportDate(page: Page, inputId: string, value: string) {
  const input = page.locator(`input#${inputId}`);
  await input.fill(value);
  await input.press("Tab");
}

async function selectBranch(page: Page, branchId: string) {
  const currentBranchId =
    (await page.evaluate((selector) => {
      const labels = Array.from(document.querySelectorAll(selector));
      const branchLabel = labels.find((label) =>
        (label.textContent ?? "").toLowerCase().includes("салбар"),
      );
      return branchLabel?.getAttribute("for") ?? labels[2]?.getAttribute("for") ?? null;
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

  const comboBoxId =
    (await branchInput.evaluate((input) => {
      const parentId = input.getAttribute("parent-id")?.trim();
      const parent = parentId ? document.getElementById(parentId) : null;
      const combo = parent || input.closest("dxbl-combo-box, dxbl-date-edit");
      return combo?.id || parentId || "";
    })) ?? "";
  const dropdownButtonCandidates = [
    comboBoxId
      ? page
          .locator(`[id="${comboBoxId}"] button[aria-label="Open or close the drop-down window"]`)
          .first()
      : null,
    comboBoxId ? page.locator(`[id="${comboBoxId}"] button`).last() : null,
    branchInput
      .locator("xpath=ancestor::*[self::dxbl-combo-box or self::dxbl-date-edit][1]")
      .locator('button[aria-label="Open or close the drop-down window"]')
      .first(),
    branchInput
      .locator("xpath=ancestor::*[self::dxbl-combo-box or self::dxbl-date-edit][1]")
      .locator("button")
      .last(),
  ].filter((locator): locator is ReturnType<Page["locator"]> => Boolean(locator));

  let opened = false;
  for (const dropdownButton of dropdownButtonCandidates) {
    try {
      if (!(await dropdownButton.count())) {
        continue;
      }
      await dropdownButton.click({
        force: true,
        timeout: 10_000,
      });
      await page.waitForFunction(
        () => document.querySelectorAll('[role="option"]').length > 0,
        undefined,
        {
          timeout: 8_000,
        },
      );
      opened = true;
      break;
    } catch {
      // Try the next WRS/DevExpress dropdown opening strategy below.
    }
  }

  if (!opened) {
    const fallbackBranchInput = page.locator(`input#${currentBranchId}`).first();
    await fallbackBranchInput.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => undefined);
    await fallbackBranchInput.click({ force: true, timeout: 10_000 }).catch(async () => {
      await fallbackBranchInput
        .evaluate((input) => {
          input.focus();
          input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
          input.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
          input.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        })
        .catch(() => undefined);
    });
    await page.keyboard.press("Alt+ArrowDown").catch(() => page.keyboard.press("ArrowDown"));
    const openedByKeyboard = await page
      .waitForFunction(
        () => document.querySelectorAll('[role="option"]').length > 0,
        undefined,
        {
          timeout: 15_000,
        },
      )
      .then(() => true)
      .catch(() => false);

    if (!openedByKeyboard) {
      throw new Error("WRS branch dropdown could not be opened.");
    }
  }

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

      return /of\s+\d+/i.test(pageLabel) && !/^\s*0\s+of\s+0\s*$/i.test(pageLabel);
    },
    SUBMIT_BUTTON_LABEL,
    {
      timeout: 120_000,
    },
  );

  await page
    .waitForFunction(
      () => {
        const visibleLoadingPanels = Array.from(
          document.querySelectorAll(".dxbrv-page-loading-panel, dxbl-loading-panel"),
        ).filter((element) => {
          const text = (element.textContent ?? "").trim();
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          const isVisible =
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0;

          return isVisible && /waiting for parameter values|loading/i.test(text);
        });

        return visibleLoadingPanels.length === 0;
      },
      undefined,
      {
        timeout: 120_000,
      },
    )
    .catch(() => undefined);

  await page.waitForTimeout(2_000);
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

async function prepareWrsReportPage(
  requestedDate: string,
  endDate = requestedDate,
): Promise<PreparedReportPage> {
  if (!isValidDateValue(requestedDate) || !isValidDateValue(endDate)) {
    throw new Error("Invalid date value. Use YYYY-MM-DD.");
  }

  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: {
      width: 1600,
      height: 1200,
    },
  });
  const page = await context.newPage();

  try {
    await page.goto(WRS_REPORT_URL, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await page.waitForTimeout(6_000);

    await loginIfNeeded(page);

    const { startDateId, endDateId, branchId } = await getParameterMap(page);

    await fillReportDate(page, startDateId, requestedDate);
    await fillReportDate(page, endDateId, endDate);

    let branchName = "";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        branchName = await selectBranch(page, branchId);
        break;
      } catch (error) {
        if (attempt >= 2) {
          throw error;
        }
        await page.keyboard.press("Escape").catch(() => undefined);
        await page.waitForTimeout(1_500);
      }
    }

    await page.keyboard.press("Escape").catch(() => undefined);
    await clickSubmitButton(page);
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

function normalizeReportTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})/.exec(normalizeLine(value));
  if (!match) {
    return normalizeLine(value);
  }

  return `${match[1]?.padStart(2, "0")}:${match[2]}`;
}

function normalizeReportDate(value: string, fallbackDate: string) {
  const normalized = normalizeLine(value);
  const fullDate = normalized.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (fullDate) {
    return fullDate;
  }

  return normalized || fallbackDate;
}

function parseWrsWeightRowsFromCells(rows: string[][], fallbackDate: string) {
  const parsedRows: WrsWeightReportRow[] = [];

  for (const cells of rows) {
    if (cells.length < 13 || !/^\d+$/.test(cells[0] ?? "")) {
      continue;
    }

    const ticketNumber = cells[1] ?? "";
    const vehicleCode = normalizeVehicleCode(cells[2] ?? "");
    const vehicleWeightKg = parseNumericToken(cells[10] ?? "") ?? 0;
    const garbageWeightKg = parseNumericToken(cells[11] ?? "") ?? 0;
    const totalWeightKg = parseNumericToken(cells[12] ?? "") ?? 0;

    if (!ticketNumber || !vehicleCode || garbageWeightKg <= 0) {
      continue;
    }

    parsedRows.push({
      sequence: Number(cells[0]),
      ticketNumber,
      vehicleCode,
      carrierName: cells[3] ?? "",
      fromLocation: cells[4] ?? "",
      district: cells[5] ?? "",
      wasteType: cells[6] ?? "",
      sourceName: cells[7] ?? "",
      reportDate: normalizeReportDate(cells[8] ?? "", fallbackDate),
      reportTime: normalizeReportTime(cells[9] ?? ""),
      vehicleWeightKg,
      garbageWeightKg,
      totalWeightKg,
    });
  }

  return parsedRows;
}

function decodeExportText(buffer: Buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le");
  }

  return buffer.toString("utf8").replace(/^\ufeff/, "");
}

function parseDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index] ?? "";
    const next = line[index + 1] ?? "";

    if (character === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      quoted = !quoted;
      continue;
    }

    if (character === delimiter && !quoted) {
      cells.push(normalizeLine(current));
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(normalizeLine(current));
  return cells.filter(Boolean);
}

function detectDelimiter(lines: string[]) {
  const delimiters = ["\t", ";", ","];
  let bestDelimiter = ",";
  let bestScore = -1;

  for (const delimiter of delimiters) {
    const score = lines
      .slice(0, 20)
      .reduce((sum, line) => sum + parseDelimitedLine(line, delimiter).length, 0);
    if (score > bestScore) {
      bestDelimiter = delimiter;
      bestScore = score;
    }
  }

  return bestDelimiter;
}

function parseDelimitedRows(content: string) {
  const lines = content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const delimiter = detectDelimiter(lines);
  return lines.map((line) => parseDelimitedLine(line, delimiter)).filter((cells) => cells.length);
}

async function clickVisibleControl(page: Page, labelPattern: RegExp) {
  return page.evaluate((patternSource) => {
    const pattern = new RegExp(patternSource, "i");
    const control = Array.from(
      document.querySelectorAll("button, a, [role='button'], [role='menuitem'], [role='option']"),
    ).find((element) => {
      const label = [
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        element.textContent,
      ]
        .filter(Boolean)
        .join(" ");
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        pattern.test(label) &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    }) as HTMLElement | undefined;

    if (!control) {
      return false;
    }

    control.click();
    return true;
  }, labelPattern.source);
}

async function extractExportedWeightReportRows(page: Page, fallbackDate: string) {
  const opened = await clickVisibleControl(page, /Export To/);
  if (!opened) {
    return [];
  }

  await page.waitForTimeout(1_000);
  const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
  const selected = await clickVisibleControl(page, /\bText\b/);
  if (!selected) {
    await page.keyboard.press("Escape").catch(() => undefined);
    return [];
  }

  const download = await downloadPromise;
  const filePath = await download.path();
  if (!filePath) {
    return [];
  }

  const content = decodeExportText(await readFile(filePath));
  return parseWrsWeightRowsFromCells(parseDelimitedRows(content), fallbackDate);
}

async function extractWeightReportRows(page: Page, fallbackDate: string) {
  const tableRows = await page.evaluate(() =>
    Array.from(document.querySelectorAll("tr"))
      .map((row) =>
        Array.from(row.querySelectorAll("td"))
          .map((cell) =>
            (cell.textContent ?? "")
              .replace(/\u00a0/g, " ")
              .replace(/\s+/g, " ")
              .trim(),
          )
          .filter(Boolean),
      )
      .filter((cells) => cells.length > 0),
  );

  return parseWrsWeightRowsFromCells(tableRows, fallbackDate);
}

async function enterDocumentReadingMode(page: Page) {
  const previewPage = page.locator(".dxbrv-report-preview-content").first();
  if (!(await previewPage.count().catch(() => 0))) {
    return;
  }

  await previewPage.click({ force: true, timeout: 5_000 }).catch(() => undefined);
  await previewPage.focus().catch(() => undefined);
  await previewPage.press("Enter").catch(() => page.keyboard.press("Enter"));
  await page.waitForTimeout(1_000);
  await previewPage.press("Space").catch(() => page.keyboard.press("Space"));
  await page.waitForTimeout(2_000);
}

async function extractAccessibilityTextLines(page: Page) {
  try {
    const session = await page.context().newCDPSession(page);
    const result = (await session.send("Accessibility.getFullAXTree")) as {
      nodes?: Array<{
        name?: { value?: string };
        value?: { value?: string };
      }>;
    };
    await session.detach().catch(() => undefined);

    return Array.from(
      new Set(
        (result.nodes ?? [])
          .flatMap((node) => [node.name?.value, node.value?.value])
          .map((value) => normalizeLine(String(value ?? "")))
          .filter(Boolean),
      ),
    );
  } catch {
    return [];
  }
}

function aggregateWeightRows(
  rows: WrsWeightReportRow[],
  requestedDate: string,
  branchName: string,
) {
  const totals = new Map<string, AggregatedVehicleTotal>();

  for (const row of rows) {
    const current = totals.get(row.vehicleCode) ?? {
      netWeightTotal: 0,
      rowCount: 0,
      samples: [],
      vehicleLabel: row.vehicleCode,
    };

    current.netWeightTotal += row.garbageWeightKg;
    current.rowCount += 1;
    if (current.samples.length < 3) {
      current.samples.push(
        `${row.sequence}. ${row.ticketNumber} ${row.vehicleCode} ${row.garbageWeightKg} кг`,
      );
    }

    totals.set(row.vehicleCode, current);
  }

  return Array.from(totals.entries())
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
  await enterDocumentReadingMode(page);

  const lines = await page.evaluate(() => {
    const selectors = [
      "body",
      ".dxbrv-report-preview-content",
      ".dxbrv-document-surface",
      ".dx-scrollview-content",
      '[role="document"]',
      '[aria-label*="Document Page"]',
    ];

    const rawSegments = selectors.flatMap((selector) =>
      Array.from(document.querySelectorAll(selector)).map(
        (element) => (element as HTMLElement).innerText || element.textContent || "",
      ),
    );

    return rawSegments.flatMap((segment) => segment.split(/\r?\n/));
  });

  const accessibilityLines = await extractAccessibilityTextLines(page);
  return Array.from(
    new Set(
      [...lines, ...accessibilityLines].map((line) => normalizeLine(line)).filter(Boolean),
    ),
  );
}

function aggregateVehicleTotals(lines: string[], requestedDate: string, branchName: string) {
  const totals = new Map<string, AggregatedVehicleTotal>();
  const ignoredSamples: string[] = [];

  for (const line of lines) {
    const cells = splitCells(line);
    if (cells.length < 2) {
      if (
        ignoredSamples.length < 10 &&
        /[A-Z\u0410-\u042f\u04ae\u04e8]/u.test(line) &&
        /\d/.test(line)
      ) {
        ignoredSamples.push(line);
      }
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
    const weightRows = await extractWeightReportRows(page, requestedDate);
    if (weightRows.length) {
      return {
        requestedDate,
        branchName,
        title: header.title,
        pageLabel: header.pageLabel,
        totalPages: parseTotalPages(header.pageLabel),
        extractedLineCount: weightRows.length,
        totals: aggregateWeightRows(weightRows, requestedDate, branchName),
        ignoredSamples: [],
      };
    }

    const exportedRows = await extractExportedWeightReportRows(page, requestedDate);
    if (exportedRows.length) {
      return {
        requestedDate,
        branchName,
        title: header.title,
        pageLabel: header.pageLabel,
        totalPages: parseTotalPages(header.pageLabel),
        extractedLineCount: exportedRows.length,
        totals: aggregateWeightRows(exportedRows, requestedDate, branchName),
        ignoredSamples: [],
      };
    }

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

export async function fetchWrsWeightRows(
  startDate: string,
  endDate = startDate,
): Promise<WrsWeightRowsResult> {
  if (!isValidDateValue(startDate) || !isValidDateValue(endDate) || startDate > endDate) {
    throw new Error("Invalid date range. Use YYYY-MM-DD.");
  }

  const { browser, branchName, page } = await prepareWrsReportPage(startDate, endDate);

  try {
    const header = await readReportHeader(page);
    const rows = await extractWeightReportRows(page, startDate === endDate ? startDate : "");
    const vehicleCodes = new Set(rows.map((row) => row.vehicleCode));

    return {
      startDate,
      endDate,
      branchName,
      title: header.title,
      pageLabel: header.pageLabel,
      totalPages: parseTotalPages(header.pageLabel),
      rows,
      tripCount: rows.length,
      vehicleCount: vehicleCodes.size,
      totalVehicleWeightKg: rows.reduce((sum, row) => sum + row.vehicleWeightKg, 0),
      totalGarbageWeightKg: rows.reduce((sum, row) => sum + row.garbageWeightKg, 0),
      totalCombinedWeightKg: rows.reduce((sum, row) => sum + row.totalWeightKg, 0),
      generatedAt: new Date().toISOString(),
    };
  } finally {
    await browser.close();
  }
}
