# Export Fixture Library

This folder is the regression sample library for Convo Vault exports. Each
fixture should explain what risk it protects, what output must be preserved, and
which layer owns a failure.

## Current Contract

Every fixture is registered in `export-regression-cases.json` with:

- `purpose`: why this sample exists.
- `coverage`: stable tags for the behavior it protects.
- `expectedLang`: the expected document language after normalization. Use `und`
  when the source has no explicit language metadata. Decision-path label
  locale is separate and does not set the document language.
- `expectedCounts`: message, role, QA-pair, code-block, and table counts.
- `expectedOutputObjects`: optional object counts for non-plain-text content
  such as formulas, diagrams, media, file references, citations, and
  interactive cards.
- `mustContain`: source text that must survive export.
- `mustRenderContain`: rendered HTML/PDF markers that should be present after
  the advanced renderer handles or degrades the content.
- `mustNotContain`: corruption markers or accidental stringified values that
  should never appear.

The fixture tests check three layers:

- Source contract: the manifest must match the payload, so a broken sample is
  caught before renderer output is blamed.
- Renderer contract: the advanced PDF HTML output must preserve language,
  fallback fonts, `dir="auto"`, and fixture text.
- Backend contract: the Markdown and data builders preserve the fixture text,
  and `/prepare-render-bundle` packages those sidecars in the ZIP.

## Failure Attribution

- Manifest self-consistency failure: the fixture definition is wrong or stale.
- HTML renderer failure: PDF layout/rendering likely changed.
- Markdown endpoint failure: text export or Markdown compaction likely changed.
- Data endpoint failure: sidecar structure, language metadata, or count logic
  likely changed.
- Output-object failure: PDF/JSON classification drifted, or a degraded content
  policy changed without updating the fixture contract.

## Next Samples To Add

- More math formulas, including multiline align-style LaTeX.
- Footnotes and citation-style references.
- Dense code blocks with long lines and syntax labels.
- Local embedded image assets and generated image galleries.
- Real animated GIF/video messages, represented by poster frame plus source
  link.
- More Mermaid diagrams and generated visual blocks.
