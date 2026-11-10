import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { LinesMesh, NullEngine, Scene, TransformNode, UtilityLayerRenderer, Vector3 } from "babylonjs";

vi.mock("electron", () => ({
	shell: {
		beep: vi.fn(),
	},
}));

import { undo, redo, clearUndoRedo, registerSimpleUndoRedo } from "../../../../src/tools/undoredo";
import { EditorCharacterControllerInspector } from "../../../../src/editor/layout/inspector/gameplay/character-controller";
import { EditorTriggerVolumeInspector } from "../../../../src/editor/layout/inspector/gameplay/trigger-volume";
import { EditorAnimationStateMachineInspector } from "../../../../src/editor/layout/inspector/gameplay/animation-state-machine";
import { EditorAnimationFSMGraphDialog } from "../../../../src/editor/layout/inspector/gameplay/animation-fsm-graph";
import { EditorNavAgentInspector } from "../../../../src/editor/layout/inspector/gameplay/nav-agent";
import { EditorSceneInputActionsInspector } from "../../../../src/editor/layout/inspector/scene/input-actions";
import { EditorGameplayGizmo } from "../../../../src/editor/layout/preview/gizmo/gameplay-gizmo";

const findElementsInTree = (element: any, predicate: (el: any) => boolean, acc: any[] = []): any[] => {
	if (!element || typeof element !== "object") {
		return acc;
	}
	if (Array.isArray(element)) {
		element.forEach((child) => findElementsInTree(child, predicate, acc));
		return acc;
	}
	if (predicate(element)) {
		acc.push(element);
	}
	const children = element.props?.children;
	if (children) {
		findElementsInTree(children, predicate, acc);
	}
	return acc;
};

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
			const typeFields = findElementsInTree(renderedTree, (el) => el.props?.property === "type" && el.props?.object === param0 && typeof el.props?.onChange === "function");
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

	describe("EditorAnimationFSMGraphDialog", () => {
		test("opens from EditorAnimationStateMachineInspector, manages states/transitions/conditions/blendTree, handles initial state deletion fallback, and disables toolbar buttons on empty states", () => {
			const inspector = new EditorAnimationStateMachineInspector({ object: node });
			inspector.forceUpdate = vi.fn();
			inspector.setState = vi.fn((patch: any) => {
				Object.assign(inspector.state, typeof patch === "function" ? patch(inspector.state) : patch);
			});

			(inspector as any)._handleEnabledChange();

			// Open graph dialog via [data-testid="open-fsm-graph-btn"]
			const inspectorTree = inspector.render();
			const openGraphBtns = findElementsInTree(inspectorTree, (el) => el.props?.["data-testid"] === "open-fsm-graph-btn");
			expect(openGraphBtns).toHaveLength(1);
			expect(inspector.state.graphOpen).toBe(false);

			openGraphBtns[0].props.onClick();
			expect(inspector.state.graphOpen).toBe(true);

			const openTree = inspector.render();
			const dialogElements = findElementsInTree(openTree, (el) => el.type === EditorAnimationFSMGraphDialog);
			expect(dialogElements).toHaveLength(1);
			expect(dialogElements[0].props.open).toBe(true);

			// Instantiate EditorAnimationFSMGraphDialog directly to test graph operations
			const onModified = vi.fn();
			const onClose = vi.fn();
			const dialog = new EditorAnimationFSMGraphDialog({
				open: true,
				object: node,
				onClose,
				onModified,
			});
			dialog.forceUpdate = vi.fn();
			dialog.setState = vi.fn((patch: any) => {
				Object.assign(dialog.state, typeof patch === "function" ? patch(dialog.state) : patch);
			});

			const sm = node.metadata.animationStateMachine;
			expect(sm.states).toHaveLength(1);
			expect(sm.initialState).toBe("Idle");

			// Add a second state ("State_2")
			const tree1 = dialog.render();
			const addStateBtn = findElementsInTree(tree1, (el) => el.props?.["data-testid"] === "fsm-add-state-btn")[0];
			expect(addStateBtn).toBeTruthy();
			addStateBtn.props.onClick();

			expect(sm.states).toHaveLength(2);
			expect(sm.states[1].name).toBe("State_2");
			expect(dialog.state.selectedStateIndex).toBe(1);

			// Connect transition from State 0 ("Idle") to State 1 ("State_2") via [data-testid="fsm-connect-transition-btn"]
			dialog.setState({ selectedStateIndex: 0, selectedTransition: null });
			const tree2 = dialog.render();
			const connectBtn = findElementsInTree(tree2, (el) => el.props?.["data-testid"] === "fsm-connect-transition-btn")[0];
			expect(connectBtn).toBeTruthy();
			expect(connectBtn.props.disabled).toBe(false);

			// Click Connect Transition button to enter connect mode from state 0
			connectBtn.props.onClick();
			expect(dialog.state.connectFromStateIndex).toBe(0);

			// Click target state node 1 in the rendered graph
			const treeInConnectMode = dialog.render();
			const stateNodes = findElementsInTree(treeInConnectMode, (el) => typeof el.props?.onMouseDown === "function" && typeof el.props?.onClick === "function");
			expect(stateNodes).toHaveLength(2);
			stateNodes[1].props.onClick({ stopPropagation: vi.fn() });

			expect(dialog.state.connectFromStateIndex).toBeNull();
			expect(sm.states[0].transitions).toHaveLength(1);
			expect(sm.states[0].transitions[0].targetState).toBe("State_2");
			expect(dialog.state.selectedTransition).toEqual({ stateIndex: 0, transitionIndex: 0 });

			// Add transition condition
			const transition0 = sm.states[0].transitions[0];
			(dialog as any)._handleAddCondition(transition0);
			expect(transition0.conditions).toHaveLength(1);
			expect(transition0.conditions[0]).toEqual({
				parameter: "speed",
				operator: ">",
				threshold: 0.1,
			});

			undo();
			expect(transition0.conditions).toHaveLength(0);
			redo();
			expect(transition0.conditions).toHaveLength(1);

			// Switch State 1 to "blendTree" via Type field in right inspector
			dialog.setState({ selectedStateIndex: 1, selectedTransition: null });
			const stateInspectorTree = dialog.render();
			const stateTypeField = findElementsInTree(
				stateInspectorTree,
				(el) => el.props?.object === sm.states[1] && el.props?.property === "type" && typeof el.props?.onChange === "function"
			)[0];
			expect(stateTypeField).toBeTruthy();

			sm.states[1].type = "blendTree";
			stateTypeField.props.onChange("blendTree");
			expect(sm.states[1].type).toBe("blendTree");
			expect(sm.states[1].blendTree).toEqual({
				parameter: "speed",
				motions: [],
			});

			// Delete initial state ("Idle", index 0) and verify sm.initialState falls back cleanly to "State_2"
			dialog.setState({ selectedStateIndex: 0, selectedTransition: null });
			(dialog as any)._handleDeleteSelected();
			expect(sm.states).toHaveLength(1);
			expect(sm.states[0].name).toBe("State_2");
			expect(sm.initialState).toBe("State_2");

			// Undo delete initial state -> restores "Idle" and sm.initialState = "Idle"
			undo();
			expect(sm.states).toHaveLength(2);
			expect(sm.states[0].name).toBe("Idle");
			expect(sm.initialState).toBe("Idle");

			// Redo delete initial state -> back to ["State_2"]
			redo();
			expect(sm.states).toHaveLength(1);
			expect(sm.initialState).toBe("State_2");

			// Delete remaining state so states is empty: []
			dialog.setState({ selectedStateIndex: 0, selectedTransition: null });
			(dialog as any)._handleDeleteSelected();
			expect(sm.states).toEqual([]);
			expect(sm.initialState).toBe("");

			// Verify empty states: [] disables "Connect Transition" and "Set as Initial State"
			const emptyTree = dialog.render();
			const emptyConnectBtn = findElementsInTree(emptyTree, (el) => el.props?.["data-testid"] === "fsm-connect-transition-btn")[0];
			const emptySetInitialBtn = findElementsInTree(emptyTree, (el) => el.props?.["data-testid"] === "fsm-set-initial-state-btn")[0];
			expect(emptyConnectBtn.props.disabled).toBe(true);
			expect(emptySetInitialBtn.props.disabled).toBe(true);
		});
	});

	describe("EditorNavAgentInspector", () => {
		test("enables and disables navAgent metadata and adds/removes patrolWaypoints with undo/redo and gizmo refresh", () => {
			const refreshGameplayGizmo = vi.fn();
			const mockEditor = {
				layout: {
					preview: {
						gizmo: {
							refreshGameplayGizmo,
						},
					},
				},
			} as any;

			node.position = new Vector3(3.25, 1.5, -4.75);
			const inspector = new EditorNavAgentInspector({ editor: mockEditor, object: node });
			inspector.forceUpdate = vi.fn();

			expect(node.metadata).toEqual({});
			expect(inspector.render()).toBeTruthy();

			// Enable NavAgent
			(inspector as any)._handleEnabledChange();
			expect(node.metadata.navAgent).toEqual({
				enabled: true,
				radius: 0.5,
				height: 1.8,
				speed: 3.5,
				angularSpeed: 360,
				acceleration: 8.0,
				stoppingDistance: 0.2,
				autoBraking: true,
				obstacleAvoidance: true,
				avoidanceRadius: 1.5,
				patrolLoop: true,
				patrolWaypoints: [],
			});
			expect(refreshGameplayGizmo).toHaveBeenCalled();

			// Undo enable
			refreshGameplayGizmo.mockClear();
			undo();
			expect(node.metadata.navAgent).toBeUndefined();
			expect(refreshGameplayGizmo).toHaveBeenCalledTimes(1);

			// Redo enable
			refreshGameplayGizmo.mockClear();
			redo();
			expect(node.metadata.navAgent?.enabled).toBe(true);
			expect(refreshGameplayGizmo).toHaveBeenCalledTimes(1);

			// Add patrol waypoint 1
			refreshGameplayGizmo.mockClear();
			(inspector as any)._handleAddWaypoint();
			expect(node.metadata.navAgent.patrolWaypoints).toEqual([{ x: 3.25, y: 1.5, z: -4.75 }]);
			expect(refreshGameplayGizmo).toHaveBeenCalled();

			// Add patrol waypoint 2
			node.position = new Vector3(10, 0, 5);
			(inspector as any)._handleAddWaypoint();
			expect(node.metadata.navAgent.patrolWaypoints).toHaveLength(2);
			expect(node.metadata.navAgent.patrolWaypoints[1]).toEqual({ x: 10, y: 0, z: 5 });

			// Undo add waypoint 2
			refreshGameplayGizmo.mockClear();
			undo();
			expect(node.metadata.navAgent.patrolWaypoints).toHaveLength(1);
			expect(refreshGameplayGizmo).toHaveBeenCalledTimes(1);

			// Redo add waypoint 2
			refreshGameplayGizmo.mockClear();
			redo();
			expect(node.metadata.navAgent.patrolWaypoints).toHaveLength(2);
			expect(refreshGameplayGizmo).toHaveBeenCalledTimes(1);

			// Remove waypoint 0
			refreshGameplayGizmo.mockClear();
			(inspector as any)._handleRemoveWaypoint(0);
			expect(node.metadata.navAgent.patrolWaypoints).toEqual([{ x: 10, y: 0, z: 5 }]);
			expect(refreshGameplayGizmo).toHaveBeenCalled();

			// Undo remove waypoint 0
			refreshGameplayGizmo.mockClear();
			undo();
			expect(node.metadata.navAgent.patrolWaypoints).toEqual([
				{ x: 3.25, y: 1.5, z: -4.75 },
				{ x: 10, y: 0, z: 5 },
			]);
			expect(refreshGameplayGizmo).toHaveBeenCalledTimes(1);

			// Redo remove waypoint 0
			refreshGameplayGizmo.mockClear();
			redo();
			expect(node.metadata.navAgent.patrolWaypoints).toEqual([{ x: 10, y: 0, z: 5 }]);
			expect(refreshGameplayGizmo).toHaveBeenCalledTimes(1);

			// Disable NavAgent and undo/redo
			(inspector as any)._handleEnabledChange();
			expect(node.metadata.navAgent).toBeUndefined();
			undo();
			expect(node.metadata.navAgent?.enabled).toBe(true);
			expect(node.metadata.navAgent?.patrolWaypoints).toEqual([{ x: 10, y: 0, z: 5 }]);
		});
	});

	describe("EditorGameplayGizmo", () => {
		let utilityLayer: UtilityLayerRenderer;
		let gizmo: EditorGameplayGizmo;

		beforeEach(() => {
			utilityLayer = new UtilityLayerRenderer(scene, false);
			gizmo = new EditorGameplayGizmo(utilityLayer);
		});

		afterEach(() => {
			gizmo.dispose();
			utilityLayer.dispose();
		});

		test("creates wireframe LinesMesh instances for characterController, triggerVolume (box and sphere), and navAgent with patrolWaypoints, and cleans up on detach/dispose", () => {
			node.metadata = {
				characterController: {
					enabled: true,
					radius: 0.5,
					height: 1.8,
					stepOffset: 0.3,
				},
				triggerVolume: {
					enabled: true,
					shape: "box",
					size: [2, 2, 2],
					radius: 1.5,
				},
				navAgent: {
					enabled: true,
					radius: 0.5,
					height: 1.8,
					stoppingDistance: 0.25,
					patrolLoop: true,
					patrolWaypoints: [
						{ x: 0, y: 0, z: 0 },
						{ x: 5, y: 0, z: 5 },
					],
				},
			};

			gizmo.setAttachedNode(node);

			const utilityScene = utilityLayer.utilityLayerScene;
			const getLinesMeshNames = () => utilityScene.meshes.filter((m): m is LinesMesh => m instanceof LinesMesh).map((m) => m.name);

			expect(getLinesMeshNames()).toEqual(
				expect.arrayContaining(["ccWireframe", "ccStepWireframe", "tvWireframe", "navAgentCylinder", "navAgentStopRing", "navAgentPatrolWaypoints"])
			);
			expect(utilityScene.meshes.filter((m) => m instanceof LinesMesh)).toHaveLength(6);

			// Switch triggerVolume shape to "sphere" and refresh
			node.metadata.triggerVolume.shape = "sphere";
			gizmo.refresh();
			expect(getLinesMeshNames()).toEqual(
				expect.arrayContaining(["ccWireframe", "ccStepWireframe", "tvWireframe", "navAgentCylinder", "navAgentStopRing", "navAgentPatrolWaypoints"])
			);
			expect(utilityScene.meshes.filter((m) => m instanceof LinesMesh)).toHaveLength(6);

			// Detach node -> cleans up all LinesMesh instances and root node
			gizmo.setAttachedNode(null);
			expect(utilityScene.meshes.filter((m) => m instanceof LinesMesh)).toHaveLength(0);
			expect(utilityScene.transformNodes.filter((tn) => tn.name === "gameplayGizmoRoot")).toHaveLength(0);

			// Re-attach and then dispose() -> cleans up all LinesMesh instances
			gizmo.setAttachedNode(node);
			expect(utilityScene.meshes.filter((m) => m instanceof LinesMesh)).toHaveLength(6);
			gizmo.dispose();
			expect(utilityScene.meshes.filter((m) => m instanceof LinesMesh)).toHaveLength(0);
		});

		test("adversarial NaN and invalid values in characterController, triggerVolume, and navAgent.patrolWaypoints do not throw on refresh()", () => {
			node.metadata = {
				characterController: {
					enabled: true,
					radius: Number.NaN,
					height: "invalid",
					stepOffset: Number.NaN,
				},
				triggerVolume: {
					enabled: true,
					shape: "sphere",
					radius: "invalid",
					size: [Number.NaN, "invalid", null],
				},
				navAgent: {
					enabled: true,
					radius: Number.NaN,
					height: "invalid",
					stoppingDistance: Number.NaN,
					patrolWaypoints: [{ x: Number.NaN, y: "invalid", z: undefined }, [Number.NaN, "invalid", Number.POSITIVE_INFINITY], null],
				},
			};

			expect(() => {
				gizmo.setAttachedNode(node);
				gizmo.refresh();
				node.metadata.triggerVolume.shape = "box";
				gizmo.refresh();
			}).not.toThrow();

			const utilityScene = utilityLayer.utilityLayerScene;
			expect(utilityScene.meshes.filter((m) => m instanceof LinesMesh)).toHaveLength(6);
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
