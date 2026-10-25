import { join, dirname } from "path/posix";
import { pathExists, readFile, writeFile } from "fs-extra";

import { toast } from "sonner";

import { Node, Observable } from "babylonjs";

import { Editor } from "../../editor/main";
import { SceneLinkNode } from "../../editor/nodes/scene-link";

import { projectConfiguration } from "../../project/configuration";
import { saveScene } from "../../project/save/scene";

import { isSceneLinkNode } from "../guards/scene";

import { getRootSceneLink } from "./scene-link";
import { isDimmingOthersPreferred, setDimmingOthersPreferred, startPrefabDimming, stopPrefabDimming } from "./prefab-dimming";

import { reloadSceneLinks } from "../../editor/layout/assets-browser/events/scene";

/**
 * Notified when a prefab starts or stops being edited in place (null when none is).
 */
export const onPrefabEditedInPlaceChangedObservable = new Observable<SceneLinkNode | null>();

let editedLink: SceneLinkNode | null = null;

/**
 * Returns the instance whose prefab is being edited in place, if any.
 */
export function getPrefabEditedInPlace(): SceneLinkNode | null {
	return editedLink;
}

function setEditedLink(link: SceneLinkNode | null): void {
	editedLink = link;
	onPrefabEditedInPlaceChangedObservable.notifyObservers(link);
}

/**
 * Returns the instances of the given prefab in the scene.
 * @param absolutePath defines the absolute path of the prefab (.scene).
 */
export function findPrefabInstances(editor: Editor, absolutePath: string): SceneLinkNode[] {
	if (!projectConfiguration.path) {
		return [];
	}

	const relativePath = absolutePath.replace(join(dirname(projectConfiguration.path), "/"), "");

	return editor.layout.preview.scene.transformNodes.filter((node): node is SceneLinkNode => isSceneLinkNode(node) && node.relativePath === relativePath);
}

/**
 * Starts editing the prefab of the given instance in place, in the scene (like Unity's prefab mode in context): the nodes it shows become
 * the prefab itself, and can be edited with the Graph, the Inspector and the gizmos. Saving writes them in the prefab asset: every instance
 * shows the changes.
 * @returns wether or not the prefab is being edited.
 */
export function editPrefabInPlace(editor: Editor, link: SceneLinkNode): boolean {
	if (editedLink === link) {
		return true;
	}

	if (editedLink) {
		toast.error(`Save or discard the changes of the prefab '${editedLink.name}' first.`);
		return false;
	}

	if (!link.relativePath) {
		return false;
	}

	link.beginEditingInPlace();
	link.onDisposeObservable.addOnce(() => {
		if (editedLink === link) {
			stopPrefabDimming();
			setEditedLink(null);
		}
	});

	if (isDimmingOthersPreferred()) {
		startPrefabDimming(editor.layout.preview.scene, link);
	}

	setEditedLink(link);

	editor.layout.graph.refresh();
	editor.layout.inspector.forceUpdate();

	return true;
}

/**
 * Greys out (or not) the objects that are not part of the prefab being edited in place. The choice is remembered.
 */
export function setPrefabEditDimmingOthers(editor: Editor, dim: boolean): void {
	setDimmingOthersPreferred(dim);

	if (!editedLink) {
		return;
	}

	if (dim) {
		startPrefabDimming(editor.layout.preview.scene, editedLink);
	} else {
		stopPrefabDimming();
	}
}

function getContent(link: SceneLinkNode): Set<Node> {
	const content = new Set<Node>();

	const visit = (node: Node) => {
		node.getChildren().forEach((child) => {
			content.add(child);

			// What an instance nested in the prefab shows belongs to the prefab of that instance.
			if (!isSceneLinkNode(child)) {
				visit(child);
			}
		});
	};

	visit(link);

	return content;
}

/**
 * Writes the nodes of the prefab being edited in place in the prefab asset, and shows the result on every instance.
 */
export async function savePrefabEditedInPlace(editor: Editor, link: SceneLinkNode): Promise<void> {
	if (!projectConfiguration.path || !link.relativePath) {
		return;
	}

	const projectDirectory = dirname(projectConfiguration.path);
	const scenePath = join(projectDirectory, link.relativePath);

	// What is saved is the content of the prefab: the settings of the scene (environment, post-processes...) stay the ones of the prefab.
	const configPath = join(scenePath, "config.json");
	const config = (await pathExists(configPath)) ? await readFile(configPath) : null;

	const included = getContent(link);
	const roots = link.getChildren();

	try {
		// Saved without the instance as their parent, like the nodes of a new prefab.
		roots.forEach((root) => (root.parent = null));

		await saveScene(editor, projectDirectory, scenePath, {
			filter: (node) => included.has(node),
			includeSceneLinkAnimationGroups: true,
		});
	} finally {
		roots.forEach((root) => (root.parent = link));
	}

	if (config) {
		await writeFile(configPath, config);
	}

	await reloadSceneLinks(editor, scenePath);

	editor.layout.graph.refresh();
	editor.layout.inspector.forceUpdate();
}

/**
 * Stops editing the prefab in place.
 * @param save defines wether or not the changes are written in the prefab, they are lost otherwise.
 */
export async function exitPrefabEditedInPlace(editor: Editor, link: SceneLinkNode, save: boolean): Promise<void> {
	if (save) {
		await savePrefabEditedInPlace(editor, link);
	} else {
		await link.reload();
	}

	link.endEditingInPlace();

	if (editedLink === link) {
		stopPrefabDimming();
		setEditedLink(null);
	}

	editor.layout.graph.refresh();
	editor.layout.inspector.forceUpdate();
	editor.layout.preview.setRenderScene(true);
}

/**
 * Returns the instance of the given prefab to edit in place when the prefab is double clicked in the assets browser: the one that is
 * selected (or has a selected node), else the first one. Null when the scene has no instance of it.
 */
export function findPrefabInstanceToEdit(editor: Editor, absolutePath: string): SceneLinkNode | null {
	const instances = findPrefabInstances(editor, absolutePath);

	const selected = editor.layout.graph.getSelectedNodes().map((n) => n.nodeData as Node | undefined);
	for (const node of selected) {
		const link = node && getRootSceneLink(node);
		if (link && instances.includes(link as SceneLinkNode)) {
			return link as SceneLinkNode;
		}
	}

	return instances[0] ?? null;
}
