import { ReactNode, useEffect, useRef, useState } from "react";

import { Node } from "babylonjs";

import { FaChevronDown } from "react-icons/fa";

import { Button } from "../../../ui/shadcn/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../../ui/shadcn/ui/popover";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "../../../ui/shadcn/ui/context-menu";

import { onNodeModifiedObservable } from "../../../tools/observables";
import { applyOverridesToPrefab } from "../../../tools/scene/prefab";
import { getRootSceneLink } from "../../../tools/scene/scene-link";
import { IPrefabOverrideEntry } from "../../../tools/scene/prefab-overrides";

import { SceneLinkNode } from "../../nodes/scene-link";

import { Editor } from "../../main";

/**
 * Returns the instance the given node belongs to as a part of the prefab, or null when it is not part of a prefab (or is the instance itself).
 */
export function getPrefabInstanceOf(node: Node | null | undefined): SceneLinkNode | null {
	if (!node) {
		return null;
	}

	const link = getRootSceneLink(node) as SceneLinkNode | null;
	return link && link !== node ? link : null;
}

/**
 * Returns the ids of the properties of the given node the instance overrides, or an empty set. The inspector fields do not tell when they
 * change a value: the result is shared and recomputed at most every 150 ms.
 */
const entryCache = new WeakMap<Node, { time: number; ids: Set<string> }>();

export function getOverriddenEntryIds(node: Node): Set<string> {
	const now = performance.now();
	const cached = entryCache.get(node);
	if (cached && now - cached.time < 150) {
		return cached.ids;
	}

	const ids = new Set(
		getPrefabInstanceOf(node)
			?.getOverrideEntries(node)
			.map((entry) => entry.id) ?? []
	);
	entryCache.set(node, { time: now, ids });

	return ids;
}

function usePolling(callback: () => void, interval = 300): void {
	const latest = useRef(callback);
	latest.current = callback;

	useEffect(() => {
		const id = setInterval(() => latest.current(), interval);
		return () => clearInterval(id);
	}, [interval]);
}

function notifyChanged(editor: Editor, node: Node): void {
	entryCache.delete(node);

	onNodeModifiedObservable.notifyObservers(node);

	editor.layout.graph.refresh();
	editor.layout.inspector.forceUpdate();
}

export interface IPrefabOverrideMarkProps {
	editor: Editor;
	/**
	 * Defines the node being inspected (the node that owns the field).
	 */
	node: Node;
	/**
	 * Defines the ids of the entries the field edits, @see IPrefabOverrideEntry.
	 */
	entryIds: string[];
	children: ReactNode;
}

/**
 * Wraps an inspector field of a node of a prefab instance: a blue bar tells that this instance overrides the property, and the context
 * menu of the field reverts it or applies it to the prefab, like Unity.
 */
export function PrefabOverrideMark(props: IPrefabOverrideMarkProps) {
	const instance = getPrefabInstanceOf(props.node);

	const compute = () => !!instance && props.entryIds.some((id) => getOverriddenEntryIds(props.node).has(id));

	const [overridden, setOverridden] = useState(compute);
	usePolling(() => setOverridden(compute()));

	if (!instance) {
		return <>{props.children}</>;
	}

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div className="relative" data-prefab-override={overridden ? props.entryIds.join(",") : undefined}>
					{overridden && <div className="absolute -left-1 top-0 bottom-0 w-[3px] rounded bg-sky-400 pointer-events-none" />}
					{props.children}
				</div>
			</ContextMenuTrigger>
			{overridden && (
				<ContextMenuContent>
					<ContextMenuItem
						onClick={() => {
							instance.revertOverrideEntries(props.node, props.entryIds);
							notifyChanged(props.editor, props.node);
						}}
					>
						Revert Override
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem onClick={() => applyOverridesToPrefab(props.editor, instance, props.node, props.entryIds).then(() => notifyChanged(props.editor, props.node))}>
						Apply to Prefab
					</ContextMenuItem>
				</ContextMenuContent>
			)}
		</ContextMenu>
	);
}

export interface IEditorPrefabOverridesMenuProps {
	editor: Editor;
	instance: SceneLinkNode;
	/**
	 * Defines the node whose overrides are listed. When not set, the ones of all the nodes of the instance are.
	 */
	node?: Node;
}

interface IOverrideGroup {
	node: Node;
	entries: IPrefabOverrideEntry[];
}

function listGroups(props: IEditorPrefabOverridesMenuProps): IOverrideGroup[] {
	if (props.node) {
		const entries = props.instance.getOverrideEntries(props.node);
		return entries.length ? [{ node: props.node, entries }] : [];
	}

	return props.instance.getAllOverrideEntries();
}

/**
 * A dropdown listing everything this instance overrides, per node and component, each row with its own Revert and Apply (Unity's
 * "Overrides" dropdown).
 */
export function EditorPrefabOverridesMenu(props: IEditorPrefabOverridesMenuProps) {
	const [groups, setGroups] = useState(() => listGroups(props));
	usePolling(() => setGroups(listGroups(props)));

	const count = groups.reduce((total, group) => total + group.entries.length, 0);

	const refresh = (node: Node) => {
		notifyChanged(props.editor, node);
		setGroups(listGroups(props));
	};

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="secondary" size="sm" className="gap-1" title="Everything this instance changes compared to the prefab">
					Overrides{count ? ` (${count})` : ""}
					<FaChevronDown className="w-3 h-3" />
				</Button>
			</PopoverTrigger>

			<PopoverContent className="w-96 max-h-96 overflow-y-auto p-2 flex flex-col gap-2" align="end">
				{!count && <div className="text-sm opacity-70 p-2">No overrides: this instance is the prefab.</div>}

				{groups.map((group) => (
					<div key={group.node.id} className="flex flex-col gap-1">
						<div className="flex items-center gap-2 px-1">
							<div className="flex-1 min-w-0 truncate font-semibold text-sm text-sky-400" title={group.node.name}>
								{group.node.name}
							</div>
							<Button
								variant="ghost"
								size="sm"
								className="h-6 px-2 text-xs"
								onClick={() => {
									props.instance.revertOverrideEntries(
										group.node,
										group.entries.map((e) => e.id)
									);
									refresh(group.node);
								}}
							>
								Revert
							</Button>
							<Button
								variant="ghost"
								size="sm"
								className="h-6 px-2 text-xs"
								onClick={() =>
									applyOverridesToPrefab(
										props.editor,
										props.instance,
										group.node,
										group.entries.map((e) => e.id)
									).then(() => refresh(group.node))
								}
							>
								Apply
							</Button>
						</div>

						{group.entries.map((entry) => (
							<div
								key={entry.id}
								className="flex items-center gap-2 pl-4 pr-1 py-0.5 rounded hover:bg-muted/50"
								data-override-entry={`${group.node.name}:${entry.id}`}
							>
								<div className="w-1 h-4 rounded bg-sky-400 shrink-0" />
								<div className="flex-1 min-w-0 truncate text-sm">
									<span className="opacity-60">{entry.component} › </span>
									{entry.label}
								</div>
								<Button
									variant="ghost"
									size="sm"
									className="h-6 px-2 text-xs"
									onClick={() => {
										props.instance.revertOverrideEntries(group.node, [entry.id]);
										refresh(group.node);
									}}
								>
									Revert
								</Button>
								<Button
									variant="ghost"
									size="sm"
									className="h-6 px-2 text-xs"
									onClick={() => applyOverridesToPrefab(props.editor, props.instance, group.node, [entry.id]).then(() => refresh(group.node))}
								>
									Apply
								</Button>
							</div>
						))}
					</div>
				))}
			</PopoverContent>
		</Popover>
	);
}
