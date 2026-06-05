// Capture dashboard screenshots for the README.
//   node scripts/screenshot.mjs            (app must be running on :3000, api on :8080)
// Outputs docs/screenshots/{overview,facilities}.png
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/screenshots");
const URL = process.env.APP_URL ?? "http://localhost:3000";

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1366, height: 1000 },
  deviceScaleFactor: 2,
});

// --- Overview tab: stacked area + donut ---
// Dev server keeps an HMR websocket open, so 'networkidle' never fires — wait
// for the actual chart element instead.
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".recharts-area, .recharts-surface", { timeout: 30000 });
await page.waitForTimeout(1500); // let the area chart finish its animation
await page.screenshot({ path: `${OUT}/overview.png`, fullPage: true });
console.log("wrote overview.png");

// --- Facilities tab: pickers + Leaflet map + top emitters + ownership ---
await page.getByRole("tab", { name: "Facilities" }).click();
await page.waitForSelector(".leaflet-tile-loaded", { timeout: 30000 });
await page.waitForSelector("tbody tr", { timeout: 30000 });
await page.locator("tbody tr").first().click(); // open ownership drill-down
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/facilities.png`, fullPage: true });
console.log("wrote facilities.png");

// --- Owners tab: top controlling parents by CO2 ---
await page.getByRole("tab", { name: "Owners" }).click();
await page.waitForSelector(".recharts-bar-rectangle", { timeout: 30000 });
await page.waitForSelector(".recharts-line", { timeout: 30000 }); // trend lines loaded
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/owners.png`, fullPage: true });
console.log("wrote owners.png");

await browser.close();
