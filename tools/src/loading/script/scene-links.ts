import { Node } from "@babylonjs/core/node";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";

import { AdvancedAssetContainer } from "../container/container";

import { scriptAssetsCache } from "./preload";
import { getSceneLinkPath } from "./scene-link-path";

/**
 * Defines the maximum number of levels of scene links inside scene links (a prefab made of prefabs). A deeper chain is
 * most likely a scene that links to itself.
 */
const maxSceneLinkDepth: number = 16;

const instantiatedSceneLinks = new WeakSet<Node>();

/**
 * Defines the time, in milliseconds, to wait for the geometries of a linked scene before giving up.
 */
const geometriesLoadingTimeout: number = 30000;

/**
 * Loads the geometries of the meshes of the given scenes. Packed geometries are delay loaded: the meshes of a linked scene never
 * render (only their instances do), so nothing else would load them.
 */
async function loadLinkedGeometries(containers: AdvancedAssetContainer[]): Promise<void> {
	const meshes = containers.flatMap((container) => container.container.meshes).filter((mesh): mesh is Mesh => mesh instanceof Mesh && !!mesh.delayLoadState);

	meshes.forEach((mesh) => mesh._checkDelayState());

	const start = Date.now();
	while (meshes.some((mesh) => mesh.delayLoadState !== Constants.DELAYLOADSTATE_LOADED) && Date.now() - start < geometriesLoadingTimeout) {
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
}

/**
 * Instantiates, under each scene link of the scene, the scene it links to (a prefab): the nodes, meshes, lights... of the
 * linked scene are cloned or instanced as children of the link, and the scripts attached to them run.
 * The linked scenes must be loaded in `scriptAssetsCache` (see `_preloadScriptsAssets`, which does it for the scene links).
 * The nodes of the linked scenes themselves leave the scene: only the instances remain.
 * @param scene defines the reference to the scene where to instantiate the scene links.
 * @returns the number of scene links instantiated.
 */
export async function _instantiateSceneLinks(scene: Scene): Promise<number> {
	const cache = scriptAssetsCache.get(scene);
	if (!cache) {
		return 0;
	}

	const containers = Array.from(cache.values()).filter((value): value is AdvancedAssetContainer => value instanceof AdvancedAssetContainer);

	// The nodes of loaded scenes are in the scene until their defaults are removed: they must not be taken for scene links.
	const originals = new Set<Node>(containers.flatMap((container) => container.container.getNodes()));

	// A prefab that is linked only shows through its instances.
	const linked = Array.from(new Set(scene.transformNodes.map((node) => getSceneLinkPath(node)).filter((path): path is string => path !== null)))
		.map((path) => cache.get(path))
		.filter((container): container is AdvancedAssetContainer => container instanceof AdvancedAssetContainer);

	await loadLinkedGeometries(linked);
	linked.forEach((container) => container.removeDefault());

	let count = 0;

	for (let depth = 0; depth < maxSceneLinkDepth; ++depth) {
		const links = scene.transformNodes.filter((node) => getSceneLinkPath(node) !== null && !originals.has(node) && !instantiatedSceneLinks.has(node));
		if (!links.length) {
			return count;
		}

		links.forEach((link) => {
			instantiatedSceneLinks.add(link);

			const path = getSceneLinkPath(link)!;
			const container = cache.get(path);
			if (!(container instanceof AdvancedAssetContainer)) {
				return console.warn(`Scene link "${link.name}" points to "${path}", which could not be loaded.`);
			}

			container.instantiate().rootNodes.forEach((root) => {
				root.parent = link;
			});

			++count;
		});
	}

	console.error(`Scene links are nested more than ${maxSceneLinkDepth} levels deep: a scene probably links to itself.`);

	return count;
}
