import { useState } from "react";

import { IoCheckmark, IoClose, IoPencil, IoTimeOutline, IoTrashOutline } from "react-icons/io5";

import { Button } from "../../../ui/shadcn/ui/button";
import { Input } from "../../../ui/shadcn/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../../ui/shadcn/ui/popover";

import { getAssistantAgent, EditorAssistantAgentId } from "./agents";
import { formatAssistantThreadAge, IAssistantThread, sortAssistantThreads } from "./threads";

const agentBadgeClassNames: Record<EditorAssistantAgentId, string> = {
	claude: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
	codex: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
	antigravity: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
};

const agentShortNames: Record<EditorAssistantAgentId, string> = {
	claude: "Claude",
	codex: "Codex",
	antigravity: "Antigravity",
};

export interface IAssistantThreadsMenuProps {
	/**
	 * Defines the threads of the project.
	 */
	threads: IAssistantThread[];
	/**
	 * Defines the identifier of the thread running in the assistant, if any.
	 */
	activeId: string | null;
	/**
	 * Called when the user picks a thread to switch to.
	 */
	onSelect: (id: string) => void;
	/**
	 * Called when the user renames a thread.
	 */
	onRename: (id: string, name: string) => void;
	/**
	 * Called when the user deletes a thread.
	 */
	onDelete: (id: string) => void;
}

/**
 * The agent a thread is connected to, shown as a colored label.
 */
export function AssistantAgentBadge(props: { agent: EditorAssistantAgentId }) {
	return (
		<span title={getAssistantAgent(props.agent).name} className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none ${agentBadgeClassNames[props.agent]}`}>
			{agentShortNames[props.agent]}
		</span>
	);
}

/**
 * The history of the threads of the assistant: a button opening the list to switch between them, rename and delete them.
 */
export function AssistantThreadsMenu(props: IAssistantThreadsMenuProps) {
	const [open, setOpen] = useState(false);
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [renameValue, setRenameValue] = useState("");
	const [deletingId, setDeletingId] = useState<string | null>(null);

	const close = () => {
		setOpen(false);
		setRenamingId(null);
		setDeletingId(null);
	};

	const commitRename = (id: string) => {
		props.onRename(id, renameValue);
		setRenamingId(null);
	};

	const threads = sortAssistantThreads(props.threads);
	const now = Date.now();

	return (
		<Popover open={open} onOpenChange={(value) => (value ? setOpen(true) : close())}>
			<PopoverTrigger asChild>
				<Button variant="ghost" className="w-8 h-8 !p-0" title="Threads history">
					<IoTimeOutline className="w-5 h-5" />
				</Button>
			</PopoverTrigger>

			<PopoverContent align="end" className="w-80 p-1">
				<div className="px-2 py-1.5 text-xs font-normal text-muted-foreground">Threads history</div>

				{!threads.length && <div className="px-2 py-4 text-sm text-center text-muted-foreground">No threads yet in this project.</div>}

				<div className="flex flex-col max-h-80 overflow-y-auto">
					{threads.map((thread) => {
						const active = thread.id === props.activeId;
						const renaming = thread.id === renamingId;
						const deleting = thread.id === deletingId;

						return (
							<div
								key={thread.id}
								className={`group flex items-center gap-2 px-2 py-1.5 rounded-sm ${renaming || deleting ? "" : "cursor-pointer hover:bg-accent"} ${active ? "bg-accent/60" : ""}`}
								onClick={() => {
									if (!renaming && !deleting) {
										close();
										props.onSelect(thread.id);
									}
								}}
							>
								<AssistantAgentBadge agent={thread.agent} />

								{renaming ? (
									<>
										<Input
											autoFocus
											value={renameValue}
											className="h-7 px-2 text-sm"
											onChange={(ev) => setRenameValue(ev.target.value)}
											onKeyDown={(ev) => {
												ev.stopPropagation();

												if (ev.key === "Enter") {
													commitRename(thread.id);
												} else if (ev.key === "Escape") {
													setRenamingId(null);
												}
											}}
										/>
										<Button variant="ghost" className="w-6 h-6 !p-0 shrink-0" title="Save" onClick={() => commitRename(thread.id)}>
											<IoCheckmark className="w-4 h-4" />
										</Button>
										<Button variant="ghost" className="w-6 h-6 !p-0 shrink-0" title="Cancel" onClick={() => setRenamingId(null)}>
											<IoClose className="w-4 h-4" />
										</Button>
									</>
								) : deleting ? (
									<>
										<div className="flex-1 min-w-0 text-sm" title="Removes the thread from this list. The conversation stays in the agent.">
											Delete &ldquo;<span className="truncate">{thread.name}</span>&rdquo;?
										</div>
										<Button
											variant="ghost"
											className="w-6 h-6 !p-0 shrink-0 text-destructive"
											title="Delete"
											onClick={() => {
												props.onDelete(thread.id);
												setDeletingId(null);
											}}
										>
											<IoCheckmark className="w-4 h-4" />
										</Button>
										<Button variant="ghost" className="w-6 h-6 !p-0 shrink-0" title="Cancel" onClick={() => setDeletingId(null)}>
											<IoClose className="w-4 h-4" />
										</Button>
									</>
								) : (
									<>
										<div className="flex flex-col flex-1 min-w-0">
											<div className="text-sm truncate">{thread.name}</div>
											<div className="text-xs text-muted-foreground">{active ? "Open now" : formatAssistantThreadAge(thread.updatedAt, now)}</div>
										</div>
										<Button
											variant="ghost"
											className="w-6 h-6 !p-0 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
											title="Rename"
											onClick={(ev) => {
												ev.stopPropagation();
												setDeletingId(null);
												setRenameValue(thread.name);
												setRenamingId(thread.id);
											}}
										>
											<IoPencil className="w-3.5 h-3.5" />
										</Button>
										<Button
											variant="ghost"
											className="w-6 h-6 !p-0 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
											title="Delete"
											onClick={(ev) => {
												ev.stopPropagation();
												setRenamingId(null);
												setDeletingId(thread.id);
											}}
										>
											<IoTrashOutline className="w-3.5 h-3.5" />
										</Button>
									</>
								)}
							</div>
						);
					})}
				</div>
			</PopoverContent>
		</Popover>
	);
}
