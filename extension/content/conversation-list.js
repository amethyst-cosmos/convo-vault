  // Lists conversations for the `list` job, so an agent can be told "all of the Research project"
  // instead of being handed a link per conversation. ChatGPT's list endpoints are not documented
  // and change, so answers are read by shape (an object with an id and a title) rather than by
  // exact field names, and the page's own links are the fallback.
  const LIST_PAGE_SIZE = 100;
  const LIST_MAX_PAGES = 40;
  const LIST_CONVERSATION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const LIST_PROJECT_ID_RE = /g-p-[0-9a-f]{32}/i;

  async function listConversations(request = {}) {
    const limit = Math.max(1, Math.min(Number(request.limit) || 200, 2000));
    const projectQuery = String(request.project || "").trim();
    const accessToken = await getChatGptAccessToken(null, 15000);
    const getJson = createListApiClient(accessToken);
    const notes = [];

    if (!projectQuery) {
      const conversations = await listAccountConversations(getJson, limit).catch((error) => {
        notes.push(`The conversation list API failed (${error.message}); using the links on this page.`);
        return listConversationsFromPageLinks();
      });
      return { source: notes.length ? "page" : "api", project: null, conversations: conversations.slice(0, limit), notes };
    }

    const project = await resolveListProject(getJson, projectQuery, notes);
    let conversations;
    let source = "api";

    try {
      conversations = await listProjectConversations(getJson, project.id, limit);
    } catch (error) {
      notes.push(`The project conversation API failed (${error.message}); using the links on this page.`);
      conversations = listConversationsFromPageLinks();
      source = "page";
    }

    return { source, project, conversations: conversations.slice(0, limit), notes };
  }

  function createListApiClient(accessToken) {
    return async function getJson(path) {
      const response = await fetchWithTimeout(new URL(path, location.origin).href, {
        timeoutMs: 20000,
        credentials: "include",
        cache: "no-store",
        headers: {
          accept: "application/json",
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {})
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.json();
    };
  }

  async function resolveListProject(getJson, query, notes) {
    const idMatch = query.match(LIST_PROJECT_ID_RE);

    if (idMatch) {
      return { id: idMatch[0].toLowerCase(), name: "" };
    }

    let projects = [];

    try {
      projects = findProjectsInJson(await getJson("/backend-api/gizmos/snorlax/sidebar?owned_only=true&conversations_per_gizmo=0"));
    } catch (error) {
      notes.push(`The project list API failed (${error.message}); using the links on this page.`);
    }

    if (!projects.length) {
      projects = listProjectsFromPageLinks();
    }

    const needle = query.toLowerCase();
    const exact = projects.filter((project) => project.name.toLowerCase() === needle);
    const partial = projects.filter((project) => project.name.toLowerCase().includes(needle));
    const picked = exact.length === 1 ? exact : partial;

    if (picked.length === 1) {
      return picked[0];
    }

    const known = projects.map((project) => project.name).filter(Boolean).join(", ") || "none found";
    throw new Error(picked.length > 1
      ? `More than one project matches "${query}": ${picked.map((project) => project.name).join(", ")}.`
      : `No project named "${query}" was found. Projects seen: ${known}.`);
  }

  async function listProjectConversations(getJson, projectId, limit) {
    const found = new Map();
    let cursor = "0";

    for (let page = 0; page < LIST_MAX_PAGES && found.size < limit; page += 1) {
      const json = await getJson(`/backend-api/gizmos/${encodeURIComponent(projectId)}/conversations?cursor=${encodeURIComponent(cursor)}`);
      const items = findConversationsInJson(json);
      items.forEach((item) => found.set(item.id, { ...item, projectId }));
      const next = json && typeof json === "object" && !Array.isArray(json) ? json.cursor : "";

      if (!items.length || !next || String(next) === cursor) {
        break;
      }

      cursor = String(next);
    }

    return sortByUpdated([...found.values()]);
  }

  async function listAccountConversations(getJson, limit) {
    const found = new Map();

    for (let page = 0; page < LIST_MAX_PAGES && found.size < limit; page += 1) {
      const json = await getJson(`/backend-api/conversations?offset=${page * LIST_PAGE_SIZE}&limit=${LIST_PAGE_SIZE}&order=updated`);
      const items = findConversationsInJson(json);
      items.forEach((item) => found.set(item.id, item));

      if (items.length < LIST_PAGE_SIZE) {
        break;
      }
    }

    return sortByUpdated([...found.values()]);
  }

  // Finds every object that looks like a conversation (an id like a UUID plus a title or a time),
  // wherever it sits in the response.
  function findConversationsInJson(json) {
    const found = new Map();

    walkJson(json, (node) => {
      const id = typeof node.id === "string" ? node.id : "";

      if (!LIST_CONVERSATION_ID_RE.test(id) || !("title" in node || "update_time" in node || "create_time" in node)) {
        return;
      }

      if (!found.has(id)) {
        found.set(id, {
          id,
          title: String(node.title || "").replace(/\s+/g, " ").trim(),
          updatedAt: toIsoTime(node.update_time ?? node.create_time),
          projectId: String(node.gizmo_id || node.conversation_template_id || "")
        });
      }
    });

    return [...found.values()];
  }

  function findProjectsInJson(json) {
    const found = new Map();

    walkJson(json, (node) => {
      const id = typeof node.id === "string" ? node.id.match(LIST_PROJECT_ID_RE)?.[0] : "";
      const name = String(node.display?.name || node.name || "").trim();

      if (id && name && !found.has(id)) {
        found.set(id, { id: id.toLowerCase(), name });
      }
    });

    return [...found.values()];
  }

  function walkJson(value, visit, depth = 0) {
    if (!value || typeof value !== "object" || depth > 12) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => walkJson(item, visit, depth + 1));
      return;
    }

    visit(value);
    Object.values(value).forEach((item) => walkJson(item, visit, depth + 1));
  }

  function toIsoTime(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return new Date(value * 1000).toISOString();
    }

    return typeof value === "string" ? value : "";
  }

  function sortByUpdated(conversations) {
    return conversations.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  // The page's own links: what the sidebar or a project page shows, nothing more.
  function listConversationsFromPageLinks() {
    const found = new Map();

    for (const link of document.querySelectorAll('a[href*="/c/"]')) {
      const id = String(link.getAttribute("href") || "").match(/\/c\/([0-9a-f-]{36})/i)?.[1];

      if (id && !found.has(id)) {
        found.set(id, { id, title: String(link.textContent || "").replace(/\s+/g, " ").trim(), updatedAt: "", projectId: "" });
      }
    }

    return [...found.values()];
  }

  function listProjectsFromPageLinks() {
    const found = new Map();

    for (const link of document.querySelectorAll('a[href*="g-p-"]')) {
      const id = String(link.getAttribute("href") || "").match(LIST_PROJECT_ID_RE)?.[0];
      const name = String(link.textContent || "").replace(/\s+/g, " ").trim();

      if (id && name && !found.has(id)) {
        found.set(id, { id: id.toLowerCase(), name });
      }
    }

    return [...found.values()];
  }
