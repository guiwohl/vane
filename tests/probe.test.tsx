import { describe, expect, test } from "claude-code/testing";
import type { On } from "claude-code";
import type { Engine, Mounted } from "claude-code/testing";

import { register } from "../hooks/register";

type Reply = Mounted<"terminal", "AssistantMessage">;
type LoggedLine = { to: string; text: string };
type Registration = { event: string; matcher?: unknown };

const PROBE_PERIOD = 200;
const BEFORE_FIRST_LINE = 150;
const REPLY_SHAPE = {
  type: "Box",
  children: [
    { type: "Text", children: [{ type: "Text", children: ["CLAUDE"] }, { type: "Text" }] },
    {
      type: "Box",
      children: [{ type: "Text", children: ["Hello world"] }],
    },
  ],
};

describe("speed probe", () => {
  test(
    "A1 with the probe measuring, the reply is drawn as it is without it",
    { options: { probe: true } },
    async ($, on) => {
      const logged = recordLogs(on);
      const reply = await mountReply($);

      await redraw(reply, PROBE_PERIOD);

      expect(logged).toHaveLength(1);
      expect(await reply.drawn()).toMatchObject(REPLY_SHAPE);
    },
  );

  test(
    "A1b with the probe off, the reply is drawn in the vane style",
    { options: { probe: false } },
    async ($) => {
      const reply = await mountReply($);

      expect(await reply.drawn()).toMatchObject(REPLY_SHAPE);
    },
  );

  test("A2 the probe switch adds one render hook for every component, registered first, and nothing else", () => {
    const withoutProbe = registrationsFor({ probe: false });
    const withProbe = registrationsFor({ probe: true });

    expect(withProbe[0]).toEqual({ event: "ui.render" });
    expect(withProbe.slice(1)).toEqual(withoutProbe);
    expect(withoutProbe.filter(isForEveryComponent)).toEqual([]);
  });

  test(
    "A3 the first debug line appears at the 200th render, not before, and lists calls, total, max and ids",
    { options: { probe: true } },
    async ($, on) => {
      const logged = recordLogs(on);
      const reply = await mountReply($);

      await redraw(reply, BEFORE_FIRST_LINE);
      expect(logged).toEqual([]);
      await redraw(reply, PROBE_PERIOD - BEFORE_FIRST_LINE);

      const [line = { to: "", text: "" }] = logged;
      expect(logged).toHaveLength(1);
      expect(line.to).toBe("debug");
      expect(line.text).toContain("AssistantMessage");
      expect(line.text).toContain(String(PROBE_PERIOD));
      expect(line.text).toMatch(/calls/i);
      expect(line.text).toMatch(/total/i);
      expect(line.text).toMatch(/max/i);
      expect(line.text).toMatch(/ids/i);
    },
  );
});

function recordLogs(on: On): LoggedLine[] {
  const logged: LoggedLine[] = [];
  on("ui.log", (_$, e) => {
    logged.push({ to: e.to, text: e.text });
    return { value: undefined };
  });
  return logged;
}

function mountReply($: Engine): Promise<Reply> {
  return $.ui.mount({
    plugin: "vane",
    surface: "terminal",
    component: "AssistantMessage",
    props: { text: "Hello world", isFirstOfReply: true },
    viewport: { columns: 100, rows: 40 },
  });
}

async function redraw(reply: Reply, times: number): Promise<void> {
  for (let i = 0; i < times; i++) await reply.redraw();
}

function registrationsFor(options: Record<string, boolean>): Registration[] {
  const registrations: Registration[] = [];
  const recordingOn = ((event: string, ...rest: unknown[]) => {
    registrations.push(rest.length === 2 ? { event, matcher: rest[0] } : { event });
  }) as unknown as On;
  register(recordingOn, options);
  return registrations;
}

function isForEveryComponent(registration: Registration): boolean {
  return registration.event === "ui.render" && registration.matcher === undefined;
}
