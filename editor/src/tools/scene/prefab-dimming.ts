import { AbstractMesh, Node, Scene } from "babylonjs";

import { isNodeVisibleInGraph } from "../node/metadata";

/**
 * Greys out the objects that are not part of the prefab being edited in place (Unity's prefab mode in context): they are made translucent
 * and can't be picked in the viewport. It changes properties of the meshes that are saved with the scene, so the dimming is always lifted
 * while the scene is saved, @see suspendPrefabDimming.
 */
const dimmedVisibility = 0.2;

interface IMeshState {
	visibility: number;
	isPickable: boolean;
}

const dimmed = new Map<AbstractMesh, IMeshState>();

let scene: Scene | null = null;
let content: Node | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

const storageKey = "babylonjs-editor-prefab-dim-others";

/**
 * Returns wether or not the other objects are greyed out when a prefab is edited in place (on by default, like Unity).
 */
export function isDimmingOthersPreferred(): boolean {
	try {
		return localStorage.getItem(storageKey) !== "false";
	} catch (e) {
		return true;
	}
}

export function setDimmingOthersPreferred(value: boolean): void {
	try {
		localStorage.setItem(storageKey, String(value));
	} catch (e) {
		// Not remembered.
	}
}

function isPartOfPrefab(mesh: AbstractMesh): boolean {
	let node: Node | null = mesh;
	while (node) {
		if (node === content) {
			return true;
		}

		node = node.parent;
	}

	return false;
}

function reconcile(): void {
	if (!scene || scene.isDisposed) {
		return;
	}

	scene.meshes.forEach((mesh) => {
		const shouldDim = !isPartOfPrefab(mesh) && isNodeVisibleInGraph(mesh) && !mesh.reservedDataStore?.hidden;
		const state = dimmed.get(mesh);

		if (shouldDim && !state) {
			dimmed.set(mesh, { visibility: mesh.visibility, isPickable: mesh.isPickable });
			mesh.visibility = Math.min(mesh.visibility, dimmedVisibility);
			mesh.isPickable = false;
		} else if (!shouldDim && state) {
			mesh.visibility = state.visibility;
			mesh.isPickable = state.isPickable;
			dimmed.delete(mesh);
		}
	});
}

function restoreAll(): void {
	dimmed.forEach((state, mesh) => {
		if (!mesh.isDisposed()) {
			mesh.visibility = state.visibility;
			mesh.isPickable = state.isPickable;
		}
	});

	dimmed.clear();
}

/**
 * Greys out everything that is not under the given node (the instance whose prefab is edited in place).
 */
export function startPrefabDimming(editedScene: Scene, prefabRoot: Node): void {
	stopPrefabDimming();

	scene = editedScene;
	content = prefabRoot;

	reconcile();

	// What is added or moved while editing is greyed out, or not, as it should.
	timer = setInterval(reconcile, 400);
}

export function stopPrefabDimming(): void {
	if (timer) {
		clearInterval(timer);
		timer = null;
	}

	restoreAll();

	scene = null;
	content = null;
}

export function isPrefabDimmingActive(): boolean {
	return !!timer;
}

/**
 * Lifts the dimming until the returned function is called: the saved scene must not hold the translucent meshes.
 */
export function suspendPrefabDimming(): () => void {
	if (!timer) {
		return () => {};
	}

	const editedScene = scene!;
	const root = content!;

	clearInterval(timer);
	timer = null;

	restoreAll();

	return () => {
		if (!timer && scene === editedScene && content === root) {
			timer = setInterval(reconcile, 400);
			reconcile();
		}
	};
}
