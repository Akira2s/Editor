import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { NullEngine, Scene, TransformNode } from "babylonjs";

vi.mock("electron", () => ({
	shell: {
		beep: vi.fn(),
	},
}));

import { undo, redo, clearUndoRedo, registerSimpleUndoRedo } from "../../../../src/tools/undoredo";
import { EditorCharacterControllerInspector } from "../../../../src/editor/layout/inspector/gameplay/character-controller";
import { EditorTriggerVolumeInspector } from "../../../../src/editor/layout/inspector/gameplay/trigger-volume";
import { EditorAnimationStateMachineInspector } from "../../../../src/editor/layout/inspector/gameplay/animation-state-machine";
import { EditorSceneInputActionsInspector } from "../../../../src/editor/layout/inspector/scene/input-actions";

describe("editor/layout/inspector/gameplay", () => {
	let engine: NullEngine;
	let scene: Scene;
	let node: TransformNode;

	beforeEach(() => {
		clearUndoRedo();
		engine = new NullEngine();
		scene = new Scene(engine);
		node = new TransformNode("testNode", scene);
	});

	afterEach(() => {
		clearUndoRedo();
		scene.dispose();
		engine.dispose();
	});

	describe("EditorCharacterControllerInspector", () => {
		test("enables and disables characterController metadata with undo/redo", () => {
			const inspector = new EditorCharacterControllerInspector({ object: node });
			inspector.forceUpdate = vi.fn();

			expect(node.metadata).toEqual({});
			expect(inspector.render()).toBeTruthy();

			// Enable Character Controller
			(inspector as any)._handleEnabledChange();
			expect(node.metadata.characterController).toEqual({
				enabled: true,
				radius: 0.5,
				height: 1.8,
				mass: 70,
				maxSlopeAngle: Math.PI / 4,
				stepOffset: 0.3,
				skinWidth: 0.05,
				airControl: 0.3,
			});
			expect(inspector.render()).toBeTruthy();

			// Undo enable
			undo();
			expect(node.metadata.characterController).toBeUndefined();

			// Redo enable
			redo();
			expect(node.metadata.characterController?.enabled).toBe(true);
			expect(node.metadata.characterController?.radius).toBe(0.5);

			// Customize before disabling
			node.metadata.characterController.radius = 0.8;
			node.metadata.characterController.gravity = [0, -20, 0];

			// Disable Character Controller
			(inspector as any)._handleEnabledChange();
			expect(node.metadata.characterController).toBeUndefined();

			// Undo disable -> restores previous configuration including custom radius and gravity
			undo();
			expect(node.metadata.characterController?.enabled).toBe(true);
			expect(node.metadata.characterController?.radius).toBe(0.8);
			expect(node.metadata.characterController?.gravity).toEqual([0, -20, 0]);

			// Redo disable
			redo();
			expect(node.metadata.characterController).toBeUndefined();
		});
	});

	describe("EditorTriggerVolumeInspector", () => {
		test("enables and disables triggerVolume metadata with undo/redo", () => {
			const inspector = new EditorTriggerVolumeInspector({ object: node });
			inspector.forceUpdate = vi.fn();

			expect(node.metadata).toEqual({});
			expect(inspector.render()).toBeTruthy();

			// Enable Trigger Volume
			(inspector as any)._handleEnabledChange();
			expect(node.metadata.triggerVolume).toEqual({
				enabled: true,
				name: "testNode",
				shape: "box",
				size: [2, 2, 2],
				radius: 1.5,
				detectionMode: "all",
				tag: "Player",
				checkInterval: 1,
			});
			expect(inspector.render()).toBeTruthy();

			// Undo enable
			undo();
			expect(node.metadata.triggerVolume).toBeUndefined();

			// Redo enable
			redo();
			expect(node.metadata.triggerVolume?.enabled).toBe(true);

			// Disable Trigger Volume
			(inspector as any)._handleEnabledChange();
			expect(node.metadata.triggerVolume).toBeUndefined();

			// Undo disable
			undo();
			expect(node.metadata.triggerVolume?.enabled).toBe(true);
			expect(node.metadata.triggerVolume?.size).toEqual([2, 2, 2]);
		});

		test("_sizeProxy x, y, z getters and setters and Undo/Redo resilience after toggling enabled off/on", () => {
			const inspector = new EditorTriggerVolumeInspector({ object: node });
			inspector.forceUpdate = vi.fn();
			const sizeProxy = (inspector as any)._sizeProxy as { x: number; y: number; z: number };

			// Default getters before triggerVolume exists
			expect(sizeProxy.x).toBe(2);
			expect(sizeProxy.y).toBe(2);
			expect(sizeProxy.z).toBe(2);

			// Enable trigger volume
			(inspector as any)._handleEnabledChange();
			expect(node.metadata.triggerVolume.size).toEqual([2, 2, 2]);

			// Edit x, y, z via _sizeProxy with undo/redo tracking
			const oldX = sizeProxy.x;
			sizeProxy.x = 5;
			registerSimpleUndoRedo({
				object: sizeProxy,
				property: "x",
				oldValue: oldX,
				newValue: 5,
			});

			const oldY = sizeProxy.y;
			sizeProxy.y = 6;
			registerSimpleUndoRedo({
				object: sizeProxy,
				property: "y",
				oldValue: oldY,
				newValue: 6,
			});

			const oldZ = sizeProxy.z;
			sizeProxy.z = 7;
			registerSimpleUndoRedo({
				object: sizeProxy,
				property: "z",
				oldValue: oldZ,
				newValue: 7,
			});

			expect(node.metadata.triggerVolume.size).toEqual([5, 6, 7]);
			expect(sizeProxy.x).toBe(5);
			expect(sizeProxy.y).toBe(6);
			expect(sizeProxy.z).toBe(7);

			// Toggle enabled off and on, then undo back and verify _sizeProxy still writes to current triggerVolume
			(inspector as any)._handleEnabledChange(); // off
			expect(node.metadata.triggerVolume).toBeUndefined();

			(inspector as any)._handleEnabledChange(); // on (fresh [2, 2, 2] object)
			expect(node.metadata.triggerVolume.size).toEqual([2, 2, 2]);
			expect(sizeProxy.x).toBe(2);

			// Undo on -> off
			undo();
			expect(node.metadata.triggerVolume).toBeUndefined();

			// Undo off -> back to [5, 6, 7]
			undo();
			expect(node.metadata.triggerVolume.size).toEqual([5, 6, 7]);
			expect(sizeProxy.x).toBe(5);
			expect(sizeProxy.y).toBe(6);
			expect(sizeProxy.z).toBe(7);

			// Undo z, y, x edits on _sizeProxy after object replacement
			undo();
			expect(node.metadata.triggerVolume.size).toEqual([5, 6, 2]);
			undo();
			expect(node.metadata.triggerVolume.size).toEqual([5, 2, 2]);
			undo();
			expect(node.metadata.triggerVolume.size).toEqual([2, 2, 2]);

			// Redo x, y, z edits
			redo();
			redo();
			redo();
			expect(node.metadata.triggerVolume.size).toEqual([5, 6, 7]);
		});
	});

	describe("EditorAnimationStateMachineInspector", () => {
		test("enables and disables animationStateMachine metadata, adds/removes parameters and states, and preserves parameter value on type change undo", () => {
			const inspector = new EditorAnimationStateMachineInspector({ object: node });
			inspector.forceUpdate = vi.fn();

			expect(node.metadata).toEqual({});
			expect(inspector.render()).toBeTruthy();

			// Enable Animation State Machine
			(inspector as any)._handleEnabledChange();
			expect(node.metadata.animationStateMachine).toEqual({
				enabled: true,
				initialState: "Idle",
				parameters: [{ name: "speed", type: "float", value: 0 }],
				states: [{ name: "Idle", animationGroupName: "", speed: 1, loop: true, transitions: [] }],
			});
			expect(inspector.render()).toBeTruthy();

			// Parameter addition and undo/redo
			(inspector as any)._handleAddParameter();
			expect(node.metadata.animationStateMachine.parameters).toHaveLength(2);
			expect(node.metadata.animationStateMachine.parameters[1]).toEqual({
				name: "param_2",
				type: "float",
				value: 0,
			});

			undo();
			expect(node.metadata.animationStateMachine.parameters).toHaveLength(1);
			redo();
			expect(node.metadata.animationStateMachine.parameters).toHaveLength(2);

			// Set custom float value on parameter 0, then simulate type change to bool via rendered EditorInspectorListField onChange
			const param0 = node.metadata.animationStateMachine.parameters[0];
			param0.value = 3.5;

			const renderedTree = inspector.render() as any;
			// Find the parameter Type EditorInspectorListField in the rendered tree and invoke its onChange("bool", "float")
			const findListFields = (element: any, acc: any[] = []): any[] => {
				if (!element || typeof element !== "object") {
					return acc;
				}
				if (Array.isArray(element)) {
					element.forEach((child) => findListFields(child, acc));
					return acc;
				}
				if (element.props?.property === "type" && element.props?.object === param0 && typeof element.props?.onChange === "function") {
					acc.push(element);
				}
				const children = element.props?.children;
				if (children) {
					findListFields(children, acc);
				}
				return acc;
			};

			const typeFields = findListFields(renderedTree);
			expect(typeFields).toHaveLength(1);

			// Simulate EditorInspectorListField changing param0.type to "bool" and calling onChange("bool", "float")
			param0.type = "bool";
			typeFields[0].props.onChange("bool", "float");

			expect(param0.type).toBe("bool");
			expect(param0.value).toBe(false);

			// Undo type change -> restores both type ("float") and value (3.5)
			undo();
			expect(param0.type).toBe("float");
			expect(param0.value).toBe(3.5);

			// Redo type change -> sets type ("bool") and value (false)
			redo();
			expect(param0.type).toBe("bool");
			expect(param0.value).toBe(false);

			// Parameter removal and undo/redo
			(inspector as any)._handleRemoveParameter(1);
			expect(node.metadata.animationStateMachine.parameters).toHaveLength(1);
			undo();
			expect(node.metadata.animationStateMachine.parameters).toHaveLength(2);
			expect(node.metadata.animationStateMachine.parameters[1].name).toBe("param_2");
			redo();
			expect(node.metadata.animationStateMachine.parameters).toHaveLength(1);

			// State addition and undo/redo
			(inspector as any)._handleAddState();
			expect(node.metadata.animationStateMachine.states).toHaveLength(2);
			expect(node.metadata.animationStateMachine.states[1].name).toBe("State_2");
			undo();
			expect(node.metadata.animationStateMachine.states).toHaveLength(1);
			redo();
			expect(node.metadata.animationStateMachine.states).toHaveLength(2);

			// State removal and undo/redo
			(inspector as any)._handleRemoveState(0);
			expect(node.metadata.animationStateMachine.states).toHaveLength(1);
			expect(node.metadata.animationStateMachine.states[0].name).toBe("State_2");
			undo();
			expect(node.metadata.animationStateMachine.states).toHaveLength(2);
			expect(node.metadata.animationStateMachine.states[0].name).toBe("Idle");
			redo();
			expect(node.metadata.animationStateMachine.states).toHaveLength(1);

			// Disable Animation State Machine and undo/redo
			(inspector as any)._handleEnabledChange();
			expect(node.metadata.animationStateMachine).toBeUndefined();
			undo();
			expect(node.metadata.animationStateMachine?.enabled).toBe(true);
		});
	});

	describe("EditorSceneInputActionsInspector", () => {
		test("enables and disables scene inputActions, adds/removes actions, and resets default controls with undo/redo", () => {
			const inspector = new EditorSceneInputActionsInspector({ scene });
			inspector.forceUpdate = vi.fn();

			expect(scene.metadata).toEqual({});
			expect(inspector.render()).toBeTruthy();

			// Enable Input Actions
			(inspector as any)._handleEnabledChange();
			expect(scene.metadata.inputEnabled).toBe(true);
			expect(scene.metadata.inputActionMaps).toHaveLength(1);
			expect(scene.metadata.inputActionMaps[0].name).toBe("PlayerControls");
			expect(scene.metadata.inputActionMaps[0].actions.map((a: any) => a.name)).toEqual(["Move", "Look", "Jump", "Sprint"]);
			expect(inspector.render()).toBeTruthy();

			// Undo enable
			undo();
			expect(scene.metadata.inputEnabled).toBe(false);
			expect(scene.metadata.inputActionMaps).toBeUndefined();

			// Redo enable
			redo();
			expect(scene.metadata.inputEnabled).toBe(true);
			expect(scene.metadata.inputActionMaps[0].actions).toHaveLength(4);

			// Add Action (Action_5)
			(inspector as any)._handleAddAction(0);
			expect(scene.metadata.inputActionMaps[0].actions).toHaveLength(5);
			expect(scene.metadata.inputActionMaps[0].actions[4].name).toBe("Action_5");

			// Undo / Redo Add Action
			undo();
			expect(scene.metadata.inputActionMaps[0].actions).toHaveLength(4);
			redo();
			expect(scene.metadata.inputActionMaps[0].actions).toHaveLength(5);
			expect(scene.metadata.inputActionMaps[0].actions[4].name).toBe("Action_5");

			// Remove Action (_handleRemoveAction)
			(inspector as any)._handleRemoveAction(0, 2); // Remove "Jump"
			expect(scene.metadata.inputActionMaps[0].actions.map((a: any) => a.name)).toEqual(["Move", "Look", "Sprint", "Action_5"]);

			// Undo / Redo Remove Action
			undo();
			expect(scene.metadata.inputActionMaps[0].actions.map((a: any) => a.name)).toEqual(["Move", "Look", "Jump", "Sprint", "Action_5"]);
			redo();
			expect(scene.metadata.inputActionMaps[0].actions.map((a: any) => a.name)).toEqual(["Move", "Look", "Sprint", "Action_5"]);

			// Reset Default Controls
			(inspector as any)._handleResetDefaultControls();
			expect(scene.metadata.inputActionMaps[0].actions.map((a: any) => a.name)).toEqual(["Move", "Look", "Jump", "Sprint"]);

			// Undo / Redo Reset Default Controls
			undo();
			expect(scene.metadata.inputActionMaps[0].actions.map((a: any) => a.name)).toEqual(["Move", "Look", "Sprint", "Action_5"]);
			redo();
			expect(scene.metadata.inputActionMaps[0].actions.map((a: any) => a.name)).toEqual(["Move", "Look", "Jump", "Sprint"]);
		});
	});
});
