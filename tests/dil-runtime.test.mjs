import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "..");
const runtimeSource = await readFile(path.join(repoRoot, "renderer", "dil-runtime.js"), "utf8");

// Compiled the way ChatGPT ships model_dil_v2.code: a function component at
// the root, constants by index, __dilSafe-wrapped loops, Link with children,
// a citation list from constants, and a client-defined widget.
const PROGRAM = `function __dilSafe(evaluate,failureValue){try{return evaluate()}catch{return failureValue}}

DIL.render(__dil.jsx(()=>{const __dilConstants=DIL.useConstants();const [task,setTask] = DIL.useState("prompt",{key:"task"})
return __dil.jsx(__dil.Fragment,null,
__dil.jsx("text",null,__dilConstants["0"],__dil.jsx("bold",null,__dilConstants["1"]),__dilSafe(()=>(__dil.jsx(Cite,{"refs":__dilConstants["2"]})),null)),
__dil.jsx("title",{"size":"lg"},__dilConstants["3"]),
__dil.jsx("box",{"border":true,"radius":"xl","padding":3,"gap":3},
  __dil.jsx("row",{"align":"center","gap":3},__dil.jsx("icon",{"name":"clipboard-check","size":"2xl"}),__dil.jsx("text",null,__dil.jsx("bold",null,__dilConstants["4"]))),
  __dil.jsx("text",null,__dilSafe(()=>(__dil.jsx(Link,{"url":"sandbox:/mnt/data/plan.md","__resolutionId":__dilConstants["5"]},__dil.jsx("icon",{"name":"download","inline":true,"size":"sm"}),__dilConstants["6"])),null))),
__dil.jsx("box",{"gap":2},__dilSafe(()=>(([{n:"P0",name:"Check"},{n:"P1",name:"Test"}]).map((item,i)=>__dilSafe(()=>(__dil.jsx(__dil.Fragment,null,__dil.jsx("row",null,__dil.jsx("text",null,item.n),__dil.jsx("text",null,item.name)),(__dilSafe(()=>(i<1),false))?__dil.jsx("divider",{"color":"subtle"}):null)),null))),[])),
__dil.jsx("text",null,"Mode: ",task),
__dil.jsx("text",null,__dilSafe(()=>(__dil.jsx(Link,{"url":"https://example.test/docs","__resolutionId":__dilConstants["7"]})),null)),
__dil.jsx("text",null,__dilSafe(()=>(__dil.jsx(Link,{"url":"sandbox:/mnt/data/review.md","__resolutionId":__dilConstants["10"]})),null)),
__dil.jsx("text",null,__dilSafe(()=>(__dil.jsx(Link,{"url":"sandbox:/mnt/data/notes.md","__resolutionId":__dilConstants["11"]})),null)),
(__dilConstants["9"]===null?__dil.jsx("__chatgptClientDefinedWidget",{"key":"cdw:0","invocationId":__dilConstants["8"]}):null)
);},{"key":"body:0"}));`;

const BLOCK = {
  version: 2,
  code: PROGRAM,
  constants: {
    0: "Goal: ",
    1: "one local tool.",
    2: ["turn1search0", "turn1search9"],
    3: "Plan ready",
    4: "1. Codex plan",
    5: "res-link-file",
    6: " Download plan",
    7: "res-link-web",
    8: "inv-1",
    9: null,
    10: "res-link-titled",
    11: "res-link-bare"
  },
  appData: {
    opGenui: {
      componentResults: {
        "res-link-file": { componentName: "Link", state: { url: "sandbox:/mnt/data/plan.md", title: "sandbox:/mnt/data/plan.md" } },
        "res-link-web": { componentName: "Link", state: { url: "https://example.test/docs", title: "Runner docs" } },
        "res-link-titled": { componentName: "Link", state: { url: "sandbox:/mnt/data/review.md", title: "Download review sheet" } },
        "res-link-bare": { componentName: "Link", state: { url: "sandbox:/mnt/data/notes.md", title: "sandbox:/mnt/data/notes.md" } }
      }
    }
  },
  widgets: { "inv-1": { category: "writing_block", data: { content: "Read `plan.md` first.\n\n**Only run P0.**", widget_type: "writing_block" } } },
  citations: { turn1search0: { url: "https://example.test/a", title: "Source A", label: "example.test" } }
};

test("DIL runtime draws a compiled ChatGPT program as static HTML", () => {
  const { message, root } = runRuntime(BLOCK);
  const html = serialize(root);

  assert.ok(message.classList.contains("dil-ok"));
  assert.equal(root.dataset.rendered, "true");
  assert.match(html, /<p class="dil-text">Goal: <strong>one local tool\.<\/strong><span class="dil-cite-group"><a class="dil-cite" href="https:\/\/example\.test\/a">example\.test<\/a><\/span><\/p>/);
  assert.match(html, /<h3 class="dil-title"[^>]*>Plan ready<\/h3>/);
  assert.match(html, /<div class="dil-box dil-card"/);
  // The clipboard-check icon has a real path, not the unknown-icon dot.
  assert.doesNotMatch(html, /<circle/);
  // A sandbox file link keeps its label and gets no unreachable href.
  assert.match(html, /<span class="dil-link dil-file-link" title="plan\.md"><span class="dil-icon dil-icon-inline"[^>]*><svg[\s\S]*?<\/span> Download plan<\/span>/);
  assert.match(html, /<a class="dil-link" href="https:\/\/example\.test\/docs">Runner docs<\/a>/);
  // Without children, a file link shows its resolved title, or the file name
  // when the title only repeats the sandbox URL.
  assert.match(html, /<span class="dil-link dil-file-link" title="review\.md">Download review sheet<\/span>/);
  assert.match(html, /<span class="dil-link dil-file-link" title="notes\.md">notes\.md<\/span>/);
  // Loop items render once each, with the conditional divider between them.
  assert.match(html, /<p class="dil-text">P0<\/p><p class="dil-text">Check<\/p><\/div><hr class="dil-divider"[^>]*>(?:<\/hr>)?<div class="dil-row"[^>]*><p class="dil-text">P1<\/p>/);
  assert.equal((html.match(/dil-divider/g) || []).length, 1);
  assert.match(html, /<p class="dil-text">Mode: prompt<\/p>/);
  assert.match(html, /<div class="dil-writing-body"><p>Read <code class="dil-inline-code">plan\.md<\/code> first\.<\/p><p><strong>Only run P0\.<\/strong><\/p><\/div>/);
});

test("DIL runtime leaves the Markdown fallback visible when a program throws", () => {
  const { message, root } = runRuntime({ ...BLOCK, code: "DIL.render(__dil.jsx(() => { throw new Error('boom'); }))" });

  assert.ok(message.classList.contains("dil-failed"));
  assert.ok(!message.classList.contains("dil-ok"));
  assert.equal(root.dataset.error, "boom");
  assert.equal(root.childNodes.length, 0);
});

function runRuntime(block) {
  const document = new FakeDocument();
  const message = document.createElement("div");
  message.className = "dil-message";
  const root = document.createElement("div");
  root.className = "dil-root";
  const data = document.createElement("script");
  data.textContent = JSON.stringify(block);
  message.append(root, data);
  document.body.appendChild(message);

  const context = vm.createContext({ document, window: {}, Symbol, JSON, Object, Array, String, Number, Boolean, Error });
  vm.runInContext(runtimeSource, context);
  return { message, root };
}

class FakeNode {
  constructor(document, nodeType) {
    this.ownerDocument = document;
    this.nodeType = nodeType;
    this.parentNode = null;
    this.childNodes = [];
  }

  appendChild(child) {
    const nodes = child.nodeType === 11 ? child.childNodes.splice(0) : [child];
    for (const node of nodes) {
      node.parentNode = this;
      this.childNodes.push(node);
    }
    return child;
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  get textContent() {
    return this.childNodes.map((child) => child.textContent).join("");
  }

  set textContent(value) {
    this.childNodes = [];
    this.rawHtml = "";
    if (value !== "") this.appendChild(this.ownerDocument.createTextNode(value));
  }
}

class FakeText extends FakeNode {
  constructor(document, text) {
    super(document, 3);
    this.text = String(text);
  }

  get textContent() {
    return this.text;
  }
}

class FakeElement extends FakeNode {
  constructor(document, tagName) {
    super(document, 1);
    this.tagName = tagName;
    this.className = "";
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.rawHtml = "";
    const element = this;
    this.classList = {
      add: (name) => { if (!element.classList.contains(name)) element.className = `${element.className} ${name}`.trim(); },
      contains: (name) => element.className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const names = element.className.split(/\s+/).filter((item) => item && item !== name);
        if (force) names.push(name);
        element.className = names.join(" ");
      }
    };
  }

  set href(value) { this.attributes.href = value; }
  set title(value) { this.attributes.title = value; }
  set innerHTML(value) { this.childNodes = []; this.rawHtml = value; }

  get nextElementSibling() {
    const siblings = this.parentNode?.childNodes.filter((node) => node.nodeType === 1) || [];
    return siblings[siblings.indexOf(this) + 1] || null;
  }

  closest(selector) {
    for (let node = this; node; node = node.parentNode) {
      if (node.classList?.contains(selector.slice(1))) return node;
    }
    return null;
  }

  querySelectorAll(selector) {
    const found = [];
    const visit = (node) => node.childNodes.forEach((child) => {
      if (child.nodeType === 1 && child.classList.contains(selector.slice(1))) found.push(child);
      if (child.childNodes) visit(child);
    });
    visit(this);
    return found;
  }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement(this, "body");
  }

  createElement(tagName) { return new FakeElement(this, tagName); }
  createTextNode(text) { return new FakeText(this, text); }
  createDocumentFragment() { return new FakeNode(this, 11); }
  querySelectorAll(selector) { return this.body.querySelectorAll(selector); }
}

function serialize(node) {
  if (node.nodeType === 3) return node.text;
  const inner = node.rawHtml || node.childNodes.map(serialize).join("");
  if (node.nodeType !== 1) return inner;
  const attrs = [
    node.className ? ` class="${node.className}"` : "",
    ...Object.entries(node.attributes).map(([name, value]) => ` ${name}="${value}"`),
    Object.keys(node.style).length ? ` style="${Object.entries(node.style).map(([name, value]) => `${name}:${value}`).join(";")}"` : ""
  ].join("");
  return `<${node.tagName}${attrs}>${inner}</${node.tagName}>`;
}
