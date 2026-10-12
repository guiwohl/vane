import { describe, expect, test } from "claude-code/testing";

import { TABS } from "../hooks/tabs";
import {
  API_KEY,
  CACHE_TITLE,
  HEADINGS,
  NARROW_COLUMNS,
  NO_CACHE_DATA,
  NO_RENT,
  OPUS,
  RENT_TITLE,
  RICH_COST,
  SPLIT_TITLE,
  WIDE_COLUMNS,
  blocks,
  hasNoSpendNote,
  isAllMuted,
  lines,
  mainTurn,
  mutedPartsText,
  openPane,
  ownersOf,
  plainPartsText,
  rowTextsOf,
  settle,
  sessionWithAllBlocks,
  setSessionCost,
  startFreshSession,
  showSpend,
  spacingOf,
  spendPane,
  totalsOf,
  unwrappedTexts,
  worldOf,
} from "./spend-world";
import { headingOrder } from "./skills-tree";

const MAIN_INPUT = 750_000;
const COST_BEFORE = 4;
const COST_AFTER = 6.5;
const ONE_BLANK_ABOVE_EACH = [1, 1, 1];
const NO_BLANK_RUN_LONGER_THAN_ONE = 1;

describe("spend tab layout", () => {
  test("T1 the tab bar ends with Setup then Spend and Spend opens with the Where it went, Cache misses and Biggest tool results in context headings in that order", async ($, on) => {
    worldOf(on, API_KEY);
    const pane = await openPane($);

    expect(TABS.map((tab) => tab.label).slice(-2)).toEqual(["Setup", "Spend"]);
    expect(TABS.at(-1)?.id).toBe("spend");

    await showSpend(pane);

    expect(headingOrder(await lines(pane), HEADINGS)).toEqual(HEADINGS);
  });

  test("T2 with data in all three blocks one blank row sits before each heading and no blank row is ever doubled", async ($, on) => {
    const world = worldOf(on, API_KEY);
    await sessionWithAllBlocks($, world);

    const pane = await spendPane($);

    expect(spacingOf(await lines(pane))).toEqual({
      gapAboveTop: 1,
      blanksBeforeHeadings: ONE_BLANK_ABOVE_EACH,
      longestBlankRun: NO_BLANK_RUN_LONGER_THAN_ONE,
    });
  });

  test("T3 the engine reports $12.37 and the first total reads $12.37 with the muted label this session under it", async ($, on) => {
    const world = worldOf(on, API_KEY);
    await setSessionCost($, world, RICH_COST);

    const pane = await spendPane($);

    const totals = totalsOf(await lines(pane));
    expect(totals?.usd).toBe("$12.37");
    expect(plainPartsText(totals?.values)).toContain("$12.37");
    expect(mutedPartsText(totals?.values)).not.toContain("$12.37");
    expect(isAllMuted(totals?.labels)).toBe(true);
  });

  test("T4 when the session cost grows from $4.00 to $6.50 with no new tokens the top row shows $6.50 and background grows from $1.00 to $3.50", async ($, on) => {
    const world = worldOf(on, API_KEY);
    await startFreshSession($, world);
    await mainTurn($, world, { model: OPUS, tokens: { input: MAIN_INPUT } });
    await setSessionCost($, world, COST_BEFORE);
    const pane = await spendPane($);
    const before = ownersOf((await blocks(pane))[SPLIT_TITLE]);

    await setSessionCost($, world, COST_AFTER);
    await settle(pane);

    const owners = ownersOf((await blocks(pane))[SPLIT_TITLE]);
    expect(totalsOf(await lines(pane))?.usd).toBe("$6.50");
    expect(before.map((owner) => [owner.name, owner.dollars])).toEqual([
      ["main · opus 5.5", "~$3.00"],
      ["background", "~$1.00"],
    ]);
    expect(owners.map((owner) => [owner.name, owner.dollars])).toEqual([
      ["background", "~$3.50"],
      ["main · opus 5.5", "~$3.00"],
    ]);
  });

  test("T5 a new session shows no spend yet, no owner rows, no cache data yet and no tool results, with all three headings", async ($, on) => {
    worldOf(on, API_KEY);

    const pane = await spendPane($);

    const found = await blocks(pane);
    expect(hasNoSpendNote(await lines(pane))).toBe(true);
    expect(Object.keys(found)).toEqual(HEADINGS);
    expect(rowTextsOf(found[SPLIT_TITLE])).toEqual([]);
    expect(rowTextsOf(found[CACHE_TITLE])).toEqual([NO_CACHE_DATA]);
    expect(rowTextsOf(found[RENT_TITLE])).toEqual([NO_RENT]);
  });

  test("T6 in a new session there is still one blank row before each heading and no blank row is doubled", async ($, on) => {
    worldOf(on, API_KEY);

    const pane = await spendPane($);

    expect(spacingOf(await lines(pane))).toEqual({
      gapAboveTop: 1,
      blanksBeforeHeadings: ONE_BLANK_ABOVE_EACH,
      longestBlankRun: NO_BLANK_RUN_LONGER_THAN_ONE,
    });
  });

  test("T7 tokens were counted but the engine cost is $0 so the top row says no spend yet and no owner is drawn", async ($, on) => {
    const world = worldOf(on, API_KEY);
    await mainTurn($, world, { model: OPUS, tokens: { input: MAIN_INPUT } });
    await setSessionCost($, world, 0);

    const pane = await spendPane($);

    expect(hasNoSpendNote(await lines(pane))).toBe(true);
    expect(ownersOf((await blocks(pane))[SPLIT_TITLE])).toEqual([]);
  });

  test("T8 at 60 columns every Spend row is one line that truncates", async ($, on) => {
    const world = worldOf(on, API_KEY);
    await sessionWithAllBlocks($, world);

    const pane = await spendPane($, NARROW_COLUMNS);

    expect(totalsOf(await lines(pane))?.usd).toBe("$12.37");
    expect(await unwrappedTexts(pane)).toEqual([]);
  });

  test("T9 at 120 columns every Spend row is one line that truncates", async ($, on) => {
    const world = worldOf(on, API_KEY);
    await sessionWithAllBlocks($, world);

    const pane = await spendPane($, WIDE_COLUMNS);

    expect(totalsOf(await lines(pane))?.usd).toBe("$12.37");
    expect(await unwrappedTexts(pane)).toEqual([]);
  });
});
