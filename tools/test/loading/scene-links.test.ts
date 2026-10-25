import { describe, expect, test, afterEach } from "vitest";

import { Constants } from "@babylonjs/core/Engines/constants";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";

import "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/core/Meshes/Builders/boxBuilder";

import { AdvancedAssetContainer } from "../../src/loading/container/container";
import { scriptAssetsCache } from "../../src/loading/script/preload";
import { _instantiateSceneLinks } from "../../src/loading/script/scene-links";
import { getSceneLinkPath } from "../../src/loading/script/scene-link-path";
import { loadContainerGeometries } from "../../src/loading/container/geometries";
import { applyPrefabNodeOverride } from "../../src/loading/container/overrides";

/**
 * Creates a prefab: a root with a child mesh, loaded in the scene like a scene asset is, and returns its container.
 */
function createPrefab(scene: Scene, name: string, nestedLinkTo?: string): AdvancedAssetContainer {
	const container = new AssetContainer(scene);

	const root = new TransformNode(`${name}Root`, scene);
	const box = Mesh.CreateBox(`${name}Box`, 1, scene);
	box.parent = root;
	container.transformNodes.push(root);
	container.meshes.push(box);

	if (nestedLinkTo) {
		const link = new TransformNode(`${name}NestedLink`, scene);
		link.parent = root;
		link.metadata = { sceneLink: nestedLinkTo };
		link.position.x = 10;
		container.transformNodes.push(link);
	}

	// A loaded scene asset adds its nodes to the scene until its defaults are removed.
	return new AdvancedAssetContainer(container, "", {});
}

describe("loading/script/scene-links", () => {
	let engine: NullEngine;
	let scene: Scene;

	const setup = () => {
		engine = new NullEngine();
		scene = new Scene(engine);
		scriptAssetsCache.set(scene, new Map());
	};

	afterEach(() => {
		scene?.dispose();
		engine?.dispose();
	});

	test("getSceneLinkPath reads the path packed by the CLI", () => {
		setup();

		const node = new TransformNode("link", scene);
		expect(getSceneLinkPath(node)).toBeNull();

		node.metadata = { sceneLink: "assets/prefabs/Tree.scene" };
		expect(getSceneLinkPath(node)).toBe("assets/prefabs/Tree.scene");

		node.metadata = { sceneLink: 5 };
		expect(getSceneLinkPath(node)).toBeNull();
	});

	test("instantiates the prefab under each link and removes the originals", async () => {
		setup();

		const cache = scriptAssetsCache.get(scene)!;
		cache.set("assets/prefabs/Tree.scene", createPrefab(scene, "Tree"));

		const a = new TransformNode("A", scene);
		a.metadata = { sceneLink: "assets/prefabs/Tree.scene" };
		a.position = new Vector3(5, 0, 0);

		const b = new TransformNode("B", scene);
		b.metadata = { sceneLink: "assets/prefabs/Tree.scene" };
		b.position = new Vector3(-5, 0, 0);

		expect(await _instantiateSceneLinks(scene)).toBe(2);

		[a, b].forEach((link) => {
			const roots = link.getChildren();
			expect(roots).toHaveLength(1);
			expect(roots[0].name.startsWith("TreeRoot")).toBe(true);
			expect(roots[0].getDescendants(false).length).toBe(1);
		});

		// The prefab's own root is not left in the scene at the origin: only the two instances remain.
		expect(scene.transformNodes.filter((n) => n.name.startsWith("TreeRoot"))).toHaveLength(2);

		// An instance is at the position of its link.
		const instanceBox = a.getChildren()[0].getChildren()[0] as Mesh;
		expect(instanceBox.getAbsolutePosition().x).toBeCloseTo(5);
	});

	test("does not instantiate twice", async () => {
		setup();

		scriptAssetsCache.get(scene)!.set("p.scene", createPrefab(scene, "P"));

		const link = new TransformNode("link", scene);
		link.metadata = { sceneLink: "p.scene" };

		expect(await _instantiateSceneLinks(scene)).toBe(1);
		expect(await _instantiateSceneLinks(scene)).toBe(0);
		expect(link.getChildren()).toHaveLength(1);
	});

	test("instantiates prefabs made of prefabs", async () => {
		setup();

		const cache = scriptAssetsCache.get(scene)!;
		cache.set("inner.scene", createPrefab(scene, "Inner"));
		cache.set("outer.scene", createPrefab(scene, "Outer", "inner.scene"));

		const link = new TransformNode("link", scene);
		link.metadata = { sceneLink: "outer.scene" };

		// The outer prefab and the link nested in it.
		expect(await _instantiateSceneLinks(scene)).toBe(2);
		expect(scene.transformNodes.filter((n) => n.name.startsWith("InnerRoot"))).toHaveLength(1);
		expect(scene.transformNodes.filter((n) => n.name.startsWith("OuterRoot"))).toHaveLength(1);
	});

	test("stops on a scene that links to itself", async () => {
		setup();

		scriptAssetsCache.get(scene)!.set("loop.scene", createPrefab(scene, "Loop", "loop.scene"));

		const link = new TransformNode("link", scene);
		link.metadata = { sceneLink: "loop.scene" };

		const errors: unknown[] = [];
		const originalError = console.error;
		console.error = (...args: unknown[]) => errors.push(args);

		try {
			expect(await _instantiateSceneLinks(scene)).toBeLessThanOrEqual(16);
		} finally {
			console.error = originalError;
		}

		expect(errors.length).toBe(1);
	});

	test("applies the overrides of the link on the instance only", async () => {
		setup();

		const prefab = createPrefab(scene, "Crate");
		const box = prefab.container.meshes[0] as Mesh;
		box.id = "boxid";
		const rootNode = prefab.container.transformNodes[0];
		rootNode.id = "rootid";

		scriptAssetsCache.get(scene)!.set("crate.scene", prefab);

		const a = new TransformNode("A", scene);
		a.metadata = { sceneLink: "crate.scene", overrides: { boxid: { position: [1, 2, 3], scaling: [2, 2, 2], isVisible: false }, rootid: { isEnabled: false } } };

		const b = new TransformNode("B", scene);
		b.metadata = { sceneLink: "crate.scene" };

		await _instantiateSceneLinks(scene);

		const instanceBoxOfA = a.getChildren()[0].getChildren()[0] as Mesh;
		const instanceBoxOfB = b.getChildren()[0].getChildren()[0] as Mesh;

		expect(instanceBoxOfA.position.asArray()).toEqual([1, 2, 3]);
		expect(instanceBoxOfA.scaling.asArray()).toEqual([2, 2, 2]);
		expect(instanceBoxOfA.isVisible).toBe(false);
		expect((a.getChildren()[0] as TransformNode).isEnabled(false)).toBe(false);

		// The other instance and the prefab are untouched.
		expect(instanceBoxOfB.position.asArray()).toEqual([0, 0, 0]);
		expect(instanceBoxOfB.isVisible).toBe(true);
		expect((b.getChildren()[0] as TransformNode).isEnabled(false)).toBe(true);
	});

	test("an override of a script changes only the values it holds", () => {
		const node = new TransformNode("n", scene);
		node.metadata = {
			scripts: [
				{ key: "scripts/a.ts", enabled: true, values: { speed: { type: "number", value: 1 }, label: { type: "string", value: "prefab" } } },
				{ key: "scripts/b.ts", enabled: true },
			],
		};

		applyPrefabNodeOverride(node, {
			scripts: [
				{ key: "scripts/a.ts", values: { speed: { type: "number", value: 9 } } },
				{ key: "scripts/b.ts", remove: true },
				{ key: "scripts/c.ts", enabled: true, values: {} },
			],
		});

		expect(node.metadata.scripts.map((s: any) => s.key)).toEqual(["scripts/a.ts", "scripts/c.ts"]);
		expect(node.metadata.scripts[0].values.speed.value).toBe(9);
		expect(node.metadata.scripts[0].values.label.value).toBe("prefab");
	});

	test("a whole script in an override (the older format) sets its values", () => {
		setup();

		const node = new TransformNode("n", scene);
		node.metadata = { scripts: [{ key: "scripts/a.ts", values: { speed: { type: "number", value: 1 } } }] };

		applyPrefabNodeOverride(node, { scripts: [{ key: "scripts/a.ts", values: { speed: { type: "number", value: 9 } } }] });

		expect(node.metadata.scripts[0].values.speed.value).toBe(9);
	});

	test("warns about a link whose scene was not loaded", async () => {
		setup();

		const link = new TransformNode("link", scene);
		link.metadata = { sceneLink: "missing.scene" };

		const warnings: unknown[] = [];
		const originalWarn = console.warn;
		console.warn = (...args: unknown[]) => warnings.push(args);

		try {
			expect(await _instantiateSceneLinks(scene)).toBe(0);
		} finally {
			console.warn = originalWarn;
		}

		expect(warnings.length).toBe(1);
	});
});

describe("loading/container/geometries", () => {
	test("waits for the delay loaded geometries of the meshes of a container", async () => {
		const engine = new NullEngine();
		const scene = new Scene(engine);

		const container = new AssetContainer(scene);
		const lazy = Mesh.CreateBox("lazy", 1, scene);
		const eager = Mesh.CreateBox("eager", 1, scene);
		container.meshes.push(lazy, eager);

		// A geometry that arrives a little after it is asked for.
		lazy.delayLoadState = Constants.DELAYLOADSTATE_NOTLOADED;
		lazy._checkDelayState = () => {
			lazy.delayLoadState = Constants.DELAYLOADSTATE_LOADING;
			setTimeout(() => (lazy.delayLoadState = Constants.DELAYLOADSTATE_LOADED), 60);

			return lazy;
		};

		await loadContainerGeometries(container);

		expect(lazy.delayLoadState).toBe(Constants.DELAYLOADSTATE_LOADED);

		scene.dispose();
		engine.dispose();
	});
});
