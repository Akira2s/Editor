import { join, dirname } from "path/posix";
import { mkdir } from "fs-extra";

import { Node, Quaternion, Tools, TransformNode, Vector3 } from "babylonjs";

import { Editor } from "../../editor/main";

import { projectConfiguration } from "../../project/configuration";
import { saveScene } from "../../project/save/scene";

import { findAvailableFilename } from "../fs";
import { UniqueNumber } from "../tools";
import { isAnyTransformNode, isClusteredLightContainer, isEditorCamera } from "../guards/nodes";

import { createSceneLink, isFromSceneLink } from "./scene-link";

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
	const candidates = nodes.filter((node) => !isEditorCamera(node) && !isClusteredLightContainer(node) && (!isFromSceneLink(node) || isSceneLinkRoot(node)));
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
 * A scene link itself can be part of a prefab (a prefab made of prefabs), its content can't.
 */
function isSceneLinkRoot(node: Node): boolean {
	return node.getClassName() === "SceneLinkNode";
}

/**
 * Saves the given nodes (with their descendants) as a scene asset in the prefabs folder of the project, and replaces them in the
 * scene with a link to it. The link takes the place and orientation of the nodes: a prefab is saved at the origin.
 * The nodes are removed from the scene once saved: they live in the prefab, and every instance of it is a link.
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
	if (roots.length > 1 || !isAnyTransformNode(roots[0])) {
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

	const included = new Set<Node>([root, ...root.getDescendants(false)]);

	// What takes the place of the prefab in the scene.
	const parent = root.parent;
	const position = ((root as TransformNode).position ?? Vector3.Zero()).clone();
	const rotation = getRotationQuaternion(root);

	// The prefab is saved at the origin: the transform of its root is the one of the link.
	const rootTransform = root as TransformNode;
	const savedRotation = rootTransform.rotationQuaternion?.clone() ?? null;
	const savedEuler = rootTransform.rotation?.clone();

	await mkdir(absolutePath);

	try {
		root.parent = null;
		rootTransform.position?.set(0, 0, 0);
		rootTransform.rotationQuaternion = Quaternion.Identity();

		await saveScene(editor, projectDirectory, absolutePath, {
			filter: (node) => included.has(node),
		});
	} finally {
		root.parent = parent;
		rootTransform.position?.copyFrom(position);
		rootTransform.rotationQuaternion = savedRotation;
		rootTransform.rotation?.copyFrom(savedEuler ?? Vector3.Zero());
	}

	// The nodes leave the scene before the link loads the prefab: both would share the same unique ids.
	root.dispose(false, false);

	const link = (await createSceneLink(editor, absolutePath)) as TransformNode;
	link.name = prefabName;
	link.parent = parent;
	link.position.copyFrom(position);
	link.rotationQuaternion = rotation;

	editor.layout.graph.refresh();
	editor.layout.assets.refresh();
	editor.layout.inspector.setEditedObject(link);

	return { absolutePath, relativePath, link };
}

function getWorldPosition(node: Node): Vector3 {
	return isAnyTransformNode(node) || (node as any).getAbsolutePosition ? (node as any).getAbsolutePosition().clone() : Vector3.Zero();
}

function getParentWorldMatrixInverse(parent: Node) {
	return (parent as TransformNode).getWorldMatrix().clone().invert();
}

function getRotationQuaternion(node: Node): Quaternion {
	const transformNode = node as TransformNode;
	if (transformNode.rotationQuaternion) {
		return transformNode.rotationQuaternion.clone();
	}

	const rotation = transformNode.rotation ?? Vector3.Zero();
	return Quaternion.FromEulerAngles(rotation.x, rotation.y, rotation.z);
}
