const TABLE_SEPARATOR_PATTERN =
  /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;

export function renderMarkdownToElement(markdown, target) {
  target.textContent = "";

  for (const block of parseBlocks(String(markdown || ""))) {
    target.appendChild(renderBlock(block));
  }
}

function parseBlocks(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.trimStart().startsWith("```")) {
      const fence = line.trimStart();
      const language = fence.slice(3).trim();
      const code = [];
      index += 1;

      while (index < lines.length && !lines[index].trimStart().startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      blocks.push({ type: "code", language, text: code.join("\n") });
      continue;
    }

    if (isTableStart(lines, index)) {
      const tableLines = [lines[index], lines[index + 1]];
      index += 2;

      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        tableLines.push(lines[index]);
        index += 1;
      }

      blocks.push(parseTable(tableLines));
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        text: heading[2].trim(),
      });
      index += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote = [];

      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }

      blocks.push({ type: "blockquote", children: parseBlocks(quote.join("\n")) });
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];

      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ""));
        index += 1;
      }

      blocks.push({ type: "list", ordered: false, items });
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];

      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+[.)]\s+/, ""));
        index += 1;
      }

      blocks.push({ type: "list", ordered: true, items });
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      blocks.push({ type: "hr" });
      index += 1;
      continue;
    }

    const paragraph = [line];
    index += 1;

    while (
      index < lines.length &&
      lines[index].trim() &&
      !startsSpecialBlock(lines, index)
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }

    blocks.push({ type: "paragraph", text: paragraph.join("\n") });
  }

  return blocks;
}

function startsSpecialBlock(lines, index) {
  const line = lines[index];
  return (
    line.trimStart().startsWith("```") ||
    isTableStart(lines, index) ||
    /^(#{1,4})\s+/.test(line) ||
    /^\s*>\s?/.test(line) ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    /^\s*---+\s*$/.test(line)
  );
}

function isTableStart(lines, index) {
  return (
    index + 1 < lines.length &&
    lines[index].includes("|") &&
    TABLE_SEPARATOR_PATTERN.test(lines[index + 1])
  );
}

function parseTable(lines) {
  const header = splitTableRow(lines[0]);
  const rows = lines.slice(2).map(splitTableRow);
  return { type: "table", header, rows };
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderBlock(block) {
  if (block.type === "heading") {
    const element = document.createElement(`h${block.level}`);
    renderInline(block.text, element);
    return element;
  }

  if (block.type === "paragraph") {
    const element = document.createElement("p");
    renderInline(block.text, element);
    return element;
  }

  if (block.type === "list") {
    const element = document.createElement(block.ordered ? "ol" : "ul");

    for (const item of block.items) {
      const listItem = document.createElement("li");
      renderInline(item, listItem);
      element.appendChild(listItem);
    }

    return element;
  }

  if (block.type === "blockquote") {
    const element = document.createElement("blockquote");

    for (const child of block.children) {
      element.appendChild(renderBlock(child));
    }

    return element;
  }

  if (block.type === "code") {
    const pre = document.createElement("pre");
    const code = document.createElement("code");

    if (block.language) {
      code.dataset.language = block.language;
    }

    code.textContent = block.text.replace(/\n$/, "");
    pre.appendChild(code);
    return pre;
  }

  if (block.type === "table") {
    return renderTable(block);
  }

  return document.createElement("hr");
}

function renderTable(block) {
  const wrapper = document.createElement("div");
  wrapper.className = "markdown-table-wrap";

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  for (const cell of block.header) {
    const th = document.createElement("th");
    renderInline(cell, th);
    headerRow.appendChild(th);
  }

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const row of block.rows) {
    const tableRow = document.createElement("tr");

    for (const cell of row) {
      const td = document.createElement("td");
      renderInline(cell, td);
      tableRow.appendChild(td);
    }

    tbody.appendChild(tableRow);
  }

  table.appendChild(tbody);
  wrapper.appendChild(table);
  return wrapper;
}

function renderInline(text, target) {
  const pattern =
    /(`[^`]+`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_)/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      appendTextWithBreaks(text.slice(lastIndex, match.index), target);
    }

    const token = match[0];

    if (token.startsWith("`")) {
      const code = document.createElement("code");
      code.textContent = token.slice(1, -1);
      target.appendChild(code);
    } else if (match[2] && match[3]) {
      const link = document.createElement("a");
      link.href = match[3];
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = match[2];
      target.appendChild(link);
    } else if (match[4] || match[5]) {
      const strong = document.createElement("strong");
      strong.textContent = match[4] || match[5];
      target.appendChild(strong);
    } else {
      const emphasis = document.createElement("em");
      emphasis.textContent = match[6] || match[7] || "";
      target.appendChild(emphasis);
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    appendTextWithBreaks(text.slice(lastIndex), target);
  }
}

function appendTextWithBreaks(text, target) {
  const parts = text.split("\n");

  parts.forEach((part, index) => {
    if (index > 0) {
      target.appendChild(document.createElement("br"));
    }

    if (part) {
      target.appendChild(document.createTextNode(part));
    }
  });
}
