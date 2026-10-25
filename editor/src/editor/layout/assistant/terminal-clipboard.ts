export type AssistantTerminalClipboardAction = "copy" | "paste";

export interface IAssistantTerminalKeyEvent {
	type: string;
	key: string;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
}

/**
 * Returns the clipboard action a key of the terminal of the assistant stands for, or null when the key belongs to the agent.
 * Ctrl+C only copies when text is selected: without a selection it is the interruption of the agent. Ctrl+Shift+C always
 * copies and Ctrl+Shift+V pastes (Cmd+C and Cmd+V on macOS), like the terminals of the operating systems do.
 * @param ev defines the keyboard event of the terminal.
 * @param hasSelection defines wether or not text is selected in the terminal.
 * @param isMac defines wether or not the editor runs on macOS.
 */
export function getAssistantTerminalClipboardAction(ev: IAssistantTerminalKeyEvent, hasSelection: boolean, isMac: boolean): AssistantTerminalClipboardAction | null {
	if (ev.type !== "keydown" || ev.altKey) {
		return null;
	}

	const key = ev.key.toLowerCase();

	if (isMac) {
		if (!ev.metaKey || ev.ctrlKey || ev.shiftKey) {
			return null;
		}

		return key === "c" && hasSelection ? "copy" : key === "v" ? "paste" : null;
	}

	if (!ev.ctrlKey || ev.metaKey) {
		return null;
	}

	if (key === "c" && (ev.shiftKey || hasSelection)) {
		return "copy";
	}

	return key === "v" && ev.shiftKey ? "paste" : null;
}
