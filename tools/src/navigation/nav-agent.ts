import { Scene } from "@babylonjs/core/scene";
import { Tools } from "@babylonjs/core/Misc/tools";
import { Observable, Observer } from "@babylonjs/core/Misc/observable";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

import { INavAgentData, INavAgentOptions, INavWaypoint } from "./types";

export interface INavigationPluginLike {
	computePath?: (start: Vector3, end: Vector3) => Vector3[];
}

export class NavAgent {
	private static _sceneAgents = new WeakMap<Scene, Set<NavAgent>>();

	public readonly onDestinationReachedObservable: Observable<Vector3> = new Observable<Vector3>();
	public readonly onWaypointReachedObservable: Observable<number> = new Observable<number>();

	private _node: TransformNode;
	private _scene: Scene;
	private _navigationPlugin: INavigationPluginLike | null = null;
	private _sceneDisposeObserver: Observer<Scene> | null = null;

	private _radius: number = 0.5;
	private _height: number = 1.8;
	private _speed: number = 3.5;
	private _angularSpeed: number = 360;
	private _acceleration: number = 8.0;
	private _stoppingDistance: number = 0.2;
	private _autoBraking: boolean = true;
	private _updateRotation: boolean = true;
	private _obstacleAvoidance: boolean = true;
	private _avoidanceRadius: number = 1.5;
	private _patrolWaypoints: Vector3[] = [];
	private _patrolLoop: boolean = true;

	private _velocity: Vector3 = Vector3.Zero();
	private _destination: Vector3 | null = null;
	private _path: Vector3[] = [];
	private _currentCornerIndex: number = 0;
	private _isStopped: boolean = true;
	private _isPatrolling: boolean = false;
	private _patrolIndex: number = 0;
	private _isDisposed: boolean = false;

	public constructor(node: TransformNode, scene: Scene, options: INavAgentOptions = {}) {
		this._node = node;
		this._scene = scene;

		if (options.radius !== undefined) {
			this.radius = options.radius;
		}
		if (options.height !== undefined) {
			this.height = options.height;
		}
		if (options.speed !== undefined) {
			this.speed = options.speed;
		}
		if (options.angularSpeed !== undefined) {
			this.angularSpeed = options.angularSpeed;
		}
		if (options.acceleration !== undefined) {
			this.acceleration = options.acceleration;
		}
		if (options.stoppingDistance !== undefined) {
			this.stoppingDistance = options.stoppingDistance;
		}
		if (options.autoBraking !== undefined) {
			this.autoBraking = options.autoBraking;
		}
		if (options.updateRotation !== undefined) {
			this.updateRotation = options.updateRotation;
		}
		if (options.obstacleAvoidance !== undefined) {
			this.obstacleAvoidance = options.obstacleAvoidance;
		}
		if (options.avoidanceRadius !== undefined) {
			this.avoidanceRadius = options.avoidanceRadius;
		}
		if (Array.isArray(options.patrolWaypoints)) {
			this.patrolWaypoints = options.patrolWaypoints.filter((wp) => wp && typeof wp === "object").map((wp) => new Vector3(Number(wp.x), Number(wp.y), Number(wp.z)));
		}
		if (options.patrolLoop !== undefined) {
			this.patrolLoop = options.patrolLoop;
		}

		let agents = NavAgent._sceneAgents.get(this._scene);
		if (!agents) {
			agents = new Set<NavAgent>();
			NavAgent._sceneAgents.set(this._scene, agents);
		}
		agents.add(this);

		if (this._scene?.onDisposeObservable) {
			this._sceneDisposeObserver = this._scene.onDisposeObservable.addOnce(() => {
				this.dispose();
			});
		}
	}

	public get node(): TransformNode {
		return this._node;
	}

	public get isDisposed(): boolean {
		return this._isDisposed;
	}

	public get isStopped(): boolean {
		return this._isStopped;
	}

	public get hasPath(): boolean {
		return this._path.length > 0 && this._currentCornerIndex < this._path.length;
	}

	public get velocity(): Vector3 {
		return this._velocity.clone();
	}

	public get currentSpeed(): number {
		return this._velocity.length();
	}

	public get destination(): Vector3 | null {
		return this._destination ? this._destination.clone() : null;
	}

	public get path(): Vector3[] {
		return this._path.map((p) => p.clone());
	}

	public get remainingDistance(): number {
		if (!this.hasPath) {
			return 0;
		}

		let dist = Vector3.Distance(this._node.position, this._path[this._currentCornerIndex]);
		for (let i = this._currentCornerIndex; i < this._path.length - 1; i++) {
			dist += Vector3.Distance(this._path[i], this._path[i + 1]);
		}

		return dist;
	}

	public get currentPatrolIndex(): number {
		return this._patrolIndex;
	}

	public get radius(): number {
		return this._radius;
	}

	public set radius(value: number) {
		if (Number.isFinite(value)) {
			this._radius = Math.max(0.05, value);
		}
	}

	public get height(): number {
		return this._height;
	}

	public set height(value: number) {
		if (Number.isFinite(value)) {
			this._height = Math.max(0.1, value);
		}
	}

	public get speed(): number {
		return this._speed;
	}

	public set speed(value: number) {
		if (Number.isFinite(value)) {
			this._speed = Math.max(0, value);
		}
	}

	public get angularSpeed(): number {
		return this._angularSpeed;
	}

	public set angularSpeed(value: number) {
		if (Number.isFinite(value)) {
			this._angularSpeed = Math.max(0, value);
		}
	}

	public get acceleration(): number {
		return this._acceleration;
	}

	public set acceleration(value: number) {
		if (Number.isFinite(value)) {
			this._acceleration = Math.max(0.01, value);
		}
	}

	public get stoppingDistance(): number {
		return this._stoppingDistance;
	}

	public set stoppingDistance(value: number) {
		if (Number.isFinite(value)) {
			this._stoppingDistance = Math.max(0.01, value);
		}
	}

	public get autoBraking(): boolean {
		return this._autoBraking;
	}

	public set autoBraking(value: boolean) {
		this._autoBraking = Boolean(value);
	}

	public get updateRotation(): boolean {
		return this._updateRotation;
	}

	public set updateRotation(value: boolean) {
		this._updateRotation = Boolean(value);
	}

	public get obstacleAvoidance(): boolean {
		return this._obstacleAvoidance;
	}

	public set obstacleAvoidance(value: boolean) {
		this._obstacleAvoidance = Boolean(value);
	}

	public get avoidanceRadius(): number {
		return this._avoidanceRadius;
	}

	public set avoidanceRadius(value: number) {
		if (Number.isFinite(value)) {
			this._avoidanceRadius = Math.max(0.1, value);
		}
	}

	public get patrolWaypoints(): Vector3[] {
		return this._patrolWaypoints.map((p) => p.clone());
	}

	public set patrolWaypoints(value: Vector3[]) {
		if (!Array.isArray(value)) {
			this._patrolWaypoints = [];
			return;
		}
		this._patrolWaypoints = value.filter((v) => v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)).map((v) => v.clone());
	}

	public get patrolLoop(): boolean {
		return this._patrolLoop;
	}

	public set patrolLoop(value: boolean) {
		this._patrolLoop = Boolean(value);
	}

	public setNavigationPlugin(plugin: INavigationPluginLike | null): void {
		this._navigationPlugin = plugin;
	}

	public setDestination(target: Vector3): boolean {
		this._isPatrolling = false;
		return this._setDestinationInternal(target);
	}

	private _setDestinationInternal(target: Vector3): boolean {
		if (this._isDisposed || !target || !Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.z)) {
			return false;
		}

		const currentPos = this._node.position.clone();
		const navPlugin: INavigationPluginLike | null = this._navigationPlugin ?? (this._scene as any)?.getNavigationEngine?.() ?? null;

		let computedCorners: Vector3[] | null = null;
		if (navPlugin && typeof navPlugin.computePath === "function") {
			try {
				const rawPath = navPlugin.computePath(currentPos, target);
				if (Array.isArray(rawPath) && rawPath.length > 0) {
					const validCorners = rawPath.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).map((p) => p.clone());
					if (validCorners.length > 0) {
						computedCorners = validCorners;
					}
				}
			} catch {
				computedCorners = null;
			}
		}

		if (!computedCorners) {
			computedCorners = [currentPos.clone(), target.clone()];
		}

		this._path = computedCorners;
		this._destination = target.clone();
		this._currentCornerIndex = this._path.length > 1 && Vector3.DistanceSquared(this._path[0], currentPos) < 1e-4 ? 1 : 0;
		this._isStopped = false;

		return true;
	}

	public setPath(corners: Vector3[]): void {
		if (this._isDisposed || !Array.isArray(corners)) {
			return;
		}

		this._isPatrolling = false;

		const valid = corners.filter((c) => c && Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.z)).map((c) => c.clone());

		this._path = valid;
		if (valid.length > 0) {
			this._destination = valid[valid.length - 1].clone();
			this._currentCornerIndex = valid.length > 1 && Vector3.DistanceSquared(valid[0], this._node.position) < 1e-4 ? 1 : 0;
			this._isStopped = false;
		} else {
			this._destination = null;
			this._currentCornerIndex = 0;
			this._isStopped = true;
		}
	}

	public stop(): void {
		this._velocity.setAll(0);
		this._isStopped = true;
	}

	public resume(): void {
		if (this.hasPath) {
			this._isStopped = false;
		}
	}

	public warp(position: Vector3): void {
		if (this._isDisposed || !position || !Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
			return;
		}

		this._node.position.copyFrom(position);
		this._node.computeWorldMatrix(true);
		this._path = [];
		this._destination = null;
		this._currentCornerIndex = 0;
		this._velocity.setAll(0);
		this._isPatrolling = false;
		this._isStopped = true;
	}

	public startPatrol(startIndex: number = 0): boolean {
		if (this._isDisposed || this._patrolWaypoints.length === 0) {
			return false;
		}

		const len = this._patrolWaypoints.length;
		const safeIndex = Number.isFinite(startIndex) ? ((Math.trunc(startIndex) % len) + len) % len : 0;

		this._isPatrolling = true;
		this._patrolIndex = safeIndex;

		return this._setDestinationInternal(this._patrolWaypoints[this._patrolIndex]);
	}

	public stopPatrol(): void {
		this._isPatrolling = false;
		this.stop();
	}

	public update(deltaTime: number): void {
		if (this._isDisposed || this._isStopped || !Number.isFinite(deltaTime) || deltaTime <= 0) {
			return;
		}

		if (!this.hasPath) {
			this._velocity.setAll(0);
			this._isStopped = true;
			return;
		}

		// Advance past any intermediate corners already within stoppingDistance
		while (this._currentCornerIndex < this._path.length - 1 && Vector3.Distance(this._node.position, this._path[this._currentCornerIndex]) <= this._stoppingDistance) {
			this._currentCornerIndex++;
		}

		const finalCorner = this._path[this._path.length - 1];
		if (this._currentCornerIndex === this._path.length - 1 && Vector3.Distance(this._node.position, finalCorner) <= this._stoppingDistance) {
			this._handleArrival(finalCorner);
			return;
		}

		const targetCorner = this._path[this._currentCornerIndex];
		const toCorner = targetCorner.subtract(this._node.position);
		const distToCorner = toCorner.length();

		let desiredSpeed = this._speed;
		if (this._autoBraking) {
			const totalRemaining = this.remainingDistance;
			const brakingDistance = Math.max(this._stoppingDistance * 3, (this._speed * this._speed) / (2 * Math.max(0.01, this._acceleration)));
			if (totalRemaining < brakingDistance && brakingDistance > 1e-4) {
				const factor = Math.max(0.15, Math.min(1, totalRemaining / brakingDistance));
				desiredSpeed = this._speed * factor;
			}
		}

		const desiredVelocity = distToCorner > 1e-5 ? toCorner.scale(desiredSpeed / distToCorner) : Vector3.Zero();

		if (this._obstacleAvoidance) {
			const avoidanceForce = this._computeAvoidanceForce();
			if (avoidanceForce.lengthSquared() > 0) {
				desiredVelocity.addInPlace(avoidanceForce);
				const mag = desiredVelocity.length();
				if (mag > this._speed && mag > 1e-5) {
					desiredVelocity.scaleInPlace(this._speed / mag);
				}
			}
		}

		const maxVelocityDelta = this._acceleration * deltaTime;
		const velocityDiff = desiredVelocity.subtract(this._velocity);
		const velocityDiffLen = velocityDiff.length();
		if (velocityDiffLen <= maxVelocityDelta || velocityDiffLen < 1e-6) {
			this._velocity.copyFrom(desiredVelocity);
		} else {
			this._velocity.addInPlace(velocityDiff.scale(maxVelocityDelta / velocityDiffLen));
		}

		const step = this._velocity.scale(deltaTime);
		if (step.length() >= distToCorner) {
			this._node.position.copyFrom(targetCorner);
		} else {
			this._node.position.addInPlace(step);
		}
		this._node.computeWorldMatrix(true);

		if (this._updateRotation) {
			this._applyRotation(deltaTime);
		}

		// Re-check corner progression after moving
		while (this._currentCornerIndex < this._path.length - 1 && Vector3.Distance(this._node.position, this._path[this._currentCornerIndex]) <= this._stoppingDistance) {
			this._currentCornerIndex++;
		}

		if (this._currentCornerIndex === this._path.length - 1 && Vector3.Distance(this._node.position, finalCorner) <= this._stoppingDistance) {
			this._handleArrival(finalCorner);
		}
	}

	public serialize(): INavAgentData {
		return {
			enabled: true,
			radius: this._radius,
			height: this._height,
			speed: this._speed,
			angularSpeed: this._angularSpeed,
			acceleration: this._acceleration,
			stoppingDistance: this._stoppingDistance,
			autoBraking: this._autoBraking,
			updateRotation: this._updateRotation,
			obstacleAvoidance: this._obstacleAvoidance,
			avoidanceRadius: this._avoidanceRadius,
			patrolWaypoints: this._patrolWaypoints.map((wp): INavWaypoint => ({ x: wp.x, y: wp.y, z: wp.z })),
			patrolLoop: this._patrolLoop,
		};
	}

	public static Parse(data: INavAgentData | null | undefined, node: TransformNode, scene: Scene): NavAgent {
		const safeData: INavAgentOptions = data && typeof data === "object" ? data : {};
		return new NavAgent(node, scene, safeData);
	}

	public dispose(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		this._isStopped = true;
		this._isPatrolling = false;
		this._path = [];
		this._destination = null;
		this._velocity.setAll(0);

		if (this._sceneDisposeObserver && this._scene?.onDisposeObservable) {
			this._scene.onDisposeObservable.remove(this._sceneDisposeObserver);
			this._sceneDisposeObserver = null;
		}

		const agents = NavAgent._sceneAgents.get(this._scene);
		if (agents) {
			agents.delete(this);
		}

		this.onDestinationReachedObservable.clear();
		this.onWaypointReachedObservable.clear();
	}

	private _computeAvoidanceForce(): Vector3 {
		const agents = NavAgent._sceneAgents.get(this._scene);
		if (!agents || agents.size <= 1) {
			return Vector3.Zero();
		}

		const force = Vector3.Zero();
		const myPos = this._node.position;

		for (const other of agents) {
			if (other === this || other._isDisposed) {
				continue;
			}

			const diffX = myPos.x - other._node.position.x;
			const diffZ = myPos.z - other._node.position.z;
			const distSq = diffX * diffX + diffZ * diffZ;
			const minRadius = Math.max(this._avoidanceRadius, this._radius + other._radius);

			if (distSq < minRadius * minRadius) {
				const dist = Math.sqrt(distSq);
				const weight = (minRadius - dist) / minRadius;
				if (dist > 1e-5) {
					force.x += (diffX / dist) * weight * this._speed;
					force.z += (diffZ / dist) * weight * this._speed;
				} else {
					force.x += this._speed;
				}
			}
		}

		return force;
	}

	private _applyRotation(deltaTime: number): void {
		const horizSpeedSq = this._velocity.x * this._velocity.x + this._velocity.z * this._velocity.z;
		if (horizSpeedSq <= 1e-6) {
			return;
		}

		const targetYaw = Math.atan2(this._velocity.x, this._velocity.z);
		const maxTurnRad = Tools.ToRadians(this._angularSpeed) * deltaTime;

		let currentYaw = this._node.rotation.y;
		if (this._node.rotationQuaternion) {
			const euler = this._node.rotationQuaternion.toEulerAngles();
			currentYaw = euler.y;
		}

		let deltaYaw = ((((targetYaw - currentYaw + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
		if (Math.abs(deltaYaw) > maxTurnRad) {
			deltaYaw = Math.sign(deltaYaw) * maxTurnRad;
		}

		const newYaw = currentYaw + deltaYaw;
		if (this._node.rotationQuaternion) {
			const euler = this._node.rotationQuaternion.toEulerAngles();
			Quaternion.RotationYawPitchRollToRef(newYaw, euler.x, euler.z, this._node.rotationQuaternion);
		} else {
			this._node.rotation.y = newYaw;
		}
	}

	private _handleArrival(reachedCorner: Vector3): void {
		const destClone = (this._destination ?? reachedCorner).clone();
		this._path = [];
		this._currentCornerIndex = 0;
		this._velocity.setAll(0);
		this._isStopped = true;

		this.onDestinationReachedObservable.notifyObservers(destClone);

		if (this._isPatrolling && this._patrolWaypoints.length > 0) {
			const reachedWaypointIndex = this._patrolIndex;
			this.onWaypointReachedObservable.notifyObservers(reachedWaypointIndex);

			const nextIndex = this._patrolIndex + 1;
			if (nextIndex < this._patrolWaypoints.length) {
				this._patrolIndex = nextIndex;
				this._setDestinationInternal(this._patrolWaypoints[this._patrolIndex]);
			} else if (this._patrolLoop) {
				this._patrolIndex = 0;
				this._setDestinationInternal(this._patrolWaypoints[0]);
			} else {
				this._isPatrolling = false;
			}
		}
	}
}
