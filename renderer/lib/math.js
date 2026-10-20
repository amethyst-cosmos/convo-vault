const { escapeHtml } = require("./util.js");

function installMathRules(md) {
  md.block.ruler.before("fence", "math_block", (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const end = state.eMarks[startLine];
    const firstLine = state.src.slice(start, end).trim();

    if (!firstLine.startsWith("$$")) {
      return false;
    }

    const firstContent = firstLine.slice(2);
    if (firstContent.endsWith("$$") && firstContent.length > 2) {
      if (!silent) {
        const token = state.push("math_block", "math", 0);
        token.content = firstContent.slice(0, -2).trim();
        state.line = startLine + 1;
      }
      return true;
    }

    const content = firstContent.trim() ? [firstContent] : [];
    let nextLine = startLine + 1;

    while (nextLine < endLine) {
      const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
      const lineEnd = state.eMarks[nextLine];
      const line = state.src.slice(lineStart, lineEnd);
      const trimmed = line.trim();

      if (trimmed.endsWith("$$")) {
        const beforeClose = line.slice(0, line.lastIndexOf("$$"));
        if (beforeClose.trim()) {
          content.push(beforeClose);
        }
        if (!silent) {
          const token = state.push("math_block", "math", 0);
          token.content = content.join("\n").trim();
          state.line = nextLine + 1;
        }
        return true;
      }

      content.push(line);
      nextLine += 1;
    }

    return false;
  });

  md.inline.ruler.before("escape", "math_inline", (state, silent) => {
    const marker = "\\(";

    if (state.src.slice(state.pos, state.pos + marker.length) !== marker) {
      return false;
    }

    const close = state.src.indexOf("\\)", state.pos + marker.length);
    if (close < 0) {
      return false;
    }

    if (!silent) {
      const token = state.push("math_inline", "math", 0);
      token.content = state.src.slice(state.pos + marker.length, close).trim();
    }

    state.pos = close + 2;
    return true;
  });

  md.renderer.rules.math_block = (tokens, index) => {
    const source = cleanMathSource(tokens[index].content);
    return `<figure class="math-card"><figcaption>Formula</figcaption><div class="math-display">${renderMathHtml(source, { display: true })}</div></figure>`;
  };

  md.renderer.rules.math_inline = (tokens, index) => {
    return `<span class="math-inline">${renderMathHtml(cleanMathSource(tokens[index].content), { display: false })}</span>`;
  };
}

function cleanMathSource(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

function renderMathHtml(source, options = {}) {
  const math = renderMathSegment(source, 0, String(source || "").length).html;
  return options.display
    ? math.replace(/(?:<br>){2,}/g, "<br>")
    : math.replace(/<br>/g, " ");
}

function renderMathSegment(source, start, end) {
  let html = "";
  let index = start;

  while (index < end) {
    const char = source[index];

    if (char === "\\") {
      const command = readMathCommand(source, index);
      if (command.name === "\\") {
        html += "<br>";
      } else if (command.name === "frac") {
        const numerator = readMathAtom(source, command.end);
        const denominator = readMathAtom(source, numerator.end);
        html += `<span class="math-frac"><span class="math-num">${numerator.html}</span><span class="math-den">${denominator.html}</span></span>`;
        index = denominator.end;
        continue;
      } else if (command.name === "sqrt") {
        const radicand = readMathAtom(source, command.end);
        html += `<span class="math-root"><span class="math-root-symbol">√</span><span class="math-root-body">${radicand.html}</span></span>`;
        index = radicand.end;
        continue;
      } else if (command.name === "left" || command.name === "right") {
        // Formatting hint only; the next visible delimiter is handled normally.
      } else {
        html += escapeHtml(mathCommandToText(command.name));
      }
      index = command.end;
      continue;
    }

    if (char === "^" || char === "_") {
      const atom = readMathAtom(source, index + 1);
      html += char === "^"
        ? `<sup class="math-sup">${atom.html}</sup>`
        : `<sub class="math-sub">${atom.html}</sub>`;
      index = atom.end;
      continue;
    }

    if (char === "{") {
      const group = readMathGroup(source, index);
      html += group.html;
      index = group.end;
      continue;
    }

    if (char === "}") {
      index += 1;
      continue;
    }

    if (char === "\n") {
      html += "<br>";
      index += 1;
      continue;
    }

    if (char === "&") {
      html += `<span class="math-align-space"></span>`;
      index += 1;
      continue;
    }

    html += escapeHtml(char);
    index += 1;
  }

  return { html, end: index };
}

function readMathAtom(source, start) {
  let index = skipMathWhitespace(source, start);

  if (source[index] === "{") {
    return readMathGroup(source, index);
  }

  if (source[index] === "\\") {
    const command = readMathCommand(source, index);
    if (command.name === "frac") {
      const numerator = readMathAtom(source, command.end);
      const denominator = readMathAtom(source, numerator.end);
      return {
        html: `<span class="math-frac"><span class="math-num">${numerator.html}</span><span class="math-den">${denominator.html}</span></span>`,
        end: denominator.end
      };
    }
    if (command.name === "sqrt") {
      const radicand = readMathAtom(source, command.end);
      return {
        html: `<span class="math-root"><span class="math-root-symbol">√</span><span class="math-root-body">${radicand.html}</span></span>`,
        end: radicand.end
      };
    }
    return {
      html: escapeHtml(mathCommandToText(command.name)),
      end: command.end
    };
  }

  if (index >= source.length) {
    return { html: "", end: index };
  }

  return {
    html: escapeHtml(source[index]),
    end: index + 1
  };
}

function readMathGroup(source, start) {
  let depth = 0;
  let index = start;

  while (index < source.length) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          html: renderMathSegment(source, start + 1, index).html,
          end: index + 1
        };
      }
    }
    index += 1;
  }

  return {
    html: escapeHtml(source.slice(start)),
    end: source.length
  };
}

function readMathCommand(source, start) {
  if (source[start + 1] === "\\") {
    return { name: "\\", end: start + 2 };
  }

  const match = source.slice(start + 1).match(/^[A-Za-z]+|^./);
  const name = match?.[0] || "";
  return {
    name,
    end: start + 1 + name.length
  };
}

function skipMathWhitespace(source, start) {
  let index = start;
  while (/\s/.test(source[index] || "") && source[index] !== "\n") {
    index += 1;
  }
  return index;
}

function mathCommandToText(command) {
  const symbols = {
    alpha: "α",
    beta: "β",
    gamma: "γ",
    delta: "δ",
    Delta: "Δ",
    epsilon: "ε",
    theta: "θ",
    lambda: "λ",
    mu: "μ",
    pi: "π",
    sigma: "σ",
    Sigma: "Σ",
    omega: "ω",
    Omega: "Ω",
    sum: "∑",
    prod: "∏",
    int: "∫",
    infty: "∞",
    le: "≤",
    leq: "≤",
    ge: "≥",
    geq: "≥",
    neq: "≠",
    approx: "≈",
    times: "×",
    cdot: "·",
    pm: "±",
    to: "→",
    rightarrow: "→",
    leftarrow: "←",
    implies: "⇒",
    in: "∈",
    notin: "∉",
    subset: "⊂",
    subseteq: "⊆",
    cup: "∪",
    cap: "∩",
    text: ""
  };

  return Object.prototype.hasOwnProperty.call(symbols, command)
    ? symbols[command]
    : command;
}

module.exports = {
  installMathRules
};
