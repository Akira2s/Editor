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
	 * Defines what the instance changes in the scripts attached to the node, per script (found by its key). Only what differs from the
	 * prefab is stored, so that the other values keep following the prefab: `enabled`, `values` (the Inspector values that are changed,
	 * by property), `remove` for a script of the prefab that the instance does not have. A script the prefab doesn't have is stored as
	 * a whole.
	 */
	scripts?: any[];
}

export type PrefabOverrides = Record<string, IPrefabNodeOverride>;

/**
 * Returns the given scripts of a node with the changes of an override applied: see `IPrefabNodeOverride.scripts`.
 * @param scripts defines the scripts the prefab attaches to the node.
 * @param patches defines what the instance changes in them.
 */
export function mergePrefabScripts(scripts: any[] | undefined, patches: any[]): any[] {
	const result: any[] = cloneJSObject(scripts ?? []);

	patches.forEach((patch) => {
		const index = result.findIndex((script) => script.key === patch.key);

		if (patch.remove) {
			if (index !== -1) {
				result.splice(index, 1);
			}

			return;
		}

		if (index === -1) {
			result.push(cloneJSObject(patch));
			return;
		}

		const script = result[index];

		if (patch.enabled !== undefined) {
			script.enabled = patch.enabled;
		}

		if (patch.values) {
			script.values ??= {};
			Object.entries(patch.values).forEach(([name, value]) => (script.values[name] = cloneJSObject(value)));
		}
	});

	return result;
}

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
		node.metadata.scripts = mergePrefabScripts(node.metadata.scripts, override.scripts);
	}
}
