import { describe, expect, test } from "vitest";

import { getAssistantTerminalClipboardAction } from "../../../../src/editor/layout/assistant/terminal-clipboard";

function key(k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; type: string }> = {}) {
	return { type: "keydown", key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods };
}

describe("getAssistantTerminalClipboardAction", () => {
	test("Ctrl+C copies only with a selection, otherwise it interrupts the agent", () => {
		expect(getAssistantTerminalClipboardAction(key("c", { ctrlKey: true }), true, false)).toBe("copy");
		expect(getAssistantTerminalClipboardAction(key("c", { ctrlKey: true }), false, false)).toBeNull();
	});

	test("Ctrl+Shift+C always copies, Ctrl+Shift+V pastes", () => {
		expect(getAssistantTerminalClipboardAction(key("C", { ctrlKey: true, shiftKey: true }), false, false)).toBe("copy");
		expect(getAssistantTerminalClipboardAction(key("V", { ctrlKey: true, shiftKey: true }), false, false)).toBe("paste");
	});

	test("plain Ctrl+V and other keys belong to the agent", () => {
		expect(getAssistantTerminalClipboardAction(key("v", { ctrlKey: true }), false, false)).toBeNull();
		expect(getAssistantTerminalClipboardAction(key("c"), true, false)).toBeNull();
		expect(getAssistantTerminalClipboardAction(key("c", { ctrlKey: true, altKey: true }), true, false)).toBeNull();
	});

	test("ignores key releases", () => {
		expect(getAssistantTerminalClipboardAction(key("c", { ctrlKey: true, type: "keyup" }), true, false)).toBeNull();
	});

	test("macOS uses Cmd", () => {
		expect(getAssistantTerminalClipboardAction(key("c", { metaKey: true }), true, true)).toBe("copy");
		expect(getAssistantTerminalClipboardAction(key("c", { metaKey: true }), false, true)).toBeNull();
		expect(getAssistantTerminalClipboardAction(key("v", { metaKey: true }), false, true)).toBe("paste");
		expect(getAssistantTerminalClipboardAction(key("c", { ctrlKey: true }), true, true)).toBeNull();
	});
});
