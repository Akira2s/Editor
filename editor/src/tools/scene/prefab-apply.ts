import { join } from "path/posix";
import { pathExists, readJSON, writeJSON } from "fs-extra";

import { IPrefabNodeOverride, PrefabOverrides } from "./prefab-overrides";

/**
 * Defines the folders of a scene asset that hold nodes, and the way each file stores the data of a node: a mesh file holds the mesh in
 * its `meshes` array, the other files are the node itself.
 */
const nodeFolders = ["meshes", "nodes", "lights", "cameras"];

function patchNodeData(data: any, override: IPrefabNodeOverride): void {
	if (override.position) {
		data.position = override.position;
	}

	if (override.rotationQuaternion) {
		data.rotationQuaternion = override.rotationQuaternion;
		delete data.rotation;
	} else if (override.rotation) {
		data.rotation = override.rotation;
		delete data.rotationQuaternion;
	}

	if (override.scaling) {
		data.scaling = override.scaling;
	}

	if (override.isEnabled !== undefined) {
		data.isEnabled = override.isEnabled;
	}

	if (override.isVisible !== undefined) {
		data.isVisible = override.isVisible;
	}

	if (override.scripts) {
		data.metadata ??= {};
		data.metadata.scripts = JSON.parse(JSON.stringify(override.scripts));
	}
}

/**
 * Writes the given overrides in the files of the given scene asset (a prefab), as if they had been made in the prefab: its nodes get
 * the values of the overrides. The nodes the prefab doesn't have are ignored.
 * @param scenePath defines the absolute path of the scene asset (.scene folder).
 * @param overrides defines the overrides to write, keyed by the id of the nodes in the prefab.
 * @returns the ids of the nodes that were changed.
 */
export async function writeOverridesInPrefab(scenePath: string, overrides: PrefabOverrides): Promise<string[]> {
	const applied: string[] = [];

	for (const [id, override] of Object.entries(overrides)) {
		for (const folder of nodeFolders) {
			const path = join(scenePath, folder, `${id}.json`);
			if (!(await pathExists(path))) {
				continue;
			}

			const data = await readJSON(path, "utf-8");

			// A mesh is saved with the materials and geometries it uses: the node itself is in `meshes`.
			const target = folder === "meshes" ? data.meshes?.find((mesh: any) => mesh.id === id) : data;
			if (!target) {
				continue;
			}

			patchNodeData(target, override);

			await writeJSON(path, data, { spaces: 4 });
			applied.push(id);
			break;
		}
	}

	return applied;
}
