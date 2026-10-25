import { describe, expect, test } from "vitest";

import {
	buildPrefabScriptPatches,
	diffPrefabNode,
	diffPrefabScripts,
	getScriptValueEntryId,
	IPrefabNodeOverride,
	listPrefabOverrideEntries,
	mergePrefabOverrideEntries,
	mergePrefabScripts,
	normalizePrefabNodeOverride,
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
		expect(patch?.scripts?.length).toBe(1);
		expect(patch?.scripts?.[0].values.speed.value).toBe(5);
		expect(patch?.scripts?.[0].values.label).toBeUndefined();
	});

	test("an override of one script value stores that value only, the others keep following the prefab", () => {
		const instance = base();
		instance.scripts![0].values.speed.value = 5;

		const override = diffPrefabNode(base(), instance)!;
		expect(override.scripts).toEqual([{ key: "scripts/mover.ts", values: { speed: { type: "number", value: 5 } } }]);

		// The prefab changes the value the instance did not touch, and the one it did.
		const prefab = base();
		prefab.scripts![0].values.label.value = "changed in the prefab";
		prefab.scripts![0].values.speed.value = 3;
		prefab.scripts![1].values.max.value = 99;

		const merged = mergePrefabScripts(prefab.scripts, override.scripts!);
		expect(merged[0].values.speed.value).toBe(5);
		expect(merged[0].values.label.value).toBe("changed in the prefab");
		expect(merged[1].values.max.value).toBe(99);
	});

	test("script patches carry scripts added and removed by the instance, and enabled", () => {
		const instance = base();
		instance.scripts!.shift();
		instance.scripts!.push(script("scripts/pickup.ts", { value: 1 }));
		instance.scripts![0].enabled = false;

		const patches = buildPrefabScriptPatches(base().scripts, instance.scripts);
		expect(patches).toEqual([{ key: "scripts/mover.ts", remove: true }, { key: "scripts/health.ts", enabled: false }, instance.scripts![1]]);

		const merged = mergePrefabScripts(base().scripts, patches);
		expect(merged.map((s) => s.key)).toEqual(["scripts/health.ts", "scripts/pickup.ts"]);
		expect(merged[0].enabled).toBe(false);
	});

	test("an override saved with all the scripts of the node is reduced to what differs from the prefab", () => {
		const legacy: IPrefabNodeOverride = { position: [1, 2, 3], scripts: base().scripts };
		legacy.scripts![1].values.max.value = 12;

		const normalized = normalizePrefabNodeOverride(base(), legacy);
		expect(normalized.position).toEqual([1, 2, 3]);
		expect(normalized.scripts).toEqual([{ key: "scripts/health.ts", values: { max: { type: "number", value: 12 } } }]);

		expect(normalizePrefabNodeOverride(base(), { scripts: base().scripts }).scripts).toBeUndefined();
		expect(normalizePrefabNodeOverride(base(), normalized)).toEqual(normalized);
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
