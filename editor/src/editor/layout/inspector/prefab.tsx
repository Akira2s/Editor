import { useEffect, useRef, useState } from "react";

import { Node } from "babylonjs";

import { FaLink } from "react-icons/fa";

import { Button } from "../../../ui/shadcn/ui/button";

import { onNodeModifiedObservable } from "../../../tools/observables";
import { getPrefabOverrideProperties } from "../../../tools/scene/prefab-overrides";
import { getRootSceneLink } from "../../../tools/scene/scene-link";
import { applyOverridesToPrefab, openPrefab } from "../../../tools/scene/prefab";

import { EditorPrefabOverridesMenu } from "./prefab-overrides";

import { SceneLinkNode } from "../../nodes/scene-link";

import { Editor } from "../../main";

export interface IEditorPrefabNodeBannerProps {
	editor: Editor;
	/**
	 * Defines the node of a prefab, shown by an instance of it, being edited.
	 */
	node: Node;
}

/**
 * Shown above the inspector of a node of a prefab instance: what is edited is an override of this instance, kept in the scene. It can be
 * reverted, or applied to the prefab (and so every instance).
 */
export function EditorPrefabNodeBanner(props: IEditorPrefabNodeBannerProps) {
	const link = getRootSceneLink(props.node);

	// The fields of the inspector change the node without telling anybody: look at it regularly, and show in the graph when the node
	// becomes (or stops being) overridden.
	const [, setTick] = useState(0);
	const wasOverridden = useRef<boolean | null>(null);

	useEffect(() => {
		const id = setInterval(() => {
			const overridden = !!(getRootSceneLink(props.node) as SceneLinkNode | null)?.getNodeOverride(props.node);

			if (wasOverridden.current !== null && wasOverridden.current !== overridden) {
				props.editor.layout.graph.refresh();
			}

			wasOverridden.current = overridden;
			setTick((tick) => tick + 1);
		}, 400);

		return () => clearInterval(id);
	}, [props.node]);

	if (!link || link === props.node) {
		return null;
	}

	const sceneLink = link as SceneLinkNode;
	const override = sceneLink.getNodeOverride(props.node);
	const properties = override ? getPrefabOverrideProperties(override) : [];

	const refresh = () => {
		props.editor.layout.graph.refresh();
		props.editor.layout.inspector.forceUpdate();
	};

	return (
		<div className="flex flex-col gap-2 w-full p-2 rounded-lg bg-sky-500/10 border border-sky-500/30">
			<div className="flex items-center gap-2 text-sm text-sky-400">
				<FaLink className="w-4 h-4 shrink-0" />
				<div className="flex-1 min-w-0 truncate" title={sceneLink.relativePath ?? ""}>
					Part of prefab <b>{sceneLink.name}</b>
				</div>
				<EditorPrefabOverridesMenu editor={props.editor} instance={sceneLink} node={props.node} />
				<Button variant="ghost" size="sm" onClick={() => openPrefab(props.editor, sceneLink)}>
					Open
				</Button>
			</div>

			{override ? (
				<div className="flex items-center gap-2 text-xs">
					<div className="flex-1 min-w-0">
						<b>Overridden in this instance:</b> {properties.join(", ")}
					</div>
					<Button
						variant="secondary"
						size="sm"
						onClick={() => {
							sceneLink.revertOverrides(props.node).forEach((n) => onNodeModifiedObservable.notifyObservers(n));
							refresh();
						}}
					>
						Revert
					</Button>
					<Button
						variant="secondary"
						size="sm"
						title="Write these values in the prefab: every instance gets them"
						onClick={() => applyOverridesToPrefab(props.editor, sceneLink, props.node).then(refresh)}
					>
						Apply to prefab
					</Button>
				</div>
			) : (
				<div className="text-xs opacity-70">Changes made here only apply to this instance (an override). Edit the prefab to change all of them.</div>
			)}
		</div>
	);
}
