import { describe, expect, test, beforeEach, afterEach } from "vitest";

import { NullEngine, Scene, TransformNode, Mesh, Quaternion, PointLight, Vector3 } from "babylonjs";

import { applyPrefabNodeOverride, diffPrefabNode, getPrefabOverrideProperties, snapshotPrefabNode } from "../../../src/tools/scene/prefab-overrides";

describe("tools/scene/prefab-overrides", () => {
	let engine: NullEngine;
	let scene: Scene;

	beforeEach(() => {
		engine = new NullEngine();
		scene = new Scene(engine);
	});

	afterEach(() => {
		scene.dispose();
		engine.dispose();
	});

	test("nothing changed means no override", () => {
		const mesh = new Mesh("m", scene);
		mesh.position.set(1, 2, 3);

		expect(diffPrefabNode(snapshotPrefabNode(mesh), snapshotPrefabNode(mesh))).toBeNull();
	});

	test("only what changed is part of the override", () => {
		const mesh = new Mesh("m", scene);
		const baseline = snapshotPrefabNode(mesh);

		mesh.position.x = 5;
		mesh.isVisible = false;

		expect(diffPrefabNode(baseline, snapshotPrefabNode(mesh))).toEqual({ position: [5, 0, 0], isVisible: false });
	});

	test("tiny differences are ignored", () => {
		const mesh = new Mesh("m", scene);
		const baseline = snapshotPrefabNode(mesh);

		mesh.position.x = 1e-7;

		expect(diffPrefabNode(baseline, snapshotPrefabNode(mesh))).toBeNull();
	});

	test("rotations are compared as quaternions when the node has one, as angles otherwise", () => {
		const a = new TransformNode("a", scene);
		const baselineA = snapshotPrefabNode(a);
		a.rotation.y = 1;
		expect(diffPrefabNode(baselineA, snapshotPrefabNode(a))).toEqual({ rotation: [0, 1, 0] });

		const b = new TransformNode("b", scene);
		b.rotationQuaternion = Quaternion.Identity();
		const baselineB = snapshotPrefabNode(b);
		b.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), 1);
		expect(Object.keys(diffPrefabNode(baselineB, snapshotPrefabNode(b))!)).toEqual(["rotationQuaternion"]);
	});

	test("disabling a node and editing its scripts are overrides", () => {
		const node = new TransformNode("n", scene);
		node.metadata = { scripts: [{ key: "scripts/a.ts", values: { speed: { type: "number", value: 1 } } }] };
		const baseline = snapshotPrefabNode(node);

		node.setEnabled(false);
		node.metadata.scripts[0].values.speed.value = 4;

		const diff = diffPrefabNode(baseline, snapshotPrefabNode(node))!;
		expect(diff.isEnabled).toBe(false);
		expect(diff.scripts![0].values.speed.value).toBe(4);
		expect(getPrefabOverrideProperties(diff)).toEqual(["Enabled", "Scripts"]);
	});

	test("the snapshot is independent of the node", () => {
		const node = new TransformNode("n", scene);
		node.metadata = { scripts: [{ key: "a", values: { v: { value: 1 } } }] };

		const snapshot = snapshotPrefabNode(node);
		node.metadata.scripts[0].values.v.value = 2;

		expect(snapshot.scripts![0].values.v.value).toBe(1);
	});

	test("applying an override changes the node and a baseline puts it back", () => {
		const mesh = new Mesh("m", scene);
		mesh.position.set(1, 1, 1);
		const baseline = snapshotPrefabNode(mesh);

		applyPrefabNodeOverride(mesh, { position: [9, 8, 7], scaling: [2, 2, 2], isEnabled: false, isVisible: false });
		expect(mesh.position.asArray()).toEqual([9, 8, 7]);
		expect(mesh.scaling.asArray()).toEqual([2, 2, 2]);
		expect(mesh.isEnabled(false)).toBe(false);
		expect(mesh.isVisible).toBe(false);

		applyPrefabNodeOverride(mesh, baseline);
		expect(diffPrefabNode(baseline, snapshotPrefabNode(mesh))).toBeNull();
	});

	test("lights have a position but no scaling or visibility", () => {
		const light = new PointLight("l", new Vector3(1, 2, 3), scene);
		const snapshot = snapshotPrefabNode(light);

		expect(snapshot.position).toEqual([1, 2, 3]);
		expect(snapshot.scaling).toBeUndefined();
		expect(snapshot.isVisible).toBeUndefined();
	});
});
