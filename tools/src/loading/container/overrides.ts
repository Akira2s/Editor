import { Node } from "@babylonjs/core/node";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import { cloneJSObject } from "../../tools/tools";

/**
 * Defines what an instance of a prefab (a scene link) changes on one of the nodes of the prefab. Only the properties that differ
 * from the prefab are stored. Overrides are saved by the editor in the metadata of the scene link, under `overrides`, keyed by the
 * id the node has in the prefab.
 */
export interface IPrefabNodeOverride {
	position?: number[];
	rotation?: number[];
	rotationQuaternion?: number[];
	scaling?: number[];
	isEnabled?: boolean;
	isVisible?: boolean;
	/**
	 * Defines the scripts attached to the node with their Inspector values, replacing the ones of the prefab.
	 */
	scripts?: any[];
}

export type PrefabOverrides = Record<string, IPrefabNodeOverride>;

/**
 * Applies the given override on the given node: the properties it defines replace the ones of the node.
 * @param node defines the node to change.
 * @param override defines the override to apply.
 */
export function applyPrefabNodeOverride(node: Node, override: IPrefabNodeOverride): void {
	const transformNode = node as TransformNode;

	if (override.position && transformNode.position) {
		transformNode.position.fromArray(override.position);
	}

	if (override.rotationQuaternion && "rotationQuaternion" in transformNode) {
		transformNode.rotationQuaternion = Quaternion.FromArray(override.rotationQuaternion);
	} else if (override.rotation && transformNode.rotation) {
		transformNode.rotationQuaternion = null;
		transformNode.rotation.fromArray(override.rotation);
	}

	if (override.scaling && transformNode.scaling) {
		transformNode.scaling.fromArray(override.scaling);
	}

	if (override.isEnabled !== undefined) {
		node.setEnabled(override.isEnabled);
	}

	if (override.isVisible !== undefined && node instanceof AbstractMesh) {
		node.isVisible = override.isVisible;
	}

	if (override.scripts) {
		node.metadata ??= {};
		node.metadata.scripts = cloneJSObject(override.scripts);
	}
}
