/* Safe subset renderer for the sanctioned strategy note. It escapes HTML. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PaperbandMarkdown = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ANCHORS = {
    "in plain english": "eli5",
    "the live algorithm": "rules",
    "three-year comparison": "evidence",
  };

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function inline(value) {
    let text = escapeHtml(value);
    text = text.replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>');
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/(^|[\s(])\*([^*]+)\*/g, "$1<em>$2</em>");
    return text;
  }

  function headingId(title) {
    const key = title.trim().toLowerCase();
    return ANCHORS[key] || "";
  }

  function render(markdown) {
    const lines = String(markdown).replace(/\r\n/g, "\n").split("\n");
    const html = [];
    let i = 0;
    const para = [];
    function flushPara() {
      if (!para.length) return;
      html.push("<p>" + inline(para.join(" ")) + "</p>");
      para.length = 0;
    }
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) {
        flushPara();
        i += 1;
        continue;
      }
      const heading = /^(#{1,3})\s+(.+)$/.exec(line);
      if (heading) {
        flushPara();
        const level = heading[1].length;
        const title = heading[2].trim();
        const id = headingId(title);
        html.push("<h" + level + (id ? ' id="' + id + '"' : "") + ">" + inline(title) + "</h" + level + ">");
        i += 1;
        continue;
      }
      if (line.startsWith("|")) {
        flushPara();
        const rows = [];
        while (i < lines.length && lines[i].startsWith("|")) {
          if (!/^\|\s*-+/.test(lines[i])) rows.push(lines[i]);
          i += 1;
        }
        html.push('<div class="table-scroll"><table>');
        rows.forEach(function (row, index) {
          const cells = row.split("|").slice(1, -1).map(function (cell) { return inline(cell.trim()); });
          const tag = index === 0 ? "th" : "td";
          html.push("<tr>" + cells.map(function (cell) { return "<" + tag + ">" + cell + "</" + tag + ">"; }).join("") + "</tr>");
        });
        html.push("</table></div>");
        continue;
      }
      if (/^[-*]\s+/.test(line)) {
        flushPara();
        const items = [];
        while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
          items.push("<li>" + inline(lines[i].replace(/^[-*]\s+/, "")) + "</li>");
          i += 1;
        }
        html.push("<ul>" + items.join("") + "</ul>");
        continue;
      }
      if (/^\d+\.\s+/.test(line)) {
        flushPara();
        const items = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
          items.push("<li>" + inline(lines[i].replace(/^\d+\.\s+/, "")) + "</li>");
          i += 1;
        }
        html.push("<ol>" + items.join("") + "</ol>");
        continue;
      }
      para.push(line.trim());
      i += 1;
    }
    flushPara();
    return html.join("\n");
  }

  return { render: render };
});
