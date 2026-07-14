export type InlineNode =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; children: InlineNode[] }
  | { kind: 'italic'; children: InlineNode[] }
  | { kind: 'code'; value: string }
  | { kind: 'link'; href: string; children: InlineNode[] }

export type FlowStep =
  | { type: 'node'; content: InlineNode[]; id?: string; loopTo?: string; bottom?: boolean; process?: boolean }
  | { type: 'arrow'; label: InlineNode[]; direction: 'down' | 'up'; to?: string }
  | { type: 'side-node'; content: InlineNode[]; id?: string; top?: boolean; pair?: boolean; table?: boolean }
  | { type: 'edge'; from: string; to: string; style: 'single' | 'double' }

export type BlockNode =
  | { kind: 'heading'; level: number; children: InlineNode[]; id: string }
  | { kind: 'paragraph'; children: InlineNode[] }
  | { kind: 'list'; ordered: boolean; items: InlineNode[][] }
  | { kind: 'hr' }
  | { kind: 'codeblock'; value: string }
  | { kind: 'flow'; steps: FlowStep[] }

export type LeafBlockNode = Exclude<BlockNode, { kind: 'heading' }>

export type Section = {
  level: number
  heading: InlineNode[]
  id: string
  content: LeafBlockNode[]
  subsections: Section[]
}

export type SectionTree = {
  preamble: LeafBlockNode[]
  sections: Section[]
}

//----------------------------------------------------------------------------------
//  plainText — flattens inline nodes to their raw text, ignoring markup, for slugifying
//  (also used by renderers that want an unstyled label, e.g. a tab bar)
//----------------------------------------------------------------------------------
export function plainText(nodes: InlineNode[]): string {
  let text = ''
  for (const node of nodes) {
    if (node.kind === 'text' || node.kind === 'code') {
      text += node.value
    } else {
      text += plainText(node.children)
    }
  }
  return text
}

//----------------------------------------------------------------------------------
//  slugify — lowercase, non-alphanumeric runs collapsed to single hyphens, trimmed
//----------------------------------------------------------------------------------
function slugify(text: string): string {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug
}

//----------------------------------------------------------------------------------
//  parseInline — tokenizes one line/paragraph of text into bold/italic/code/link/text
//  nodes. Bold is checked before italic since both start with `*`.
//----------------------------------------------------------------------------------
function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let buffer = ''
  let i = 0

  function flushBuffer(): void {
    if (buffer.length > 0) {
      nodes.push({ kind: 'text', value: buffer })
      buffer = ''
    }
  }

  while (i < text.length) {
    const remaining = text.slice(i)
    const linkMatch = /^\[([^\]]*)\]\(([^)]*)\)/.exec(remaining)
    const boldMatch = /^\*\*([^*]+)\*\*/.exec(remaining)
    const codeMatch = /^`([^`]+)`/.exec(remaining)
    const italicMatch = /^\*([^*]+)\*/.exec(remaining)

    if (linkMatch) {
      flushBuffer()
      const children = parseInline(linkMatch[1])
      nodes.push({ kind: 'link', href: linkMatch[2], children })
      i += linkMatch[0].length
    } else if (boldMatch) {
      flushBuffer()
      const children = parseInline(boldMatch[1])
      nodes.push({ kind: 'bold', children })
      i += boldMatch[0].length
    } else if (codeMatch) {
      flushBuffer()
      nodes.push({ kind: 'code', value: codeMatch[1] })
      i += codeMatch[0].length
    } else if (italicMatch) {
      flushBuffer()
      const children = parseInline(italicMatch[1])
      nodes.push({ kind: 'italic', children })
      i += italicMatch[0].length
    } else {
      buffer += text[i]
      i += 1
    }
  }

  flushBuffer()
  return nodes
}

//----------------------------------------------------------------------------------
//  stripNodeTags — repeatedly strips trailing `{#some-id}`, `{loop:some-id}`, `{top}`,
//  `{pair}`, `{table}`, `{bottom}`, and/or `{process}` suffixes (any order, all
//  optional) off a node line. `{top}` marks a side node as belonging to the top row
//  (flanking the first process box) rather than the main stacked side column.
//  `{pair}` renders a side node in the same row as the side node immediately before
//  it, to its right, instead of starting a new row. `{table}` styles a side node
//  like a main-chain table (blue) instead of the default process styling (brown).
//  `{bottom}` pulls a main-chain node out of the vertical column into a separate row
//  at the bottom. `{process}` styles a main-chain node like a process (brown)
//  instead of the default table styling (blue) — the main-chain column's inverse of
//  a side node's `{table}`.
//----------------------------------------------------------------------------------
function stripNodeTags(line: string): { text: string; id?: string; loopTo?: string; top?: boolean; pair?: boolean; table?: boolean; bottom?: boolean; process?: boolean } {
  let text = line
  let id: string | undefined
  let loopTo: string | undefined
  let top: boolean | undefined
  let pair: boolean | undefined
  let table: boolean | undefined
  let bottom: boolean | undefined
  let process: boolean | undefined

  for (let i = 0; i < 7; i++) {
    const idMatch = /^(.*?)\s*\{#([a-zA-Z0-9_-]+)\}\s*$/.exec(text)
    const loopMatch = /^(.*?)\s*\{loop:([a-zA-Z0-9_-]+)\}\s*$/.exec(text)
    const topMatch = /^(.*?)\s*\{top\}\s*$/.exec(text)
    const pairMatch = /^(.*?)\s*\{pair\}\s*$/.exec(text)
    const tableMatch = /^(.*?)\s*\{table\}\s*$/.exec(text)
    const bottomMatch = /^(.*?)\s*\{bottom\}\s*$/.exec(text)
    const processMatch = /^(.*?)\s*\{process\}\s*$/.exec(text)
    if (idMatch && !id) {
      text = idMatch[1]
      id = idMatch[2]
    } else if (loopMatch && !loopTo) {
      text = loopMatch[1]
      loopTo = loopMatch[2]
    } else if (topMatch && !top) {
      text = topMatch[1]
      top = true
    } else if (pairMatch && !pair) {
      text = pairMatch[1]
      pair = true
    } else if (tableMatch && !table) {
      text = tableMatch[1]
      table = true
    } else if (bottomMatch && !bottom) {
      text = bottomMatch[1]
      bottom = true
    } else if (processMatch && !process) {
      text = processMatch[1]
      process = true
    } else {
      break
    }
  }

  return { text, id, loopTo, top, pair, table, bottom, process }
}

//----------------------------------------------------------------------------------
//  parseFlowLines — each non-blank line in a ```flow fence is one of:
//  - an arrow: starts with ↓ (forward) or ↑ (loops back to an earlier node), rest is
//    its label, optionally suffixed `{to:some-id}` naming its curve target
//  - a side node: `side <text>`, placed in a left column outside the main vertical
//    chain, optionally suffixed `{#some-id}` so edges can target it
//  - an edge: `edge <fromId> <-> <toId>` (bidirectional) or `edge <fromId> -> <toId>`
//    (single direction) — a declared connection between any two node ids, drawn as
//    its own curve, not part of the main sequence
//  - a node (everything else): optionally suffixed `{#some-id}` so it can be targeted,
//    and/or `{loop:some-id}` so a curve is drawn from this node back to that target
//----------------------------------------------------------------------------------
function parseFlowLines(lines: string[]): FlowStep[] {
  const steps: FlowStep[] = []
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line === '') continue
    if (line.startsWith('↓') || line.startsWith('↑') || line.startsWith('→') || line.startsWith('←')) {
      const direction = (line.startsWith('↑') || line.startsWith('←')) ? 'up' : 'down'
      const rest = line.slice(1).trim()
      const toMatch = /^(.*?)\s*\{to:([a-zA-Z0-9_-]+)\}\s*$/.exec(rest)
      const labelText = toMatch ? toMatch[1] : rest
      const to = toMatch ? toMatch[2] : undefined
      steps.push({ type: 'arrow', label: parseInline(labelText), direction, to })
    } else if (line.startsWith('side ')) {
      const { text, id, top, pair, table } = stripNodeTags(line.slice(5).trim())
      steps.push({ type: 'side-node', content: parseInline(text), id, top, pair, table })
    } else if (line.startsWith('edge ')) {
      const edgeMatch = /^edge\s+([a-zA-Z0-9_-]+)\s*(<->|->)\s*([a-zA-Z0-9_-]+)\s*$/.exec(line)
      if (edgeMatch) {
        steps.push({ type: 'edge', from: edgeMatch[1], to: edgeMatch[3], style: edgeMatch[2] === '<->' ? 'double' : 'single' })
      }
    } else {
      const { text, id, loopTo, bottom, process } = stripNodeTags(line)
      steps.push({ type: 'node', content: parseInline(text), id, loopTo, bottom, process })
    }
  }
  return steps
}

//----------------------------------------------------------------------------------
//  parseMarkdownLite — headings, paragraphs, ordered/unordered lists, horizontal
//  rules, fenced code/flow blocks, and inline bold/italic/code/links. Covers exactly
//  the markdown constructs used in docs/Dataflow.md — not a general CommonMark parser.
//----------------------------------------------------------------------------------
export function parseMarkdownLite(markdown: string): BlockNode[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: BlockNode[] = []

  let paragraphLines: string[] = []
  let listItems: string[] = []
  let listOrdered = false
  let inList = false
  let inCodeFence = false
  let codeFenceLang = ''
  let codeFenceLines: string[] = []

  function flushParagraph(): void {
    if (paragraphLines.length > 0) {
      const text = paragraphLines.join(' ').trim()
      const children = parseInline(text)
      blocks.push({ kind: 'paragraph', children })
      paragraphLines = []
    }
  }

  function flushList(): void {
    if (listItems.length > 0) {
      const items = listItems.map(item => parseInline(item.trim()))
      blocks.push({ kind: 'list', ordered: listOrdered, items })
      listItems = []
    }
    inList = false
  }

  for (const rawLine of lines) {
    if (inCodeFence) {
      if (rawLine.trim() === '```') {
        if (codeFenceLang === 'flow') {
          blocks.push({ kind: 'flow', steps: parseFlowLines(codeFenceLines) })
        } else {
          blocks.push({ kind: 'codeblock', value: codeFenceLines.join('\n') })
        }
        codeFenceLines = []
        codeFenceLang = ''
        inCodeFence = false
      } else {
        codeFenceLines.push(rawLine)
      }
      continue
    }

    const line = rawLine.trimEnd()

    const fenceOpenMatch = /^```(\w*)$/.exec(line.trim())
    if (fenceOpenMatch) {
      flushParagraph()
      flushList()
      inCodeFence = true
      codeFenceLang = fenceOpenMatch[1]
      continue
    }

    if (line.trim() === '') {
      flushParagraph()
      flushList()
      continue
    }

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line)
    const bulletMatch = /^-\s+(.*)$/.exec(line)
    const orderedMatch = /^\d+\.\s+(.*)$/.exec(line)
    const isContinuation = /^\s+\S/.test(rawLine)

    if (headingMatch) {
      flushParagraph()
      flushList()
      const level = headingMatch[1].length
      const idMatch = /^(.*?)\s*\{#([a-zA-Z0-9_-]+)\}\s*$/.exec(headingMatch[2])
      const headingText = idMatch ? idMatch[1] : headingMatch[2]
      const children = parseInline(headingText)
      const id = idMatch ? idMatch[2] : slugify(plainText(children))
      blocks.push({ kind: 'heading', level, children, id })
    } else if (line === '---') {
      flushParagraph()
      flushList()
      blocks.push({ kind: 'hr' })
    } else if (bulletMatch) {
      flushParagraph()
      if (inList && listOrdered) flushList()
      inList = true
      listOrdered = false
      listItems.push(bulletMatch[1])
    } else if (orderedMatch) {
      flushParagraph()
      if (inList && !listOrdered) flushList()
      inList = true
      listOrdered = true
      listItems.push(orderedMatch[1])
    } else if (isContinuation && inList) {
      listItems[listItems.length - 1] += ' ' + line.trim()
    } else if (isContinuation && paragraphLines.length > 0) {
      paragraphLines.push(line.trim())
    } else {
      flushList()
      paragraphLines.push(line.trim())
    }
  }

  flushParagraph()
  flushList()

  return blocks
}

//----------------------------------------------------------------------------------
//  buildSectionTree — groups a flat block list into a heading-nested tree: each
//  heading "owns" every block up to the next heading of equal-or-shallower level.
//  Non-heading blocks before the first heading go into `preamble`.
//----------------------------------------------------------------------------------
export function buildSectionTree(blocks: BlockNode[]): SectionTree {
  const preamble: LeafBlockNode[] = []
  const roots: Section[] = []
  const stack: Section[] = []

  for (const block of blocks) {
    if (block.kind !== 'heading') {
      const current = stack[stack.length - 1]
      if (current) {
        current.content.push(block)
      } else {
        preamble.push(block)
      }
      continue
    }

    while (stack.length > 0 && stack[stack.length - 1].level >= block.level) {
      stack.pop()
    }

    const section: Section = { level: block.level, heading: block.children, id: block.id, content: [], subsections: [] }
    const parent = stack[stack.length - 1]
    if (parent) {
      parent.subsections.push(section)
    } else {
      roots.push(section)
    }
    stack.push(section)
  }

  return { preamble, sections: roots }
}
