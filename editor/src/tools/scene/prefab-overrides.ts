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
	/**
	 * What the instance changes in the scripts of the node, per script (found by its key): `enabled`, `values` (the Inspector values that
	 * are changed, by property), `remove` for a script of the prefab the instance doesn't have. A script the prefab doesn't have is stored as
	 * a whole. Only what differs is stored, so that the other values keep following the prefab (@see mergePrefabScripts).
	 */
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

	// Only what the user can change counts: the Inspector rewrites the descriptions and types of the values of a script when it shows them.
	const scriptPatches = buildPrefabScriptPatches(baseline.scripts, current.scripts);
	if (scriptPatches.length) {
		diff.scripts = scriptPatches;
	}

	return Object.keys(diff).length ? diff : null;
}

/**
 * Applies the given override (or snapshot) on the given node.
 * @param node defines the node to change.
 * @param override defines the properties to set.
 * @param replaceScripts defines wether the scripts of the override replace the ones of the node, instead of being the changes to make on them.
 */
export function applyPrefabNodeOverride(node: Node, override: IPrefabNodeOverride, replaceScripts: boolean = false): void {
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
		node.metadata.scripts = replaceScripts ? JSON.parse(JSON.stringify(override.scripts)) : mergePrefabScripts(node.metadata.scripts, override.scripts);
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

/**
 * One thing an instance changes on a node of its prefab: a transform property, the enabled/visible state, or a script (the whole script, its
 * enabled state or one of its Inspector values). It is what the overrides menu lists, and what can be reverted or applied on its own.
 */
export interface IPrefabOverrideEntry {
	/**
	 * Identifies the entry among the ones of the node: "position", "rotation", "scaling", "enabled", "visible", "script:<key>",
	 * "script:<key>:@enabled" or "script:<key>:<value name>".
	 */
	id: string;
	/**
	 * The component the property belongs to: "Transform", "Node" or the name of the script.
	 */
	component: string;
	label: string;
}

const scriptPrefix = "script:";

function getScriptName(key: string): string {
	return (key.split("/").pop() ?? key).replace(/\.[jt]sx?$/, "");
}

function findScript(scripts: any[] | undefined, key: string): any | undefined {
	return scripts?.find((script) => script.key === key);
}

function sameJson(a: unknown, b: unknown): boolean {
	return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Returns what differs between the scripts of a node as the prefab defines them and as the instance has them.
 */
export function diffPrefabScripts(before: any[] | undefined, after: any[] | undefined): IPrefabOverrideEntry[] {
	const entries: IPrefabOverrideEntry[] = [];
	const keys = new Set<string>([...(before ?? []), ...(after ?? [])].map((script) => script.key));

	keys.forEach((key) => {
		const was = findScript(before, key);
		const now = findScript(after, key);
		const component = getScriptName(key);

		if (!was || !now) {
			entries.push({ id: `${scriptPrefix}${key}`, component, label: was ? "Removed" : "Added" });
			return;
		}

		if (!!was.enabled !== !!now.enabled) {
			entries.push({ id: `${scriptPrefix}${key}:@enabled`, component, label: "Enabled" });
		}

		const names = new Set<string>([...Object.keys(was.values ?? {}), ...Object.keys(now.values ?? {})]);
		names.forEach((name) => {
			if (!sameJson(was.values?.[name]?.value, now.values?.[name]?.value)) {
				entries.push({ id: `${scriptPrefix}${key}:${name}`, component, label: name });
			}
		});
	});

	return entries;
}

/**
 * Returns what the instance changes between the two snapshots of a node, one entry per property.
 */
export function listPrefabOverrideEntries(baseline: IPrefabNodeOverride, current: IPrefabNodeOverride): IPrefabOverrideEntry[] {
	const diff = diffPrefabNode(baseline, current);
	if (!diff) {
		return [];
	}

	const entries: IPrefabOverrideEntry[] = [];

	if (diff.position) {
		entries.push({ id: "position", component: "Transform", label: "Position" });
	}

	if (diff.rotation || diff.rotationQuaternion) {
		entries.push({ id: "rotation", component: "Transform", label: "Rotation" });
	}

	if (diff.scaling) {
		entries.push({ id: "scaling", component: "Transform", label: "Scaling" });
	}

	if (diff.isEnabled !== undefined) {
		entries.push({ id: "enabled", component: "Node", label: "Enabled" });
	}

	if (diff.isVisible !== undefined) {
		entries.push({ id: "visible", component: "Node", label: "Visible" });
	}

	if (diff.scripts) {
		entries.push(...diffPrefabScripts(baseline.scripts, current.scripts));
	}

	return entries;
}

/**
 * Returns a copy of the `target` snapshot of a node where the given entries have the value they have in the `source` snapshot. Used both ways:
 * to revert entries of an instance (target is the instance, source the prefab) and to apply them to the prefab (the other way around).
 */
export function mergePrefabOverrideEntries(target: IPrefabNodeOverride, source: IPrefabNodeOverride, entryIds: string[]): IPrefabNodeOverride {
	const merged: IPrefabNodeOverride = JSON.parse(JSON.stringify(target));
	const from: IPrefabNodeOverride = JSON.parse(JSON.stringify(source));

	entryIds.forEach((id) => {
		switch (id) {
			case "position":
				merged.position = from.position;
				break;
			case "rotation":
				delete merged.rotation;
				delete merged.rotationQuaternion;
				if (from.rotationQuaternion) {
					merged.rotationQuaternion = from.rotationQuaternion;
				} else if (from.rotation) {
					merged.rotation = from.rotation;
				}
				break;
			case "scaling":
				merged.scaling = from.scaling;
				break;
			case "enabled":
				merged.isEnabled = from.isEnabled;
				break;
			case "visible":
				merged.isVisible = from.isVisible;
				break;
			default: {
				if (!id.startsWith(scriptPrefix)) {
					break;
				}

				const [key, name] = splitScriptEntryId(id);
				const fromScript = findScript(from.scripts, key);
				merged.scripts ??= [];
				const script = findScript(merged.scripts, key);

				if (name === undefined) {
					// The script was added or removed: it follows the other side.
					merged.scripts = merged.scripts.filter((s) => s.key !== key);
					if (fromScript) {
						merged.scripts.push(fromScript);
					}
					break;
				}

				if (!fromScript || !script) {
					break;
				}

				if (name === "@enabled") {
					script.enabled = fromScript.enabled;
					break;
				}

				script.values ??= {};
				if (fromScript.values?.[name]) {
					script.values[name] = fromScript.values[name];
				} else {
					delete script.values[name];
				}
			}
		}
	});

	return merged;
}

function splitScriptEntryId(id: string): [string, string | undefined] {
	const rest = id.substring(scriptPrefix.length);
	const index = rest.indexOf(":");

	return index === -1 ? [rest, undefined] : [rest.substring(0, index), rest.substring(index + 1)];
}

/**
 * Returns the ids of the script entries of an Inspector value, for the markers next to the fields.
 */
export function getScriptValueEntryId(scriptKey: string, valueName: string): string {
	return `${scriptPrefix}${scriptKey}:${valueName}`;
}

/**
 * Returns the given scripts of a node with the changes of an override applied (@see IPrefabNodeOverride.scripts). The same is done by the
 * runtime of the game.
 * @param scripts defines the scripts the prefab attaches to the node.
 * @param patches defines what the instance changes in them.
 */
export function mergePrefabScripts(scripts: any[] | undefined, patches: any[]): any[] {
	const result: any[] = JSON.parse(JSON.stringify(scripts ?? []));

	patches.forEach((patch) => {
		const index = result.findIndex((script) => script.key === patch.key);

		if (patch.remove) {
			if (index !== -1) {
				result.splice(index, 1);
			}

			return;
		}

		if (index === -1) {
			result.push(JSON.parse(JSON.stringify(patch)));
			return;
		}

		const script = result[index];

		if (patch.enabled !== undefined) {
			script.enabled = patch.enabled;
		}

		if (patch.values) {
			script.values ??= {};
			Object.entries(patch.values).forEach(([name, value]) => (script.values[name] = JSON.parse(JSON.stringify(value))));
		}
	});

	return result;
}

/**
 * Returns what to change in the scripts the prefab attaches to a node to get the scripts the instance has: only the values that differ.
 */
export function buildPrefabScriptPatches(before: any[] | undefined, after: any[] | undefined): any[] {
	const patches: any[] = [];

	(before ?? []).forEach((script) => {
		if (!findScript(after, script.key)) {
			patches.push({ key: script.key, remove: true });
		}
	});

	(after ?? []).forEach((script) => {
		const was = findScript(before, script.key);
		if (!was) {
			patches.push(JSON.parse(JSON.stringify(script)));
			return;
		}

		const patch: any = { key: script.key };

		if (!!was.enabled !== !!script.enabled) {
			patch.enabled = !!script.enabled;
		}

		const names = new Set<string>([...Object.keys(was.values ?? {}), ...Object.keys(script.values ?? {})]);
		names.forEach((name) => {
			if (script.values?.[name] && !sameJson(was.values?.[name]?.value, script.values[name].value)) {
				patch.values ??= {};
				patch.values[name] = JSON.parse(JSON.stringify(script.values[name]));
			}
		});

		if (patch.enabled !== undefined || patch.values) {
			patches.push(patch);
		}
	});

	return patches;
}

/**
 * Overrides saved by older versions held the whole scripts of the node: it is reduced to what differs from the prefab, so that the
 * values the instance didn't change follow the prefab again.
 * @param baseline defines the node as the prefab defines it.
 * @param override defines the override of the instance for the node.
 */
export function normalizePrefabNodeOverride(baseline: IPrefabNodeOverride, override: IPrefabNodeOverride): IPrefabNodeOverride {
	if (!override.scripts) {
		return override;
	}

	const patches = buildPrefabScriptPatches(baseline.scripts, mergePrefabScripts(baseline.scripts, override.scripts));
	const result = { ...override };

	if (patches.length) {
		result.scripts = patches;
	} else {
		delete result.scripts;
	}

	return result;
}
