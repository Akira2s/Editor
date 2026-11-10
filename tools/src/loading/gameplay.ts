import { Node } from "@babylonjs/core/node";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

import { cloneJSObject } from "../tools/tools";
import { isAbstractMesh, isTransformNode } from "../tools/guards";

import { InputManager } from "../input/manager";
import { NavAgent } from "../navigation/nav-agent";
import { TriggerVolume } from "../triggers/trigger-volume";
import { CharacterController } from "../physics/kcc/controller";
import { AnimationStateMachine } from "../animation/state-machine/state-machine";

const sceneInputManagers = new WeakMap<Scene, InputManager>();
const nodeCharacterControllers = new WeakMap<TransformNode, CharacterController>();
const nodeTriggerVolumes = new WeakMap<TransformNode, TriggerVolume>();
const nodeAnimationStateMachines = new WeakMap<TransformNode, AnimationStateMachine>();
const nodeNavAgents = new WeakMap<TransformNode, NavAgent>();
const nodeCleanups = new WeakMap<TransformNode, (() => void)[]>();

/**
 * Returns the InputManager configured for the given scene, or null if none exists.
 */
export function getInputManagerForScene(scene: Scene): InputManager | null {
	return sceneInputManagers.get(scene) ?? null;
}

/**
 * Returns the CharacterController configured for the given TransformNode, or null if none exists.
 */
export function getCharacterControllerForNode(node: TransformNode): CharacterController | null {
	return nodeCharacterControllers.get(node) ?? null;
}

/**
 * Returns the TriggerVolume configured for the given TransformNode, or null if none exists.
 */
export function getTriggerVolumeForNode(node: TransformNode): TriggerVolume | null {
	return nodeTriggerVolumes.get(node) ?? null;
}

/**
 * Returns the AnimationStateMachine configured for the given TransformNode, or null if none exists.
 */
export function getAnimationStateMachineForNode(node: TransformNode): AnimationStateMachine | null {
	return nodeAnimationStateMachines.get(node) ?? null;
}

/**
 * Returns the NavAgent configured for the given TransformNode, or null if none exists.
 */
export function getNavAgentForNode(node: TransformNode): NavAgent | null {
	return nodeNavAgents.get(node) ?? null;
}

function registerNodeCleanup(node: TransformNode, cleanup: () => void): void {
	let list = nodeCleanups.get(node);
	if (!list) {
		list = [];
		nodeCleanups.set(node, list);
	}
	list.push(cleanup);
}

function runNodeCleanups(node: TransformNode): void {
	const list = nodeCleanups.get(node);
	if (!list) {
		return;
	}
	nodeCleanups.delete(node);
	for (const fn of list) {
		fn();
	}
}

function resolveAnimationStateMachineData(data: any, scene: Scene, namingId?: string): any {
	if (!namingId || !data || typeof data !== "object") {
		return data;
	}

	const cloned = cloneJSObject(data);
	if (!Array.isArray(cloned.states)) {
		return cloned;
	}

	const groupNames = new Set<string>((scene.animationGroups ?? []).map((g) => g.name));

	for (const state of cloned.states) {
		if (!state || typeof state !== "object") {
			continue;
		}

		if (typeof state.animationGroupName === "string" && state.animationGroupName.length > 0) {
			const suffixed = `${state.animationGroupName}-${namingId}`;
			if (groupNames.has(suffixed)) {
				state.animationGroupName = suffixed;
			}
		}

		if (Array.isArray(state.blendTree?.motions)) {
			for (const motion of state.blendTree.motions) {
				if (motion && typeof motion.animationGroupName === "string" && motion.animationGroupName.length > 0) {
					const suffixed = `${motion.animationGroupName}-${namingId}`;
					if (groupNames.has(suffixed)) {
						motion.animationGroupName = suffixed;
					}
				}
			}
		}
	}

	return cloned;
}

/**
 * Disposes and unregisters any runtime gameplay systems (CharacterController, TriggerVolume, AnimationStateMachine, NavAgent)
 * attached to the given nodes.
 */
export function disposeGameplaySystemsForNodes(nodes: Node[]): void {
	for (const rawNode of nodes) {
		if (!rawNode || !(rawNode instanceof TransformNode || isTransformNode(rawNode) || isAbstractMesh(rawNode))) {
			continue;
		}

		const node = rawNode as TransformNode;
		runNodeCleanups(node);

		const cc = nodeCharacterControllers.get(node);
		if (cc) {
			cc.dispose();
			nodeCharacterControllers.delete(node);
			delete (node as any).characterController;
		}

		const tv = nodeTriggerVolumes.get(node);
		if (tv) {
			tv.dispose();
			nodeTriggerVolumes.delete(node);
			delete (node as any).triggerVolume;
		}

		const sm = nodeAnimationStateMachines.get(node);
		if (sm) {
			sm.dispose();
			nodeAnimationStateMachines.delete(node);
			delete (node as any).animationStateMachine;
		}

		const nav = nodeNavAgents.get(node);
		if (nav) {
			nav.dispose();
			nodeNavAgents.delete(node);
			delete (node as any).navAgent;
		}
	}
}

/**
 * Configures node-level runtime gameplay systems (CharacterController, TriggerVolume, AnimationStateMachine, NavAgent)
 * for a specific list of nodes (such as scene nodes or instantiated prefab nodes).
 */
export function configureGameplaySystemsForNodes(scene: Scene, nodes: Node[], namingId?: string): void {
	for (const rawNode of nodes) {
		if (!rawNode || !(rawNode instanceof TransformNode || isTransformNode(rawNode) || isAbstractMesh(rawNode))) {
			continue;
		}

		const node = rawNode as TransformNode;
		disposeGameplaySystemsForNodes([node]);

		if (node.metadata?.characterController?.enabled) {
			const cc = node.metadata.characterController;
			const controller = new CharacterController(node, scene, {
				radius: cc.radius,
				height: cc.height,
				mass: cc.mass,
				maxSlopeAngle: cc.maxSlopeAngle,
				stepOffset: cc.stepOffset,
				skinWidth: cc.skinWidth,
				airControl: cc.airControl,
				gravity: Array.isArray(cc.gravity) && cc.gravity.length >= 3 ? Vector3.FromArray(cc.gravity) : undefined,
			});

			nodeCharacterControllers.set(node, controller);
			(node as any).characterController = controller;

			const disposeObserver = node.onDisposeObservable?.addOnce(() => {
				controller.dispose();
				nodeCharacterControllers.delete(node);
			});

			registerNodeCleanup(node, () => {
				if (disposeObserver) {
					node.onDisposeObservable?.remove(disposeObserver);
				}
			});
		}

		if (node.metadata?.triggerVolume && node.metadata.triggerVolume.enabled !== false) {
			const trigger = TriggerVolume.Parse(
				{
					...node.metadata.triggerVolume,
					nodeId: node.id,
					nodeName: node.name,
				},
				scene
			);
			trigger.node = node;

			nodeTriggerVolumes.set(node, trigger);
			(node as any).triggerVolume = trigger;

			const disposeObserver = node.onDisposeObservable?.addOnce(() => {
				trigger.dispose();
				nodeTriggerVolumes.delete(node);
			});

			registerNodeCleanup(node, () => {
				if (disposeObserver) {
					node.onDisposeObservable?.remove(disposeObserver);
				}
			});
		}

		if (node.metadata?.animationStateMachine && node.metadata.animationStateMachine.enabled !== false) {
			const smData = resolveAnimationStateMachineData(node.metadata.animationStateMachine, scene, namingId);
			const sm = AnimationStateMachine.Parse(smData, scene, node);

			const renderObserver = scene.onBeforeRenderObservable?.add(() => {
				if (sm.isDisposed) {
					if (renderObserver) {
						scene.onBeforeRenderObservable?.remove(renderObserver);
					}
					return;
				}
				const rawDelta = scene.getEngine()?.getDeltaTime();
				const deltaMs = rawDelta && rawDelta > 0 ? rawDelta : 16.67;
				sm.update(deltaMs / 1000);
			});

			const disposeObserver = node.onDisposeObservable?.addOnce(() => {
				if (renderObserver) {
					scene.onBeforeRenderObservable?.remove(renderObserver);
				}
				sm.dispose();
				nodeAnimationStateMachines.delete(node);
			});

			registerNodeCleanup(node, () => {
				if (renderObserver) {
					scene.onBeforeRenderObservable?.remove(renderObserver);
				}
				if (disposeObserver) {
					node.onDisposeObservable?.remove(disposeObserver);
				}
			});

			nodeAnimationStateMachines.set(node, sm);
			(node as any).animationStateMachine = sm;
		}

		if (node.metadata?.navAgent?.enabled) {
			const agent = NavAgent.Parse(node.metadata.navAgent, node, scene);

			if (Array.isArray(node.metadata.navAgent.patrolWaypoints) && node.metadata.navAgent.patrolWaypoints.length > 0) {
				agent.startPatrol(0);
			}

			const renderObserver = scene.onBeforeRenderObservable?.add(() => {
				if (agent.isDisposed) {
					if (renderObserver) {
						scene.onBeforeRenderObservable?.remove(renderObserver);
					}
					return;
				}
				const rawDelta = scene.getEngine()?.getDeltaTime();
				const deltaMs = rawDelta && rawDelta > 0 ? rawDelta : 16.67;
				agent.update(deltaMs / 1000);
			});

			const disposeObserver = node.onDisposeObservable?.addOnce(() => {
				if (renderObserver) {
					scene.onBeforeRenderObservable?.remove(renderObserver);
				}
				agent.dispose();
				nodeNavAgents.delete(node);
			});

			registerNodeCleanup(node, () => {
				if (renderObserver) {
					scene.onBeforeRenderObservable?.remove(renderObserver);
				}
				if (disposeObserver) {
					node.onDisposeObservable?.remove(disposeObserver);
				}
			});

			nodeNavAgents.set(node, agent);
			(node as any).navAgent = agent;
		}
	}
}

/**
 * Configures runtime gameplay systems (InputManager, CharacterController, TriggerVolume, AnimationStateMachine, NavAgent)
 * from scene and node metadata serialized by the Editor.
 */
export function configureGameplaySystems(scene: Scene): void {
	if (scene.metadata?.inputEnabled || Array.isArray(scene.metadata?.inputActionMaps)) {
		sceneInputManagers.get(scene)?.dispose();

		const inputManager = new InputManager(scene);
		if (Array.isArray(scene.metadata?.inputActionMaps)) {
			for (const map of scene.metadata.inputActionMaps) {
				if (map && typeof map.name === "string") {
					inputManager.registerActionMap(map);
				}
			}
		}

		sceneInputManagers.set(scene, inputManager);
		(scene as any).inputManager = inputManager;

		scene.onDisposeObservable?.addOnce(() => {
			sceneInputManagers.delete(scene);
		});
	}

	const nodes: Node[] = [...(scene.transformNodes ?? []), ...(scene.meshes ?? [])];
	configureGameplaySystemsForNodes(scene, nodes);
}
