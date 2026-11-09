import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

import { InputManager } from "../input/manager";
import { CharacterController } from "../physics/kcc/controller";
import { TriggerVolume } from "../triggers/trigger-volume";
import { AnimationStateMachine } from "../animation/state-machine/state-machine";

const sceneInputManagers = new WeakMap<Scene, InputManager>();
const nodeCharacterControllers = new WeakMap<TransformNode, CharacterController>();
const nodeTriggerVolumes = new WeakMap<TransformNode, TriggerVolume>();
const nodeAnimationStateMachines = new WeakMap<TransformNode, AnimationStateMachine>();

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
 * Configures runtime gameplay systems (InputManager, CharacterController, TriggerVolume, AnimationStateMachine)
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

	const nodes: TransformNode[] = [...(scene.transformNodes ?? []), ...(scene.meshes ?? [])];

	for (const node of nodes) {
		if (!node) {
			continue;
		}

		if (node.metadata?.characterController?.enabled) {
			nodeCharacterControllers.get(node)?.dispose();

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

			node.onDisposeObservable?.addOnce(() => {
				controller.dispose();
				nodeCharacterControllers.delete(node);
			});
		}

		if (node.metadata?.triggerVolume && node.metadata.triggerVolume.enabled !== false) {
			nodeTriggerVolumes.get(node)?.dispose();

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

			node.onDisposeObservable?.addOnce(() => {
				trigger.dispose();
				nodeTriggerVolumes.delete(node);
			});
		}

		if (node.metadata?.animationStateMachine && node.metadata.animationStateMachine.enabled !== false) {
			nodeAnimationStateMachines.get(node)?.dispose();

			const sm = AnimationStateMachine.Parse(node.metadata.animationStateMachine, scene, node);

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

			node.onDisposeObservable?.addOnce(() => {
				if (renderObserver) {
					scene.onBeforeRenderObservable?.remove(renderObserver);
				}
				sm.dispose();
				nodeAnimationStateMachines.delete(node);
			});

			nodeAnimationStateMachines.set(node, sm);
			(node as any).animationStateMachine = sm;
		}
	}
}
