import { describe, expect, test } from "claude-code/testing";
import type { On } from "claude-code";
import type { Engine } from "claude-code/testing";

import { panel } from "../hooks/panel";
import { palette } from "../hooks/palette";
import { replyLook } from "../hooks/reply-look";
import { ENGINE_DEFAULT_GREY, accentOf } from "../hooks/session-color";

const RED = accentOf("red");
const LONG_PATH = `/work/${"deep/".repeat(22)}file-name.ts`;

describe("reply look", () => {
  test("P1 under /color red the accent and strong are red", () => {
    const look = replyLook(RED);

    expect(look.accent).toBe(RED);
    expect(look.strong).toBe(RED);
  });

  test("P2 under the default colour the accent is grey and strong is the user text colour", () => {
    for (const accent of [null, ENGINE_DEFAULT_GREY]) {
      const look = replyLook(accent);

      expect(look.accent).toBe(ENGINE_DEFAULT_GREY);
      expect(look.strong).toBe(palette.userText);
    }
  });
});

describe("panel", () => {
  test("P3 a 120-character path in a 40 wide panel is one band row cut from the start", async ($, on) => {
    const draw = drawer($, on);
    const tree = await draw({ width: 40, titleText: LONG_PATH });

    const row = bandOf(tree);
    const title = collect(row, "Text").find((node) => node.props.wrap === "truncate-start");
    expect(row.props.flexDirection).toBe("row");
    expect(row.props.width).toBe(40);
    expect(textOf(title!).endsWith("file-name.ts")).toBe(true);
    expect(textOf(title!).startsWith("▌ ")).toBe(true);
  });

  test("P4 right items sit on the band row", async ($, on) => {
    const draw = drawer($, on);
    const tree = await draw({ right: true });

    expect(textOf(bandOf(tree))).toContain("Copy");
    expect(textOf(bodyOf(tree))).not.toContain("Copy");
  });

  test("P5 hiddenLines adds a muted row, zero adds nothing", async ($, on) => {
    const draw = drawer($, on);
    const hidden = await draw({ hiddenLines: 22 });
    const none = await draw({ hiddenLines: 0 });

    const row = collect(bodyOf(hidden), "Text").find((n) => textOf(n) === "… +22 lines");
    expect(row?.props.color).toBe(palette.muted);
    expect(textOf(bodyOf(none))).not.toContain("lines");
  });

  test("P6 with background the body has it, without it the body has none", async ($, on) => {
    const draw = drawer($, on);
    const filled = await draw({ background: palette.panel });
    const bare = await draw({});

    expect(bodyOf(filled).props.backgroundColor).toBe(palette.panel);
    expect(bodyOf(filled).props.paddingX).toBe(2);
    expect(bodyOf(bare).props.backgroundColor).toBeUndefined();
    expect(bodyOf(bare).props.paddingLeft).toBe(2);
  });

  test("P8 a 120-character title and right items at 60 columns leave a gap cell before the items", async ($, on) => {
    const draw = drawer($, on);
    const tree = await draw({ width: 60, titleText: LONG_PATH, right: true });

    const right = childrenOf(bandOf(tree))[1]!;
    expect(Number(right.props.paddingLeft)).toBeGreaterThanOrEqual(1);
  });

  test("P7 the band has no border characters", async ($, on) => {
    const draw = drawer($, on);
    const tree = await draw({ right: true });

    expect(textOf(bandOf(tree))).not.toMatch(/[│┃|┌┐└┘─]/);
    expect(JSON.stringify(tree)).not.toContain("borderStyle");
  });
});

type Drawing = {
  width?: number;
  titleText?: string;
  right?: boolean;
  hiddenLines?: number;
  background?: string;
};

type Node = { type: string; props: Record<string, unknown>; children?: unknown };

function drawer($: Engine, on: On): (drawing: Drawing) => Promise<Node> {
  let current: Drawing = {};
  on("ui.render", { component: "InfoNotice" }, ($ui, e) => {
    const ui = $ui.ui.resolve(e);
    const { Text } = ui;
    const right = current.right === true ? [<Text key="copy">Copy</Text>] : undefined;
    return panel(ui, {
      key: "p",
      width: current.width ?? 60,
      look: replyLook(null),
      title: <Text>{current.titleText ?? "title"}</Text>,
      right,
      body: <Text>content</Text>,
      hiddenLines: current.hiddenLines,
      background: current.background,
    });
  });
  return async (drawing) => {
    current = drawing;
    const ui = await $.ui.mount({
      plugin: "vane",
      surface: "terminal",
      component: "InfoNotice",
      props: { text: "x", command: null },
      viewport: { columns: 80, rows: 24 },
    });
    return (await ui.drawn()) as unknown as Node;
  };
}

function listOf(raw: unknown): unknown[] {
  if (raw === undefined || raw === null) return [];
  return Array.isArray(raw) ? raw.flat(Infinity) : [raw];
}

function childrenOf(node: Node): Node[] {
  return listOf(node.children).filter(
    (child): child is Node => typeof child === "object" && child !== null,
  );
}

function collect(node: Node, type: string): Node[] {
  const inner = childrenOf(node).flatMap((child) => collect(child, type));
  return node.type === type ? [node, ...inner] : inner;
}

function textOf(node: Node): string {
  return listOf(node.children)
    .map((child) => (typeof child === "object" ? textOf(child as Node) : (child as string)))
    .join("");
}

const bandOf = (tree: Node): Node => childrenOf(tree)[0]!;
const bodyOf = (tree: Node): Node => childrenOf(tree)[1]!;
