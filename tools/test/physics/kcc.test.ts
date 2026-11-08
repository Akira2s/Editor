import { describe, beforeEach, afterEach, test, expect, vi } from "vitest";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PickingInfo } from "@babylonjs/core/Collisions/pickingInfo";
import { Mesh } from "@babylonjs/core/Meshes/mesh";

import { CharacterController } from "../../src/physics/kcc/controller";

describe("physics/kcc/CharacterController", () => {
	let engine: NullEngine;
	let scene: Scene;
	let node: TransformNode;

	beforeEach(() => {
		engine = new NullEngine();
		scene = new Scene(engine);
		node = new TransformNode("Character", scene);
	});

	afterEach(() => {
		scene.dispose();
		engine.dispose();
	});

	describe("Initialization & Options", () => {
		test("should initialize with default options", () => {
			const controller = new CharacterController(node, scene);

			expect(controller.node).toBe(node);
			expect(controller.scene).toBe(scene);
			expect(controller.radius).toBe(0.5);
			expect(controller.height).toBe(1.8);
			expect(controller.mass).toBe(70);
			expect(controller.maxSlopeAngle).toBe(Math.PI / 4);
			expect(controller.stepOffset).toBe(0.3);
			expect(controller.skinWidth).toBe(0.05);
			expect(controller.gravity.equals(new Vector3(0, -9.81, 0))).toBe(true);
			expect(controller.airControl).toBe(0.3);

			const state = controller.state;
			expect(state.isGrounded).toBe(false);
			expect(state.isSliding).toBe(false);
			expect(state.onSteepSlope).toBe(false);
			expect(state.groundDistance).toBe(Number.POSITIVE_INFINITY);
			expect(state.velocity.equals(Vector3.Zero())).toBe(true);
		});

		test("should initialize with custom options", () => {
			const customGravity = new Vector3(0, -20, 0);
			const controller = new CharacterController(node, scene, {
				radius: 0.4,
				height: 2.0,
				mass: 80,
				maxSlopeAngle: Math.PI / 6,
				stepOffset: 0.4,
				skinWidth: 0.02,
				gravity: customGravity,
				airControl: 0.5,
			});

			expect(controller.radius).toBe(0.4);
			expect(controller.height).toBe(2.0);
			expect(controller.mass).toBe(80);
			expect(controller.maxSlopeAngle).toBe(Math.PI / 6);
			expect(controller.stepOffset).toBe(0.4);
			expect(controller.skinWidth).toBe(0.02);
			expect(controller.gravity.equals(customGravity)).toBe(true);
			expect(controller.airControl).toBe(0.5);
		});

		test("should allow updating options through setters", () => {
			const controller = new CharacterController(node, scene);

			controller.radius = 0.6;
			controller.height = 1.9;
			controller.mass = 75;
			controller.maxSlopeAngle = Math.PI / 3;
			controller.stepOffset = 0.35;
			controller.skinWidth = 0.04;
			controller.airControl = 0.4;
			controller.gravity = new Vector3(0, -15, 0);

			expect(controller.radius).toBe(0.6);
			expect(controller.height).toBe(1.9);
			expect(controller.mass).toBe(75);
			expect(controller.maxSlopeAngle).toBe(Math.PI / 3);
			expect(controller.stepOffset).toBe(0.35);
			expect(controller.skinWidth).toBe(0.04);
			expect(controller.airControl).toBe(0.4);
			expect(controller.gravity.equals(new Vector3(0, -15, 0))).toBe(true);
		});

		test("should update gravity with setGravity()", () => {
			const controller = new CharacterController(node, scene);
			controller.setGravity(new Vector3(0, -5, 0));
			expect(controller.gravity.equals(new Vector3(0, -5, 0))).toBe(true);
		});
	});

	describe("Teleport & Dispose", () => {
		test("should teleport to target position and reset velocity", () => {
			const controller = new CharacterController(node, scene);
			controller.velocity.set(5, 10, -3);
			controller.state.velocity.set(5, 10, -3);

			const targetPos = new Vector3(10, 2, 20);
			controller.teleport(targetPos);

			expect(node.position.equals(targetPos)).toBe(true);
			expect(controller.velocity.equals(Vector3.Zero())).toBe(true);
			expect(controller.state.velocity.equals(Vector3.Zero())).toBe(true);
		});

		test("should reset state and references on dispose", () => {
			const controller = new CharacterController(node, scene);
			controller.velocity.set(1, 2, 3);
			controller.dispose();

			expect(controller.velocity.equals(Vector3.Zero())).toBe(true);
			expect(controller.state.velocity.equals(Vector3.Zero())).toBe(true);
		});
	});

	describe("Jumping", () => {
		test("should fail to jump when not grounded", () => {
			const controller = new CharacterController(node, scene);
			expect(controller.state.isGrounded).toBe(false);

			const jumped = controller.jump(8);
			expect(jumped).toBe(false);
			expect(controller.velocity.y).toBe(0);
		});

		test("should fail to jump when on a steep slope", () => {
			const controller = new CharacterController(node, scene);
			controller.state.isGrounded = true;
			controller.state.onSteepSlope = true;

			const jumped = controller.jump(8);
			expect(jumped).toBe(false);
			expect(controller.velocity.y).toBe(0);
		});

		test("should successfully jump when grounded and not on steep slope", () => {
			const controller = new CharacterController(node, scene);
			controller.state.isGrounded = true;
			controller.state.onSteepSlope = false;

			const jumped = controller.jump(8);
			expect(jumped).toBe(true);
			expect(controller.velocity.y).toBe(8);
			expect(controller.state.velocity.y).toBe(8);
			expect(controller.state.isGrounded).toBe(false);
		});
	});

	describe("Movement & Collisions", () => {
		test("should return current state immediately when deltaTime <= 0", () => {
			const controller = new CharacterController(node, scene);
			const state = controller.move(new Vector3(1, 0, 0), 0);
			expect(state).toBe(controller.state);
		});

		test("should detect grounded state when downward ray hits surface", () => {
			const controller = new CharacterController(node, scene, {
				height: 2.0,
				skinWidth: 0.05,
			});
			node.position.set(0, 0, 0);

			const pickInfo = new PickingInfo();
			pickInfo.hit = true;
			pickInfo.distance = 1.02; // center is at 1.0, feet at 0.0, hit at distance 1.02 -> groundDistance = 0.02 <= skinWidth
			pickInfo.pickedPoint = new Vector3(0, -0.02, 0);
			vi.spyOn(pickInfo, "getNormal").mockReturnValue(new Vector3(0, 1, 0));

			vi.spyOn(scene, "pickWithRay").mockReturnValue(pickInfo);

			const state = controller.move(new Vector3(0, 0, 0), 0.016);
			expect(state.isGrounded).toBe(true);
			expect(state.onSteepSlope).toBe(false);
			expect(state.isSliding).toBe(false);
			expect(state.groundDistance).toBeCloseTo(0.02, 3);
			expect(state.groundNormal.equals(Vector3.Up())).toBe(true);
		});

		test("should detect airborne state and accumulate gravity when ray misses", () => {
			const controller = new CharacterController(node, scene, {
				gravity: new Vector3(0, -10, 0),
			});
			node.position.set(0, 5, 0);

			const missPick = new PickingInfo();
			missPick.hit = false;
			vi.spyOn(scene, "pickWithRay").mockReturnValue(missPick);

			const state = controller.move(new Vector3(0, 0, 0), 0.1);
			expect(state.isGrounded).toBe(false);
			expect(controller.velocity.y).toBeCloseTo(-1.0, 3); // -10 * 0.1
		});

		test("should scale horizontal displacement by airControl when airborne", () => {
			const controller = new CharacterController(node, scene, {
				airControl: 0.25,
			});
			node.position.set(0, 5, 0);

			const missPick = new PickingInfo();
			missPick.hit = false;
			vi.spyOn(scene, "pickWithRay").mockReturnValue(missPick);

			controller.move(new Vector3(4, 0, 0), 1.0);
			// Air control 0.25 scales horizontal displacement from 4 to 1
			expect(node.position.x).toBeCloseTo(1.0, 3);
		});

		test("should detect steep slopes and slide down slope plane", () => {
			const controller = new CharacterController(node, scene, {
				maxSlopeAngle: Math.PI / 4, // 45 degrees
				height: 2.0,
			});
			node.position.set(0, 0, 0);

			// Normal tilted 60 degrees from vertical (x: sin(60deg)=0.866, y: cos(60deg)=0.5)
			const slopeNormal = new Vector3(0.866, 0.5, 0).normalize();

			const slopePick = new PickingInfo();
			slopePick.hit = true;
			slopePick.distance = 1.02;
			slopePick.pickedPoint = new Vector3(0, -0.02, 0);
			vi.spyOn(slopePick, "getNormal").mockReturnValue(slopeNormal);

			vi.spyOn(scene, "pickWithRay").mockReturnValue(slopePick);

			const state = controller.move(Vector3.Zero(), 0.1);
			expect(state.isGrounded).toBe(true);
			expect(state.onSteepSlope).toBe(true);
			expect(state.isSliding).toBe(true);
			// Node should slide downhill in +X direction (normal has +X and +Y)
			expect(node.position.x).toBeGreaterThan(0);
		});

		test("should deflect horizontal displacement along wall planes", () => {
			const controller = new CharacterController(node, scene, {
				radius: 0.5,
				height: 1.8,
			});
			node.position.set(0, 0, 0);

			// First ray (ground check): grounded
			const groundPick = new PickingInfo();
			groundPick.hit = true;
			groundPick.distance = 0.9;
			groundPick.pickedPoint = new Vector3(0, 0, 0);
			vi.spyOn(groundPick, "getNormal").mockReturnValue(Vector3.Up());

			// Forward obstacle ray: hits a wall with normal (-1, 0, 0)
			const wallPick = new PickingInfo();
			wallPick.hit = true;
			wallPick.distance = 0.52; // near capsule radius 0.5
			vi.spyOn(wallPick, "getNormal").mockReturnValue(new Vector3(-1, 0, 0));

			vi.spyOn(scene, "pickWithRay").mockImplementation((ray) => {
				if (ray.direction.y < -0.9) {
					return groundPick;
				}
				return wallPick;
			});

			// Desired movement diagonal into wall: (1, 0, 1)
			controller.move(new Vector3(1, 0, 1), 0.1);

			// Displacement projected onto wall normal (-1, 0, 0) cancels X and preserves Z
			expect(node.position.x).toBeCloseTo(0, 2);
			expect(node.position.z).toBeGreaterThan(0);
		});

		test("should climb steps within stepOffset height", () => {
			const controller = new CharacterController(node, scene, {
				radius: 0.5,
				height: 1.8,
				stepOffset: 0.3,
				skinWidth: 0.05,
			});
			node.position.set(0, 0, 0);

			// Ground check
			const groundPick = new PickingInfo();
			groundPick.hit = true;
			groundPick.distance = 0.9;
			groundPick.pickedPoint = new Vector3(0, 0, 0);
			vi.spyOn(groundPick, "getNormal").mockReturnValue(Vector3.Up());

			// Low obstacle at foot level
			const lowHit = new PickingInfo();
			lowHit.hit = true;
			lowHit.distance = 0.52;
			vi.spyOn(lowHit, "getNormal").mockReturnValue(new Vector3(0, 0, -1));

			// Step ray at step height is clear
			const stepClear = new PickingInfo();
			stepClear.hit = false;

			// Ledge ray downwards onto top of the step (height: 0.2m)
			const ledgeHit = new PickingInfo();
			ledgeHit.hit = true;
			ledgeHit.pickedPoint = new Vector3(0, 0.2, 0.6);

			vi.spyOn(scene, "pickWithRay").mockImplementation((ray) => {
				// Ground ray
				if (ray.origin.y > 0.8 && ray.origin.y < 1.0 && ray.direction.y < -0.9) {
					return groundPick;
				}
				// Low forward ray
				if (ray.origin.y < 0.2 && ray.direction.z > 0.9) {
					return lowHit;
				}
				// Step forward ray
				if (ray.origin.y >= 0.3 && ray.direction.z > 0.9) {
					return stepClear;
				}
				// Ledge downward ray
				if (ray.direction.y < -0.9) {
					return ledgeHit;
				}
				return new PickingInfo();
			});

			controller.move(new Vector3(0, 0, 0.5), 0.1);

			// Character should step upward onto the 0.2m ledge
			expect(node.position.y).toBeGreaterThanOrEqual(0.2);
		});

		test("should return state unchanged when deltaTime or position is NaN or infinite", () => {
			const controller = new CharacterController(node, scene);

			// NaN deltaTime
			expect(controller.move(new Vector3(1, 0, 0), Number.NaN)).toBe(controller.state);
			// Infinite deltaTime
			expect(controller.move(new Vector3(1, 0, 0), Number.POSITIVE_INFINITY)).toBe(controller.state);

			// NaN position
			node.position.set(Number.NaN, 0, 0);
			expect(controller.move(new Vector3(1, 0, 0), 0.016)).toBe(controller.state);

			// NaN displacement
			node.position.set(0, 0, 0);
			expect(controller.move(new Vector3(Number.NaN, 0, 0), 0.016)).toBe(controller.state);
		});

		test("should fall back to Vector3.Up() when ground normal is degenerate or inverted", () => {
			const controller = new CharacterController(node, scene, {
				height: 2.0,
			});
			node.position.set(0, 0, 0);

			// Inverted normal (pointing down: normal.y < 0)
			const invertedPick = new PickingInfo();
			invertedPick.hit = true;
			invertedPick.distance = 1.0;
			invertedPick.pickedPoint = new Vector3(0, 0, 0);
			vi.spyOn(invertedPick, "getNormal").mockReturnValue(new Vector3(0, -1, 0));

			vi.spyOn(scene, "pickWithRay").mockReturnValue(invertedPick);

			const state1 = controller.move(Vector3.Zero(), 0.016);
			expect(state1.groundNormal.equals(Vector3.Up())).toBe(true);

			// Degenerate normal (zero vector: lengthSquared < 0.0001)
			const degeneratePick = new PickingInfo();
			degeneratePick.hit = true;
			degeneratePick.distance = 1.0;
			degeneratePick.pickedPoint = new Vector3(0, 0, 0);
			vi.spyOn(degeneratePick, "getNormal").mockReturnValue(new Vector3(0, 0, 0));

			vi.spyOn(scene, "pickWithRay").mockReturnValue(degeneratePick);

			const state2 = controller.move(Vector3.Zero(), 0.016);
			expect(state2.groundNormal.equals(Vector3.Up())).toBe(true);
		});

		test("should depenetrate upwards when penetrating floor (ground distance < halfHeight)", () => {
			const controller = new CharacterController(node, scene, {
				height: 2.0, // halfHeight = 1.0
			});
			node.position.set(0, -0.2, 0);

			// Pick distance is 0.8 (< halfHeight 1.0), so penetration depth = 0.2
			const groundPick = new PickingInfo();
			groundPick.hit = true;
			groundPick.distance = 0.8;
			groundPick.pickedPoint = new Vector3(0, 0, 0);
			vi.spyOn(groundPick, "getNormal").mockReturnValue(Vector3.Up());

			vi.spyOn(scene, "pickWithRay").mockReturnValue(groundPick);

			const state = controller.move(Vector3.Zero(), 0.016);
			expect(state.isGrounded).toBe(true);
			expect(state.groundDistance).toBe(0);
			// Depenetration pushes node up by depth 0.2 from -0.2 to 0.0
			expect(node.position.y).toBeCloseTo(0.0, 3);
		});

		test("should prevent step climbing when ceiling headroom is insufficient", () => {
			const controller = new CharacterController(node, scene, {
				radius: 0.5,
				height: 1.8,
				stepOffset: 0.3,
				skinWidth: 0.05,
			});
			node.position.set(0, 0, 0);

			const groundPick = new PickingInfo();
			groundPick.hit = true;
			groundPick.distance = 0.9;
			groundPick.pickedPoint = new Vector3(0, 0, 0);
			vi.spyOn(groundPick, "getNormal").mockReturnValue(Vector3.Up());

			// Low obstacle hit
			const lowHit = new PickingInfo();
			lowHit.hit = true;
			lowHit.distance = 0.52;
			vi.spyOn(lowHit, "getNormal").mockReturnValue(new Vector3(0, 0, -1));

			// Step forward ray is clear
			const stepClear = new PickingInfo();
			stepClear.hit = false;

			// Ledge ray hits step top at y = 0.25
			const ledgeHit = new PickingInfo();
			ledgeHit.hit = true;
			ledgeHit.pickedPoint = new Vector3(0, 0.25, 0.6);

			// Headroom ray hits low ceiling 0.1m above head (insufficient for 0.25m step)
			const ceilingHit = new PickingInfo();
			ceilingHit.hit = true;
			ceilingHit.distance = 0.1; // < stepHeight 0.25

			vi.spyOn(scene, "pickWithRay").mockImplementation((ray) => {
				// Ground ray
				if (ray.origin.y > 0.8 && ray.origin.y < 1.0 && ray.direction.y < -0.9) {
					return groundPick;
				}
				// Low forward ray
				if (ray.origin.y < 0.2 && ray.direction.z > 0.9) {
					return lowHit;
				}
				// Step forward ray
				if (ray.origin.y >= 0.3 && ray.origin.y < 0.5 && ray.direction.z > 0.9) {
					return stepClear;
				}
				// Ledge downward ray
				if (ray.direction.y < -0.9) {
					return ledgeHit;
				}
				// Headroom upward ray
				if (ray.origin.y >= 1.7 && ray.direction.y > 0.9) {
					return ceilingHit;
				}
				return new PickingInfo();
			});

			controller.move(new Vector3(0, 0, 0.5), 0.1);

			// Step-up should be cancelled: node.position.y should remain near 0
			expect(node.position.y).toBeCloseTo(0.0, 2);
		});

		test("should detect head-level obstacles and deflect horizontally", () => {
			const controller = new CharacterController(node, scene, {
				radius: 0.5,
				height: 1.8,
			});
			node.position.set(0, 0, 0);

			const groundPick = new PickingInfo();
			groundPick.hit = true;
			groundPick.distance = 0.9;
			groundPick.pickedPoint = new Vector3(0, 0, 0);
			vi.spyOn(groundPick, "getNormal").mockReturnValue(Vector3.Up());

			// Head obstacle hit (origin near 1.7)
			const headHit = new PickingInfo();
			headHit.hit = true;
			headHit.distance = 0.52;
			vi.spyOn(headHit, "getNormal").mockReturnValue(new Vector3(-1, 0, 0));

			vi.spyOn(scene, "pickWithRay").mockImplementation((ray) => {
				// Ground ray
				if (ray.direction.y < -0.9) {
					return groundPick;
				}
				// Head ray
				if (ray.origin.y > 1.5) {
					return headHit;
				}
				// Low and body rays are clear
				return new PickingInfo();
			});

			// Move diagonal into obstacle: (1, 0, 1)
			controller.move(new Vector3(1, 0, 1), 0.1);

			// Wall deflection should cancel X and allow Z
			expect(node.position.x).toBeCloseTo(0, 2);
			expect(node.position.z).toBeGreaterThan(0);
		});

		test("should exclude character mesh and descendant meshes from raycasts", () => {
			const controller = new CharacterController(node, scene);
			const childMesh = new Mesh("Child", scene);
			childMesh.parent = node;

			const otherMesh = new Mesh("Obstacle", scene);

			let passedPredicate: any;
			vi.spyOn(scene, "pickWithRay").mockImplementation((_ray, predicate) => {
				passedPredicate = predicate;
				return new PickingInfo();
			});

			controller.move(Vector3.Zero(), 0.016);

			expect(passedPredicate).toBeDefined();
			if (passedPredicate) {
				expect(passedPredicate(node)).toBe(false);
				expect(passedPredicate(childMesh)).toBe(false);
				expect(passedPredicate(otherMesh)).toBe(true);
			}
		});

		test("should respect custom collisionFilter if provided", () => {
			const customFilter = vi.fn().mockImplementation((mesh: Mesh) => mesh.name !== "Ignored");
			const controller = new CharacterController(node, scene, {
				collisionFilter: customFilter,
			});

			const mesh1 = new Mesh("Normal", scene);
			const mesh2 = new Mesh("Ignored", scene);

			let passedPredicate: any;
			vi.spyOn(scene, "pickWithRay").mockImplementation((_ray, predicate) => {
				passedPredicate = predicate;
				return new PickingInfo();
			});

			controller.move(Vector3.Zero(), 0.016);

			expect(passedPredicate).toBeDefined();
			if (passedPredicate) {
				expect(passedPredicate(mesh1)).toBe(true);
				expect(passedPredicate(mesh2)).toBe(false);
			}
		});

		test("should reject negative, zero, or NaN jump force and clamp negative geometry setters", () => {
			const controller = new CharacterController(node, scene);
			controller.state.isGrounded = true;
			controller.state.onSteepSlope = false;

			expect(controller.jump(0)).toBe(false);
			expect(controller.jump(-5)).toBe(false);
			expect(controller.jump(Number.NaN)).toBe(false);
			expect(controller.state.isGrounded).toBe(true);

			controller.radius = -2;
			controller.height = -1;
			controller.stepOffset = -0.5;
			controller.skinWidth = -0.1;

			expect(controller.radius).toBeGreaterThan(0);
			expect(controller.height).toBeGreaterThan(0);
			expect(controller.stepOffset).toBeGreaterThanOrEqual(0);
			expect(controller.skinWidth).toBeGreaterThan(0);
		});
	});
});
