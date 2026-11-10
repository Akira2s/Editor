import { beforeEach, describe, expect, test, vi } from "vitest";
import { FreeCamera, NullEngine, Quaternion, Scene, TransformNode, Vector3 } from "@babylonjs/core";

import { NavAgent } from "../../src/navigation/nav-agent";

describe("navigation/NavAgent", () => {
	let engine: NullEngine;
	let scene: Scene;
	let node: TransformNode;

	beforeEach(() => {
		engine = new NullEngine();
		scene = new Scene(engine);
		new FreeCamera("Camera", Vector3.Zero(), scene);
		node = new TransformNode("AgentNode", scene);
	});

	test("should initialize with defaults and clamp invalid property values", () => {
		const agent = new NavAgent(node, scene);

		expect(agent.node).toBe(node);
		expect(agent.radius).toBe(0.5);
		expect(agent.height).toBe(1.8);
		expect(agent.speed).toBe(3.5);
		expect(agent.angularSpeed).toBe(360);
		expect(agent.acceleration).toBe(8.0);
		expect(agent.stoppingDistance).toBe(0.2);
		expect(agent.autoBraking).toBe(true);
		expect(agent.updateRotation).toBe(true);
		expect(agent.obstacleAvoidance).toBe(true);
		expect(agent.avoidanceRadius).toBe(1.5);
		expect(agent.patrolWaypoints).toEqual([]);
		expect(agent.patrolLoop).toBe(true);
		expect(agent.isStopped).toBe(true);
		expect(agent.hasPath).toBe(false);
		expect(agent.remainingDistance).toBe(0);

		agent.radius = -5;
		expect(agent.radius).toBe(0.05);
		agent.radius = Number.NaN;
		expect(agent.radius).toBe(0.05);

		agent.height = -1;
		expect(agent.height).toBe(0.1);

		agent.speed = -10;
		expect(agent.speed).toBe(0);

		agent.angularSpeed = -90;
		expect(agent.angularSpeed).toBe(0);

		agent.acceleration = 0;
		expect(agent.acceleration).toBe(0.01);

		agent.stoppingDistance = -1;
		expect(agent.stoppingDistance).toBe(0.01);

		agent.avoidanceRadius = 0;
		expect(agent.avoidanceRadius).toBe(0.1);
	});

	test("should follow direct fallback path to destination and fire onDestinationReachedObservable", () => {
		const agent = new NavAgent(node, scene, {
			speed: 5,
			acceleration: 50,
			stoppingDistance: 0.25,
			autoBraking: false,
		});

		const reachedSpy = vi.fn();
		agent.onDestinationReachedObservable.add(reachedSpy);

		const ok = agent.setDestination(new Vector3(5, 0, 0));
		expect(ok).toBe(true);
		expect(agent.hasPath).toBe(true);
		expect(agent.isStopped).toBe(false);
		expect(agent.destination?.equals(new Vector3(5, 0, 0))).toBe(true);
		expect(agent.remainingDistance).toBeCloseTo(5, 2);

		for (let i = 0; i < 60 && !agent.isStopped; i++) {
			agent.update(0.05);
		}

		expect(agent.isStopped).toBe(true);
		expect(agent.hasPath).toBe(false);
		expect(reachedSpy).toHaveBeenCalledOnce();
		expect(Vector3.Distance(node.position, new Vector3(5, 0, 0))).toBeLessThanOrEqual(0.25);
	});

	test("should use custom navigation plugin or scene.getNavigationEngine() when available", () => {
		const agent = new NavAgent(node, scene, {
			speed: 6,
			acceleration: 50,
			stoppingDistance: 0.2,
		});

		const computePath = vi.fn((start: Vector3, end: Vector3) => [start.clone(), new Vector3(2, 0, 2), end.clone()]);

		agent.setNavigationPlugin({ computePath });
		agent.setDestination(new Vector3(4, 0, 0));

		expect(computePath).toHaveBeenCalledOnce();
		expect(agent.path.length).toBe(3);
		expect(agent.remainingDistance).toBeGreaterThan(4);

		// Also test fallback to scene.getNavigationEngine() when plugin is cleared
		agent.setNavigationPlugin(null);
		const sceneComputePath = vi.fn((start: Vector3, end: Vector3) => [start.clone(), end.clone()]);
		(scene as any).getNavigationEngine = () => ({ computePath: sceneComputePath });

		agent.setDestination(new Vector3(0, 0, 6));
		expect(sceneComputePath).toHaveBeenCalledOnce();
	});

	test("should support stop, resume, and warp", () => {
		const agent = new NavAgent(node, scene, { speed: 4, acceleration: 20 });
		agent.setDestination(new Vector3(10, 0, 0));

		agent.update(0.1);
		expect(node.position.x).toBeGreaterThan(0);
		expect(agent.currentSpeed).toBeGreaterThan(0);

		const posWhenStopped = node.position.x;
		agent.stop();
		expect(agent.isStopped).toBe(true);
		expect(agent.currentSpeed).toBe(0);

		agent.update(0.5);
		expect(node.position.x).toBe(posWhenStopped);

		agent.resume();
		expect(agent.isStopped).toBe(false);
		agent.update(0.1);
		expect(node.position.x).toBeGreaterThan(posWhenStopped);

		agent.warp(new Vector3(-5, 2, 8));
		expect(node.position.equals(new Vector3(-5, 2, 8))).toBe(true);
		expect(agent.hasPath).toBe(false);
		expect(agent.isStopped).toBe(true);
	});

	test("should patrol waypoints with and without looping", () => {
		const agent = new NavAgent(node, scene, {
			speed: 10,
			acceleration: 100,
			stoppingDistance: 0.3,
			autoBraking: false,
			patrolWaypoints: [
				{ x: 2, y: 0, z: 0 },
				{ x: 2, y: 0, z: 2 },
			],
			patrolLoop: false,
		});

		const reachedWaypoints: number[] = [];
		agent.onWaypointReachedObservable.add((idx) => reachedWaypoints.push(idx));

		expect(agent.startPatrol(0)).toBe(true);
		expect(agent.currentPatrolIndex).toBe(0);

		for (let i = 0; i < 60 && !agent.isStopped; i++) {
			agent.update(0.05);
		}

		expect(reachedWaypoints).toEqual([0, 1]);
		expect(agent.isStopped).toBe(true);

		// Enable loop and restart patrol
		agent.patrolLoop = true;
		reachedWaypoints.length = 0;
		agent.startPatrol(0);

		for (let i = 0; i < 60 && reachedWaypoints.length < 3; i++) {
			agent.update(0.05);
		}

		expect(reachedWaypoints.slice(0, 3)).toEqual([0, 1, 0]);
		expect(agent.isStopped).toBe(false);

		agent.stopPatrol();
		expect(agent.isStopped).toBe(true);
	});

	test("should apply local obstacle avoidance between nearby agents in the same scene", () => {
		const nodeA = new TransformNode("AgentA", scene);
		const nodeB = new TransformNode("AgentB", scene);
		nodeA.position.set(0, 0, 0);
		nodeB.position.set(2, 0, 0.05);

		const agentA = new NavAgent(nodeA, scene, {
			speed: 3,
			acceleration: 30,
			obstacleAvoidance: true,
			avoidanceRadius: 1.5,
		});
		const agentB = new NavAgent(nodeB, scene, {
			speed: 3,
			acceleration: 30,
			obstacleAvoidance: true,
			avoidanceRadius: 1.5,
		});

		agentA.setDestination(new Vector3(4, 0, 0));
		agentB.setDestination(new Vector3(-2, 0, 0));

		for (let i = 0; i < 20; i++) {
			agentA.update(0.05);
			agentB.update(0.05);
		}

		// Agents moving head-on should deflect laterally along Z due to separation steering
		expect(Math.abs(nodeA.position.z)).toBeGreaterThan(0.01);
		expect(Math.abs(nodeB.position.z)).toBeGreaterThan(0.05);
	});

	test("should smoothly rotate node (Euler and Quaternion) toward movement direction", () => {
		const agent = new NavAgent(node, scene, {
			speed: 5,
			angularSpeed: 180,
			acceleration: 50,
			updateRotation: true,
		});

		agent.setDestination(new Vector3(5, 0, 0));
		agent.update(0.1);

		// Moving along +X means yaw should rotate toward +PI/2
		expect(node.rotation.y).toBeGreaterThan(0);
		expect(node.rotation.y).toBeLessThanOrEqual(Math.PI / 2 + 0.01);

		// Also test when rotationQuaternion is active on the node
		node.rotationQuaternion = Quaternion.Identity();
		agent.update(0.1);
		const euler = node.rotationQuaternion.toEulerAngles();
		expect(euler.y).toBeGreaterThan(0);
	});

	test("should serialize and Parse NavAgent data accurately", () => {
		const agent = new NavAgent(node, scene, {
			radius: 0.7,
			height: 2.1,
			speed: 4.5,
			angularSpeed: 240,
			acceleration: 12,
			stoppingDistance: 0.35,
			autoBraking: false,
			updateRotation: false,
			obstacleAvoidance: false,
			avoidanceRadius: 2.5,
			patrolWaypoints: [{ x: 1, y: 2, z: 3 }],
			patrolLoop: false,
		});

		const serialized = agent.serialize();
		expect(serialized).toEqual({
			enabled: true,
			radius: 0.7,
			height: 2.1,
			speed: 4.5,
			angularSpeed: 240,
			acceleration: 12,
			stoppingDistance: 0.35,
			autoBraking: false,
			updateRotation: false,
			obstacleAvoidance: false,
			avoidanceRadius: 2.5,
			patrolWaypoints: [{ x: 1, y: 2, z: 3 }],
			patrolLoop: false,
		});

		const parsedNode = new TransformNode("ParsedNode", scene);
		const parsed = NavAgent.Parse(serialized, parsedNode, scene);
		expect(parsed.radius).toBe(0.7);
		expect(parsed.height).toBe(2.1);
		expect(parsed.speed).toBe(4.5);
		expect(parsed.angularSpeed).toBe(240);
		expect(parsed.acceleration).toBe(12);
		expect(parsed.stoppingDistance).toBe(0.35);
		expect(parsed.autoBraking).toBe(false);
		expect(parsed.updateRotation).toBe(false);
		expect(parsed.obstacleAvoidance).toBe(false);
		expect(parsed.avoidanceRadius).toBe(2.5);
		expect(parsed.patrolWaypoints.length).toBe(1);
		expect(parsed.patrolWaypoints[0].equals(new Vector3(1, 2, 3))).toBe(true);
		expect(parsed.patrolLoop).toBe(false);
	});

	test("should guard against NaN destinations, non-positive deltaTime, and disposal", () => {
		const agent = new NavAgent(node, scene);

		expect(agent.setDestination(new Vector3(Number.NaN, 0, 0))).toBe(false);
		expect(agent.startPatrol()).toBe(false);

		agent.setDestination(new Vector3(5, 0, 0));
		agent.update(0);
		agent.update(-1);
		agent.update(Number.NaN);
		expect(node.position.x).toBe(0);

		agent.dispose();
		expect(agent.isDisposed).toBe(true);
		expect(agent.setDestination(new Vector3(5, 0, 0))).toBe(false);
	});

	test("adversarial: should not overshoot destination on high speed or large deltaTime", () => {
		const agent = new NavAgent(node, scene, {
			speed: 50,
			acceleration: 500,
			stoppingDistance: 0.05,
			autoBraking: false,
		});

		const reachedSpy = vi.fn();
		agent.onDestinationReachedObservable.add(reachedSpy);

		agent.setDestination(new Vector3(1, 0, 0));
		agent.update(1.0);

		expect(reachedSpy).toHaveBeenCalledOnce();
		expect(agent.isStopped).toBe(true);
		expect(node.position.equals(new Vector3(1, 0, 0))).toBe(true);
	});

	test("adversarial: should handle null/malformed patrolWaypoints in Parse, immutable patrolWaypoints getter, and cancel patrol on warp/setDestination", () => {
		const parsed = NavAgent.Parse(
			{
				enabled: true,
				patrolWaypoints: [null as any, undefined as any, { x: Number.NaN, y: 0, z: 0 }, { x: 3, y: 0, z: 4 }],
			},
			node,
			scene
		);

		expect(parsed.patrolWaypoints.length).toBe(1);
		expect(parsed.patrolWaypoints[0].equals(new Vector3(3, 0, 4))).toBe(true);

		// Mutating returned array or its Vector3 elements must not mutate internal state
		const copy = parsed.patrolWaypoints;
		copy[0].x = 999;
		copy.push(new Vector3(10, 10, 10));
		expect(parsed.patrolWaypoints.length).toBe(1);
		expect(parsed.patrolWaypoints[0].x).toBe(3);

		// warp() during active patrol cancels patrol
		parsed.patrolWaypoints = [new Vector3(2, 0, 0), new Vector3(4, 0, 0)];
		parsed.speed = 50;
		parsed.acceleration = 500;
		const waypointSpy = vi.fn();
		parsed.onWaypointReachedObservable.add(waypointSpy);

		expect(parsed.startPatrol(0)).toBe(true);
		parsed.warp(new Vector3(10, 0, 0));
		expect(parsed.isStopped).toBe(true);

		// Calling setDestination after warp should not trigger patrol waypoint advancement on arrival
		parsed.setDestination(new Vector3(11, 0, 0));
		parsed.update(1.0);
		expect(waypointSpy).not.toHaveBeenCalled();
		expect(parsed.isStopped).toBe(true);
	});
});
