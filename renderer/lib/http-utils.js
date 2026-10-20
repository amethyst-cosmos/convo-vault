const crypto = require("crypto");
const { LOCAL_API_TOKEN, LOCAL_API_TOKEN_HEADER, MAX_BODY_BYTES, PORT } = require("./config");

// A request from a program on this machine, not from a web page: browsers always
// label their requests with an Origin or Sec-Fetch-Site header, plain HTTP clients
// do not. The Host check blocks DNS-rebinding pages.
function isLocalProcessRequest(request) {
  if (request.headers.origin || request.headers["sec-fetch-site"]) {
    return false;
  }
  const host = String(request.headers.host || "").toLowerCase();
  return host === `127.0.0.1:${PORT}` || host === `localhost:${PORT}`;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    request.on("data", (chunk) => {
      total += chunk.length;

      if (total > MAX_BODY_BYTES) {
        reject(new Error(`Request body is too large. Limit is ${MAX_BODY_BYTES} bytes.`));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error(`Invalid JSON body: ${error.message || error}`));
      }
    });

    request.on("error", reject);
  });
}

function setCorsHeaders(request, response) {
  const origin = request.headers.origin || "*";
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Convo-Vault-Token, x-convo-vault-token, Authorization, authorization, *");
  response.setHeader("Access-Control-Allow-Private-Network", "true");
  response.setHeader("Access-Control-Max-Age", "86400");
  response.setHeader("Access-Control-Expose-Headers", [
    "Content-Disposition",
    "X-PDF-Engine",
    "X-Markdown-Engine",
    "X-Data-Engine",
    "X-Renderer-HTML",
    "X-Data-Dir",
    "X-Data-Files",
    "X-Page-Count",
    "X-Capture-Warning",
    "X-Asset-Count",
    "X-Bundle-Timings"
  ].join(", "));
}

function isLocalApiAuthorized(request) {
  if (!LOCAL_API_TOKEN) {
    const origin = String(request.headers.origin || "").toLowerCase();
    if (!origin) return true;
    return (
      origin === "https://chatgpt.com"
      || origin === "https://gemini.google.com"
      || origin.startsWith("chrome-extension://")
      || origin.startsWith("moz-extension://")
      || origin === "http://localhost:38474"
      || origin === "http://127.0.0.1:38474"
    );
  }

  const providedToken = String(request.headers[LOCAL_API_TOKEN_HEADER] || "").trim();
  return timingSafeEqualText(providedToken, LOCAL_API_TOKEN);
}

function timingSafeEqualText(left, right) {
  const leftBytes = Buffer.from(String(left || ""), "utf8");
  const rightBytes = Buffer.from(String(right || ""), "utf8");

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBytes, rightBytes);
}

function sendJson(response, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length
  });
  response.end(body);
}

function makeContentDisposition(filename) {
  const fallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

module.exports = {
  isLocalApiAuthorized,
  isLocalProcessRequest,
  makeContentDisposition,
  readJsonBody,
  sendJson,
  setCorsHeaders
};
