import { describe, expect, test } from "claude-code/testing";
import type { On } from "claude-code";
import type { Engine } from "claude-code/testing";

import { palette } from "../hooks/palette";
import { replyLook } from "../hooks/reply-look";
import { accentOf } from "../hooks/session-color";
import { childrenOf, collect, diagramRows, findText, textOf } from "./draw-tree";
import type { Node } from "./draw-tree";

const FENCE = "```";
const TERMINAL_COLUMNS = 80;
const WIDE_COLUMNS = 250;
const WIDE_ART_SOURCE = [
  "flowchart LR",
  "  A[Receive the request] --> B[Validate the payload] --> C[Store the record] --> D[Notify the owner]",
  "  D --> E[Close the ticket] --> F[Archive everything] --> G[Audit the trail] --> H[Report the totals] --> I[Review the report]",
].join("\n");
const RED = accentOf("red");
const ENGINE_DRAWING = "engine drew this reply";

describe("code blocks", () => {
  test("R1 a short ts block is a panel with a Code body and the Copy button on its band", async ($, on) => {
    mockClipboard(on);
    const source = "const answer = 42\nconsole.log(answer)";

    const ui = await mountReply($, fenced("ts", source));

    const code = await ui.find({ type: "Code" });
    expect(code?.props.source).toBe(source);
    expect(code?.props.language).toBe("ts");
    expect(await ui.find({ type: "Button", text: "Copy" })).toBeDefined();
  });

  test("R2 a block of 10,000 characters is drawn by Code, one of 10,001 is a panel of plain text with Copy", async ($, on) => {
    mockClipboard(on);
    const atLimit = codeOfLength(10_000);
    const pastLimit = codeOfLength(10_001);

    const limit = await mountReply($, fenced("ts", atLimit));
    const past = await mountReply($, fenced("ts", pastLimit));

    expect((await limit.find({ type: "Code" }))?.props.source).toHaveLength(10_000);
    expect(await past.find({ type: "Code" })).toBeUndefined();
    expect(await past.find({ type: "Text", text: pastLimit.split("\n")[0]! })).toBeDefined();
    expect(await past.find({ type: "Button", text: "Copy" })).toBeDefined();
  });
});

describe("reply blocks", () => {
  test("R10 H1 is a round box in the accent colour and H2 is a heavy rule as wide as its label", async ($, on) => {
    mockClipboard(on);
    mockSessionColor(on, "red");

    const ui = await mountReply($, "# Big title\n\n## Label\n\nbody");
    const tree = await drawnOf(ui);

    const box = collect(tree, "Box").find((node) => node.props?.borderStyle === "round");
    expect(box?.props?.borderColor).toBe(RED);
    expect(textOf(box!)).toBe("Big title");
    expect(findText(tree, "━".repeat(5))?.props?.color).toBe(RED);
  });

  test("R11 under /color red bullets, the quote bar and bold are red", async ($, on) => {
    mockClipboard(on);
    mockSessionColor(on, "red");

    const tree = await drawnOf(await mountReply($, "- item\n\n> said\n\nsome **loud** words"));

    expect(findText(tree, "• ")?.props?.color).toBe(RED);
    expect(findText(tree, "│ ")?.props?.color).toBe(RED);
    expect(findText(tree, "loud")?.props?.color).toBe(RED);
  });

  test("R11b under the default colour bold is the user text colour", async ($, on) => {
    mockClipboard(on);
    mockSessionColor(on, "default");

    const tree = await drawnOf(await mountReply($, "some **loud** words"));

    expect(findText(tree, "loud")?.props?.color).toBe(palette.userText);
  });

  test("R12 a ts block with a title is a panel named by it with a Code body, Copy and no vertical border", async ($, on) => {
    mockClipboard(on);

    const tree = await drawnOf(await mountReply($, '```ts title="a.ts"\nconst a = 1\n```'));

    expect(findText(tree, "a.ts")?.props?.color).toBe(palette.userText);
    expect(collect(tree, "Code")).toHaveLength(1);
    expect(collect(tree, "Button")[0]?.props?.label).toBe("Copy");
    expect(JSON.stringify(tree)).not.toContain("│");
    expect(JSON.stringify(tree)).not.toContain("borderStyle");
  });

  test("R20 every Text on the code panel band, and the Copy button box, carries the band background", async ($, on) => {
    mockClipboard(on);
    const { band } = replyLook(null);

    for (const text of [fenced("ts", "const a = 1"), '```ts title="a.ts"\nconst a = 1\n```']) {
      const tree = await drawnOf(await mountReply($, text));

      const row = collect(tree, "Box").find(
        (node) => node.props?.flexDirection === "row" && node.props.backgroundColor === band,
      )!;
      const texts = collect(row, "Text");
      expect(texts.length).toBeGreaterThanOrEqual(5);
      for (const node of texts) expect(node.props?.backgroundColor).toBe(band);
      const buttonBox = collect(row, "Box").find((box) => collect(box, "Button").length === 1);
      expect(buttonBox?.props?.backgroundColor).toBe(band);
    }
  });

  test("R13 an unlabeled block is titled code", async ($, on) => {
    mockClipboard(on);

    const tree = await drawnOf(await mountReply($, "```\nplain\n```"));

    expect(findText(tree, "code")).toBeDefined();
  });

  test("R14 a CAUTION alert has the failed colour border and starts with Caution", async ($, on) => {
    mockClipboard(on);

    const tree = await drawnOf(await mountReply($, "> [!CAUTION]\n> Do not do this"));

    const box = collect(tree, "Box").find((node) => node.props?.borderStyle === "round");
    expect(box?.props?.borderColor).toBe(palette.failed);
    expect(textOf(childrenOf(box!)[0]!).startsWith("Caution")).toBe(true);
    expect(textOf(box!)).toContain("Do not do this");
  });

  test("R15 a done task is struck and muted with a green check", async ($, on) => {
    mockClipboard(on);

    const tree = await drawnOf(await mountReply($, "- [x] shipped\n- [ ] later"));

    const struck = findText(tree, "shipped");
    expect(struck?.props?.strikethrough).toBe(true);
    expect(struck?.props?.color).toBe(palette.muted);
    expect(findText(tree, "✓")?.props?.color).toBe(palette.ok);
    expect(findText(tree, "[ ] ")?.props?.color).toBe(palette.muted);
  });

  test("R16 a markdown link is a Link with its href", async ($, on) => {
    mockClipboard(on);

    const tree = await drawnOf(await mountReply($, "see [the site](https://x.dev) now"));

    const link = collect(tree, "Link")[0];
    expect(link?.props?.href).toBe("https://x.dev");
    expect(textOf(link!)).toBe("the site");
  });

  test("R17 a nested list shows a bullet then a hollow bullet and a wrapped item hangs under its text", async ($, on) => {
    mockClipboard(on);
    const long = "word ".repeat(40).trim();

    const tree = await drawnOf(await mountReply($, `- top\n  - inner\n- ${long}`));

    expect(findText(tree, "• ")).toBeDefined();
    expect(findText(tree, "◦ ")).toBeDefined();
    const rows = collect(tree, "Box").filter((node) => node.props?.flexDirection === "row");
    const wrapped = rows.find((row) => textOf(row).includes("word word"))!;
    const [marker, text] = childrenOf(wrapped);
    expect(marker?.props?.flexShrink).toBe(0);
    expect(text?.props?.flexGrow).toBe(1);
  });

  test("R18 a half-streamed reply draws without an error and keeps an unclosed ** as text", async ($, on) => {
    mockClipboard(on);
    const text = "| A | B |\n\n> [!NOTE]\n\n**bold\n\n```ts\nconst x";

    const tree = await drawnOf(await mountReply($, text));

    expect(textOf(tree)).toContain("**bold");
    expect(collect(tree, "Code")).toHaveLength(1);
  });

  test("R19 a quote wrapped to 3 rows has a bar on each row", async ($, on) => {
    mockClipboard(on);
    const text = `> ${"word ".repeat(50).trim()}`;

    const tree = await drawnOf(await mountReply($, text, { columns: 60 }));

    const bars = collect(tree, "Text").filter((node) => textOf(node).startsWith("│ "));
    expect(bars.length).toBeGreaterThanOrEqual(3);
    for (const bar of bars) expect(textOf(bar).length).toBeLessThanOrEqual(60);
  });
});

describe("mermaid diagrams", () => {
  test("R5 a 9-box diagram is redrawn top-down at 80 columns and stays one row of boxes at 250 columns", async ($, on) => {
    mockClipboard(on);
    const text = [`${FENCE}mermaid`, WIDE_ART_SOURCE, FENCE].join("\n");

    const narrow = await mountReply($, text, { columns: TERMINAL_COLUMNS });
    const wide = await mountReply($, text, { columns: WIDE_COLUMNS });

    const narrowRows = diagramRows(await drawnOf(narrow));
    const wideRows = diagramRows(await drawnOf(wide));
    expect(await narrow.find({ type: "Code" })).toBeUndefined();
    expect(narrowRows.filter((row) => row.includes("▼"))).toHaveLength(8);
    expect(narrowRows.every((row) => (row.match(/┌/g) ?? []).length <= 1)).toBe(true);
    expect(await wide.find({ type: "Code" })).toBeUndefined();
    expect(wideRows).toHaveLength(3);
    expect((wideRows[0]!.match(/┌/g) ?? []).length).toBe(9);
    expect(wideRows[1]).toMatch(
      /Receive the request.*►.*Validate the payload.*►.*Review the report/,
    );
  });
});

describe("copying", () => {
  test("R6 a reply drawn again still copies its code and shows Copied", async ($, on) => {
    const clipboard = mockClipboard(on);
    const source = "const redrawn = true";
    const text = fenced("ts", source);
    const first = await mountReply($, text);
    await first.unmount();

    const again = await mountReply($, text);
    await again.press({ key: "copy-b0" });

    expect(await again.find({ type: "Code" })).toBeDefined();
    expect(clipboard.copied).toEqual([source]);
    expect(clipboard.toasts).toEqual(["Copied"]);
  });

  test("R7 a reply that keeps growing under a finished code block still copies that block", async ($, on) => {
    const clipboard = mockClipboard(on);
    const source = "const growing = 1";
    const code = fenced("ts", source);
    const ui = await mountReply($, code);

    await ui.redraw({ text: `${code}\n\nMore words arrive under the code.`, isFirstOfReply: true });
    await ui.press({ key: "copy-b0" });

    expect(await ui.find({ type: "Code" })).toBeDefined();
    expect(clipboard.copied).toEqual([source]);
    expect(clipboard.toasts).toEqual(["Copied"]);
  });

  test('R8 a refused copy shows "Could not copy here"', async ($, on) => {
    const clipboard = mockClipboard(on, { isRefusing: true });
    const ui = await mountReply($, fenced("ts", "const refused = 1"));

    await ui.press({ key: "copy-b0" });

    expect(clipboard.toasts).toEqual(["Could not copy here"]);
  });
});

describe("very long replies", () => {
  test("R9 a reply of 60,001 characters is left to the engine to draw", async ($, on) => {
    mockClipboard(on);
    on("ui.render", { component: "AssistantMessage" }, ($, e) => {
      const { Text } = $.ui.resolve(e);
      return <Text>{ENGINE_DRAWING}</Text>;
    });

    const ui = await mountReply($, paragraphsOfLength(60_001));

    expect(await ui.find({ type: "Text", text: ENGINE_DRAWING })).toBeDefined();
  });
});

type Clipboard = { copied: string[]; toasts: string[] };

function mockClipboard(on: On, { isRefusing = false }: { isRefusing?: boolean } = {}): Clipboard {
  const clipboard: Clipboard = { copied: [], toasts: [] };
  on("ui.toast", (_$, e) => {
    clipboard.toasts.push(e.text);
    return { value: undefined };
  });
  on("ui.copy", (_$, e) => {
    if (isRefusing) return { deny: "clipboard unavailable" };
    clipboard.copied.push(e.text);
    return { value: { isCopied: true } };
  });
  return clipboard;
}

function mountReply(
  $: Engine,
  text: string,
  { columns = TERMINAL_COLUMNS }: { columns?: number } = {},
) {
  return $.ui.mount({
    plugin: "vane",
    surface: "terminal",
    component: "AssistantMessage",
    props: { text, isFirstOfReply: true },
    viewport: { columns, rows: 24 },
  });
}

function fenced(language: string, source: string): string {
  return [`${FENCE}${language}`, source, FENCE].join("\n");
}

function codeOfLength(length: number): string {
  const lineLength = 80;
  const fullLines = Math.floor((length - 1) / (lineLength + 1));
  const lastLength = length - fullLines * (lineLength + 1);
  const lines = Array.from({ length: fullLines }, (_, i) => `row${i}`.padEnd(lineLength, "x"));
  return [...lines, "z".repeat(lastLength)].join("\n");
}

function paragraphsOfLength(length: number): string {
  const paragraph = `${"a".repeat(98)}\n\n`;
  return (
    paragraph.repeat(Math.floor(length / paragraph.length)) + "b".repeat(length % paragraph.length)
  );
}

function mockSessionColor(on: On, colorName: string): void {
  on("state.get", (_$, e, next) =>
    e.key === "sessionColor" ? { value: { value: colorName, version: 1 } } : next(e),
  );
}

async function drawnOf(ui: { drawn(): Promise<unknown> }): Promise<Node> {
  return (await ui.drawn()) as Node;
}
