const { cleanText, escapeAttr, escapeHtml, escapeSvgText } = require("./util.js");

function isChartLanguage(language) {
  return ["chart", "chart-json", "vega-lite", "vegalite"].includes(String(language || "").toLowerCase());
}

function renderChartBlock(source, language = "chart") {
  const chart = parseChartSpec(source, language);

  if (!chart) {
    return `<figure class="chart-card chart-unsupported">
      <figcaption class="chart-title">Chart (source preserved)</figcaption>
      <div class="diagram-degraded-note">This chart could not be parsed, so the source text is preserved in the PDF.</div>
      <pre class="hljs chart-fallback"><code>${escapeHtml(source)}</code></pre>
    </figure>`;
  }

  return `<figure class="chart-card">
    <figcaption class="chart-title">${escapeHtml(chart.title || formatChartType(chart.type))}</figcaption>
    <div class="chart-stage">${renderChartSvg(chart)}</div>
  </figure>`;
}

function parseChartSpec(source, language = "chart") {
  const text = String(source || "").trim();

  if (!text) {
    return null;
  }

  const json = parseChartJson(text);
  if (json) {
    return normalizeChartSpec(json, language);
  }

  return parseDelimitedChart(text);
}

function parseChartJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function normalizeChartSpec(value, language = "chart") {
  const spec = Array.isArray(value) ? { data: value } : value;
  const type = normalizeChartType(spec.mark || spec.type || spec.chart || (language.includes("vega") ? "bar" : "bar"));
  const title = typeof spec.title === "string" ? spec.title : "";

  if (Array.isArray(spec.labels) && Array.isArray(spec.values)) {
    return {
      type,
      title,
      points: spec.labels.map((label, index) => ({
        label: cleanText(label, 40),
        value: Number(spec.values[index])
      })).filter((point) => Number.isFinite(point.value))
    };
  }

  const data = Array.isArray(spec.data?.values) ? spec.data.values : (Array.isArray(spec.data) ? spec.data : []);
  const encoding = spec.encoding || {};
  const xField = encoding.x?.field || spec.x || "label";
  const yField = encoding.y?.field || spec.y || "value";
  const points = data.map((row, index) => ({
    label: cleanText(row?.[xField] ?? row?.label ?? row?.name ?? `Item ${index + 1}`, 40),
    value: Number(row?.[yField] ?? row?.value ?? row?.count)
  })).filter((point) => Number.isFinite(point.value));

  return points.length ? { type, title, points } : null;
}

function parseDelimitedChart(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let type = "bar";

  if (/^(bar|line|area|scatter)\b/i.test(lines[0] || "")) {
    type = normalizeChartType(lines.shift());
  }

  if (lines[0] && /label\s*,\s*value/i.test(lines[0])) {
    lines.shift();
  }

  const points = lines.map((line, index) => {
    const [label, rawValue] = line.split(/,|\t/);
    return {
      label: cleanText(label || `Item ${index + 1}`, 40),
      value: Number(rawValue)
    };
  }).filter((point) => point.label && Number.isFinite(point.value));

  return points.length ? { type, title: formatChartType(type), points } : null;
}

function normalizeChartType(value) {
  const type = String(value || "bar").toLowerCase().replace(/[^a-z]/g, "");
  if (type.includes("line")) return "line";
  if (type.includes("area")) return "line";
  if (type.includes("scatter")) return "scatter";
  return "bar";
}

function formatChartType(type) {
  if (type === "line") return "Line chart";
  if (type === "scatter") return "Scatter chart";
  return "Bar chart";
}

function renderChartSvg(chart) {
  const width = 620;
  const height = 300;
  const margin = { top: 24, right: 22, bottom: 58, left: 52 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(1, ...chart.points.map((point) => point.value));
  const minValue = Math.min(0, ...chart.points.map((point) => point.value));
  const range = Math.max(1, maxValue - minValue);
  const scaleY = (value) => margin.top + plotHeight - ((value - minValue) / range) * plotHeight;
  const zeroY = scaleY(0);
  const axis = renderChartAxis({ width, height, margin, plotWidth, plotHeight, maxValue, minValue, zeroY });
  const labels = chart.points.map((point, index) => {
    const x = margin.left + (index + 0.5) * (plotWidth / chart.points.length);
    return `<text class="chart-label" x="${x}" y="${height - 22}" text-anchor="middle">${escapeSvgText(point.label)}</text>`;
  }).join("");

  const plot = chart.type === "bar"
    ? renderBarChartPlot(chart, { margin, plotWidth, scaleY, zeroY })
    : renderLineChartPlot(chart, { margin, plotWidth, scaleY });

  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(chart.title || formatChartType(chart.type))}" xmlns="http://www.w3.org/2000/svg">
    ${axis}
    ${plot}
    ${labels}
  </svg>`;
}

function renderChartAxis({ width, height, margin, plotWidth, plotHeight, maxValue, minValue, zeroY }) {
  const ticks = [minValue, (minValue + maxValue) / 2, maxValue]
    .map((value) => Number(value.toFixed(2)));
  const grid = ticks.map((tick) => {
    const y = margin.top + plotHeight - ((tick - minValue) / Math.max(1, maxValue - minValue)) * plotHeight;
    return `<g class="chart-grid">
      <line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>
      <text x="${margin.left - 8}" y="${y + 4}" text-anchor="end">${escapeSvgText(String(tick))}</text>
    </g>`;
  }).join("");

  return `${grid}
    <line class="chart-axis" x1="${margin.left}" y1="${zeroY}" x2="${width - margin.right}" y2="${zeroY}"></line>
    <line class="chart-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
}

function renderBarChartPlot(chart, context) {
  const { margin, plotWidth, scaleY, zeroY } = context;
  const slot = plotWidth / chart.points.length;
  const barWidth = Math.max(16, Math.min(54, slot * 0.58));

  return chart.points.map((point, index) => {
    const x = margin.left + index * slot + (slot - barWidth) / 2;
    const y = Math.min(scaleY(point.value), zeroY);
    const height = Math.max(1, Math.abs(zeroY - scaleY(point.value)));
    return `<g class="chart-bar-group">
      <rect class="chart-bar" x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="4"></rect>
      <text class="chart-value" x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle">${escapeSvgText(String(point.value))}</text>
    </g>`;
  }).join("");
}

function renderLineChartPlot(chart, context) {
  const { margin, plotWidth, scaleY } = context;
  const step = chart.points.length > 1 ? plotWidth / (chart.points.length - 1) : plotWidth;
  const points = chart.points.map((point, index) => ({
    x: margin.left + index * step,
    y: scaleY(point.value),
    value: point.value
  }));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const dots = points.map((point) => `<circle class="chart-dot" cx="${point.x}" cy="${point.y}" r="4"></circle>`).join("");
  const values = points.map((point) => `<text class="chart-value" x="${point.x}" y="${point.y - 8}" text-anchor="middle">${escapeSvgText(String(point.value))}</text>`).join("");

  return `<path class="chart-line" d="${path}"></path>${dots}${values}`;
}

module.exports = {
  isChartLanguage,
  renderChartBlock
};
