import { homedir } from "os";
import { join } from "path";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";

import type { EditorAssistantAgentId } from "./agents";

/**
 * Returns the folder where Claude Code stores the conversations of the given project folder: its path with every
 * character that is not a letter or a digit replaced by "-".
 * @param projectDirectory defines the absolute path of the folder of the project, where the agent runs.
 */
export function getClaudeConversationsDirectory(projectDirectory: string, claudeDirectory: string = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude")): string {
	return join(claudeDirectory, "projects", projectDirectory.replace(/[^a-zA-Z0-9]/g, "-"));
}

/**
 * Returns wether or not Claude Code saved the given conversation: it creates it when the user sends the first message.
 */
export function claudeConversationExists(projectDirectory: string, conversationId: string): boolean {
	return existsSync(join(getClaudeConversationsDirectory(projectDirectory), `${conversationId}.jsonl`));
}

function normalizePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function listFiles(directory: string, depth: number): string[] {
	let names: string[];
	try {
		names = readdirSync(directory);
	} catch (e) {
		return [];
	}

	return names.flatMap((name) => {
		const path = join(directory, name);
		try {
			if (statSync(path).isDirectory()) {
				return depth > 0 ? listFiles(path, depth - 1) : [];
			}
		} catch (e) {
			return [];
		}

		return [path];
	});
}

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * Looks for the conversation an agent created since the given date, to resume that thread later. Codex and Antigravity
 * CLI choose the identifier of their conversations themselves, when the user sends the first message.
 * @param agent defines the agent of the thread.
 * @param projectDirectory defines the absolute path of the folder of the project, where the agent runs.
 * @param since defines the date the agent started, in milliseconds.
 * @param excluded defines the identifiers of the conversations other threads already use.
 * @returns the identifier of the conversation, or null when there is none yet.
 */
export function findNewAgentConversation(agent: EditorAssistantAgentId, projectDirectory: string, since: number, excluded: string[] = []): string | null {
	if (agent === "codex") {
		const root = join(process.env.CODEX_HOME || join(homedir(), ".codex"), "sessions");

		for (const path of listFiles(root, 3)) {
			const match = new RegExp(`rollout-.*-(${uuid})\\.jsonl$`, "i").exec(path);
			if (!match || excluded.includes(match[1])) {
				continue;
			}

			try {
				if (statSync(path).birthtimeMs < since) {
					continue;
				}

				const meta = JSON.parse(readFileSync(path, "utf8").split("\n", 1)[0]);
				if (typeof meta?.payload?.cwd === "string" && normalizePath(meta.payload.cwd) === normalizePath(projectDirectory)) {
					return match[1];
				}
			} catch (e) {
				// Still being written.
			}
		}

		return null;
	}

	if (agent === "antigravity") {
		const root = join(homedir(), ".gemini", "antigravity-cli", "conversations");

		for (const path of listFiles(root, 0)) {
			const match = new RegExp(`(${uuid})\\.db$`, "i").exec(path);
			if (match && !excluded.includes(match[1]) && statSync(path).birthtimeMs >= since) {
				return match[1];
			}
		}
	}

	return null;
}
