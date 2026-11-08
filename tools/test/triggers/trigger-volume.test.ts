import { beforeEach, describe, expect, test, vi } from "vitest";
import { FreeCamera, Mesh, NullEngine, Scene, Tags, TransformNode, Vector3 } from "@babylonjs/core";

import { TriggerVolume } from "../../src/triggers/trigger-volume";
import { ITriggerEvent } from "../../src/triggers/types";

describe("triggers/trigger-volume", () => {
	let engine: NullEngine;
	let scene: Scene;
	let triggerNode: TransformNode;

	beforeEach(() => {
		engine = new NullEngine();
		scene = new Scene(engine);
		new FreeCamera("Camera", Vector3.Zero(), scene);
		triggerNode = new TransformNode("TriggerNode", scene);
	});

	describe("Box Trigger", () => {
		test("should handle enter, stay, and exit states correctly", () => {
			const trigger = new TriggerVolume("BoxTrigger", scene, triggerNode, {
				shape: "box",
				size: new Vector3(2, 2, 2),
			});

			const player = new TransformNode("Player", scene);
			player.position.set(0, 0, 0);

			const enterSpy = vi.fn();
			const staySpy = vi.fn();
			const exitSpy = vi.fn();

			trigger.onTriggerEnter.add((event: ITriggerEvent) => enterSpy(event));
			trigger.onTriggerStay.add((event: ITriggerEvent) => staySpy(event));
			trigger.onTriggerExit.add((event: ITriggerEvent) => exitSpy(event));

			// Frame 1: Enter
			trigger.update([player]);
			expect(enterSpy).toHaveBeenCalledTimes(1);
			expect(enterSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					trigger,
					target: player,
					state: "enter",
				})
			);
			expect(staySpy).not.toHaveBeenCalled();
			expect(exitSpy).not.toHaveBeenCalled();
			expect(trigger.isOverlapping(player)).toBe(true);
			expect(trigger.overlappingEntities).toEqual([player]);

			// Frame 2: Stay (player remains at 0, 0, 0)
			trigger.update([player]);
			expect(enterSpy).toHaveBeenCalledTimes(1);
			expect(staySpy).toHaveBeenCalledTimes(1);
			expect(staySpy).toHaveBeenCalledWith(
				expect.objectContaining({
					trigger,
					target: player,
					state: "stay",
				})
			);
			expect(exitSpy).not.toHaveBeenCalled();
			expect(trigger.overlappingEntities).toEqual([player]);

			// Frame 3: Move outside -> Exit
			player.position.set(10, 0, 0);
			trigger.update([player]);
			expect(enterSpy).toHaveBeenCalledTimes(1);
			expect(staySpy).toHaveBeenCalledTimes(1);
			expect(exitSpy).toHaveBeenCalledTimes(1);
			expect(exitSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					trigger,
					target: player,
					state: "exit",
				})
			);
			expect(trigger.isOverlapping(player)).toBe(false);
			expect(trigger.overlappingEntities).toEqual([]);

			// Frame 4: Remains outside -> No new events
			trigger.update([player]);
			expect(enterSpy).toHaveBeenCalledTimes(1);
			expect(staySpy).toHaveBeenCalledTimes(1);
			expect(exitSpy).toHaveBeenCalledTimes(1);
		});

		test("should handle oriented box testing with rotated trigger node", () => {
			triggerNode.position.set(0, 0, 0);
			// Rotate 45 degrees around Y
			triggerNode.rotation.y = Math.PI / 4;
			triggerNode.computeWorldMatrix(true);

			const trigger = new TriggerVolume("RotatedBoxTrigger", scene, triggerNode, {
				shape: "box",
				size: new Vector3(2, 2, 2),
			});

			// A point along the rotated local X-axis: (cos(45)*0.8, 0, sin(45)*0.8) should be inside
			const insideTarget = new TransformNode("Inside", scene);
			const cos45 = Math.SQRT1_2;
			insideTarget.position.set(cos45 * 0.8, 0, -cos45 * 0.8);

			// A point along the world axis at (1.2, 0, 1.2) is distance ~1.7 from center:
			// In local rotated space, (1.2, 0, 1.2) rotates by -45 deg to (1.7, 0, 0) which exceeds halfSize (1.0)
			const outsideTarget = new TransformNode("Outside", scene);
			outsideTarget.position.set(1.2, 0, 1.2);

			expect(trigger.isOverlapping(insideTarget)).toBe(true);
			expect(trigger.isOverlapping(outsideTarget)).toBe(false);
		});

		test("should handle box trigger without attached node", () => {
			const trigger = new TriggerVolume("DetachedBox", scene, null, {
				shape: "box",
				size: new Vector3(4, 4, 4),
			});
			trigger.position.set(5, 5, 5);

			const player = new TransformNode("Player", scene);
			player.position.set(5, 5, 5);
			expect(trigger.isOverlapping(player)).toBe(true);

			player.position.set(5, 8, 5); // dy = 3 > halfSize (2)
			expect(trigger.isOverlapping(player)).toBe(false);
		});
	});

	describe("Sphere Trigger", () => {
		test("should handle enter, stay, and exit states correctly", () => {
			triggerNode.position.set(0, 0, 0);
			const trigger = new TriggerVolume("SphereTrigger", scene, triggerNode, {
				shape: "sphere",
				radius: 2.0,
			});

			const target = new TransformNode("Target", scene);
			target.position.set(1, 0, 0); // Distance 1 <= 2

			const enterSpy = vi.fn();
			const staySpy = vi.fn();
			const exitSpy = vi.fn();

			trigger.onTriggerEnter.add((event: ITriggerEvent) => enterSpy(event));
			trigger.onTriggerStay.add((event: ITriggerEvent) => staySpy(event));
			trigger.onTriggerExit.add((event: ITriggerEvent) => exitSpy(event));

			// Frame 1: Enter
			trigger.update([target]);
			expect(enterSpy).toHaveBeenCalledTimes(1);
			expect(enterSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					trigger,
					target,
					state: "enter",
				})
			);
			expect(staySpy).not.toHaveBeenCalled();
			expect(exitSpy).not.toHaveBeenCalled();
			expect(trigger.isOverlapping(target)).toBe(true);

			// Frame 2: Stay
			trigger.update([target]);
			expect(enterSpy).toHaveBeenCalledTimes(1);
			expect(staySpy).toHaveBeenCalledTimes(1);
			expect(staySpy).toHaveBeenCalledWith(
				expect.objectContaining({
					trigger,
					target,
					state: "stay",
				})
			);
			expect(exitSpy).not.toHaveBeenCalled();

			// Frame 3: Move outside (distance 3 > 2) -> Exit
			target.position.set(3, 0, 0);
			trigger.update([target]);
			expect(enterSpy).toHaveBeenCalledTimes(1);
			expect(staySpy).toHaveBeenCalledTimes(1);
			expect(exitSpy).toHaveBeenCalledTimes(1);
			expect(exitSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					trigger,
					target,
					state: "exit",
				})
			);
			expect(trigger.isOverlapping(target)).toBe(false);

			// Frame 4: Still outside
			trigger.update([target]);
			expect(enterSpy).toHaveBeenCalledTimes(1);
			expect(staySpy).toHaveBeenCalledTimes(1);
			expect(exitSpy).toHaveBeenCalledTimes(1);
		});

		test("should compute distance correctly using DistanceSquared formula", () => {
			triggerNode.position.set(10, 0, 0);
			const trigger = new TriggerVolume("SphereTrigger", scene, triggerNode, {
				shape: "sphere",
				radius: 5.0,
			});

			const player = new TransformNode("Player", scene);
			player.position.set(13, 4, 0); // distance = sqrt(3^2 + 4^2) = 5.0 <= 5.0
			expect(trigger.isOverlapping(player)).toBe(true);

			player.position.set(13, 4.01, 0); // distance > 5.0
			expect(trigger.isOverlapping(player)).toBe(false);
		});
	});

	describe("Tag Filtering", () => {
		test("should filter entities by tag when detectionMode is taggedOnly", () => {
			const trigger = new TriggerVolume("TaggedTrigger", scene, triggerNode, {
				shape: "box",
				size: new Vector3(4, 4, 4),
				detectionMode: "taggedOnly",
				tag: "Player",
			});

			const player = new TransformNode("Player", scene);
			Tags.EnableFor(player);
			Tags.AddTagsTo(player, "Player");
			player.position.set(0, 0, 0);

			const enemy = new TransformNode("Enemy", scene);
			Tags.EnableFor(enemy);
			Tags.AddTagsTo(enemy, "Enemy");
			enemy.position.set(0, 0, 0);

			const untagged = new TransformNode("Untagged", scene);
			untagged.position.set(0, 0, 0);

			const enterSpy = vi.fn();
			trigger.onTriggerEnter.add((event: ITriggerEvent) => enterSpy(event));

			trigger.update([player, enemy, untagged]);

			expect(enterSpy).toHaveBeenCalledTimes(1);
			expect(enterSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					target: player,
				})
			);
			expect(trigger.isOverlapping(player)).toBe(true);
			expect(trigger.isOverlapping(enemy)).toBe(false);
			expect(trigger.isOverlapping(untagged)).toBe(false);
			expect(trigger.overlappingEntities).toEqual([player]);
		});

		test("should support metadata-based tagging", () => {
			const trigger = new TriggerVolume("TaggedTrigger", scene, triggerNode, {
				tag: "Player",
			});

			const playerMeta = new TransformNode("PlayerMeta", scene);
			playerMeta.metadata = { tag: "Player" };
			playerMeta.position.set(0, 0, 0);

			const otherMeta = new TransformNode("OtherMeta", scene);
			otherMeta.metadata = { tag: "NPC" };
			otherMeta.position.set(0, 0, 0);

			expect(trigger.isOverlapping(playerMeta)).toBe(true);
			expect(trigger.isOverlapping(otherMeta)).toBe(false);
		});

		test("should accept all candidates when detectionMode is all", () => {
			const trigger = new TriggerVolume("AllTrigger", scene, triggerNode, {
				shape: "box",
				detectionMode: "all",
				tag: "Player",
			});

			const untagged = new TransformNode("Untagged", scene);
			untagged.position.set(0, 0, 0);

			expect(trigger.isOverlapping(untagged)).toBe(true);
		});
	});

	describe("Enabled / Disabled State", () => {
		test("should emit no events and report no overlap when disabled", () => {
			const trigger = new TriggerVolume("DisabledTrigger", scene, triggerNode, {
				enabled: false,
			});

			expect(trigger.isEnabled).toBe(false);

			const player = new TransformNode("Player", scene);
			player.position.set(0, 0, 0);

			const enterSpy = vi.fn();
			const staySpy = vi.fn();
			const exitSpy = vi.fn();

			trigger.onTriggerEnter.add(enterSpy);
			trigger.onTriggerStay.add(staySpy);
			trigger.onTriggerExit.add(exitSpy);

			trigger.update([player]);

			expect(enterSpy).not.toHaveBeenCalled();
			expect(staySpy).not.toHaveBeenCalled();
			expect(exitSpy).not.toHaveBeenCalled();
			expect(trigger.isOverlapping(player)).toBe(false);
			expect(trigger.overlappingEntities).toEqual([]);

			// Enable and update -> should enter
			trigger.setEnabled(true);
			expect(trigger.isEnabled).toBe(true);

			trigger.update([player]);
			expect(enterSpy).toHaveBeenCalledTimes(1);

			// Disable again -> should not emit stay or exit
			trigger.setEnabled(false);
			expect(trigger.isEnabled).toBe(false);

			trigger.update([player]);
			expect(staySpy).not.toHaveBeenCalled();
			expect(exitSpy).not.toHaveBeenCalled();
		});
	});

	describe("Serialization and Deserialization", () => {
		test("should perform round-trip serialization and parse for box trigger", () => {
			triggerNode.id = "trigger-node-id";
			const original = new TriggerVolume("MyTrigger", scene, triggerNode, {
				shape: "box",
				size: new Vector3(4, 5, 6),
				radius: 3.5,
				detectionMode: "taggedOnly",
				tag: "Hero",
				enabled: true,
				checkInterval: 2,
			});

			const json = original.serialize();
			expect(json).toEqual({
				name: "MyTrigger",
				nodeId: "trigger-node-id",
				nodeName: "TriggerNode",
				shape: "box",
				size: [4, 5, 6],
				radius: 3.5,
				detectionMode: "taggedOnly",
				tag: "Hero",
				enabled: true,
				checkInterval: 2,
				position: undefined,
			});

			const restored = TriggerVolume.Parse(json, scene);
			expect(restored.name).toBe("MyTrigger");
			expect(restored.node).toBe(triggerNode);
			expect(restored.shape).toBe("box");
			expect(restored.size.asArray()).toEqual([4, 5, 6]);
			expect(restored.radius).toBe(3.5);
			expect(restored.detectionMode).toBe("taggedOnly");
			expect(restored.tag).toBe("Hero");
			expect(restored.isEnabled).toBe(true);
			expect(restored.checkInterval).toBe(2);
		});

		test("should perform round-trip serialization and parse for standalone trigger without node", () => {
			const original = new TriggerVolume("StandaloneSphere", scene, null, {
				shape: "sphere",
				radius: 7.25,
				detectionMode: "all",
				enabled: false,
				checkInterval: 1,
			});
			original.position.set(10, 20, 30);

			const json = original.serialize();
			expect(json.position).toEqual([10, 20, 30]);
			expect(json.nodeId).toBeNull();

			const restored = TriggerVolume.Parse(json, scene);
			expect(restored.name).toBe("StandaloneSphere");
			expect(restored.node).toBeNull();
			expect(restored.shape).toBe("sphere");
			expect(restored.radius).toBe(7.25);
			expect(restored.position.asArray()).toEqual([10, 20, 30]);
			expect(restored.isEnabled).toBe(false);
		});
	});

	describe("Cleanup and Disposal", () => {
		test("should emit exit event on dispose for all currently overlapping entities and clear observables", () => {
			const trigger = new TriggerVolume("DisposalTrigger", scene, triggerNode, {
				shape: "box",
				size: new Vector3(2, 2, 2),
			});

			const player1 = new TransformNode("Player1", scene);
			player1.position.set(0, 0, 0);

			const player2 = new TransformNode("Player2", scene);
			player2.position.set(0, 0, 0);

			trigger.update([player1, player2]);
			expect(trigger.overlappingEntities.length).toBe(2);

			const exitSpy = vi.fn();
			trigger.onTriggerExit.add((event: ITriggerEvent) => exitSpy(event));

			trigger.dispose();

			expect(exitSpy).toHaveBeenCalledTimes(2);
			expect(exitSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					target: player1,
					state: "exit",
				})
			);
			expect(exitSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					target: player2,
					state: "exit",
				})
			);
			expect(trigger.overlappingEntities).toEqual([]);
			expect(trigger.isDisposed).toBe(true);

			// Calling update after dispose does nothing
			const enterSpy = vi.fn();
			trigger.onTriggerEnter.add(enterSpy);
			trigger.update([player1]);
			expect(enterSpy).not.toHaveBeenCalled();

			// Calling dispose again is a safe no-op
			expect(() => trigger.dispose()).not.toThrow();
		});

		test("should dispose trigger when its attached node is disposed", () => {
			const trigger = new TriggerVolume("NodeDisposedTrigger", scene, triggerNode);
			expect(trigger.isDisposed).toBe(false);

			triggerNode.dispose();
			expect(trigger.isDisposed).toBe(true);
		});
	});

	describe("Scene Candidate Discovery & Integration", () => {
		test("should automatically discover scene meshes and transformNodes when candidates are not provided", () => {
			const trigger = new TriggerVolume("SceneTrigger", scene, triggerNode, {
				shape: "box",
				size: new Vector3(4, 4, 4),
			});

			const mesh = new Mesh("SceneMesh", scene);
			mesh.position.set(0, 0, 0);

			const node = new TransformNode("SceneNode", scene);
			node.position.set(0, 0, 0);

			const enterSpy = vi.fn();
			trigger.onTriggerEnter.add(enterSpy);

			// Calling update with no arguments
			trigger.update();

			expect(enterSpy).toHaveBeenCalledTimes(2);
			expect(trigger.overlappingEntities).toContain(mesh);
			expect(trigger.overlappingEntities).toContain(node);
			// Trigger's own node should never be included
			expect(trigger.overlappingEntities).not.toContain(triggerNode);
		});

		test("should respect frame checkInterval during scene render", () => {
			const trigger = new TriggerVolume("IntervalTrigger", scene, triggerNode, {
				shape: "box",
				checkInterval: 2,
			});

			const player = new TransformNode("Player", scene);
			player.position.set(0, 0, 0);

			const updateSpy = vi.spyOn(trigger, "update");

			// Render frame 1 (1 % 2 !== 0) -> update should not be called
			scene.render();
			expect(updateSpy).toHaveBeenCalledTimes(0);

			// Render frame 2 (2 % 2 === 0) -> update called
			scene.render();
			expect(updateSpy).toHaveBeenCalledTimes(1);

			// Render frame 3 (3 % 2 !== 0) -> update not called again
			scene.render();
			expect(updateSpy).toHaveBeenCalledTimes(1);

			// Render frame 4 (4 % 2 === 0) -> update called
			scene.render();
			expect(updateSpy).toHaveBeenCalledTimes(2);
		});
	});

	describe("Adversarial Edge Cases", () => {
		test("should safely return false when target is null or undefined without throwing", () => {
			const trigger = new TriggerVolume("SafeTrigger", scene, triggerNode);
			expect(trigger.isOverlapping(null as any)).toBe(false);
			expect(trigger.isOverlapping(undefined as any)).toBe(false);
		});

		test("should handle non-uniform scaling on box triggers accurately", () => {
			triggerNode.position.set(0, 0, 0);
			triggerNode.scaling.set(2, 0.5, 3); // box effective size: 2*2=4 on X, 2*0.5=1 on Y, 2*3=6 on Z
			const trigger = new TriggerVolume("ScaledBox", scene, triggerNode, {
				shape: "box",
				size: new Vector3(2, 2, 2),
			});

			const player = new TransformNode("Player", scene);

			// Within scaled bounds: X=1.5 (half-extent is 2), Y=0.4 (half-extent is 0.5), Z=2.5 (half-extent is 3)
			player.position.set(1.5, 0.4, 2.5);
			expect(trigger.isOverlapping(player)).toBe(true);

			// Outside scaled Y: Y=0.7 > 0.5
			player.position.set(1.5, 0.7, 2.5);
			expect(trigger.isOverlapping(player)).toBe(false);
		});

		test("should handle scaled sphere triggers using maxScale", () => {
			triggerNode.position.set(0, 0, 0);
			triggerNode.scaling.set(2, 1, 1); // maxScale = 2, base radius = 1.5 => effective radius = 3.0
			const trigger = new TriggerVolume("ScaledSphere", scene, triggerNode, {
				shape: "sphere",
				radius: 1.5,
			});

			const player = new TransformNode("Player", scene);

			// Distance = 2.5 <= 3.0
			player.position.set(2.5, 0, 0);
			expect(trigger.isOverlapping(player)).toBe(true);

			// Distance = 3.5 > 3.0
			player.position.set(3.5, 0, 0);
			expect(trigger.isOverlapping(player)).toBe(false);
		});

		test("should handle entity disposed while inside volume and clean up safely", () => {
			const trigger = new TriggerVolume("DisposalTest", scene, triggerNode);
			const player = new TransformNode("DisposedPlayer", scene);
			player.position.set(0, 0, 0);

			const exitSpy = vi.fn();
			trigger.onTriggerExit.add(exitSpy);

			trigger.update([player]);
			expect(trigger.overlappingEntities).toContain(player);

			// Dispose the player entity
			player.dispose();

			// Overlapping entities getter must filter out disposed entity
			expect(trigger.overlappingEntities).not.toContain(player);

			// Next update fires exit and removes entity
			trigger.update();
			expect(exitSpy).toHaveBeenCalled();
			expect(trigger.overlappingEntities.length).toBe(0);
		});

		test("should handle re-entrant dispose calls without infinite recursion or duplicate events", () => {
			const trigger = new TriggerVolume("ReentrantTest", scene, triggerNode);
			const player = new TransformNode("Player", scene);
			player.position.set(0, 0, 0);

			trigger.update([player]);

			let exitCallCount = 0;
			trigger.onTriggerExit.add(() => {
				exitCallCount++;
				// Attempt recursive dispose from inside listener
				trigger.dispose();
			});

			trigger.dispose();
			expect(exitCallCount).toBe(1);
			expect(trigger.isDisposed).toBe(true);
		});

		test("should automatically dispose standalone trigger when scene is disposed", () => {
			const trigger = new TriggerVolume("StandaloneTrigger", scene, null);
			expect(trigger.isDisposed).toBe(false);

			scene.dispose();
			expect(trigger.isDisposed).toBe(true);
		});
	});
});
