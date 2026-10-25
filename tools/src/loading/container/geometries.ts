import { Constants } from "@babylonjs/core/Engines/constants";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { Mesh } from "@babylonjs/core/Meshes/mesh";

/**
 * Defines the time, in milliseconds, to wait for the geometries of a container before giving up.
 */
const geometriesLoadingTimeout: number = 30000;

/**
 * Loads the geometries of the meshes of the given container, and waits for them. Packed geometries are delay loaded: the meshes of a
 * loaded scene asset (a prefab) never render, only their instances do, so nothing else would load them, and instantiating the
 * container before would give meshes without geometry.
 * @param container defines the container to load the geometries of.
 */
export async function loadContainerGeometries(container: AssetContainer): Promise<void> {
	const meshes = container.meshes.filter((mesh): mesh is Mesh => mesh instanceof Mesh && !!mesh.delayLoadState);

	meshes.forEach((mesh) => mesh._checkDelayState());

	const start = Date.now();
	while (meshes.some((mesh) => mesh.delayLoadState !== Constants.DELAYLOADSTATE_LOADED) && Date.now() - start < geometriesLoadingTimeout) {
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
}
