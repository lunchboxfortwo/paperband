import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = process.env.SHOTS || "/tmp/paperband-shots";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".md": "text/markdown; charset=utf-8",
  ".pdf": "application/pdf",
};
const widths = [
  { name: "360", width: 360, height: 800, mobile: true },
  { name: "390", width: 390, height: 844, mobile: true },
  { name: "412", width: 412, height: 915, mobile: true },
  { name: "desktop", width: 1280, height: 900, mobile: false },
];

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const path = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  try {
    const buf = await readFile(join(root, path));
    res.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end("missing");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const pageUrl = `http://127.0.0.1:${port}/`;

const chrome = spawn("google-chrome", [
  "--headless=new",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--remote-debugging-port=9333",
  "--user-data-dir=/tmp/paperband-chrome-profile",
  "about:blank",
], { stdio: "ignore" });

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function debuggerUrl() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const version = await fetch("http://127.0.0.1:9333/json/version").then((res) => res.json());
      if (version.webSocketDebuggerUrl) return version.webSocketDebuggerUrl;
    } catch { /* chrome still starting */ }
    await delay(100);
  }
  throw new Error("Chrome did not open a debugging port");
}

function cdp(ws) {
  let id = 0;
  const pending = new Map();
  const waits = [];
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
      return;
    }
    for (const wait of waits) {
      if (wait.method === message.method) {
        wait.resolve(message.params);
        waits.splice(waits.indexOf(wait), 1);
      }
    }
  });
  return {
    send(method, params = {}, sessionId) {
      const msgId = ++id;
      const payload = { id: msgId, method, params };
      if (sessionId) payload.sessionId = sessionId;
      ws.send(JSON.stringify(payload));
      return new Promise((resolve, reject) => pending.set(msgId, { resolve, reject }));
    },
    wait(method) {
      return new Promise((resolve) => waits.push({ method, resolve }));
    },
  };
}

await mkdir(outDir, { recursive: true });
const browserWs = new WebSocket(await debuggerUrl());
await new Promise((resolve, reject) => {
  browserWs.addEventListener("open", resolve);
  browserWs.addEventListener("error", reject);
});
const browser = cdp(browserWs);
const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
const send = (method, params) => browser.send(method, params, sessionId);
await send("Page.enable");
await send("Runtime.enable");
const loaded = browser.wait("Page.loadEventFired");
await send("Page.navigate", { url: pageUrl });
await loaded;
await delay(250);

const failures = [];
function check(name, condition, detail) {
  if (!condition) failures.push(`${name}: ${detail}`);
}

for (const size of widths) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: size.width,
    height: size.height,
    deviceScaleFactor: 1,
    mobile: size.mobile,
  });
  await delay(200);
  const probe = await send("Runtime.evaluate", {
    expression: `(() => {
      const view = document.documentElement.clientWidth;
      const bad = [];
      for (const el of document.querySelectorAll("body *")) {
        if (el.closest("svg")) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 1 && rect.height < 1) continue;
        if (rect.left < -1 || rect.right > view + 1) {
          bad.push(el.tagName + "." + String(el.className).slice(0, 40) + " " + Math.round(rect.left) + ":" + Math.round(rect.right));
        }
      }
      const line = document.querySelector("#price polyline");
      return {
        scroll: document.documentElement.scrollWidth,
        client: view,
        bad: bad.slice(0, 12),
        status: document.querySelector("#status").textContent,
        strategyCount: document.querySelectorAll("#strategy").length,
        marks: document.querySelectorAll("#price .mark").length,
        points: line ? line.getAttribute("points").split(" ").length : 0,
        balance: document.querySelector("#balance").innerText,
        equity: document.querySelector("#equity").innerText,
        actions: document.querySelector("#actions").innerText,
        tracked: document.querySelector("#tracked").innerText,
        caption: document.querySelector("#price .caption")?.textContent || "",
      };
    })()`,
    returnByValue: true,
  });
  const value = probe.result.value;
  check(`${size.name} overflow`, value.scroll <= value.client + 1 && value.bad.length === 0, JSON.stringify({ scroll: value.scroll, client: value.client, bad: value.bad }));
  check(`${size.name} status`, value.status.includes("Not a live feed.") && value.status.includes("Nov 8, 2026, 2:59 PM EST"), value.status);
  check(`${size.name} equity`, value.equity.includes("$500.00") && value.equity.includes("Flat"), value.equity);
  check(`${size.name} balance`, value.balance.includes("Only published mark.") && value.balance.includes("funding"), value.balance);
  check(`${size.name} series`, value.points === 126 && value.marks === 1, JSON.stringify({ points: value.points, marks: value.marks }));
  check(`${size.name} strategy`, value.strategyCount === 1, String(value.strategyCount));
  check(`${size.name} actions`, value.actions.includes("No fills.") && value.actions.includes("Pending, not executed.") && value.actions.includes("no fill price") && !value.actions.includes("filled"), value.actions);
  check(`${size.name} pnl`, value.tracked.includes("none") && !value.tracked.includes("-17.91%") && !value.tracked.includes("+9.12%"), value.tracked);
  check(`${size.name} caption`, value.caption.includes("not a target") && value.caption.includes("Yahoo Finance chart API"), value.caption);

  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  await writeFile(join(outDir, `paperband-${size.name}.png`), Buffer.from(shot.data, "base64"));
}

await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await delay(200);
const tapped = await send("Runtime.evaluate", {
  expression: `(() => {
    const marker = document.querySelector("#price .mark");
    marker.click();
    const tip = document.querySelector("#price .tip");
    const rect = tip.getBoundingClientRect();
    const view = document.documentElement.clientWidth;
    const basis = document.querySelector(".hint");
    basis.click();
    const basisOpen = document.querySelector(".basis");
    const basisText = basisOpen.textContent;
    const basisWasHidden = basisOpen.hidden;
    basis.click();
    return {
      hidden: tip.hidden,
      text: tip.innerText,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      view,
      scroll: document.documentElement.scrollWidth,
      basisText,
      basisWasHidden,
      basisClosed: document.querySelector(".basis").hidden,
    };
  })()`,
  returnByValue: true,
});
const tap = tapped.result.value;
check("tooltip text", tap.text.includes("Not a fill") && tap.text.includes("not a limit price") && tap.text.includes("Pending short"), tap.text);
check("tooltip inside", tap.left >= -1 && tap.right <= tap.view + 1, JSON.stringify(tap));
check("tooltip overflow", tap.scroll <= 390 + 1, String(tap.scroll));
check("basis", tap.basisWasHidden === false && tap.basisClosed === true && tap.basisText.includes("booked cost") && tap.basisText.includes("not P&L"), tap.basisText);
const tipShot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
await writeFile(join(outDir, "paperband-390-tooltip.png"), Buffer.from(tipShot.data, "base64"));

await send("Runtime.evaluate", {
  expression: `document.querySelector('#symbols button[aria-pressed="false"]').click()`,
});
await delay(200);
const switched = await send("Runtime.evaluate", {
  expression: `({
    pressed: [...document.querySelectorAll("#symbols button")].map(b => b.textContent + ":" + b.getAttribute("aria-pressed")).join(","),
    label: document.querySelector("#price .plot").getAttribute("aria-label"),
    marks: document.querySelectorAll("#price .mark").length,
    caption: document.querySelector("#price .caption").textContent
  })`,
  returnByValue: true,
});
const next = switched.result.value;
check("switch", next.pressed.includes("QQQ:true") && next.label.startsWith("QQQ") && next.marks === 1 && next.caption.includes("not a target"), JSON.stringify(next));
const qqqShot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
await writeFile(join(outDir, "paperband-390-qqq.png"), Buffer.from(qqqShot.data, "base64"));

chrome.kill("SIGKILL");
server.close();
browserWs.close();

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("browser checks passed");
console.log(outDir);
