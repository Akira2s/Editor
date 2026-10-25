import { describe, expect, test, beforeEach, afterEach } from "vitest";

import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeOverridesInPrefab } from "../../../src/tools/scene/prefab-apply";

describe("tools/scene/prefab-apply", () => {
	let scenePath: string;

	const write = (folder: string, id: string, data: unknown) => writeFile(join(scenePath, folder, `${id}.json`), JSON.stringify(data));
	const read = async (folder: string, id: string) => JSON.parse(await readFile(join(scenePath, folder, `${id}.json`), "utf-8"));

	beforeEach(async () => {
		scenePath = await mkdtemp(join(tmpdir(), "prefab-apply-"));
		await Promise.all(["meshes", "nodes", "lights"].map((folder) => mkdir(join(scenePath, folder))));
	});

	afterEach(() => rm(scenePath, { recursive: true, force: true }));

	test("writes the override in the mesh of the prefab, leaving what it doesn't touch", async () => {
		await write("meshes", "m1", {
			meshes: [{ id: "m1", name: "Box", position: [0, 0, 0], scaling: [1, 1, 1], rotation: [0, 0, 0], isVisible: true }],
			materials: [{ id: "mat" }],
		});

		const applied = await writeOverridesInPrefab(scenePath, { m1: { position: [1, 2, 3], isVisible: false, rotationQuaternion: [0, 0, 0, 1] } });

		expect(applied).toEqual(["m1"]);

		const data = await read("meshes", "m1");
		expect(data.meshes[0]).toMatchObject({ name: "Box", position: [1, 2, 3], scaling: [1, 1, 1], isVisible: false, rotationQuaternion: [0, 0, 0, 1] });
		expect(data.meshes[0].rotation).toBeUndefined();
		expect(data.materials).toEqual([{ id: "mat" }]);
	});

	test("writes transform nodes and lights, and the scripts in their metadata", async () => {
		await write("nodes", "n1", { id: "n1", position: [0, 0, 0], metadata: { parentId: 4, scripts: [{ key: "a", values: {} }] } });
		await write("lights", "l1", { id: "l1", position: [0, 5, 0], intensity: 1 });

		await writeOverridesInPrefab(scenePath, {
			n1: { isEnabled: false, scripts: [{ key: "a", values: { speed: { type: "number", value: 3 } } }] },
			l1: { position: [0, 9, 0] },
		});

		const node = await read("nodes", "n1");
		expect(node.isEnabled).toBe(false);
		expect(node.metadata.parentId).toBe(4);
		expect(node.metadata.scripts[0].values.speed.value).toBe(3);

		expect((await read("lights", "l1")).position).toEqual([0, 9, 0]);
	});

	test("ignores the nodes the prefab doesn't have", async () => {
		expect(await writeOverridesInPrefab(scenePath, { ghost: { position: [1, 1, 1] } })).toEqual([]);
	});
});
