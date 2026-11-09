import { beforeEach, describe, expect, test, vi } from "vitest";
import { AnimationGroup, FreeCamera, Mesh, NullEngine, Scene, TransformNode, Vector3 } from "@babylonjs/core";

import {
	configureGameplaySystems,
	getAnimationStateMachineForNode,
	getCharacterControllerForNode,
	getInputManagerForScene,
	getTriggerVolumeForNode,
} from "../../src/loading/gameplay";
import { InputManager } from "../../src/input/manager";
import { CharacterController } from "../../src/physics/kcc/controller";
import { TriggerVolume } from "../../src/triggers/trigger-volume";
import { AnimationStateMachine } from "../../src/animation/state-machine/state-machine";

describe("loading/gameplay", () => {
	let engine: NullEngine;
	let scene: Scene;

	beforeEach(() => {
		engine = new NullEngine();
		scene = new Scene(engine);
		new FreeCamera("Camera", Vector3.Zero(), scene);
	});

	test("should return null from getters when gameplay systems are not configured", () => {
		const node = new TransformNode("TestNode", scene);

		expect(getInputManagerForScene(scene)).toBeNull();
		expect(getCharacterControllerForNode(node)).toBeNull();
		expect(getTriggerVolumeForNode(node)).toBeNull();
		expect(getAnimationStateMachineForNode(node)).toBeNull();
	});

	test("should configure InputManager when scene.metadata.inputEnabled is true", () => {
		scene.metadata = {
			inputEnabled: true,
			inputActionMaps: [
				{
					name: "CustomControls",
					enabled: true,
					actions: [
						{
							name: "Fire",
							type: "button",
							bindings: [{ device: "keyboard", key: "KeyF" }],
						},
					],
				},
			],
		};

		configureGameplaySystems(scene);

		const inputManager = getInputManagerForScene(scene);
		expect(inputManager).toBeInstanceOf(InputManager);
		expect((scene as any).inputManager).toBe(inputManager);
		expect(inputManager?.getActionMap("CustomControls")).not.toBeNull();
		expect(inputManager?.getActionMap("PlayerControls")).not.toBeNull();
	});

	test("should configure CharacterController on TransformNode and Mesh when enabled", () => {
		const playerNode = new TransformNode("Player", scene);
		playerNode.metadata = {
			characterController: {
				enabled: true,
				radius: 0.6,
				height: 2.0,
				mass: 80,
				maxSlopeAngle: Math.PI / 3,
				stepOffset: 0.4,
				skinWidth: 0.06,
				airControl: 0.5,
				gravity: [0, -15, 0],
			},
		};

		const disabledNode = new TransformNode("DisabledPlayer", scene);
		disabledNode.metadata = {
			characterController: {
				enabled: false,
				radius: 0.5,
			},
		};

		configureGameplaySystems(scene);

		const controller = getCharacterControllerForNode(playerNode);
		expect(controller).toBeInstanceOf(CharacterController);
		expect((playerNode as any).characterController).toBe(controller);
		expect(controller?.radius).toBe(0.6);
		expect(controller?.height).toBe(2.0);
		expect(controller?.mass).toBe(80);
		expect(controller?.maxSlopeAngle).toBeCloseTo(Math.PI / 3);
		expect(controller?.stepOffset).toBe(0.4);
		expect(controller?.skinWidth).toBe(0.06);
		expect(controller?.airControl).toBe(0.5);
		expect(controller?.gravity.y).toBe(-15);

		expect(getCharacterControllerForNode(disabledNode)).toBeNull();

		const disposeSpy = vi.spyOn(controller!, "dispose");
		playerNode.dispose();
		expect(disposeSpy).toHaveBeenCalledOnce();
		expect(getCharacterControllerForNode(playerNode)).toBeNull();
	});

	test("should configure TriggerVolume on TransformNode and Mesh when enabled", () => {
		const zoneMesh = new Mesh("ZoneMesh", scene);
		zoneMesh.metadata = {
			triggerVolume: {
				enabled: true,
				name: "VictoryZone",
				shape: "sphere",
				size: [4, 4, 4],
				radius: 3.5,
				detectionMode: "taggedOnly",
				tag: "Hero",
				checkInterval: 2,
			},
		};

		const disabledZone = new TransformNode("DisabledZone", scene);
		disabledZone.metadata = {
			triggerVolume: {
				enabled: false,
				name: "DisabledZone",
			},
		};

		configureGameplaySystems(scene);

		const trigger = getTriggerVolumeForNode(zoneMesh);
		expect(trigger).toBeInstanceOf(TriggerVolume);
		expect((zoneMesh as any).triggerVolume).toBe(trigger);
		expect(trigger?.node).toBe(zoneMesh);
		expect(trigger?.name).toBe("VictoryZone");
		expect(trigger?.shape).toBe("sphere");
		expect(trigger?.radius).toBe(3.5);
		expect(trigger?.detectionMode).toBe("taggedOnly");
		expect(trigger?.tag).toBe("Hero");
		expect(trigger?.checkInterval).toBe(2);

		expect(getTriggerVolumeForNode(disabledZone)).toBeNull();
	});

	test("should configure AnimationStateMachine and update on scene beforeRender", () => {
		const idleGroup = new AnimationGroup("IdleAnim", scene);
		const walkGroup = new AnimationGroup("WalkAnim", scene);
		expect(idleGroup).toBeDefined();
		expect(walkGroup).toBeDefined();

		const characterNode = new TransformNode("Character", scene);
		characterNode.metadata = {
			animationStateMachine: {
				enabled: true,
				initialState: "Idle",
				parameters: [{ name: "speed", type: "float", value: 0 }],
				states: [
					{
						name: "Idle",
						animationGroupName: "IdleAnim",
						speed: 1,
						loop: true,
						transitions: [
							{
								targetState: "Walk",
								duration: 0,
								hasExitTime: false,
								conditions: [{ parameter: "speed", operator: ">", threshold: 0.1 }],
							},
						],
					},
					{
						name: "Walk",
						animationGroupName: "WalkAnim",
						speed: 1,
						loop: true,
						transitions: [],
					},
				],
			},
		};

		configureGameplaySystems(scene);

		const sm = getAnimationStateMachineForNode(characterNode);
		expect(sm).toBeInstanceOf(AnimationStateMachine);
		expect((characterNode as any).animationStateMachine).toBe(sm);
		expect(sm?.currentState?.name).toBe("Idle");

		sm?.setFloat("speed", 1.0);
		scene.onBeforeRenderObservable.notifyObservers(scene);
		expect(sm?.currentState?.name).toBe("Walk");

		const disposeSpy = vi.spyOn(sm!, "dispose");
		characterNode.dispose();
		expect(disposeSpy).toHaveBeenCalledOnce();
		expect(sm?.isDisposed).toBe(true);
		expect(getAnimationStateMachineForNode(characterNode)).toBeNull();
	});

	test("should remove scene.onBeforeRenderObservable observers when node with AnimationStateMachine and TriggerVolume is disposed", async () => {
		const baselineObservers = scene.onBeforeRenderObservable.observers.length;

		const node = new TransformNode("InteractiveNode", scene);
		node.metadata = {
			triggerVolume: {
				enabled: true,
				name: "NodeTrigger",
				shape: "box",
				size: [2, 2, 2],
			},
			animationStateMachine: {
				enabled: true,
				initialState: "Idle",
				parameters: [],
				states: [{ name: "Idle", animationGroupName: "", speed: 1, loop: true, transitions: [] }],
			},
		};

		configureGameplaySystems(scene);
		expect(scene.onBeforeRenderObservable.observers.length).toBe(baselineObservers + 2);

		node.dispose();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(scene.onBeforeRenderObservable.observers.length).toBe(baselineObservers);
		expect(getTriggerVolumeForNode(node)).toBeNull();
		expect(getAnimationStateMachineForNode(node)).toBeNull();
	});

	test("should be idempotent when configureGameplaySystems is called twice on the same scene", async () => {
		const baselineObservers = scene.onBeforeRenderObservable.observers.length;

		scene.metadata = {
			inputEnabled: true,
		};

		const node = new TransformNode("Player", scene);
		node.metadata = {
			characterController: { enabled: true },
			triggerVolume: { enabled: true, name: "Trigger" },
			animationStateMachine: {
				enabled: true,
				initialState: "Idle",
				parameters: [],
				states: [{ name: "Idle", animationGroupName: "", speed: 1, loop: true, transitions: [] }],
			},
		};

		configureGameplaySystems(scene);

		const firstInput = getInputManagerForScene(scene)!;
		const firstCC = getCharacterControllerForNode(node)!;
		const firstTV = getTriggerVolumeForNode(node)!;
		const firstSM = getAnimationStateMachineForNode(node)!;

		const inputDisposeSpy = vi.spyOn(firstInput, "dispose");
		const ccDisposeSpy = vi.spyOn(firstCC, "dispose");
		const tvDisposeSpy = vi.spyOn(firstTV, "dispose");
		const smDisposeSpy = vi.spyOn(firstSM, "dispose");

		const observersAfterFirst = scene.onBeforeRenderObservable.observers.length;
		expect(observersAfterFirst).toBe(baselineObservers + 3);

		configureGameplaySystems(scene);

		expect(inputDisposeSpy).toHaveBeenCalledOnce();
		expect(ccDisposeSpy).toHaveBeenCalledOnce();
		expect(tvDisposeSpy).toHaveBeenCalledOnce();
		expect(smDisposeSpy).toHaveBeenCalledOnce();

		// Trigger one render frame so any disposed SM observer self-cleans and await macrotask for Observable._deferUnregister
		scene.onBeforeRenderObservable.notifyObservers(scene);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(scene.onBeforeRenderObservable.observers.length).toBe(observersAfterFirst);
	});

	test("should handle malformed metadata gracefully without throwing", () => {
		scene.metadata = null;
		const node1 = new TransformNode("NullMetaNode", scene);
		node1.metadata = null;

		const node2 = new TransformNode("MalformedMetaNode", scene);
		node2.metadata = {
			characterController: {
				enabled: true,
				gravity: "invalid-gravity",
			},
			triggerVolume: {
				enabled: true,
				size: "invalid-size",
			},
			animationStateMachine: {
				enabled: true,
				parameters: "not-an-array",
				states: "not-an-array",
			},
		};

		expect(() => configureGameplaySystems(scene)).not.toThrow();
		expect(getCharacterControllerForNode(node2)).toBeInstanceOf(CharacterController);
		expect(getTriggerVolumeForNode(node2)).toBeInstanceOf(TriggerVolume);
		expect(getAnimationStateMachineForNode(node2)).toBeInstanceOf(AnimationStateMachine);
	});
});
