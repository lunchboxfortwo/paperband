const DOC_MD = "docs/paper-trader-monthly-momentum-s1.md";
const DOC_PDF = "docs/paper-trader-monthly-momentum-s1.pdf";

function text(id, value) {
  const node = document.querySelector(id);
  if (node) node.textContent = value;
}

function metric(label, value) {
  const node = document.createElement("article");
  node.className = "metric";
  const name = document.createElement("p");
  name.className = "label";
  name.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  node.append(name, strong);
  return node;
}

export function renderPublication(body) {
  const publication = body?.publication || {};
  const snapshot = body?.snapshot;
  const lines = [publication.market_note || "No paper snapshot has been published."];
  if (publication.publication_state === "stale") {
    lines.unshift("STALE. The publisher has not delivered a new snapshot.");
  }
  if (publication.published_at) lines.push("Published " + publication.published_at + ".");
  const market = snapshot?.market?.status;
  if (market && market !== "open") lines.push("Market status: " + market + ". Not a live quote.");
  return lines.join(" ");
}

async function loadSnapshot() {
  const metrics = document.querySelector("#metrics");
  try {
    const response = await fetch("data/snapshot.json", { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const raw = await response.json();
    const body = raw.snapshot ? raw : { publication: { market_note: raw.disclaimer, published_at: raw.generated_at_et }, snapshot: raw };
    text("#publication", renderPublication(body));
    metrics.replaceChildren();
    const book = body.snapshot && body.snapshot.book;
    if (!book) return;
    const equity = book.equity == null ? "unknown" : "$" + Number(book.equity).toFixed(2);
    metrics.append(
      metric("Paper equity", equity),
      metric("Cash", "$" + Number(book.cash).toFixed(2)),
      metric("Session", book.session_date || "none"),
    );
    const symbols = document.querySelector("#symbols");
    if (symbols) {
      symbols.replaceChildren();
      for (const row of body.snapshot.symbols || []) {
        const item = document.createElement("li");
        const close = row.last_close == null ? "" : " mark " + row.last_close;
        item.textContent = (row.symbol || "") + " " + (row.tsmom_target_label || row.direction || "") + close;
        symbols.append(item);
      }
    }
  } catch (error) {
    text("#publication", "The published snapshot could not be read. No prices were estimated.");
  }
}

async function loadNote() {
  const doc = document.querySelector("#strategy-doc");
  try {
    const response = await fetch(DOC_MD, { cache: "no-store" });
    if (!response.ok || !window.PaperbandMarkdown) throw new Error("missing");
    doc.innerHTML = window.PaperbandMarkdown.render(await response.text());
  } catch (error) {
    doc.textContent = "The strategy note is not on this site yet.";
  }
}

async function loadPdf() {
  const status = document.querySelector("#pdf-status");
  const link = document.querySelector("#pdf-link");
  try {
    const response = await fetch(DOC_PDF, { method: "HEAD", cache: "no-store" });
    const ready = response.ok && (response.headers.get("content-type") || "").includes("application/pdf");
    status.textContent = ready
      ? "The sanctioned PDF is on this site."
      : "The sanctioned PDF is not on this site yet.";
    if (!ready && link) {
      link.setAttribute("aria-disabled", "true");
      link.removeAttribute("href");
    }
  } catch (error) {
    status.textContent = "The PDF could not be checked.";
  }
}

loadSnapshot();
loadNote();
loadPdf();
setInterval(loadSnapshot, 60000);
