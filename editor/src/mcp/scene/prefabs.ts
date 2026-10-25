import { dirname, join, relative } from "path/posix";
import { pathExists } from "fs-extra";

import { Node, Quaternion, Scene, TransformNode } from "babylonjs";

import { SceneLinkNode } from "../../editor/nodes/scene-link";

import { normalizedGlob } from "../../tools/fs";
import { isSceneLinkNode } from "../../tools/guards/scene";
import { applyOverridesToPrefab, createPrefabFromNodes, defaultPrefabsDirectory, unpackSceneLink } from "../../tools/scene/prefab";
import { applyPrefabNodeOverride, getPrefabOverrideProperties, IPrefabNodeOverride } from "../../tools/scene/prefab-overrides";
import { createSceneLink } from "../../tools/scene/scene-link";

import { projectConfiguration } from "../../project/configuration";

import { IMCPActionOptions } from "../action";
import { resolveNode, toNodeSummary, toVector3 } from "../tools/resolve";

/**
 * Returns the scene assets (.scene) of the project, prefabs included: what `instantiate_prefab` can place.
 */
export async function listPrefabs(): Promise<any> {
	if (!projectConfiguration.path) {
		throw new Error("No project is opened.");
	}

	const projectDirectory = dirname(projectConfiguration.path);
	const paths = await normalizedGlob(join(projectDirectory, "assets/**/*.scene"), { nodir: false });

	return {
		prefabs: (paths as string[])
			.map((absolutePath) => ({
				name: absolutePath
					.split("/")
					.pop()!
					.replace(/\.scene$/, ""),
				path: relative(projectDirectory, absolutePath),
			}))
			.sort((a, b) => a.path.localeCompare(b.path)),
	};
}

/**
 * Saves nodes as a prefab (a scene asset) and replaces them in the scene with a link to it, like "Create Prefab..." in the graph.
 * The nodes are moved into the prefab: ask for it only when the user wants them turned into a reusable prefab.
 */
export async function createPrefab(scene: Scene, data: any, options: IMCPActionOptions): Promise<any> {
	const requested: { id?: string; name?: string }[] = [...(data.nodeIds ?? []).map((id: string) => ({ id })), ...(data.nodeNames ?? []).map((name: string) => ({ name }))];

	if (data.nodeId || data.nodeName) {
		requested.push({ id: data.nodeId, name: data.nodeName });
	}

	if (!requested.length) {
		throw new Error("Give the nodes to turn into a prefab with `nodeIds`, `nodeNames`, `nodeId` or `nodeName`.");
	}

	if (typeof data.name !== "string" || !data.name.trim()) {
		throw new Error("`name` (the name of the prefab) is required.");
	}

	const nodes: Node[] = requested.map(({ id, name }) => resolveNode({ scene, nodeId: id, nodeName: name }));

	const result = await createPrefabFromNodes(options.editor, nodes, data.name, data.directory ?? defaultPrefabsDirectory);

	return {
		prefab: result.relativePath,
		link: toNodeSummary(result.link),
		note: "The nodes now live in the prefab. Save the scene (the user confirms) to keep the link; attach scripts to the prefab's nodes by opening it.",
	};
}

function resolveLink(scene: Scene, data: any): SceneLinkNode {
	const node = resolveNode({ scene, nodeId: data.linkId, nodeName: data.linkName });
	if (!isSceneLinkNode(node)) {
		throw new Error(`"${node.name}" is not a prefab instance (a scene link).`);
	}

	return node;
}

/**
 * Finds a node of the prefab an instance shows, by its id in the prefab or by its name.
 */
function resolvePrefabNode(link: SceneLinkNode, data: any): Node {
	const nodes = link.getPrefabNodes();
	const node = nodes.find((n) => (data.nodeId && n.id === data.nodeId) || (!data.nodeId && data.nodeName && n.name === data.nodeName));

	if (!node) {
		throw new Error(`Node not found in the prefab of "${link.name}": ${data.nodeId ?? data.nodeName}. Nodes: ${nodes.map((n) => `${n.name} (${n.id})`).join(", ")}`);
	}

	return node;
}

function summarizeOverrides(link: SceneLinkNode): any[] {
	return Object.entries(link.getOverrides()).map(([id, override]) => ({
		nodeId: id,
		nodeName: link.getPrefabNodes().find((n) => n.id === id)?.name ?? null,
		properties: getPrefabOverrideProperties(override),
		override,
	}));
}

/**
 * Describes a prefab instance: the prefab it shows, the nodes of the prefab, and what the instance overrides.
 */
export function getPrefabInstance(scene: Scene, data: any): any {
	const link = resolveLink(scene, data);

	return {
		link: toNodeSummary(link),
		prefab: link.relativePath,
		nodes: link.getPrefabNodes().map((node) => ({ id: node.id, name: node.name, className: node.getClassName() })),
		overrides: summarizeOverrides(link),
	};
}

/**
 * Changes a node of the prefab in one instance only (an override): the prefab and the other instances keep their values.
 */
export function setPrefabOverride(scene: Scene, data: any): any {
	const link = resolveLink(scene, data);
	const node = resolvePrefabNode(link, data);

	const override: IPrefabNodeOverride = {};
	if (data.position) {
		override.position = toVector3(data.position).asArray();
	}

	if (data.rotation) {
		override.rotation = toVector3(data.rotation).asArray();
	}

	if (data.scaling) {
		override.scaling = toVector3(data.scaling).asArray();
	}

	if (typeof data.isEnabled === "boolean") {
		override.isEnabled = data.isEnabled;
	}

	if (typeof data.isVisible === "boolean") {
		override.isVisible = data.isVisible;
	}

	applyPrefabNodeOverride(node, override);

	return { overrides: summarizeOverrides(link) };
}

/**
 * Puts a node of the prefab (or all of them) back as the prefab defines it in one instance.
 */
export function revertPrefabOverrides(scene: Scene, data: any): any {
	const link = resolveLink(scene, data);

	const reverted = link.revertOverrides(data.nodeId || data.nodeName ? resolvePrefabNode(link, data) : undefined);

	return { reverted: reverted.map((node) => node.name), overrides: summarizeOverrides(link) };
}

/**
 * Writes what an instance overrides in the prefab itself, so every instance gets it.
 */
export async function applyPrefabOverrides(scene: Scene, data: any, options: IMCPActionOptions): Promise<any> {
	const link = resolveLink(scene, data);

	const applied = await applyOverridesToPrefab(options.editor, link, data.nodeId || data.nodeName ? resolvePrefabNode(link, data) : undefined);

	return { applied, prefab: link.relativePath };
}

/**
 * Turns an instance into plain nodes, not connected to the prefab anymore.
 */
export function unpackPrefab(scene: Scene, data: any, options: IMCPActionOptions): any {
	const link = resolveLink(scene, data);
	const group = unpackSceneLink(options.editor, link);

	return { group: toNodeSummary(group), children: group.getChildren().map((child) => toNodeSummary(child)) };
}

/**
 * Places an instance of a prefab (a scene asset) in the scene: a scene link, like dropping the asset in the viewport.
 */
export async function instantiatePrefab(scene: Scene, data: any, options: IMCPActionOptions): Promise<any> {
	if (!projectConfiguration.path) {
		throw new Error("No project is opened.");
	}

	if (typeof data.prefab !== "string" || !data.prefab) {
		throw new Error('`prefab` is required: the path of the scene asset, like "assets/prefabs/Tree.scene" (see `list_prefabs`).');
	}

	const projectDirectory = dirname(projectConfiguration.path);

	// A name ("Tree") is accepted for the prefabs created by `create_prefab`.
	const relativePath = data.prefab.endsWith(".scene") ? data.prefab : join(defaultPrefabsDirectory, `${data.prefab}.scene`);
	const absolutePath = join(projectDirectory, relativePath);

	if (!(await pathExists(absolutePath))) {
		throw new Error(`Prefab not found: ${relativePath}`);
	}

	if (absolutePath === options.editor.state.lastOpenedScenePath) {
		throw new Error("A scene can't be placed in itself.");
	}

	const link = (await createSceneLink(options.editor, absolutePath)) as TransformNode | undefined;
	if (!link || !isSceneLinkNode(link)) {
		throw new Error(`Failed to place the prefab: ${relativePath}`);
	}

	if (typeof data.name === "string" && data.name) {
		link.name = data.name;
	}

	if (data.parentId || data.parentName) {
		link.parent = resolveNode({ scene, nodeId: data.parentId, nodeName: data.parentName });
	}

	if (data.position) {
		link.position.copyFrom(toVector3(data.position));
	}

	if (data.rotation) {
		const rotation = toVector3(data.rotation);
		link.rotationQuaternion = Quaternion.FromEulerAngles(rotation.x, rotation.y, rotation.z);
	}

	if (data.scaling) {
		link.scaling.copyFrom(toVector3(data.scaling));
	}

	options.editor.layout.graph.refresh();

	return { prefab: relativePath, link: toNodeSummary(link) };
}
