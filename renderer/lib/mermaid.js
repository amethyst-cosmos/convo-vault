const { escapeHtml, escapeSvgText } = require("./util.js");

function renderMermaidDiagram(source) {
  const diagramType = getMermaidDiagramType(source);

  if (diagramType === "sequencediagram") {
    const sequence = parseMermaidSequence(source);
    if (sequence) {
      return `<figure class="mermaid-card">${renderMermaidTitle("Mermaid Sequence")}<div class="mermaid-stage">${renderSequenceSvg(sequence)}</div></figure>`;
    }
  }

  if (diagramType === "erdiagram") {
    const erDiagram = parseMermaidErDiagram(source);
    if (erDiagram) {
      return `<figure class="mermaid-card">${renderMermaidTitle("Mermaid ER Diagram")}<div class="mermaid-stage">${renderErSvg(erDiagram)}</div></figure>`;
    }
  }

  if (diagramType === "statediagram" || diagramType === "statediagram-v2") {
    const stateDiagram = parseMermaidStateDiagram(source);
    if (stateDiagram) {
      return `<figure class="mermaid-card">${renderMermaidTitle("Mermaid State Diagram")}<div class="mermaid-stage">${renderStateSvg(stateDiagram)}</div></figure>`;
    }
  }

  const graph = parseMermaidFlowchart(source);

  if (!graph) {
    return renderUnsupportedMermaidDiagram(source, diagramType);
  }

  return `<figure class="mermaid-card">${renderMermaidTitle("Mermaid")}<div class="mermaid-stage">${renderFlowchartSvg(graph)}</div></figure>`;
}

function renderMermaidTitle(label = "Mermaid") {
  return `<figcaption class="mermaid-title">${escapeHtml(label)}</figcaption>`;
}

function renderUnsupportedMermaidDiagram(source, diagramType = "") {
  const label = diagramType ? `Mermaid ${diagramType} (source preserved)` : "Mermaid (source preserved)";
  return `<figure class="mermaid-card mermaid-unsupported">
    ${renderMermaidTitle(label)}
    <div class="diagram-degraded-note">This diagram type is preserved as source text in the PDF.</div>
    <pre class="hljs mermaid-fallback"><code>${escapeHtml(source)}</code></pre>
  </figure>`;
}

function getMermaidDiagramType(source) {
  const firstLine = String(source || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("%%")) || "";
  const match = firstLine.match(/^([A-Za-z][A-Za-z0-9_-]*)/);
  return String(match?.[1] || "").toLowerCase();
}

function parseMermaidFlowchart(source) {
  const lines = String(source || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("%%"));
  const header = lines.shift() || "";
  const headerMatch = header.match(/^(?:flowchart|graph)\s+(LR|RL|TB|TD|BT)\b/i);

  if (!headerMatch) {
    return null;
  }

  const graph = {
    direction: headerMatch[1].toUpperCase(),
    groups: [],
    nodes: new Map(),
    edges: []
  };
  let currentGroup = "";

  for (const rawLine of lines) {
    const line = rawLine.replace(/;$/g, "").trim();

    if (!line) {
      continue;
    }

    const subgraphMatch = line.match(/^subgraph\s+(.+)$/i);
    if (subgraphMatch) {
      currentGroup = cleanMermaidLabel(subgraphMatch[1]);
      ensureMermaidGroup(graph, currentGroup);
      continue;
    }

    if (/^end$/i.test(line)) {
      currentGroup = "";
      continue;
    }

    const edgeMatch = line.match(/^(.+?)\s*-{1,2}>\s*(?:\|([^|]+)\|\s*)?(.+)$/);
    if (edgeMatch) {
      const sourceNode = ensureMermaidNode(graph, edgeMatch[1], currentGroup);
      const targetNode = ensureMermaidNode(graph, edgeMatch[3], currentGroup);
      if (sourceNode && targetNode) {
        graph.edges.push({
          source: sourceNode.id,
          target: targetNode.id,
          label: cleanMermaidLabel(edgeMatch[2] || "")
        });
      }
      continue;
    }

    ensureMermaidNode(graph, line, currentGroup);
  }

  return graph.nodes.size ? graph : null;
}

function parseMermaidSequence(source) {
  const lines = String(source || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("%%"));

  if (!/^sequenceDiagram\b/i.test(lines.shift() || "")) {
    return null;
  }

  const participants = new Map();
  const events = [];

  for (const line of lines) {
    const participant = line.match(/^(?:participant|actor)\s+([A-Za-z][\w-]*)(?:\s+as\s+(.+))?$/i);
    if (participant) {
      ensureSequenceParticipant(participants, participant[1], participant[2] || participant[1]);
      continue;
    }

    const note = line.match(/^Note\s+(?:over|left of|right of)\s+([A-Za-z][\w-]*(?:\s*,\s*[A-Za-z][\w-]*)*)\s*:\s*(.+)$/i);
    if (note) {
      const ids = note[1].split(/\s*,\s*/).filter(Boolean);
      ids.forEach((id) => ensureSequenceParticipant(participants, id, id));
      events.push({
        kind: "note",
        participants: ids,
        text: cleanMermaidLabel(note[2])
      });
      continue;
    }

    const message = line.match(/^([A-Za-z][\w-]*)\s*(?:-{1,2}|={1,2})(?:>>|>|x)?\s*([A-Za-z][\w-]*)\s*:\s*(.+)$/);
    if (message) {
      ensureSequenceParticipant(participants, message[1], message[1]);
      ensureSequenceParticipant(participants, message[2], message[2]);
      events.push({
        kind: "message",
        from: message[1],
        to: message[2],
        text: cleanMermaidLabel(message[3])
      });
    }
  }

  return participants.size && events.length ? {
    participants: [...participants.values()],
    events
  } : null;
}

function ensureSequenceParticipant(participants, id, label) {
  if (!participants.has(id)) {
    participants.set(id, {
      id,
      label: cleanMermaidLabel(label || id)
    });
  }

  return participants.get(id);
}

function renderSequenceSvg(sequence) {
  const participantWidth = 150;
  const participantGap = 28;
  const top = 22;
  const headerHeight = 34;
  const eventGap = 48;
  const left = 12;
  const width = Math.max(430, sequence.participants.length * participantWidth + Math.max(0, sequence.participants.length - 1) * participantGap + left * 2);
  const height = top + headerHeight + 34 + sequence.events.length * eventGap + 24;
  const positions = new Map();

  sequence.participants.forEach((participant, index) => {
    const x = left + participantWidth / 2 + index * (participantWidth + participantGap);
    positions.set(participant.id, x);
  });

  const participantBoxes = sequence.participants.map((participant) => {
    const x = positions.get(participant.id);
    return `<g class="sequence-participant">
      <rect x="${x - participantWidth / 2}" y="${top}" width="${participantWidth}" height="${headerHeight}" rx="7"></rect>
      <text x="${x}" y="${top + 22}" text-anchor="middle">${escapeSvgText(participant.label)}</text>
      <line x1="${x}" y1="${top + headerHeight}" x2="${x}" y2="${height - 18}"></line>
    </g>`;
  }).join("");

  const events = sequence.events.map((event, index) => {
    const y = top + headerHeight + 34 + index * eventGap;

    if (event.kind === "note") {
      const xs = event.participants.map((id) => positions.get(id)).filter((value) => Number.isFinite(value));
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const boxX = Math.max(left, minX - 58);
      const boxWidth = Math.min(width - boxX - left, Math.max(130, maxX - minX + 116));
      return `<g class="sequence-note">
        <rect x="${boxX}" y="${y - 16}" width="${boxWidth}" height="30" rx="6"></rect>
        <text x="${boxX + boxWidth / 2}" y="${y + 4}" text-anchor="middle">${escapeSvgText(event.text)}</text>
      </g>`;
    }

    const fromX = positions.get(event.from);
    const toX = positions.get(event.to);
    if (!Number.isFinite(fromX) || !Number.isFinite(toX)) {
      return "";
    }

    const direction = fromX <= toX ? 1 : -1;
    const labelX = (fromX + toX) / 2;
    return `<g class="sequence-message">
      <line x1="${fromX}" y1="${y}" x2="${toX - direction * 8}" y2="${y}" marker-end="url(#sequence-arrow)"></line>
      <text x="${labelX}" y="${y - 7}" text-anchor="middle">${escapeSvgText(event.text)}</text>
    </g>`;
  }).join("");

  return `<svg class="sequence-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mermaid sequence diagram" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="sequence-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
        <path d="M 0 0 L 8 4 L 0 8 z" fill="#64748b"></path>
      </marker>
    </defs>
    ${participantBoxes}
    ${events}
  </svg>`;
}

function parseMermaidErDiagram(source) {
  const lines = String(source || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("%%"));

  if (!/^erDiagram\b/i.test(lines.shift() || "")) {
    return null;
  }

  const entities = new Map();
  const relationships = [];
  let currentEntity = "";

  for (const line of lines) {
    const entityStart = line.match(/^([A-Za-z][\w-]*)\s*\{$/);
    if (entityStart) {
      currentEntity = entityStart[1];
      ensureErEntity(entities, currentEntity);
      continue;
    }

    if (line === "}") {
      currentEntity = "";
      continue;
    }

    if (currentEntity) {
      const entity = ensureErEntity(entities, currentEntity);
      entity.attributes.push(cleanMermaidLabel(line));
      continue;
    }

    const relationship = line.match(/^([A-Za-z][\w-]*)\s+([|o}{]+)--([|o}{]+)\s+([A-Za-z][\w-]*)\s*:?\s*(.*)$/);
    if (relationship) {
      const from = ensureErEntity(entities, relationship[1]);
      const to = ensureErEntity(entities, relationship[4]);
      relationships.push({
        from: from.id,
        to: to.id,
        leftCardinality: relationship[2],
        rightCardinality: relationship[3],
        label: cleanMermaidLabel(relationship[5] || "")
      });
    }
  }

  return entities.size ? {
    entities: [...entities.values()],
    relationships
  } : null;
}

function ensureErEntity(entities, id) {
  if (!entities.has(id)) {
    entities.set(id, {
      id,
      label: cleanMermaidLabel(id.replace(/_/g, " ")),
      attributes: []
    });
  }

  return entities.get(id);
}

function renderErSvg(diagram) {
  const columnWidth = 180;
  const rowHeight = 102;
  const gapX = 48;
  const gapY = 22;
  const cols = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(diagram.entities.length))));
  const rows = Math.ceil(diagram.entities.length / cols);
  const width = cols * columnWidth + Math.max(0, cols - 1) * gapX + 24;
  const height = rows * rowHeight + Math.max(0, rows - 1) * gapY + 24;
  const positions = new Map();

  diagram.entities.forEach((entity, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = 12 + col * (columnWidth + gapX);
    const y = 12 + row * (rowHeight + gapY);
    positions.set(entity.id, {
      x,
      y,
      width: columnWidth,
      height: rowHeight
    });
  });

  const relationships = diagram.relationships.map((relationship) => {
    const from = positions.get(relationship.from);
    const to = positions.get(relationship.to);
    if (!from || !to) return "";

    const fromX = from.x + from.width / 2;
    const fromY = from.y + from.height / 2;
    const toX = to.x + to.width / 2;
    const toY = to.y + to.height / 2;
    const labelX = (fromX + toX) / 2;
    const labelY = (fromY + toY) / 2 - 5;
    const label = [
      relationship.leftCardinality,
      relationship.label,
      relationship.rightCardinality
    ].filter(Boolean).join(" ");

    return `<g class="er-relationship">
      <path d="M ${fromX} ${fromY} C ${labelX} ${fromY}, ${labelX} ${toY}, ${toX} ${toY}"></path>
      ${label ? `<text x="${labelX}" y="${labelY}" text-anchor="middle">${escapeSvgText(label)}</text>` : ""}
    </g>`;
  }).join("");

  const entities = diagram.entities.map((entity) => {
    const box = positions.get(entity.id);
    const attributes = entity.attributes.slice(0, 4).map((attribute, index) => (
      `<text class="er-attribute" x="${box.x + 12}" y="${box.y + 48 + index * 13}">${escapeSvgText(attribute)}</text>`
    )).join("");
    return `<g class="er-entity">
      <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="7"></rect>
      <line x1="${box.x}" y1="${box.y + 33}" x2="${box.x + box.width}" y2="${box.y + 33}"></line>
      <text class="er-title" x="${box.x + box.width / 2}" y="${box.y + 22}" text-anchor="middle">${escapeSvgText(entity.label)}</text>
      ${attributes}
    </g>`;
  }).join("");

  return `<svg class="er-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mermaid ER diagram" xmlns="http://www.w3.org/2000/svg">
    ${relationships}
    ${entities}
  </svg>`;
}

function parseMermaidStateDiagram(source) {
  const lines = String(source || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("%%"));
  const header = lines.shift() || "";

  if (!/^stateDiagram(?:-v2)?\b/i.test(header)) {
    return null;
  }

  const states = new Map();
  const transitions = [];

  for (const line of lines) {
    const alias = line.match(/^state\s+"([^"]+)"\s+as\s+([A-Za-z][\w-]*)$/i);
    if (alias) {
      ensureStateNode(states, alias[2], alias[1]);
      continue;
    }

    const transition = line.match(/^(\[\*\]|[A-Za-z][\w-]*)\s*-->\s*(\[\*\]|[A-Za-z][\w-]*)(?:\s*:\s*(.+))?$/);
    if (transition) {
      const from = ensureStateNode(
        states,
        transition[1] === "[*]" ? "__start" : transition[1],
        transition[1],
        transition[1] === "[*]" ? "start" : ""
      );
      const to = ensureStateNode(
        states,
        transition[2] === "[*]" ? "__end" : transition[2],
        transition[2],
        transition[2] === "[*]" ? "end" : ""
      );
      transitions.push({
        from: from.id,
        to: to.id,
        label: cleanMermaidLabel(transition[3] || "")
      });
      continue;
    }

    const plain = line.match(/^state\s+([A-Za-z][\w-]*)$/i) || line.match(/^([A-Za-z][\w-]*)$/);
    if (plain) {
      ensureStateNode(states, plain[1], plain[1]);
    }
  }

  return states.size ? {
    states: [...states.values()],
    transitions
  } : null;
}

function ensureStateNode(states, id, label, terminalKind = "") {
  const normalized = id === "[*]" ? "state-terminal" : id;
  if (!states.has(normalized)) {
    states.set(normalized, {
      id: normalized,
      rawId: id,
      label: label === "[*]" ? "" : cleanMermaidLabel(label || id),
      terminal: label === "[*]" || Boolean(terminalKind),
      terminalKind
    });
  }

  return states.get(normalized);
}

function renderStateSvg(diagram) {
  const nodeWidth = 132;
  const nodeHeight = 48;
  const gapX = 54;
  const gapY = 38;
  const cols = diagram.states.length <= 5
    ? diagram.states.length
    : Math.min(3, Math.max(1, Math.ceil(Math.sqrt(diagram.states.length))));
  const rows = Math.ceil(diagram.states.length / cols);
  const width = cols * nodeWidth + Math.max(0, cols - 1) * gapX + 32;
  const height = rows * nodeHeight + Math.max(0, rows - 1) * gapY + 32;
  const positions = new Map();

  diagram.states.forEach((state, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    positions.set(state.id, {
      x: 16 + col * (nodeWidth + gapX),
      y: 16 + row * (nodeHeight + gapY),
      width: nodeWidth,
      height: nodeHeight
    });
  });

  const transitions = diagram.transitions.map((transition) => {
    const from = positions.get(transition.from);
    const to = positions.get(transition.to);
    if (!from || !to) return "";

    const fromCenterX = from.x + from.width / 2;
    const toCenterX = to.x + to.width / 2;
    const leftToRight = toCenterX >= fromCenterX;
    const fromX = leftToRight ? from.x + from.width : from.x;
    const fromY = from.y + from.height / 2;
    const toX = leftToRight ? to.x : to.x + to.width;
    const toY = to.y + to.height / 2;
    const sameColumn = Math.abs(from.x - to.x) < 4;
    const sx = sameColumn ? from.x + from.width / 2 : fromX;
    const sy = sameColumn ? from.y + from.height : fromY;
    const tx = sameColumn ? to.x + to.width / 2 : toX;
    const ty = sameColumn ? to.y : toY;
    const curve = sameColumn ? 28 : Math.max(28, Math.abs(tx - sx) / 2);
    const path = sameColumn
      ? `M ${sx} ${sy} C ${sx} ${sy + curve}, ${tx} ${ty - curve}, ${tx} ${ty}`
      : `M ${sx} ${sy} C ${sx + curve} ${sy}, ${tx - curve} ${ty}, ${tx} ${ty}`;
    const labelX = (sx + tx) / 2;
    const labelY = (sy + ty) / 2 - 7;

    return `<g class="state-transition">
      <path d="${path}" marker-end="url(#state-arrow)"></path>
      ${transition.label ? `<text x="${labelX}" y="${labelY}" text-anchor="middle">${escapeSvgText(transition.label)}</text>` : ""}
    </g>`;
  }).join("");

  const states = diagram.states.map((state) => {
    const box = positions.get(state.id);
    if (state.terminal) {
      return `<g class="state-node state-terminal">
        <circle cx="${box.x + box.width / 2}" cy="${box.y + box.height / 2}" r="12"></circle>
      </g>`;
    }
    return `<g class="state-node">
      <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="20"></rect>
      <text x="${box.x + box.width / 2}" y="${box.y + 30}" text-anchor="middle">${escapeSvgText(state.label)}</text>
    </g>`;
  }).join("");

  return `<svg class="state-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mermaid state diagram" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="state-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
        <path d="M 0 0 L 8 4 L 0 8 z" fill="#64748b"></path>
      </marker>
    </defs>
    ${transitions}
    ${states}
  </svg>`;
}

function ensureMermaidGroup(graph, name) {
  const groupName = name || "Diagram";
  let group = graph.groups.find((item) => item.name === groupName);

  if (!group) {
    group = {
      name: groupName,
      nodes: []
    };
    graph.groups.push(group);
  }

  return group;
}

function ensureMermaidNode(graph, token, groupName = "") {
  const parsed = parseMermaidNodeToken(token);

  if (!parsed?.id) {
    return null;
  }

  let node = graph.nodes.get(parsed.id);

  if (!node) {
    node = {
      ...parsed,
      group: groupName || "Diagram"
    };
    graph.nodes.set(node.id, node);
  } else if (parsed.label && parsed.label !== parsed.id) {
    node.label = parsed.label;
    node.shape = parsed.shape || node.shape;
  }

  if (groupName && node.group === "Diagram") {
    node.group = groupName;
  }

  const group = ensureMermaidGroup(graph, node.group);
  if (!group.nodes.includes(node.id)) {
    group.nodes.push(node.id);
  }

  return node;
}

function parseMermaidNodeToken(token) {
  const value = String(token || "").trim().replace(/;$/g, "");
  const idMatch = value.match(/^([A-Za-z][\w-]*)/);

  if (!idMatch) {
    return null;
  }

  const id = idMatch[1];
  const rest = value.slice(id.length).trim();
  let label = id;
  let shape = "rect";
  let labelMatch = rest.match(/^\[\(([\s\S]+)\)\]$/);

  if (labelMatch) {
    label = labelMatch[1];
    shape = "database";
  } else {
    labelMatch = rest.match(/^\[([\s\S]+)\]$/);
    if (labelMatch) {
      label = labelMatch[1];
    } else {
      labelMatch = rest.match(/^\(\(([\s\S]+)\)\)$/);
      if (labelMatch) {
        label = labelMatch[1];
        shape = "circle";
      } else {
        labelMatch = rest.match(/^\(([\s\S]+)\)$/);
        if (labelMatch) {
          label = labelMatch[1];
          shape = "round";
        }
      }
    }
  }

  return {
    id,
    label: cleanMermaidLabel(label),
    shape
  };
}

function renderFlowchartSvg(graph) {
  const layout = layoutMermaidFlowchart(graph);
  const arrows = graph.edges.map((edge, index) => renderMermaidEdge(edge, layout, index)).join("");
  const groups = layout.groups.map(renderMermaidGroup).join("");
  const nodes = layout.nodes.map(renderMermaidNode).join("");

  return `<svg class="mermaid-svg" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="Mermaid flowchart" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="${layout.markerId}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
        <path d="M 0 0 L 8 4 L 0 8 z" fill="#64748b"></path>
      </marker>
    </defs>
    ${groups}
    <g class="mermaid-edges">${arrows}</g>
    <g class="mermaid-nodes">${nodes}</g>
  </svg>`;
}

function layoutMermaidFlowchart(graph) {
  const horizontal = !["TB", "TD", "BT"].includes(graph.direction);
  const groupWidth = 158;
  const groupGap = 50;
  const nodeWidth = 122;
  const nodeHeight = 46;
  const nodeGap = 14;
  const groupPaddingX = 18;
  const groupHeader = 24;
  const bottomPadding = 16;
  const groupHeights = graph.groups.map((group) => {
    const nodeCount = Math.max(1, group.nodes.length);
    return groupHeader + bottomPadding + nodeCount * nodeHeight + (nodeCount - 1) * nodeGap;
  });
  const groupHeight = Math.max(104, ...groupHeights);
  const layout = {
    width: horizontal
      ? graph.groups.length * groupWidth + Math.max(0, graph.groups.length - 1) * groupGap
      : groupWidth,
    height: horizontal
      ? groupHeight
      : graph.groups.length * groupHeight + Math.max(0, graph.groups.length - 1) * groupGap,
    markerId: `arrow-${graph.direction.toLowerCase()}-${graph.groups.length}-${graph.nodes.size}`,
    groups: [],
    nodes: []
  };
  const positions = new Map();

  graph.groups.forEach((group, groupIndex) => {
    const groupX = horizontal ? groupIndex * (groupWidth + groupGap) : 0;
    const groupY = horizontal ? 0 : groupIndex * (groupHeight + groupGap);
    layout.groups.push({
      name: group.name,
      x: groupX,
      y: groupY,
      width: groupWidth,
      height: groupHeight
    });

    const totalNodeHeight = group.nodes.length * nodeHeight + Math.max(0, group.nodes.length - 1) * nodeGap;
    const startY = groupY + groupHeader + Math.max(0, (groupHeight - groupHeader - bottomPadding - totalNodeHeight) / 2);

    group.nodes.forEach((nodeId, nodeIndex) => {
      const node = graph.nodes.get(nodeId);
      const positioned = {
        ...node,
        x: groupX + groupPaddingX,
        y: startY + nodeIndex * (nodeHeight + nodeGap),
        width: nodeWidth,
        height: nodeHeight
      };
      positions.set(nodeId, positioned);
      layout.nodes.push(positioned);
    });
  });

  layout.positions = positions;
  return layout;
}

function renderMermaidGroup(group) {
  return `<g class="mermaid-group">
    <rect x="${group.x + 0.5}" y="${group.y + 0.5}" width="${group.width - 1}" height="${group.height - 1}" rx="4"></rect>
    <text x="${group.x + group.width / 2}" y="${group.y + 15}" text-anchor="middle">${escapeSvgText(group.name)}</text>
  </g>`;
}

function renderMermaidNode(node) {
  const lines = wrapMermaidLabel(node.label);
  const textY = node.y + node.height / 2 - ((lines.length - 1) * 7);
  const rect = node.shape === "circle"
    ? `<ellipse cx="${node.x + node.width / 2}" cy="${node.y + node.height / 2}" rx="${node.width / 2}" ry="${node.height / 2}"></ellipse>`
    : `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${node.shape === "database" ? 18 : 4}"></rect>`;
  const text = lines.map((line, index) => (
    `<tspan x="${node.x + node.width / 2}" dy="${index === 0 ? 0 : 14}">${escapeSvgText(line)}</tspan>`
  )).join("");

  return `<g class="mermaid-node">${rect}<text x="${node.x + node.width / 2}" y="${textY}" text-anchor="middle">${text}</text></g>`;
}

function renderMermaidEdge(edge, layout, index) {
  const source = layout.positions.get(edge.source);
  const target = layout.positions.get(edge.target);

  if (!source || !target) {
    return "";
  }

  const sameColumn = Math.abs(source.x - target.x) < 4;
  const sx = sameColumn ? source.x + source.width / 2 : source.x + source.width;
  const sy = sameColumn ? source.y + source.height : source.y + source.height / 2;
  const tx = sameColumn ? target.x + target.width / 2 : target.x;
  const ty = sameColumn ? target.y : target.y + target.height / 2;
  const curve = sameColumn ? Math.max(18, Math.abs(ty - sy) / 2) : Math.max(30, Math.abs(tx - sx) / 2);
  const path = sameColumn
    ? `M ${sx} ${sy} C ${sx} ${sy + curve}, ${tx} ${ty - curve}, ${tx} ${ty}`
    : `M ${sx} ${sy} C ${sx + curve} ${sy}, ${tx - curve} ${ty}, ${tx} ${ty}`;
  const labelX = sameColumn ? sx + source.width / 2 + 8 : (sx + tx) / 2;
  const labelY = sameColumn ? (sy + ty) / 2 : (sy + ty) / 2 - 6 - (index % 2) * 6;
  const label = edge.label
    ? `<text class="mermaid-edge-label" x="${labelX}" y="${labelY}" text-anchor="middle">${escapeSvgText(edge.label)}</text>`
    : "";

  return `<g class="mermaid-edge"><path d="${path}" marker-end="url(#${layout.markerId})"></path>${label}</g>`;
}

function wrapMermaidLabel(label) {
  const lines = String(label || "")
    .replace(/\\n/g, "\n")
    .split("\n")
    .flatMap((line) => wrapMermaidTextLine(line.trim(), 17))
    .filter(Boolean);
  return lines.length ? lines.slice(0, 4) : [""];
}

function wrapMermaidTextLine(line, maxChars) {
  if (line.length <= maxChars) {
    return [line];
  }

  const chunks = [];
  let cursor = 0;
  while (cursor < line.length) {
    chunks.push(line.slice(cursor, cursor + maxChars));
    cursor += maxChars;
  }
  return chunks;
}

function cleanMermaidLabel(label) {
  return String(label || "")
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

module.exports = {
  renderMermaidDiagram
};
