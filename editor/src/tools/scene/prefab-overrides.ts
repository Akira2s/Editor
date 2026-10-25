import { AbstractMesh, Node, Quaternion, TransformNode } from "babylonjs";

/**
 * Defines what an instance of a prefab (a scene link) changes on one of the nodes of the prefab: only the properties that differ
 * from the prefab. The same shape is read at runtime by `babylonjs-editor-tools` (`IPrefabNodeOverride`).
 */
export interface IPrefabNodeOverride {
	position?: number[];
	rotation?: number[];
	rotationQuaternion?: number[];
	scaling?: number[];
	isEnabled?: boolean;
	isVisible?: boolean;
	scripts?: any[];
}

/**
 * The overrides of an instance, keyed by the id the nodes have in the prefab.
 */
export type PrefabOverrides = Record<string, IPrefabNodeOverride>;

const epsilon = 1e-5;

function sameArray(a: number[] | undefined, b: number[] | undefined): boolean {
	if (!a || !b || a.length !== b.length) {
		return a === b;
	}

	return a.every((value, index) => Math.abs(value - b[index]) <= epsilon);
}

/**
 * Returns the properties of the given node an instance of a prefab can override.
 * @param node defines the node to take the snapshot of.
 */
export function snapshotPrefabNode(node: Node): IPrefabNodeOverride {
	const transformNode = node as TransformNode;
	const snapshot: IPrefabNodeOverride = {};

	if (transformNode.position?.asArray) {
		snapshot.position = transformNode.position.asArray();
	}

	if (transformNode.rotationQuaternion) {
		snapshot.rotationQuaternion = transformNode.rotationQuaternion.asArray();
	} else if (transformNode.rotation?.asArray) {
		snapshot.rotation = transformNode.rotation.asArray();
	}

	if (transformNode.scaling?.asArray) {
		snapshot.scaling = transformNode.scaling.asArray();
	}

	snapshot.isEnabled = node.isEnabled(false);

	if (node instanceof AbstractMesh) {
		snapshot.isVisible = node.isVisible;
	}

	if (node.metadata?.scripts) {
		snapshot.scripts = JSON.parse(JSON.stringify(node.metadata.scripts));
	}

	return snapshot;
}

/**
 * Returns what changed between the two snapshots of a node, or null when nothing did.
 * @param baseline defines the snapshot of the node as defined by the prefab.
 * @param current defines the current snapshot of the node.
 */
export function diffPrefabNode(baseline: IPrefabNodeOverride, current: IPrefabNodeOverride): IPrefabNodeOverride | null {
	const diff: IPrefabNodeOverride = {};

	if (!sameArray(baseline.position, current.position)) {
		diff.position = current.position;
	}

	// A node switching between a quaternion and Euler angles keeps what it is now.
	if (baseline.rotationQuaternion && current.rotationQuaternion) {
		if (!sameArray(baseline.rotationQuaternion, current.rotationQuaternion)) {
			diff.rotationQuaternion = current.rotationQuaternion;
		}
	} else if (baseline.rotation && current.rotation) {
		if (!sameArray(baseline.rotation, current.rotation)) {
			diff.rotation = current.rotation;
		}
	} else if (current.rotationQuaternion) {
		diff.rotationQuaternion = current.rotationQuaternion;
	} else if (current.rotation) {
		diff.rotation = current.rotation;
	}

	if (!sameArray(baseline.scaling, current.scaling)) {
		diff.scaling = current.scaling;
	}

	if (baseline.isEnabled !== current.isEnabled) {
		diff.isEnabled = current.isEnabled;
	}

	if (baseline.isVisible !== current.isVisible) {
		diff.isVisible = current.isVisible;
	}

	if (JSON.stringify(baseline.scripts ?? null) !== JSON.stringify(current.scripts ?? null)) {
		diff.scripts = current.scripts ?? [];
	}

	return Object.keys(diff).length ? diff : null;
}

/**
 * Applies the given override (or snapshot) on the given node.
 * @param node defines the node to change.
 * @param override defines the properties to set.
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
		node.metadata.scripts = JSON.parse(JSON.stringify(override.scripts));
	}
}

/**
 * Returns the names of the properties set by the given override, for the UI.
 */
export function getPrefabOverrideProperties(override: IPrefabNodeOverride): string[] {
	const names: string[] = [];

	if (override.position) {
		names.push("Position");
	}

	if (override.rotation || override.rotationQuaternion) {
		names.push("Rotation");
	}

	if (override.scaling) {
		names.push("Scaling");
	}

	if (override.isEnabled !== undefined) {
		names.push("Enabled");
	}

	if (override.isVisible !== undefined) {
		names.push("Visible");
	}

	if (override.scripts) {
		names.push("Scripts");
	}

	return names;
}
