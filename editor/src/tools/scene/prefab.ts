import { join, dirname } from "path/posix";
import { mkdir } from "fs-extra";
import { ipcRenderer } from "electron";

import { AbstractMesh, InstancedMesh, Mesh, Node, Quaternion, Tools, TransformNode, Vector3 } from "babylonjs";

import { Editor } from "../../editor/main";
import { SceneLinkNode } from "../../editor/nodes/scene-link";

import { projectConfiguration } from "../../project/configuration";
import { saveScene } from "../../project/save/scene";

import { findAvailableFilename } from "../fs";
import { registerUndoRedo } from "../undoredo";
import { UniqueNumber } from "../tools";
import { isSceneLinkNode } from "../guards/scene";
import { isClusteredLightContainer, isEditorCamera } from "../guards/nodes";

import { writeOverridesInPrefab } from "./prefab-apply";
import { createSceneLink, isFromSceneLink } from "./scene-link";

import { reloadSceneLinks } from "../../editor/layout/assets-browser/events/scene";

/**
 * Defines the folder, relative to the project, where the prefabs are created.
 */
export const defaultPrefabsDirectory = "assets/prefabs";

export interface ICreatePrefabResult {
	/**
	 * Defines the absolute path of the scene asset (the prefab) that was created.
	 */
	absolutePath: string;
	/**
	 * Defines the path of the scene asset relative to the project.
	 */
	relativePath: string;
	/**
	 * Defines the scene link that replaced the nodes in the scene.
	 */
	link: TransformNode;
}

/**
 * Returns a name usable as the name of a scene asset: the characters not allowed in file names are replaced.
 * @param name defines the name typed by the user.
 */
export function getPrefabName(name: string): string {
	const cleaned = name
		.trim()
		.replace(/\.scene$/i, "")
		.replace(/[\\/:*?"<>|]/g, "_")
		.trim();
	return cleaned || "Prefab";
}

/**
 * Returns the nodes of the given list that have no ancestor in the list: the roots of the selection. Nodes that can't be part
 * of a prefab (the camera of the editor, the clustered light container, the content of a scene link) are ignored.
 * @param nodes defines the selected nodes.
 */
export function getPrefabRoots(nodes: Node[]): Node[] {
	const candidates = nodes.filter((node) => !isEditorCamera(node) && !isClusteredLightContainer(node) && (!isFromSceneLink(node) || isSceneLinkNode(node)));
	const set = new Set<Node>(candidates);

	return candidates.filter((node) => {
		for (let parent = node.parent; parent; parent = parent.parent) {
			if (set.has(parent)) {
				return false;
			}
		}

		return true;
	});
}

/**
 * Returns what prevents the given nodes from being saved together as a prefab, or null when they can. A mesh is saved with its
 * instances, and an instance is saved with its source mesh: both must be in the prefab, else the prefab would hold extra nodes
 * or the scene would lose instances when the nodes are removed from it.
 * @param included defines the nodes that would be saved in the prefab (the roots and their descendants).
 */
export function getPrefabSelectionProblem(included: Set<Node>): string | null {
	for (const node of included) {
		if (node instanceof Mesh) {
			const outside = node.instances.filter((instance) => !included.has(instance));
			if (outside.length) {
				return `"${node.name}" has instances outside the selection (${outside
					.slice(0, 3)
					.map((instance) => `"${instance.name}"`)
					.join(", ")}${outside.length > 3 ? "..." : ""}). Select them too, or make the prefab from the instances' source mesh together with them.`;
			}
		}

		if (node instanceof InstancedMesh && !included.has(node.sourceMesh)) {
			return `"${node.name}" is an instance of "${node.sourceMesh.name}", which is not in the selection. Select the source mesh too.`;
		}
	}

	return null;
}

function getAllNodes(root: Node): Node[] {
	return [root, ...root.getDescendants(false)];
}

function getLocalRotation(node: Node): Quaternion {
	const transformNode = node as TransformNode;
	if (transformNode.rotationQuaternion) {
		return transformNode.rotationQuaternion.clone();
	}

	const rotation = transformNode.rotation ?? Vector3.Zero();
	return Quaternion.FromEulerAngles(rotation.x, rotation.y, rotation.z);
}

/**
 * Saves the given nodes (with their descendants) as a scene asset in the prefabs folder of the project, and replaces them in the
 * scene with a link to it. The link takes the place and orientation of the nodes: a prefab is saved at the origin.
 * The nodes are removed from the scene once saved: they live in the prefab, and every instance of it is a link.
 * The creation can be undone: the nodes come back from the prefab (the asset stays on disk).
 * @param editor defines the reference to the editor.
 * @param nodes defines the nodes to make the prefab of. When they are several roots, a group holding them is created.
 * @param name defines the name of the prefab.
 * @param directory defines the folder of the prefab, relative to the project.
 */
export async function createPrefabFromNodes(editor: Editor, nodes: Node[], name: string, directory: string = defaultPrefabsDirectory): Promise<ICreatePrefabResult> {
	if (!projectConfiguration.path) {
		throw new Error("No project is opened.");
	}

	const roots = getPrefabRoots(nodes);
	if (!roots.length) {
		throw new Error("Select at least one node that can be part of a prefab.");
	}

	const problem = getPrefabSelectionProblem(new Set(roots.flatMap((root) => getAllNodes(root))));
	if (problem) {
		throw new Error(problem);
	}

	const projectDirectory = dirname(projectConfiguration.path);
	const scene = editor.layout.preview.scene;

	const prefabName = getPrefabName(name);
	const absoluteDirectory = join(projectDirectory, directory);

	await mkdir(absoluteDirectory, { recursive: true });

	const filename = await findAvailableFilename(absoluteDirectory, prefabName, ".scene");
	const absolutePath = join(absoluteDirectory, filename);
	const relativePath = join(directory, filename);

	let root = roots[0];

	// Several roots (or a root that has no transform, like a light) are grouped under a node placed in the middle of them.
	if (roots.length > 1 || !(roots[0] instanceof TransformNode)) {
		const center = roots.reduce((sum, node) => sum.addInPlace(getWorldPosition(node)), Vector3.Zero()).scaleInPlace(1 / roots.length);

		const group = new TransformNode(prefabName, scene);
		group.id = Tools.RandomId();
		group.uniqueId = UniqueNumber.Get();
		group.metadata = {};
		group.parent = roots[0].parent;
		group.position = group.parent ? Vector3.TransformCoordinates(center, getParentWorldMatrixInverse(group.parent)) : center;

		roots.forEach((node) => (node as TransformNode).setParent?.(group));

		root = group;
	}

	const included = new Set<Node>(getAllNodes(root));

	// What takes the place of the prefab in the scene.
	const parent = root.parent;
	const rootTransform = root as TransformNode;
	const position = rootTransform.position.clone();
	const rotation = getLocalRotation(root);

	// The prefab is saved at the origin: the transform of its root is the one of the link.
	const savedRotation = rootTransform.rotationQuaternion?.clone() ?? null;
	const savedEuler = rootTransform.rotation.clone();

	await mkdir(absolutePath);

	try {
		root.parent = null;
		rootTransform.position.set(0, 0, 0);
		rootTransform.rotationQuaternion = Quaternion.Identity();

		await saveScene(editor, projectDirectory, absolutePath, {
			filter: (node) => included.has(node),
		});
	} finally {
		root.parent = parent;
		rootTransform.position.copyFrom(position);
		rootTransform.rotationQuaternion = savedRotation;
		rootTransform.rotation.copyFrom(savedEuler);
	}

	const placement: IPrefabPlacement = { name: prefabName, parent, position, rotation };

	let current = await replaceWithLink(editor, root, absolutePath, placement);

	registerUndoRedo({
		executeRedo: false,
		undo: () => {
			const restored = restoreFromLink(editor, current.link, parent, position, rotation);
			root = restored[0];
		},
		redo: () => {
			void replaceWithLink(editor, root, absolutePath, placement).then((result) => (current = result));
		},
	});

	return { absolutePath, relativePath, link: current.link };
}

/**
 * Defines where the instance of a prefab goes in the scene.
 */
interface IPrefabPlacement {
	name: string;
	parent: Node | null;
	position: Vector3;
	rotation: Quaternion;
}

async function replaceWithLink(editor: Editor, root: Node, absolutePath: string, placement: IPrefabPlacement): Promise<{ link: SceneLinkNode }> {
	const { name, parent, position, rotation } = placement;

	// The nodes leave the scene before the link loads the prefab: both would share the same unique ids.
	root.dispose(false, false);

	const link = (await createSceneLink(editor, absolutePath)) as SceneLinkNode;
	link.name = name;
	link.parent = parent;
	link.position.copyFrom(position);
	link.rotationQuaternion = rotation.clone();

	editor.layout.graph.refresh();
	editor.layout.assets.refresh();
	editor.layout.inspector.setEditedObject(link);

	return { link };
}

/**
 * Takes the content of a link out of it, as nodes of the scene at the place of the link, and removes the link. Used by the undo of the
 * creation of a prefab: the nodes come back as they were (they keep their ids).
 */
function restoreFromLink(editor: Editor, link: SceneLinkNode, parent: Node | null, position: Vector3, rotation: Quaternion): Node[] {
	link.releaseContent();

	const roots = link.getChildren().slice();
	roots.forEach((node) => {
		node.parent = parent;

		const transformNode = node as TransformNode;
		if (transformNode.position) {
			transformNode.position.copyFrom(position);
			transformNode.rotationQuaternion = rotation.clone();
		}
	});

	link.dispose();

	editor.layout.graph.refresh();
	if (roots.length) {
		editor.layout.graph.setSelectedNode(roots[0]);
	}

	return roots;
}

/**
 * Turns a prefab instance into plain nodes of the scene (Unity's "Unpack Prefab"): the content of the link, with what the instance
 * overrides, is kept as the children of a group that replaces the link, and is not connected to the prefab anymore.
 * @param editor defines the reference to the editor.
 * @param link defines the scene link to unpack.
 * @returns the group that holds the nodes of the prefab.
 */
export function unpackSceneLink(editor: Editor, link: SceneLinkNode): TransformNode {
	const scene = editor.layout.preview.scene;

	// Nothing is disposed with the link once the content is released.
	link.releaseContent();
	const roots = link.getChildren().slice();

	const group = new TransformNode(link.name, scene);
	group.id = Tools.RandomId();
	group.uniqueId = UniqueNumber.Get();
	group.metadata = link.metadata ? JSON.parse(JSON.stringify(link.metadata)) : {};
	group.parent = link.parent;
	group.position.copyFrom(link.position);
	group.rotationQuaternion = link.rotationQuaternion?.clone() ?? Quaternion.FromEulerAngles(link.rotation.x, link.rotation.y, link.rotation.z);
	group.scaling.copyFrom(link.scaling);

	roots.forEach((node) => (node.parent = group));

	// The content has the ids it has in the prefab, which other instances share: it gets its own.
	const ids = new Map<string, string>();
	const materials = new Map<string, string>();

	group.getDescendants(false).forEach((node) => {
		const id = Tools.RandomId();
		ids.set(node.id, id);

		node.id = id;
		node.uniqueId = UniqueNumber.Get();

		if (node instanceof AbstractMesh && node.material && !materials.has(node.material.id)) {
			const materialId = Tools.RandomId();
			materials.set(node.material.id, materialId);
			node.material.id = materialId;
			node.material.uniqueId = UniqueNumber.Get();
		}
	});

	// The scripts that point to nodes of the prefab by id follow them.
	[group, ...group.getDescendants(false)].forEach((node) => {
		node.metadata?.scripts?.forEach((script: any) => {
			Object.values<any>(script.values ?? {}).forEach((value) => {
				if (value?.type === "entity" && ids.has(value.value)) {
					value.value = ids.get(value.value);
				}
			});
		});
	});

	link.dispose();

	editor.layout.graph.refresh();
	editor.layout.graph.setSelectedNode(group);

	return group;
}

/**
 * Opens the prefab of the given scene link in its own window, to edit it: saving it updates every instance.
 */
export function openPrefab(editor: Editor, link: SceneLinkNode): void {
	if (!projectConfiguration.path || !link.relativePath) {
		return;
	}

	openPrefabWindow(editor, join(dirname(projectConfiguration.path), link.relativePath));
}

/**
 * Opens the given scene asset (a prefab) in its own window, next to the scene being edited.
 * @param absolutePath defines the absolute path of the scene asset (.scene).
 */
export function openPrefabWindow(editor: Editor, absolutePath: string): void {
	ipcRenderer.send("window:open", "build/src/editor/windows/scene", {
		appPath: editor.path,
		scenePath: absolutePath,
		projectPath: editor.state.projectPath,
	});
}

/**
 * Returns wether or not the given scene asset is a prefab, that is lives in a "prefabs" folder.
 */
export function isPrefabAsset(absolutePath: string): boolean {
	return absolutePath.split(/[\\/]/).includes("prefabs");
}

/**
 * Shows the prefab of the given scene link in the assets browser, selected.
 */
export async function revealPrefab(editor: Editor, link: SceneLinkNode): Promise<void> {
	if (!projectConfiguration.path || !link.relativePath) {
		return;
	}

	await editor.layout.assets.revealFile(join(dirname(projectConfiguration.path), link.relativePath));
}

/**
 * Writes what an instance overrides in the prefab itself (Unity's "Apply"): the prefab takes the values, and every instance of it,
 * this one included, shows them. Without nodes, all the overrides of the instance are applied.
 * @param editor defines the reference to the editor.
 * @param link defines the instance.
 * @param node defines the node of the prefab whose overrides are applied.
 * @param entryIds defines the properties of the node to apply (@see SceneLinkNode.getOverrideEntries), all of them when not set.
 * @returns the number of nodes of the prefab that changed.
 */
export async function applyOverridesToPrefab(editor: Editor, link: SceneLinkNode, node?: Node, entryIds?: string[]): Promise<number> {
	if (!projectConfiguration.path || !link.relativePath) {
		return 0;
	}

	const all = link.getOverrides();
	let overrides = node ? (all[node.id] ? { [node.id]: all[node.id] } : {}) : all;

	if (node && entryIds) {
		const patch = link.getOverrideEntriesPatch(node, entryIds);
		overrides = patch ? { [node.id]: patch } : {};
	}

	if (!Object.keys(overrides).length) {
		return 0;
	}

	const scenePath = join(dirname(projectConfiguration.path), link.relativePath);
	const applied = await writeOverridesInPrefab(scenePath, overrides);

	// The instances (this one too) load the prefab again: they show the new values.
	await reloadSceneLinks(editor, scenePath);

	editor.layout.graph.refresh();
	editor.layout.inspector.forceUpdate();

	return applied.length;
}

function getWorldPosition(node: Node): Vector3 {
	return (node as TransformNode).getAbsolutePosition ? (node as TransformNode).getAbsolutePosition().clone() : Vector3.Zero();
}

function getParentWorldMatrixInverse(parent: Node) {
	return (parent as TransformNode).getWorldMatrix().clone().invert();
}
