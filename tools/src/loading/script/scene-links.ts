import { Node } from "@babylonjs/core/node";
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

			container.instantiate({ overrides: link.metadata?.overrides }).rootNodes.forEach((root) => {
				root.parent = link;
			});

			++count;
		});
	}

	console.error(`Scene links are nested more than ${maxSceneLinkDepth} levels deep: a scene probably links to itself.`);

	return count;
}
