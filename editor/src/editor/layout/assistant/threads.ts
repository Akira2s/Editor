import type { EditorAssistantAgentId } from "./agents";

/**
 * Defines a conversation the user had with an agent in the assistant of a project.
 */
export interface IAssistantThread {
	/**
	 * Defines the identifier of the thread.
	 */
	id: string;
	/**
	 * Defines the name of the thread, chosen by the user.
	 */
	name: string;
	/**
	 * Defines the agent the thread is connected to: a thread resumes with the same agent only.
	 */
	agent: EditorAssistantAgentId;
	/**
	 * Defines the identifier of the conversation in the agent, used to resume this thread and no other. Null while the
	 * agent didn't create it yet (it does when the user sends the first message): the last conversation is resumed then.
	 */
	conversationId: string | null;
	/**
	 * Defines the date the thread was created, in milliseconds.
	 */
	createdAt: number;
	/**
	 * Defines the date the thread was last opened, in milliseconds.
	 */
	updatedAt: number;
}

const agents: EditorAssistantAgentId[] = ["claude", "codex", "antigravity"];

/**
 * Returns the threads stored in the given value, ignoring the entries that are not valid.
 * @param value defines the parsed JSON read from the storage.
 */
export function parseAssistantThreads(value: unknown): IAssistantThread[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.flatMap((item): IAssistantThread[] => {
		if (!item || typeof item !== "object") {
			return [];
		}

		const { id, name, agent, conversationId, createdAt, updatedAt } = item as Record<string, unknown>;
		if (typeof id !== "string" || !id || typeof name !== "string" || !agents.includes(agent as EditorAssistantAgentId)) {
			return [];
		}

		return [
			{
				id,
				name,
				agent: agent as EditorAssistantAgentId,
				conversationId: typeof conversationId === "string" && conversationId ? conversationId : null,
				createdAt: typeof createdAt === "number" ? createdAt : 0,
				updatedAt: typeof updatedAt === "number" ? updatedAt : 0,
			},
		];
	});
}

/**
 * Returns the default name of a thread created at the given date, like "Jun 22, 17:09".
 */
export function getDefaultAssistantThreadName(date: Date): string {
	const month = date.toLocaleString("en-US", { month: "short" });
	const pad = (value: number) => value.toString().padStart(2, "0");

	return `${month} ${date.getDate()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Returns the given threads, the most recently opened first.
 */
export function sortAssistantThreads(threads: IAssistantThread[]): IAssistantThread[] {
	return [...threads].sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Returns the given threads with the name of the given one changed. An empty name is ignored.
 */
export function renameAssistantThread(threads: IAssistantThread[], id: string, name: string): IAssistantThread[] {
	const trimmed = name.trim();
	if (!trimmed) {
		return threads;
	}

	return threads.map((thread) => (thread.id === id ? { ...thread, name: trimmed } : thread));
}

/**
 * Returns the given threads without the given one. The conversation stays in the agent.
 */
export function deleteAssistantThread(threads: IAssistantThread[], id: string): IAssistantThread[] {
	return threads.filter((thread) => thread.id !== id);
}

/**
 * Returns the given threads with the given properties set on one of them.
 */
export function updateAssistantThread(threads: IAssistantThread[], id: string, changes: Partial<Pick<IAssistantThread, "conversationId" | "updatedAt">>): IAssistantThread[] {
	return threads.map((thread) => (thread.id === id ? { ...thread, ...changes } : thread));
}

/**
 * Returns the thread the "resume" action continues for the given agent: the active one when it belongs to the agent,
 * else the most recently opened one of the agent, or null.
 */
export function findResumableAssistantThread(threads: IAssistantThread[], agent: EditorAssistantAgentId, activeId: string | null): IAssistantThread | null {
	const active = threads.find((thread) => thread.id === activeId && thread.agent === agent);
	return active ?? sortAssistantThreads(threads).find((thread) => thread.agent === agent) ?? null;
}

/**
 * Returns how long ago the given date was, like "just now", "5 min ago", "3 h ago" or "2 d ago".
 */
export function formatAssistantThreadAge(date: number, now: number): string {
	const minutes = Math.floor(Math.max(0, now - date) / 60000);

	if (minutes < 1) {
		return "just now";
	}

	if (minutes < 60) {
		return `${minutes} min ago`;
	}

	const hours = Math.floor(minutes / 60);
	return hours < 24 ? `${hours} h ago` : `${Math.floor(hours / 24)} d ago`;
}
