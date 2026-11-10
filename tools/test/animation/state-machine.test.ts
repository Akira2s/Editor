import { describe, beforeEach, afterEach, test, expect, vi } from "vitest";

import { NullEngine, Scene, TransformNode } from "@babylonjs/core";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";

import { AnimationStateMachine } from "../../src/animation/state-machine/state-machine";
import { IAnimationEvent, IAnimationState, IAnimationStateMachineData } from "../../src/animation/state-machine/types";

describe("animation/state-machine", () => {
	let engine: NullEngine;
	let scene: Scene;
	let node: TransformNode;

	beforeEach(() => {
		engine = new NullEngine();
		scene = new Scene(engine);
		node = new TransformNode("CharacterNode", scene);
	});

	afterEach(() => {
		scene.dispose();
		engine.dispose();
	});

	// ---------------------------------------------------------------------------
	// 1. Blackboard Parameters
	// ---------------------------------------------------------------------------
	describe("parameters", () => {
		test("should handle float parameters", () => {
			const sm = new AnimationStateMachine(scene, node);
			expect(sm.hasParameter("speed")).toBe(false);
			expect(sm.getFloat("speed")).toBe(0);

			sm.setFloat("speed", 4.5);
			expect(sm.hasParameter("speed")).toBe(true);
			expect(sm.getFloat("speed")).toBe(4.5);

			sm.setFloat("speed", -1.25);
			expect(sm.getFloat("speed")).toBe(-1.25);
		});

		test("should handle int parameters with truncation", () => {
			const sm = new AnimationStateMachine(scene);
			expect(sm.getInt("combo")).toBe(0);

			sm.setInt("combo", 3.8);
			expect(sm.getInt("combo")).toBe(3);

			sm.setInt("combo", -2.9);
			expect(sm.getInt("combo")).toBe(-2);
		});

		test("should handle bool parameters", () => {
			const sm = new AnimationStateMachine(scene);
			expect(sm.getBool("isGrounded")).toBe(false);

			sm.setBool("isGrounded", true);
			expect(sm.getBool("isGrounded")).toBe(true);

			sm.setBool("isGrounded", false);
			expect(sm.getBool("isGrounded")).toBe(false);
		});

		test("should handle trigger parameters", () => {
			const sm = new AnimationStateMachine(scene);
			expect(sm.hasParameter("jump")).toBe(false);

			sm.setTrigger("jump");
			expect(sm.hasParameter("jump")).toBe(true);
			expect(sm.getBool("jump")).toBe(true);

			sm.resetTrigger("jump");
			expect(sm.getBool("jump")).toBe(false);
		});

		test("should retrieve all parameters and allow direct addition", () => {
			const sm = new AnimationStateMachine(scene);
			sm.addParameter({ name: "health", type: "float", value: 100 });
			sm.setBool("alive", true);

			const params = sm.getParameters();
			expect(params.length).toBe(2);
			expect(sm.getFloat("health")).toBe(100);
			expect(sm.getBool("alive")).toBe(true);
		});
	});

	// ---------------------------------------------------------------------------
	// 2. State Registration and Initial State Setup
	// ---------------------------------------------------------------------------
	describe("state registration & setup", () => {
		test("should register states and set initial state", () => {
			const sm = new AnimationStateMachine(scene, node);
			const idleState: IAnimationState = {
				name: "Idle",
				animationGroupName: "idle_anim",
				transitions: [],
			};
			const runState: IAnimationState = {
				name: "Run",
				animationGroupName: "run_anim",
				transitions: [],
			};

			sm.addState(idleState);
			sm.addState(runState);

			expect(sm.getState("Idle")).toBe(idleState);
			expect(sm.getState("Run")).toBe(runState);
			expect(sm.getState("Unknown")).toBeNull();
			expect(sm.states.length).toBe(2);

			sm.setInitialState("Idle");
			expect(sm.initialState).toBe("Idle");
			expect(sm.currentState).toBe(idleState);
		});

		test("should establish initial state if setInitialState is called before addState", () => {
			const sm = new AnimationStateMachine(scene);
			sm.setInitialState("Walk");
			expect(sm.currentState).toBeNull();

			const walkState: IAnimationState = {
				name: "Walk",
				transitions: [],
			};
			sm.addState(walkState);
			expect(sm.currentState).toBe(walkState);
		});

		test("should expose scene and node references", () => {
			const sm = new AnimationStateMachine(scene, node);
			expect(sm.scene).toBe(scene);
			expect(sm.node).toBe(node);
		});

		test("should transition directly with transitionTo", () => {
			const sm = new AnimationStateMachine(scene);
			const idleState: IAnimationState = { name: "Idle", transitions: [] };
			const walkState: IAnimationState = { name: "Walk", transitions: [] };

			sm.addState(idleState);
			sm.addState(walkState);
			sm.setInitialState("Idle");

			const stateChangedSpy = vi.fn();
			sm.onStateChanged.add((data) => stateChangedSpy(data));

			sm.transitionTo("Walk", 0);
			expect(sm.currentState?.name).toBe("Walk");
			expect(stateChangedSpy).toHaveBeenCalledWith({ from: "Idle", to: "Walk" });
		});
	});

	// ---------------------------------------------------------------------------
	// 3. Transition Condition Evaluation & Trigger Consumption
	// ---------------------------------------------------------------------------
	describe("transition conditions & trigger consumption", () => {
		test("should transition on float comparison (speed > threshold)", () => {
			const sm = new AnimationStateMachine(scene);
			const idleState: IAnimationState = {
				name: "Idle",
				transitions: [
					{
						targetState: "Run",
						conditions: [{ parameter: "speed", operator: ">", threshold: 5.0 }],
						duration: 0,
						hasExitTime: false,
					},
				],
			};
			const runState: IAnimationState = { name: "Run", transitions: [] };

			sm.addState(idleState);
			sm.addState(runState);
			sm.setInitialState("Idle");

			sm.setFloat("speed", 2.0);
			sm.update(0.1);
			expect(sm.currentState?.name).toBe("Idle");

			sm.setFloat("speed", 5.1);
			sm.update(0.1);
			expect(sm.currentState?.name).toBe("Run");
		});

		test("should transition on bool condition (isGrounded == true)", () => {
			const sm = new AnimationStateMachine(scene);
			const fallState: IAnimationState = {
				name: "Fall",
				transitions: [
					{
						targetState: "Land",
						conditions: [{ parameter: "isGrounded", operator: "==", threshold: true }],
						duration: 0,
						hasExitTime: false,
					},
				],
			};
			const landState: IAnimationState = { name: "Land", transitions: [] };

			sm.addState(fallState);
			sm.addState(landState);
			sm.setInitialState("Fall");

			sm.setBool("isGrounded", false);
			sm.update(0.1);
			expect(sm.currentState?.name).toBe("Fall");

			sm.setBool("isGrounded", true);
			sm.update(0.1);
			expect(sm.currentState?.name).toBe("Land");
		});

		test("should automatically consume triggers when transition takes place", () => {
			const sm = new AnimationStateMachine(scene);
			const idleState: IAnimationState = {
				name: "Idle",
				transitions: [
					{
						targetState: "Jump",
						conditions: [{ parameter: "jump", operator: "==", threshold: true }],
						duration: 0,
						hasExitTime: false,
					},
				],
			};
			const jumpState: IAnimationState = {
				name: "Jump",
				transitions: [
					{
						targetState: "Idle",
						conditions: [{ parameter: "jump", operator: "==", threshold: true }],
						duration: 0,
						hasExitTime: false,
					},
				],
			};

			sm.addState(idleState);
			sm.addState(jumpState);
			sm.setInitialState("Idle");

			// Trigger jump
			sm.setTrigger("jump");
			expect(sm.getBool("jump")).toBe(true);

			sm.update(0.1);
			expect(sm.currentState?.name).toBe("Jump");
			// Trigger must be automatically consumed (reset to false)
			expect(sm.getBool("jump")).toBe(false);

			// On subsequent update, should NOT transition back because trigger is consumed
			sm.update(0.1);
			expect(sm.currentState?.name).toBe("Jump");
		});

		test("should respect exit time before allowing transition", () => {
			const sm = new AnimationStateMachine(scene);
			const attackState: IAnimationState = {
				name: "Attack",
				speed: 1.0,
				loop: false,
				transitions: [
					{
						targetState: "Idle",
						conditions: [],
						duration: 0,
						hasExitTime: true,
						exitTime: 0.8,
					},
				],
			};
			const idleState: IAnimationState = { name: "Idle", transitions: [] };

			sm.addState(attackState);
			sm.addState(idleState);
			sm.setInitialState("Attack");

			// Default duration is 1.0s. At dt = 0.5, normalized progress is 0.5 < 0.8
			sm.update(0.5);
			expect(sm.currentState?.name).toBe("Attack");

			// At dt = 0.35, cumulative is 0.85 >= 0.8 -> transition triggers!
			sm.update(0.35);
			expect(sm.currentState?.name).toBe("Idle");
		});

		test("should support multiple conditions with AND logic", () => {
			const sm = new AnimationStateMachine(scene);
			const idleState: IAnimationState = {
				name: "Idle",
				transitions: [
					{
						targetState: "Run",
						conditions: [
							{ parameter: "speed", operator: ">=", threshold: 2.0 },
							{ parameter: "stamina", operator: ">", threshold: 10.0 },
						],
						duration: 0,
						hasExitTime: false,
					},
				],
			};
			const runState: IAnimationState = { name: "Run", transitions: [] };

			sm.addState(idleState);
			sm.addState(runState);
			sm.setInitialState("Idle");

			sm.setFloat("speed", 3.0);
			sm.setFloat("stamina", 5.0); // stamina condition fails
			sm.update(0.1);
			expect(sm.currentState?.name).toBe("Idle");

			sm.setFloat("stamina", 20.0); // both conditions satisfied
			sm.update(0.1);
			expect(sm.currentState?.name).toBe("Run");
		});

		test("should ignore deltaTime <= 0 or invalid numbers", () => {
			const sm = new AnimationStateMachine(scene);
			const idleState: IAnimationState = {
				name: "Idle",
				transitions: [
					{
						targetState: "Run",
						conditions: [{ parameter: "speed", operator: ">", threshold: 0 }],
						duration: 0,
						hasExitTime: false,
					},
				],
			};
			sm.addState(idleState);
			sm.setInitialState("Idle");
			sm.setFloat("speed", 5);

			sm.update(0);
			expect(sm.currentState?.name).toBe("Idle");

			sm.update(-1);
			expect(sm.currentState?.name).toBe("Idle");

			sm.update(NaN);
			expect(sm.currentState?.name).toBe("Idle");

			sm.update(Infinity);
			expect(sm.currentState?.name).toBe("Idle");
		});
	});

	// ---------------------------------------------------------------------------
	// 4. 1D Blend Tree Weight Calculation
	// ---------------------------------------------------------------------------
	describe("1D blend tree weight calculation", () => {
		test("should calculate linear interpolation weights at min, midpoint, and max", () => {
			const sm = new AnimationStateMachine(scene);
			const blendTreeState: IAnimationState = {
				name: "Locomotion",
				blendTree: {
					parameter: "speed",
					motions: [
						{ animationGroupName: "Walk", threshold: 0.0 },
						{ animationGroupName: "Run", threshold: 10.0 },
					],
				},
				transitions: [],
			};

			sm.addState(blendTreeState);
			sm.setInitialState("Locomotion");

			// At threshold 0.0: Walk = 1.0, Run = 0.0
			sm.setFloat("speed", 0.0);
			let weights = sm.getBlendTreeWeights("Locomotion");
			expect(weights.get("Walk")).toBeCloseTo(1.0);
			expect(weights.get("Run")).toBeCloseTo(0.0);

			// At midpoint 5.0: Walk = 0.5, Run = 0.5
			sm.setFloat("speed", 5.0);
			weights = sm.getBlendTreeWeights("Locomotion");
			expect(weights.get("Walk")).toBeCloseTo(0.5);
			expect(weights.get("Run")).toBeCloseTo(0.5);

			// At max threshold 10.0: Walk = 0.0, Run = 1.0
			sm.setFloat("speed", 10.0);
			weights = sm.getBlendTreeWeights("Locomotion");
			expect(weights.get("Walk")).toBeCloseTo(0.0);
			expect(weights.get("Run")).toBeCloseTo(1.0);

			// Below min (-5.0): clamped to min
			sm.setFloat("speed", -5.0);
			weights = sm.getBlendTreeWeights("Locomotion");
			expect(weights.get("Walk")).toBeCloseTo(1.0);
			expect(weights.get("Run")).toBeCloseTo(0.0);

			// Above max (15.0): clamped to max
			sm.setFloat("speed", 15.0);
			weights = sm.getBlendTreeWeights("Locomotion");
			expect(weights.get("Walk")).toBeCloseTo(0.0);
			expect(weights.get("Run")).toBeCloseTo(1.0);
		});

		test("should calculate weights for multi-motion blend tree (3 motions)", () => {
			const sm = new AnimationStateMachine(scene);
			const blendTreeState: IAnimationState = {
				name: "Locomotion3",
				blendTree: {
					parameter: "velocity",
					motions: [
						{ animationGroupName: "Idle", threshold: 0.0 },
						{ animationGroupName: "Walk", threshold: 2.0 },
						{ animationGroupName: "Run", threshold: 6.0 },
					],
				},
				transitions: [],
			};

			sm.addState(blendTreeState);
			sm.setInitialState("Locomotion3");

			// velocity = 1.0 (halfway between Idle and Walk)
			sm.setFloat("velocity", 1.0);
			let weights = sm.getBlendTreeWeights();
			expect(weights.get("Idle")).toBeCloseTo(0.5);
			expect(weights.get("Walk")).toBeCloseTo(0.5);
			expect(weights.get("Run")).toBeCloseTo(0.0);

			// velocity = 2.0 (exact Walk threshold)
			sm.setFloat("velocity", 2.0);
			weights = sm.getBlendTreeWeights();
			expect(weights.get("Idle")).toBeCloseTo(0.0);
			expect(weights.get("Walk")).toBeCloseTo(1.0);
			expect(weights.get("Run")).toBeCloseTo(0.0);

			// velocity = 4.0 (halfway between Walk 2.0 and Run 6.0)
			sm.setFloat("velocity", 4.0);
			weights = sm.getBlendTreeWeights();
			expect(weights.get("Idle")).toBeCloseTo(0.0);
			expect(weights.get("Walk")).toBeCloseTo(0.5);
			expect(weights.get("Run")).toBeCloseTo(0.5);

			// velocity = 6.0 (exact Run threshold)
			sm.setFloat("velocity", 6.0);
			weights = sm.getBlendTreeWeights();
			expect(weights.get("Idle")).toBeCloseTo(0.0);
			expect(weights.get("Walk")).toBeCloseTo(0.0);
			expect(weights.get("Run")).toBeCloseTo(1.0);
		});

		test("should apply blend tree weights to registered AnimationGroups via setWeightForAllAnimatables", () => {
			const sm = new AnimationStateMachine(scene);
			const walkGroup = new AnimationGroup("WalkAnim", scene);
			const runGroup = new AnimationGroup("RunAnim", scene);

			vi.spyOn(walkGroup, "setWeightForAllAnimatables");
			vi.spyOn(runGroup, "setWeightForAllAnimatables");

			sm.registerAnimationGroup(walkGroup);
			sm.registerAnimationGroup(runGroup);

			const blendTreeState: IAnimationState = {
				name: "Movement",
				blendTree: {
					parameter: "speed",
					motions: [
						{ animationGroupName: "WalkAnim", threshold: 0.0 },
						{ animationGroupName: "RunAnim", threshold: 10.0 },
					],
				},
				transitions: [],
			};

			sm.addState(blendTreeState);
			sm.setInitialState("Movement");

			sm.setFloat("speed", 5.0);
			sm.update(0.016);

			expect(walkGroup.setWeightForAllAnimatables).toHaveBeenCalledWith(0.5);
			expect(runGroup.setWeightForAllAnimatables).toHaveBeenCalledWith(0.5);
		});
	});

	// ---------------------------------------------------------------------------
	// 5. Cross-fade Blending
	// ---------------------------------------------------------------------------
	describe("cross-fade blending", () => {
		test("should smoothly cross-fade outgoing and incoming weights over duration", () => {
			const sm = new AnimationStateMachine(scene);
			const idleGroup = new AnimationGroup("IdleAnim", scene);
			const runGroup = new AnimationGroup("RunAnim", scene);

			const idleWeightSpy = vi.spyOn(idleGroup, "setWeightForAllAnimatables");
			const runWeightSpy = vi.spyOn(runGroup, "setWeightForAllAnimatables");
			const idleStopSpy = vi.spyOn(idleGroup, "stop");

			sm.registerAnimationGroup(idleGroup);
			sm.registerAnimationGroup(runGroup);

			const idleState: IAnimationState = {
				name: "Idle",
				animationGroupName: "IdleAnim",
				transitions: [
					{
						targetState: "Run",
						conditions: [{ parameter: "speed", operator: ">", threshold: 1.0 }],
						duration: 1.0,
						hasExitTime: false,
					},
				],
			};
			const runState: IAnimationState = {
				name: "Run",
				animationGroupName: "RunAnim",
				transitions: [],
			};

			sm.addState(idleState);
			sm.addState(runState);
			sm.setInitialState("Idle");

			// Trigger transition to Run with 1.0s duration
			sm.setFloat("speed", 5.0);
			sm.update(0.01); // Initial update triggers transition start

			expect(sm.currentState?.name).toBe("Run");

			// Advance by 0.5s (halfway through transition)
			sm.update(0.5);
			expect(idleWeightSpy).toHaveBeenLastCalledWith(expect.closeTo(0.49, 1));
			expect(runWeightSpy).toHaveBeenLastCalledWith(expect.closeTo(0.51, 1));

			// Advance by another 0.5s (completes transition)
			sm.update(0.5);
			expect(idleWeightSpy).toHaveBeenLastCalledWith(0.0);
			expect(idleStopSpy).toHaveBeenCalled();
			expect(runWeightSpy).toHaveBeenLastCalledWith(1.0);
		});
	});

	// ---------------------------------------------------------------------------
	// 6. Animation Events
	// ---------------------------------------------------------------------------
	describe("animation events", () => {
		test("should fire onAnimationEvent when normalized time reaches event keyframe", () => {
			const sm = new AnimationStateMachine(scene);
			const firedEvents: IAnimationEvent[] = [];
			sm.onAnimationEvent.add((evt) => firedEvents.push(evt));

			const footstepEvent: IAnimationEvent = {
				time: 0.5,
				name: "Footstep",
				parameter: { foot: "left" },
			};

			const walkState: IAnimationState = {
				name: "Walk",
				speed: 1.0,
				loop: false,
				events: [footstepEvent],
				transitions: [],
			};

			sm.addState(walkState);
			sm.setInitialState("Walk");

			// Update to 0.3 (normalized 0.3 < 0.5) -> should not fire
			sm.update(0.3);
			expect(firedEvents.length).toBe(0);

			// Update by 0.3 (normalized 0.6 >= 0.5) -> should fire
			sm.update(0.3);
			expect(firedEvents.length).toBe(1);
			expect(firedEvents[0].name).toBe("Footstep");
			expect(firedEvents[0].parameter).toEqual({ foot: "left" });

			// Subsequent update in non-looping state -> should not fire again
			sm.update(0.2);
			expect(firedEvents.length).toBe(1);
		});

		test("should re-fire animation events on subsequent loops in looping state", () => {
			const sm = new AnimationStateMachine(scene);
			let fireCount = 0;
			sm.onAnimationEvent.add((evt) => {
				if (evt.name === "Step") {
					fireCount++;
				}
			});

			const walkState: IAnimationState = {
				name: "WalkLoop",
				speed: 1.0,
				loop: true,
				events: [{ time: 0.5, name: "Step" }],
				transitions: [],
			};

			sm.addState(walkState);
			sm.setInitialState("WalkLoop");

			// First cycle: advance past 0.5
			sm.update(0.6);
			expect(fireCount).toBe(1);

			// Complete cycle 1 and enter cycle 2 past 0.5 (dt = 0.9 => 0.6 + 0.9 = 1.5 => wraps to 0.5)
			sm.update(0.9);
			expect(fireCount).toBe(2);
		});
	});

	// ---------------------------------------------------------------------------
	// 7. Serialization Round-Trip
	// ---------------------------------------------------------------------------
	describe("serialization", () => {
		test("should serialize and parse accurately maintaining all configuration", () => {
			const sm = new AnimationStateMachine(scene, node);

			sm.setFloat("speed", 4.2);
			sm.setInt("lives", 3);
			sm.setBool("isGrounded", true);
			sm.setTrigger("attack");

			const state1: IAnimationState = {
				name: "Idle",
				animationGroupName: "idle_anim",
				speed: 1.0,
				loop: true,
				position: { x: 120, y: 240 },
				transitions: [
					{
						targetState: "Move",
						duration: 0.25,
						hasExitTime: false,
						conditions: [{ parameter: "speed", operator: ">", threshold: 0.1 }],
					},
				],
				events: [{ time: 0.9, name: "IdleBlink" }],
			};

			const state2: IAnimationState = {
				name: "Move",
				blendTree: {
					parameter: "speed",
					motions: [
						{ animationGroupName: "Walk", threshold: 1.0 },
						{ animationGroupName: "Run", threshold: 5.0 },
					],
				},
				speed: 1.2,
				loop: true,
				transitions: [],
			};

			sm.addState(state1);
			sm.addState(state2);
			sm.setInitialState("Idle");

			const serialized: IAnimationStateMachineData = sm.serialize();
			expect(serialized.initialState).toBe("Idle");
			expect(serialized.currentState).toBe("Idle");
			expect(serialized.parameters.length).toBe(4);
			expect(serialized.states.length).toBe(2);
			expect(serialized.states[0].position).toEqual({ x: 120, y: 240 });

			// Round-trip Parse
			const restored = AnimationStateMachine.Parse(serialized, scene);
			expect(restored.initialState).toBe("Idle");
			expect(restored.currentState?.name).toBe("Idle");
			expect(restored.currentState?.position).toEqual({ x: 120, y: 240 });
			expect(restored.getFloat("speed")).toBe(4.2);
			expect(restored.getInt("lives")).toBe(3);
			expect(restored.getBool("isGrounded")).toBe(true);
			expect(restored.getBool("attack")).toBe(true);

			const restoredMove = restored.getState("Move");
			expect(restoredMove).toBeDefined();
			expect(restoredMove?.blendTree?.motions.length).toBe(2);
			expect(restoredMove?.speed).toBe(1.2);
			expect(restoredMove?.position).toBeUndefined();

			// Both serializations should match structurally
			const reSerialized = restored.serialize();
			expect(reSerialized.initialState).toBe(serialized.initialState);
			expect(reSerialized.states.length).toBe(serialized.states.length);
			expect(reSerialized.parameters.length).toBe(serialized.parameters.length);
			expect(reSerialized.states[0].position).toEqual({ x: 120, y: 240 });
		});
	});

	// ---------------------------------------------------------------------------
	// 8. Disposal
	// ---------------------------------------------------------------------------
	describe("disposal", () => {
		test("should cleanly dispose internal state, stop animation groups, and clear observers", () => {
			const sm = new AnimationStateMachine(scene, node);
			const animGroup = new AnimationGroup("TestAnim", scene);
			const stopSpy = vi.spyOn(animGroup, "stop");

			sm.registerAnimationGroup(animGroup);

			const testState: IAnimationState = {
				name: "Play",
				animationGroupName: "TestAnim",
				transitions: [],
			};
			sm.addState(testState);
			sm.setInitialState("Play");

			const stateChangedSpy = vi.fn();
			const eventSpy = vi.fn();
			sm.onStateChanged.add(stateChangedSpy);
			sm.onAnimationEvent.add(eventSpy);

			expect(sm.isDisposed).toBe(false);

			sm.dispose();

			expect(sm.isDisposed).toBe(true);
			expect(stopSpy).toHaveBeenCalled();
			expect(sm.currentState).toBeNull();
			expect(sm.getState("Play")).toBeNull();
			expect(sm.hasParameter("speed")).toBe(false);

			// Observers should have been cleared
			expect(sm.onStateChanged.hasObservers()).toBe(false);
			expect(sm.onAnimationEvent.hasObservers()).toBe(false);

			// update() after disposal does nothing
			expect(() => sm.update(0.1)).not.toThrow();
		});
	});

	// ---------------------------------------------------------------------------
	// 9. Adversarial Edge Cases
	// ---------------------------------------------------------------------------
	describe("adversarial edge cases", () => {
		test("TC-ASM-01: should stop orphaned animations on interrupted cross-fade", () => {
			const sm = new AnimationStateMachine(scene, node);

			const animA = new AnimationGroup("AnimA", scene);
			const animB = new AnimationGroup("AnimB", scene);
			const animC = new AnimationGroup("AnimC", scene);

			const stopSpyA = vi.spyOn(animA, "stop");
			const stopSpyB = vi.spyOn(animB, "stop");
			const startSpyC = vi.spyOn(animC, "start");

			sm.registerAnimationGroup(animA);
			sm.registerAnimationGroup(animB);
			sm.registerAnimationGroup(animC);

			sm.addState({ name: "A", animationGroupName: "AnimA", transitions: [] });
			sm.addState({ name: "B", animationGroupName: "AnimB", transitions: [] });
			sm.addState({ name: "C", animationGroupName: "AnimC", transitions: [] });

			sm.setInitialState("A");

			// Start crossfade A -> B (1.0s), advance halfway
			sm.transitionTo("B", 1.0);
			sm.update(0.5);

			// Interrupt with transition B -> C (1.0s)
			sm.transitionTo("C", 1.0);

			// State A must have been cleanly stopped
			expect(stopSpyA).toHaveBeenCalled();
			expect(animA.weight).toBe(0);

			// Advance C to completion
			sm.update(1.0);
			expect(stopSpyB).toHaveBeenCalled();
			expect(animB.weight).toBe(0);
			expect(startSpyC).toHaveBeenCalled();
			expect(animC.weight).toBe(1.0);
		});

		test("TC-ASM-02: should cleanly cancel active transition if setInitialState is called mid-transition", () => {
			const sm = new AnimationStateMachine(scene, node);

			const animA = new AnimationGroup("AnimA", scene);
			const animB = new AnimationGroup("AnimB", scene);
			const animC = new AnimationGroup("AnimC", scene);

			const stopSpyA = vi.spyOn(animA, "stop");
			const stopSpyB = vi.spyOn(animB, "stop");
			const startSpyC = vi.spyOn(animC, "start");

			sm.registerAnimationGroup(animA);
			sm.registerAnimationGroup(animB);
			sm.registerAnimationGroup(animC);

			sm.addState({ name: "A", animationGroupName: "AnimA", transitions: [] });
			sm.addState({ name: "B", animationGroupName: "AnimB", transitions: [] });
			sm.addState({ name: "C", animationGroupName: "AnimC", transitions: [] });

			sm.setInitialState("A");
			sm.transitionTo("B", 1.0);
			sm.update(0.5);

			// Interrupt transition by resetting initial state to C
			sm.setInitialState("C");
			expect(sm.currentState?.name).toBe("C");
			expect(stopSpyA).toHaveBeenCalled();
			expect(stopSpyB).toHaveBeenCalled();
			expect(startSpyC).toHaveBeenCalled();

			// Further updates must not overwrite state back to B
			sm.update(0.5);
			expect(sm.currentState?.name).toBe("C");
		});

		test("TC-ASM-03: should handle zero-motion and single-motion blend trees safely", () => {
			const sm = new AnimationStateMachine(scene, node);

			// Empty motions blend tree
			const emptyWeights = sm.computeBlendTreeWeights({ parameter: "speed", motions: [] });
			expect(emptyWeights.size).toBe(0);

			// Single motion blend tree
			const singleWeights = sm.computeBlendTreeWeights({
				parameter: "speed",
				motions: [{ animationGroupName: "SingleAnim", threshold: 0 }],
			});
			expect(singleWeights.get("SingleAnim")).toBe(1.0);
		});

		test("TC-ASM-04: should not trigger repeat events once clamped at 1.0 in non-looping state", () => {
			const sm = new AnimationStateMachine(scene, node);
			let eventCount = 0;
			sm.onAnimationEvent.add(() => {
				eventCount++;
			});

			sm.addState({
				name: "NonLoop",
				loop: false,
				transitions: [],
				events: [{ time: 1.0, name: "EndEvent" }],
			});
			sm.setInitialState("NonLoop");

			sm.update(0.8);
			expect(eventCount).toBe(0);

			sm.update(0.5); // Reaches 1.0
			expect(eventCount).toBe(1);

			sm.update(1.0); // Stays at 1.0
			expect(eventCount).toBe(1); // No repeat!
		});

		test("TC-ASM-05: should handle rapid zero-duration transitions cleanly", () => {
			const sm = new AnimationStateMachine(scene, node);

			const animA = new AnimationGroup("AnimA", scene);
			const animB = new AnimationGroup("AnimB", scene);
			const animC = new AnimationGroup("AnimC", scene);

			const stopSpyA = vi.spyOn(animA, "stop");
			const stopSpyB = vi.spyOn(animB, "stop");
			const startSpyC = vi.spyOn(animC, "start");

			sm.registerAnimationGroup(animA);
			sm.registerAnimationGroup(animB);
			sm.registerAnimationGroup(animC);

			sm.addState({ name: "A", animationGroupName: "AnimA", transitions: [] });
			sm.addState({ name: "B", animationGroupName: "AnimB", transitions: [] });
			sm.addState({ name: "C", animationGroupName: "AnimC", transitions: [] });

			sm.setInitialState("A");
			sm.transitionTo("B", 0.5);
			sm.transitionTo("C", 0); // Immediate cut to C

			expect(sm.currentState?.name).toBe("C");
			expect(stopSpyA).toHaveBeenCalled();
			expect(stopSpyB).toHaveBeenCalled();
			expect(startSpyC).toHaveBeenCalled();
			expect(animC.weight).toBe(1.0);
		});

		test("TC-ASM-06: should ignore NaN parameter values, avoid duplicate t=0 loop events, and dispose on scene disposal", () => {
			const sm = new AnimationStateMachine(scene, node);
			sm.setFloat("speed", 5.0);
			sm.setFloat("speed", Number.NaN);
			expect(sm.getFloat("speed")).toBe(5.0);

			let zeroEventCount = 0;
			sm.onAnimationEvent.add((evt) => {
				if (evt.name === "StartEvent") {
					zeroEventCount++;
				}
			});

			sm.addState({
				name: "LoopZero",
				loop: true,
				transitions: [],
				events: [{ time: 0.0, name: "StartEvent" }],
			});
			sm.setInitialState("LoopZero");

			// Exact 1.0s loop boundary -> t=0 event should fire once for loop 1, not twice
			sm.update(1.0);
			expect(zeroEventCount).toBe(1);

			// Disposing scene automatically disposes state machine
			scene.dispose();
			expect(sm.isDisposed).toBe(true);
		});
	});
});
