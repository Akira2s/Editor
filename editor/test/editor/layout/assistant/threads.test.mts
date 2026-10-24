import { describe, expect, test } from "vitest";

import { getAntigravityArguments } from "../../../../src/editor/layout/assistant/antigravity";
import { getCodexArguments } from "../../../../src/editor/layout/assistant/codex";
import { getClaudeArguments } from "../../../../src/editor/layout/assistant/config";
import {
	deleteAssistantThread,
	findResumableAssistantThread,
	formatAssistantThreadAge,
	IAssistantThread,
	parseAssistantThreads,
	renameAssistantThread,
	sortAssistantThreads,
	updateAssistantThread,
} from "../../../../src/editor/layout/assistant/threads";

function thread(id: string, agent: IAssistantThread["agent"], updatedAt: number): IAssistantThread {
	return { id, name: `Thread ${id}`, agent, conversationId: null, createdAt: 0, updatedAt };
}

describe("assistant threads", () => {
	test("parse ignores invalid entries and fills missing fields", () => {
		const parsed = parseAssistantThreads([
			thread("a", "claude", 1),
			{ id: "b", name: "x", agent: "gemini" },
			null,
			3,
			{ id: "c", name: "ok", agent: "codex", conversationId: 5 },
		]);

		expect(parsed.map((item) => item.id)).toEqual(["a", "c"]);
		expect(parsed[1]).toEqual({ id: "c", name: "ok", agent: "codex", conversationId: null, createdAt: 0, updatedAt: 0 });
		expect(parseAssistantThreads("nope")).toEqual([]);
	});

	test("rename trims, ignores empty names and leaves the other threads alone", () => {
		const threads = [thread("a", "claude", 1), thread("b", "codex", 2)];

		expect(renameAssistantThread(threads, "a", "  Level design  ")[0].name).toBe("Level design");
		expect(renameAssistantThread(threads, "a", "   ")).toBe(threads);
		expect(renameAssistantThread(threads, "a", "x")[1]).toBe(threads[1]);
	});

	test("delete removes only the given thread", () => {
		expect(deleteAssistantThread([thread("a", "claude", 1), thread("b", "codex", 2)], "a").map((item) => item.id)).toEqual(["b"]);
	});

	test("sort puts the most recently opened first without changing the input", () => {
		const threads = [thread("a", "claude", 1), thread("b", "codex", 3), thread("c", "claude", 2)];

		expect(sortAssistantThreads(threads).map((item) => item.id)).toEqual(["b", "c", "a"]);
		expect(threads[0].id).toBe("a");
	});

	test("update sets the conversation of one thread", () => {
		const updated = updateAssistantThread([thread("a", "codex", 1)], "a", { conversationId: "123" });
		expect(updated[0].conversationId).toBe("123");
	});

	test("resume picks the active thread of the agent, else the latest one of the agent", () => {
		const threads = [thread("a", "claude", 1), thread("b", "claude", 5), thread("c", "codex", 9)];

		expect(findResumableAssistantThread(threads, "claude", "a")?.id).toBe("a");
		expect(findResumableAssistantThread(threads, "claude", "c")?.id).toBe("b");
		expect(findResumableAssistantThread(threads, "antigravity", null)).toBeNull();
	});

	test("age", () => {
		const now = 10 * 24 * 3600 * 1000;

		expect(formatAssistantThreadAge(now - 10_000, now)).toBe("just now");
		expect(formatAssistantThreadAge(now - 5 * 60_000, now)).toBe("5 min ago");
		expect(formatAssistantThreadAge(now - 3 * 3600_000, now)).toBe("3 h ago");
		expect(formatAssistantThreadAge(now - 2 * 24 * 3600_000, now)).toBe("2 d ago");
	});
});

describe("agent arguments for a thread", () => {
	test("Claude Code creates then resumes the conversation by identifier", () => {
		expect(getClaudeArguments("m.json", "s.json", false, null, { id: "abc", resume: false }).slice(-2)).toEqual(["--session-id", "abc"]);
		expect(getClaudeArguments("m.json", "s.json", true, null, { id: "abc", resume: true }).slice(-2)).toEqual(["--resume", "abc"]);
		expect(getClaudeArguments("m.json", "s.json", true)).toContain("--continue");
		expect(getClaudeArguments("m.json", "s.json", false)).not.toContain("--continue");
	});

	test("Antigravity CLI resumes by conversation, else continues the last one", () => {
		expect(getAntigravityArguments(true, "abc")).toEqual(["--conversation", "abc"]);
		expect(getAntigravityArguments(true)).toEqual(["--continue"]);
		expect(getAntigravityArguments(false, "abc")).toEqual([]);
	});

	test("Codex resumes by identifier, else the last conversation", () => {
		const options = { executablePath: "e", serverScriptPath: "s", url: "http://127.0.0.1:1", token: "t" };

		expect(getCodexArguments(options, true, "0.100.0", "abc").slice(0, 2)).toEqual(["resume", "abc"]);
		expect(getCodexArguments(options, true, "0.100.0").slice(0, 2)).toEqual(["resume", "--last"]);
		expect(getCodexArguments(options, false, "0.100.0", "abc")[0]).not.toBe("resume");
	});
});
