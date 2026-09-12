import test from "node:test";
import assert from "node:assert/strict";
import { KINDS } from "../src/store.js";

test("category names match the existing main.json layout", () => {
  assert.deepEqual(KINDS, {
    mvp: "mvp", style: "styles", ost: "osts", command: "commands",
    emote: "emotes", commentator: "commentators", goaleffect: "goaleffects",
    title: "titles", nowl: "nowl"
  });
});
