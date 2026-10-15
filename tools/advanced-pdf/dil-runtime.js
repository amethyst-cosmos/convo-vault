// Static renderer for ChatGPT generative-UI (DIL) responses inside the PDF page.
//
// ChatGPT stores a DIL response as compiled JavaScript (model_dil_v2.code) that
// calls DIL.render(__dil.jsx(...)) with string constants and resolved component
// results. This file provides the globals that code expects and turns the
// element tree into static HTML styled after the ChatGPT page. Hooks return
// their initial state, actions (GenUI.copy, onClick, onChange) do nothing, and
// the page's Content-Security-Policy blocks network access.
//
// Each root is a .dil-root element followed by a JSON <script> holding
// { code, constants, appData, widgets (by invocation id), citations (by ref
// id, each { url, title, label }) }. A root that throws is left
// empty and its message shows the Markdown fallback instead.
(function () {
  "use strict";

  const Fragment = Symbol("dil.fragment");
  const SPACING_PX = 4;
  const TEXT_SIZES = { "3xs": 10, "2xs": 11, xs: 12, sm: 13, md: 14, lg: 16, xl: 18, "2xl": 21, "3xl": 24 };
  const COLORS = {
    default: "#0d0d0d",
    primary: "#0d0d0d",
    secondary: "#5d5d5d",
    tertiary: "#8f8f8f",
    success: "#0f8a5f",
    warning: "#b26a00",
    danger: "#d13a2f",
    error: "#d13a2f",
    info: "#1f6fd1",
    accent: "#1f6fd1"
  };
  const BACKGROUNDS = {
    "surface-primary": "#ffffff",
    "surface-secondary": "#f4f4f4",
    "surface-tertiary": "#ececec",
    "surface-elevated": "#ffffff",
    success: "#e7f6ef",
    warning: "#fff4e0",
    danger: "#fdecea",
    info: "#e8f1fd"
  };
  const BORDER_COLORS = { default: "#d9d9d9", subtle: "#ececec", strong: "#b4b4b4" };
  const RADII = { none: "0", xs: "4px", sm: "6px", md: "8px", lg: "12px", xl: "16px", "2xl": "20px", full: "999px" };
  const ALIGN = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch", baseline: "baseline" };
  const JUSTIFY = { start: "flex-start", center: "center", end: "flex-end", between: "space-between", around: "space-around", evenly: "space-evenly" };
  // A small subset of Lucide icons; unknown names render as a neutral dot.
  const ICONS = {
    "arrow-down": "M12 5v14M19 12l-7 7-7-7",
    "arrow-up": "M12 19V5M5 12l7-7 7 7",
    "arrow-right": "M5 12h14M12 5l7 7-7 7",
    "arrow-left": "M19 12H5M12 19l-7-7 7-7",
    "chevron-right": "M9 18l6-6-6-6",
    "chevron-down": "M6 9l6 6 6-6",
    check: "M20 6 9 17l-5-5",
    "check-circle-2": "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9 12l2 2 4-4",
    "circle-check": "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9 12l2 2 4-4",
    circle: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
    x: "M18 6 6 18M6 6l12 12",
    plus: "M12 5v14M5 12h14",
    download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
    copy: "M8 8h12v12H8zM4 16V4h12",
    "file-text": "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
    image: "M3 3h18v18H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21",
    languages: "M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6",
    "code-2": "M18 16l4-4-4-4M6 8l-4 4 4 4M14.5 4l-5 16",
    code: "M16 18l6-6-6-6M8 6l-6 6 6 6",
    laptop: "M4 5h16v10H4zM2 19h20",
    cloud: "M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z",
    sparkles: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z",
    "wand-sparkles": "M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M10.6 6.6 9.4 5.4M3 21l9-9",
    "message-circle": "M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.5 8.5 0 1 1 21 11.5z",
    "brain-circuit": "M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18zM12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18z",
    info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01",
    "alert-triangle": "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
    lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
    "shield-check": "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4",
    cpu: "M4 4h16v16H4zM9 9h6v6H9zM9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3",
    "hard-drive": "M22 12H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
    zap: "M13 2 3 14h9l-1 8 10-12h-9z",
    "clipboard-check": "M9 2h6v4H9zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4",
    "clipboard-list": "M9 2h6v4H9zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M12 11h4M12 16h4M8 11h.01M8 16h.01",
    "list-checks": "M3 17l2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8",
    file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
    folder: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z",
    settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-2.82-1.17l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3.09 15H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.17-2.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9.91 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 2.82 1.17l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20.91 9H21a2 2 0 0 1 0 4h-.09",
    search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
    star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z",
    target: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    gauge: "M12 14l4-4M3.34 19a10 10 0 1 1 17.32 0",
    "bar-chart-3": "M3 3v18h18M18 17V9M13 17V5M8 17v-3",
    "chart-bar": "M3 3v18h18M7 16h8M7 11h12M7 6h3",
    "trending-up": "M22 7l-8.5 8.5-5-5L2 17M16 7h6v6",
    monitor: "M2 3h20v14H2zM8 21h8M12 17v4",
    smartphone: "M5 2h14v20H5zM12 18h.01",
    server: "M2 2h20v8H2zM2 14h20v8H2zM6 6h.01M6 18h.01",
    database: "M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3zM21 12c0 1.66-4 3-9 3s-9-1.34-9-3M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5",
    rocket: "M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z",
    lightbulb: "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4",
    "book-open": "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",
    calendar: "M3 4h18v18H3zM16 2v4M8 2v4M3 10h18",
    clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
    timer: "M10 2h4M12 14l3-3M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
    user: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
    "external-link": "M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
    play: "M6 3l14 9-14 9z",
    "refresh-cw": "M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5",
    "trash-2": "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6",
    pencil: "M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5zM15 5l4 4",
    eye: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    globe: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
    mic: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3",
    camera: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    terminal: "M4 17l6-6-6-6M12 19h8",
    "git-branch": "M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9",
    package: "M16.5 9.4 7.5 4.21M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96 12 12.01l8.73-5.05M12 22.08V12",
    layers: "M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
    "layout-dashboard": "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
    flag: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7",
    heart: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z",
    "thumbs-up": "M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88z",
    "help-circle": "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01",
    "x-circle": "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM15 9l-6 6M9 9l6 6",
    "circle-x": "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM15 9l-6 6M9 9l6 6",
    minus: "M5 12h14",
    "chevron-left": "M15 18l-6-6 6-6",
    "chevron-up": "M18 15l-6-6-6 6",
    mail: "M2 4h20v16H2zM22 6l-10 7L2 6",
    bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
    key: "M7.5 15.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM11.4 11.4 21 2M15.5 7.5l3 3L22 7l-3-3",
    "wifi-off": "M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 4.17-2.65M10.66 5c4.01-.36 8.14.9 11.34 3.76M16.85 11.25a10 10 0 0 1 2.22 1.68M5 13a10 10 0 0 1 5.24-2.76M12 20h.01",
    "memory-stick": "M6 19v-3M10 19v-3M14 19v-3M18 19v-3M8 11V9M16 11V9M12 11V9M2 15h20M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1.1a2 2 0 0 0 0 3.84V19H2v-7.06a2 2 0 0 0 0-3.84z",
    "square-check": "M3 3h18v18H3zM9 12l2 2 4-4",
    square: "M3 3h18v18H3z",
    "app-window": "M2 4h20v16H2zM10 4v4M2 8h20M6 4v4",
    "arrow-down-up": "M3 16l4 4 4-4M7 20V4M21 8l-4-4-4 4M17 4v16",
    "arrow-up-circle": "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM16 12l-4-4-4 4M12 16V8",
    ellipsis: "M5 12h.01M12 12h.01M19 12h.01",
    "image-plus": "M16 5h6M19 2v6M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5M21 15l-5-5L5 21M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    "mouse-pointer-2": "M4.04 4.95l6.9 16.56a.5.5 0 0 0 .93-.03l2.48-6.67a2 2 0 0 1 1.17-1.17l6.67-2.48a.5.5 0 0 0 .03-.93L5.66 3.33a.5.5 0 0 0-.62.62z",
    paperclip: "M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48",
    "settings-2": "M20 7h-9M14 17H5M17 20a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM7 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    "sliders-horizontal": "M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"
  };

  function el(tag, className, style) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (style) Object.assign(node.style, style);
    return node;
  }

  function spacing(value) {
    if (value == null || value === false) return "";
    if (typeof value === "number") return `${value * SPACING_PX}px`;
    return String(value);
  }

  function sizeValue(value) {
    if (value == null) return "";
    return typeof value === "number" ? `${value}px` : String(value);
  }

  function colorValue(value, fallback = "") {
    if (!value) return fallback;
    return COLORS[value] || (/^(#|rgb|hsl)/.test(String(value)) ? String(value) : fallback);
  }

  function backgroundValue(value) {
    if (!value) return "";
    return BACKGROUNDS[value] || (/^(#|rgb|hsl)/.test(String(value)) ? String(value) : "");
  }

  function borderValue(value) {
    if (!value) return "";
    if (value === true) return `1px solid ${BORDER_COLORS.default}`;
    if (typeof value === "object") {
      const size = Number(value.size) || 1;
      return `${size}px solid ${BORDER_COLORS[value.color] || colorValue(value.color, BORDER_COLORS.default)}`;
    }
    return `1px solid ${BORDER_COLORS[value] || BORDER_COLORS.default}`;
  }

  function layoutStyle(props, direction) {
    const style = { display: "flex", flexDirection: direction, minWidth: "0" };
    if (props.gap != null) style.gap = spacing(props.gap);
    if (props.padding != null) style.padding = spacing(props.padding);
    if (props.align) style.alignItems = ALIGN[props.align] || props.align;
    if (props.justify) style.justifyContent = JUSTIFY[props.justify] || props.justify;
    if (props.wrap) style.flexWrap = props.wrap === true ? "wrap" : props.wrap;
    if (props.flex != null) style.flex = String(props.flex);
    if (props.width) style.width = sizeValue(props.width);
    if (props.height) style.height = sizeValue(props.height);
    if (props.background) style.background = backgroundValue(props.background);
    if (props.border) style.border = borderValue(props.border);
    if (props.radius) style.borderRadius = RADII[props.radius] || sizeValue(props.radius);
    if (props.clip) style.overflow = "hidden";
    return style;
  }

  function textStyle(props) {
    const style = {};
    if (props.size && TEXT_SIZES[props.size]) style.fontSize = `${TEXT_SIZES[props.size]}px`;
    if (props.color) style.color = colorValue(props.color);
    if (props.weight) style.fontWeight = { normal: 400, medium: 550, semibold: 650, bold: 700 }[props.weight] || props.weight;
    if (props.textAlign) style.textAlign = props.textAlign;
    if (props.tabularNums) style.fontVariantNumeric = "tabular-nums";
    if (props.truncate) Object.assign(style, { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
    return style;
  }

  function appendChildren(parent, children, ctx) {
    for (const child of flatten(children)) {
      const node = renderNode(child, ctx);
      if (node) parent.appendChild(node);
    }
    return parent;
  }

  function flatten(children) {
    const out = [];
    (Array.isArray(children) ? children : [children]).forEach((child) => {
      if (Array.isArray(child)) out.push(...flatten(child));
      else out.push(child);
    });
    return out;
  }

  function renderIcon(props) {
    const size = { xs: 12, sm: 14, md: 16, lg: 20, xl: 24, "2xl": 28 }[props.size] || 16;
    const color = colorValue(props.color, "currentColor");
    const path = ICONS[String(props.name || "").toLowerCase()];
    const span = el("span", "dil-icon", { width: `${size}px`, height: `${size}px`, color });
    if (props.inline) span.classList.add("dil-icon-inline");
    span.innerHTML = path
      ? `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`
      : `<svg viewBox="0 0 24 24" width="${size}" height="${size}"><circle cx="12" cy="12" r="4" fill="currentColor" opacity=".45"/></svg>`;
    return span;
  }

  const INTRINSICS = {
    box: (props, children, ctx) => appendChildren(el(props.inline ? "span" : "div", props.border || props.background ? "dil-box dil-card" : "dil-box", layoutStyle(props, props.direction === "row" ? "row" : "column")), children, ctx),
    row: (props, children, ctx) => appendChildren(el("div", "dil-row", { alignItems: "center", ...layoutStyle(props, "row") }), children, ctx),
    grid(props, children, ctx) {
      const style = layoutStyle(props, "row");
      style.display = "grid";
      style.gridTemplateColumns = `repeat(${Number(props.columns) || 2}, minmax(0, 1fr))`;
      return appendChildren(el("div", "dil-grid", style), children, ctx);
    },
    "grid-item": (props, children, ctx) => appendChildren(el("div", "dil-grid-item", layoutStyle(props, "column")), children, ctx),
    text: (props, children, ctx) => appendChildren(el("p", "dil-text", textStyle(props)), children, ctx),
    title(props, children, ctx) {
      const { size, ...rest } = props;
      const fontSize = { sm: 15, md: 17, lg: 20, xl: 24 }[size] || 17;
      return appendChildren(el("h3", "dil-title", { ...textStyle(rest), fontSize: `${fontSize}px` }), children, ctx);
    },
    caption: (props, children, ctx) => appendChildren(el("p", "dil-caption", textStyle(props)), children, ctx),
    badge: (props, children, ctx) => appendChildren(el("span", "dil-badge", { color: colorValue(props.color, COLORS.secondary), background: BACKGROUNDS[props.color] || "#f0f0f0" }), children, ctx),
    bold: (props, children, ctx) => appendChildren(el("strong"), children, ctx),
    italic: (props, children, ctx) => appendChildren(el("em"), children, ctx),
    code: (props, children, ctx) => appendChildren(el("code", "dil-inline-code"), children, ctx),
    icon: (props) => renderIcon(props),
    divider: (props) => el("hr", "dil-divider", { borderTopColor: BORDER_COLORS[props.color] || BORDER_COLORS.subtle }),
    spacer: (props) => el("div", "dil-spacer", { flex: "1", minHeight: spacing(props.size || 2) }),
    button(props, children, ctx) {
      const button = el("span", `dil-button dil-button-${props.variant || "solid"}`, textStyle(props));
      if (props.block) button.classList.add("dil-button-block");
      if (props.disabled) button.classList.add("dil-button-disabled");
      return appendChildren(button, children, ctx);
    },
    pressable: (props, children, ctx) => appendChildren(el("div", "dil-pressable", layoutStyle(props, "column")), children, ctx),
    "radio-group"(props, children, ctx) {
      const group = el("div", "dil-radio-group", { flexDirection: props.direction === "row" ? "row" : "column" });
      return appendChildren(group, children, { ...ctx, radioValue: props.value });
    },
    radio(props, children, ctx) {
      const option = el("div", "dil-radio");
      const dot = el("span", "dil-radio-dot");
      if (ctx.radioValue != null && props.value === ctx.radioValue) dot.classList.add("dil-radio-dot-on");
      option.appendChild(dot);
      return appendChildren(option, children, ctx);
    },
    checkbox(props, children, ctx) {
      const option = el("div", "dil-radio");
      const box = el("span", "dil-checkbox");
      if (props.checked || props.defaultChecked) box.classList.add("dil-checkbox-on");
      option.appendChild(box);
      return appendChildren(option, children, ctx);
    },
    list(props, children, ctx) {
      const list = el(props.marker === "number" ? "ol" : "ul", "dil-list");
      return appendChildren(list, children, ctx);
    },
    "list-item": (props, children, ctx) => appendChildren(el("li"), children, ctx),
    blockquote: (props, children, ctx) => appendChildren(el("blockquote", "dil-blockquote"), children, ctx),
    table: (props, children, ctx) => appendChildren(el("table", "dil-table"), children, ctx),
    "table-row": (props, children, ctx) => appendChildren(el("tr"), children, ctx),
    "table-cell": (props, children, ctx) => appendChildren(el(props.header ? "th" : "td", "", props.align ? { textAlign: props.align === "end" ? "right" : props.align } : null), children, ctx),
    math: (props) => {
      const span = el("span", "dil-math");
      span.textContent = String(props.value ?? "");
      return span;
    },
    __chatgptClientDefinedWidget: (props, children, ctx) => renderWidget(props, ctx)
  };

  function renderWidget(props, ctx) {
    const widget = ctx.widgets[props.invocationId];
    const data = widget?.data || {};

    if ((widget?.category || data.widget_type) === "writing_block") {
      const card = el("div", "dil-writing");
      const label = el("div", "dil-writing-label");
      label.textContent = "Writing";
      const body = el("div", "dil-writing-body");
      String(data.content || "").split(/\n{2,}/).forEach((paragraph) => {
        if (paragraph.trim()) body.appendChild(renderInlineMarkdown(el("p"), paragraph));
      });
      card.append(label, body);
      return card;
    }

    if (data.content != null) {
      const wrapper = el("div", "dil-code");
      if (data.language) {
        const label = el("div", "dil-code-label");
        label.textContent = String(data.language);
        wrapper.appendChild(label);
      }
      const pre = el("pre");
      pre.textContent = String(data.content);
      wrapper.appendChild(pre);
      return wrapper;
    }

    return null;
  }

  // Writing blocks hold Markdown; only the inline marks they use (bold and
  // code spans) are formatted, everything else stays literal text.
  function renderInlineMarkdown(parent, text) {
    String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/).forEach((part, index) => {
      if (!part) return;
      if (index % 2 && part.startsWith("**")) parent.appendChild(el("strong")).textContent = part.slice(2, -2);
      else if (index % 2) parent.appendChild(el("code", "dil-inline-code")).textContent = part.slice(1, -1);
      else parent.appendChild(document.createTextNode(part));
    });
    return parent;
  }

  function componentResult(ctx, props) {
    const id = props.__resolutionId;
    return id ? ctx.appData?.opGenui?.componentResults?.[id]?.state || null : null;
  }

  function makeComponents(ctx) {
    return {
      Cite(props) {
        const refs = Array.isArray(props.refs) ? props.refs : (props.ref ? [props.ref] : []);
        const sources = refs.map((ref) => ctx.citations[ref]).filter(Boolean);
        if (!sources.length) return null;
        return { type: "__cite", props: { sources }, children: [] };
      },
      MemoryCite: () => null,
      Entity(props) {
        const state = componentResult(ctx, props);
        return { type: "__entity", props: { value: state?.value || props.value || "" }, children: [] };
      },
      Link(props) {
        const state = componentResult(ctx, props);
        const url = state?.url || props.url || "";
        return { type: "__link", props: { url, title: state?.title || props.title || url }, children: props.children || [] };
      },
      AsyncImage(props) {
        const state = componentResult(ctx, props);
        return { type: "__image", props: { query: props.query || "", title: state?.images?.[0]?.title || "", aspectRatio: props.aspectRatio, maxWidth: props.maxWidth }, children: [] };
      },
      WritingBlock(props) {
        return { type: "__writing", props, children: props.children || [] };
      }
    };
  }

  const SPECIAL = {
    __cite(props) {
      const wrap = el("span", "dil-cite-group");
      props.sources.forEach((source) => {
        const chip = el("a", "dil-cite");
        chip.href = source.url;
        chip.textContent = source.label;
        wrap.appendChild(chip);
      });
      return wrap;
    },
    __entity(props) {
      const span = el("span", "dil-entity");
      span.textContent = props.value;
      return span;
    },
    __link(props, children, ctx) {
      // sandbox: links name files in ChatGPT's code sandbox, which the PDF
      // cannot reach, so they render as labelled text without a link target.
      const sandboxFile = /^sandbox:/i.test(props.url) ? props.url.split("/").pop() : "";
      const link = el(sandboxFile ? "span" : "a", sandboxFile ? "dil-link dil-file-link" : "dil-link");
      if (!sandboxFile) link.href = props.url;
      if (flatten(children).some((child) => child != null && child !== false && child !== "")) appendChildren(link, children, ctx);
      else link.textContent = props.title && props.title !== props.url ? props.title : (sandboxFile || props.title);
      if (sandboxFile) link.title = sandboxFile;
      return link;
    },
    __image(props) {
      const frame = el("div", "dil-image", { maxWidth: sizeValue(props.maxWidth) || "100%" });
      if (props.aspectRatio) frame.style.aspectRatio = String(props.aspectRatio).replace(":", " / ");
      const caption = el("span", "dil-image-caption");
      caption.textContent = props.title || props.query || "Image";
      frame.appendChild(caption);
      return frame;
    },
    __writing(props, children, ctx) {
      const card = el("div", "dil-writing");
      const label = el("div", "dil-writing-label");
      label.textContent = "Writing";
      const body = appendChildren(el("div", "dil-writing-body"), children, ctx);
      card.append(label, body);
      return card;
    }
  };

  function renderNode(node, ctx) {
    if (node == null || node === false || node === true) return null;
    if (typeof node === "string" || typeof node === "number") return document.createTextNode(String(node));
    if (Array.isArray(node)) return appendChildren(document.createDocumentFragment(), node, ctx);

    const { type, props = {}, children = [] } = node;
    if (type === Fragment) return appendChildren(document.createDocumentFragment(), children, ctx);
    if (typeof type === "function") return renderNode(type({ ...props, children }), ctx);
    if (SPECIAL[type]) return SPECIAL[type](props, children, ctx);
    if (INTRINSICS[type]) return INTRINSICS[type](props, children, ctx);
    return appendChildren(el("div", `dil-unknown dil-${String(type).replace(/[^a-z0-9-]/gi, "")}`), children, ctx);
  }

  function renderRoot(root, data) {
    let tree = null;
    const ctx = {
      appData: data.appData || {},
      widgets: data.widgets && typeof data.widgets === "object" ? data.widgets : {},
      citations: data.citations || {}
    };
    const components = makeComponents(ctx);
    const DIL = {
      render(element) { tree = element; },
      useState(initial) { return [typeof initial === "function" ? initial() : initial, () => {}]; },
      useConstants() { return data.constants || {}; },
      useAppData(selector) { return typeof selector === "function" ? selector(ctx.appData) : ctx.appData; },
      useMemo(factory) { return factory(); },
      useEffect() {}
    };
    const dil = {
      Fragment,
      jsx(type, props, ...children) {
        const ownChildren = props && "children" in props && !children.length ? [props.children] : children;
        return { type, props: props || {}, children: ownChildren };
      }
    };
    const GenUI = { copy() {}, issueNewTurn() {}, openUrl() {} };
    // The code is ChatGPT's own compiled output for this message; it runs in
    // the PDF page with network access disabled by the page CSP.
    const run = new Function("DIL", "__dil", "GenUI", "Cite", "MemoryCite", "Entity", "Link", "AsyncImage", "WritingBlock", String(data.code || ""));
    run(DIL, dil, GenUI, components.Cite, components.MemoryCite, components.Entity, components.Link, components.AsyncImage, components.WritingBlock);
    if (!tree) throw new Error("DIL code did not render");
    root.appendChild(renderNode(tree, ctx));
  }

  function renderAll() {
    document.querySelectorAll(".dil-root").forEach((root) => {
      const message = root.closest(".dil-message");
      try {
        const data = JSON.parse(root.nextElementSibling?.textContent || "{}");
        renderRoot(root, data);
        root.dataset.rendered = "true";
      } catch (error) {
        root.textContent = "";
        root.dataset.error = String(error && error.message || error);
        message?.classList.add("dil-failed");
      }
    });
    document.querySelectorAll(".dil-message").forEach((message) => {
      const roots = message.querySelectorAll(".dil-root");
      const ok = roots.length && [...roots].every((root) => root.dataset.rendered === "true");
      message.classList.toggle("dil-ok", Boolean(ok));
    });
  }

  window.renderDilRoots = renderAll;
  renderAll();
})();
