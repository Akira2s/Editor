import { describe, expect, test } from "vitest";

import {
	diffPrefabNode,
	diffPrefabScripts,
	getScriptValueEntryId,
	IPrefabNodeOverride,
	listPrefabOverrideEntries,
	mergePrefabOverrideEntries,
} from "../../../src/tools/scene/prefab-overrides";

const script = (key: string, values: Record<string, any> = {}, enabled = true) => ({
	key,
	enabled,
	values: Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { type: typeof value, value }])),
});

const base = (): IPrefabNodeOverride => ({
	position: [0, 0, 0],
	rotation: [0, 0, 0],
	scaling: [1, 1, 1],
	isEnabled: true,
	isVisible: true,
	scripts: [script("scripts/mover.ts", { speed: 2, label: "a" }), script("scripts/health.ts", { max: 10 })],
});

describe("tools/scene/prefab-overrides entries", () => {
	test("an unchanged node has no entries", () => {
		expect(listPrefabOverrideEntries(base(), base())).toEqual([]);
	});

	test("one entry per property, grouped by component", () => {
		const current = base();
		current.position = [1, 0, 0];
		current.scaling = [2, 2, 2];
		current.isVisible = false;
		current.scripts![0].values.speed.value = 5;
		current.scripts![1].enabled = false;

		const entries = listPrefabOverrideEntries(base(), current);

		expect(entries).toEqual([
			{ id: "position", component: "Transform", label: "Position" },
			{ id: "scaling", component: "Transform", label: "Scaling" },
			{ id: "visible", component: "Node", label: "Visible" },
			{ id: "script:scripts/mover.ts:speed", component: "mover", label: "speed" },
			{ id: "script:scripts/health.ts:@enabled", component: "health", label: "Enabled" },
		]);
		expect(getScriptValueEntryId("scripts/mover.ts", "speed")).toBe("script:scripts/mover.ts:speed");
	});

	test("what the Inspector rewrites in a script (descriptions, types) is not an override", () => {
		const current = base();
		current.scripts![0].values.speed = { type: "number", description: "How fast", value: 2 };

		expect(diffPrefabScripts(base().scripts, current.scripts)).toEqual([]);
		expect(diffPrefabNode(base(), current)).toBeNull();
	});

	test("a script added or removed by the instance is one entry", () => {
		const added = base();
		added.scripts!.push(script("scripts/pickup.ts"));
		expect(listPrefabOverrideEntries(base(), added).map((e) => e.id)).toEqual(["script:scripts/pickup.ts"]);

		const removed = base();
		removed.scripts!.shift();
		expect(listPrefabOverrideEntries(base(), removed).map((e) => `${e.id}=${e.label}`)).toEqual(["script:scripts/mover.ts=Removed"]);
	});

	test("reverting one entry keeps the others", () => {
		const current = base();
		current.position = [1, 2, 3];
		current.scaling = [2, 2, 2];
		current.scripts![0].values.speed.value = 5;
		current.scripts![0].values.label.value = "b";

		const reverted = mergePrefabOverrideEntries(current, base(), ["position", "script:scripts/mover.ts:speed"]);

		expect(reverted.position).toEqual([0, 0, 0]);
		expect(reverted.scaling).toEqual([2, 2, 2]);
		expect(reverted.scripts![0].values.speed.value).toBe(2);
		expect(reverted.scripts![0].values.label.value).toBe("b");
		expect(listPrefabOverrideEntries(base(), reverted).map((e) => e.id)).toEqual(["scaling", "script:scripts/mover.ts:label"]);
	});

	test("applying one entry to the prefab writes only that entry", () => {
		const current = base();
		current.position = [1, 2, 3];
		current.scripts![0].values.speed.value = 5;
		current.scripts![0].values.label.value = "b";

		const patch = diffPrefabNode(base(), mergePrefabOverrideEntries(base(), current, ["script:scripts/mover.ts:speed"]));

		expect(patch?.position).toBeUndefined();
		expect(patch?.scripts?.[0].values.speed.value).toBe(5);
		expect(patch?.scripts?.[0].values.label.value).toBe("a");
	});

	test("the rotation entry follows a quaternion or Euler angles", () => {
		const prefab: IPrefabNodeOverride = { rotationQuaternion: [0, 0, 0, 1] };
		const current: IPrefabNodeOverride = { rotationQuaternion: [0, 1, 0, 0] };

		expect(listPrefabOverrideEntries(prefab, current).map((e) => e.id)).toEqual(["rotation"]);
		expect(mergePrefabOverrideEntries(current, prefab, ["rotation"]).rotationQuaternion).toEqual([0, 0, 0, 1]);
	});

	test("a script added by the instance can be reverted and applied as a whole", () => {
		const current = base();
		current.scripts!.push(script("scripts/pickup.ts", { value: 1 }));

		const reverted = mergePrefabOverrideEntries(current, base(), ["script:scripts/pickup.ts"]);
		expect(reverted.scripts!.map((s) => s.key)).toEqual(["scripts/mover.ts", "scripts/health.ts"]);

		const applied = mergePrefabOverrideEntries(base(), current, ["script:scripts/pickup.ts"]);
		expect(applied.scripts!.map((s) => s.key)).toEqual(["scripts/mover.ts", "scripts/health.ts", "scripts/pickup.ts"]);
	});
});
