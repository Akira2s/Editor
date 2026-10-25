import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";

import { NullEngine, Scene, TransformNode, Mesh, FreeCamera, PointLight, Vector3 } from "babylonjs";

vi.mock("babylonjs-editor-tools", () => ({}));

import { getPrefabName, getPrefabRoots } from "../../../src/tools/scene/prefab";

describe("tools/scene/prefab", () => {
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

	describe("getPrefabName", () => {
		test("replaces the characters a file name can't have", () => {
			expect(getPrefabName('My: "Tree"/v2?')).toBe("My_ _Tree__v2_");
		});

		test("drops the .scene extension and trims", () => {
			expect(getPrefabName("  Tree.scene ")).toBe("Tree");
		});

		test("never returns an empty name", () => {
			expect(getPrefabName("   ")).toBe("Prefab");
			expect(getPrefabName("")).toBe("Prefab");
		});
	});

	describe("getPrefabRoots", () => {
		test("keeps only the nodes without a selected ancestor", () => {
			const root = new TransformNode("root", scene);
			const child = new TransformNode("child", scene);
			const mesh = new Mesh("mesh", scene);
			const other = new TransformNode("other", scene);

			child.parent = root;
			mesh.parent = child;

			expect(getPrefabRoots([mesh, child, root, other])).toEqual([root, other]);
			expect(getPrefabRoots([mesh, child])).toEqual([child]);
		});

		test("a descendant of a node that is not selected is a root", () => {
			const root = new TransformNode("root", scene);
			const child = new TransformNode("child", scene);
			child.parent = root;

			expect(getPrefabRoots([child])).toEqual([child]);
		});

		test("ignores the camera of the editor", () => {
			const editorCamera = new FreeCamera("camera", Vector3.Zero(), scene);
			(editorCamera as any).getClassName = () => "EditorCamera";

			const light = new PointLight("light", Vector3.Zero(), scene);

			expect(getPrefabRoots([editorCamera, light])).toEqual([light]);
		});

		test("returns nothing for an empty selection", () => {
			expect(getPrefabRoots([])).toEqual([]);
		});
	});
});
