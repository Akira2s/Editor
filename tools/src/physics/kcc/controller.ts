import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Ray } from "@babylonjs/core/Culling/ray";

import { ICharacterControllerOptions, ICharacterMovementState } from "./types";

export class CharacterController {
	private _node: TransformNode;
	private _scene: Scene;

	private _radius: number;
	private _height: number;
	private _mass: number;
	private _maxSlopeAngle: number;
	private _stepOffset: number;
	private _skinWidth: number;
	private _gravity: Vector3;
	private _airControl: number;
	private _collisionFilter?: (mesh: AbstractMesh) => boolean;

	private _velocity: Vector3;
	private _state: ICharacterMovementState;

	/**
	 * Creates a new Kinematic Character Controller instance.
	 * @param node The TransformNode or AbstractMesh representing the character.
	 * @param scene The Babylon.js scene in which collisions and raycasts take place.
	 * @param options Configuration options for capsule geometry, slopes, steps, and gravity.
	 */
	public constructor(node: TransformNode, scene: Scene, options?: ICharacterControllerOptions) {
		this._node = node;
		this._scene = scene;

		this._radius = Math.max(0.001, options?.radius ?? 0.5);
		this._height = Math.max(0.001, options?.height ?? 1.8);
		this._mass = Math.max(0.001, options?.mass ?? 70);
		this._maxSlopeAngle = options?.maxSlopeAngle ?? Math.PI / 4;
		this._stepOffset = Math.max(0, options?.stepOffset ?? 0.3);
		this._skinWidth = Math.max(0.0001, options?.skinWidth ?? 0.05);
		this._gravity = options?.gravity ? options.gravity.clone() : new Vector3(0, -9.81, 0);
		this._airControl = options?.airControl ?? 0.3;
		this._collisionFilter = options?.collisionFilter;

		this._velocity = Vector3.Zero();
		this._state = {
			isGrounded: false,
			isSliding: false,
			onSteepSlope: false,
			groundNormal: Vector3.Up(),
			groundDistance: Number.POSITIVE_INFINITY,
			velocity: Vector3.Zero(),
		};
	}

	/**
	 * Returns the current movement and grounded state of the character.
	 */
	public get state(): ICharacterMovementState {
		return this._state;
	}

	/**
	 * Returns the TransformNode driven by this controller.
	 */
	public get node(): TransformNode {
		return this._node;
	}

	/**
	 * Returns the Scene associated with this controller.
	 */
	public get scene(): Scene {
		return this._scene;
	}

	/**
	 * Returns the capsule radius.
	 */
	public get radius(): number {
		return this._radius;
	}

	/**
	 * Sets the capsule radius.
	 */
	public set radius(value: number) {
		this._radius = Math.max(0.001, value);
	}

	/**
	 * Returns the capsule total height.
	 */
	public get height(): number {
		return this._height;
	}

	/**
	 * Sets the capsule total height.
	 */
	public set height(value: number) {
		this._height = Math.max(0.001, value);
	}

	/**
	 * Returns the mass in kg.
	 */
	public get mass(): number {
		return this._mass;
	}

	/**
	 * Sets the mass in kg.
	 */
	public set mass(value: number) {
		this._mass = Math.max(0.001, value);
	}

	/**
	 * Returns the maximum walkable slope angle in radians.
	 */
	public get maxSlopeAngle(): number {
		return this._maxSlopeAngle;
	}

	/**
	 * Sets the maximum walkable slope angle in radians.
	 */
	public set maxSlopeAngle(value: number) {
		this._maxSlopeAngle = value;
	}

	/**
	 * Returns the maximum step height for stair climbing.
	 */
	public get stepOffset(): number {
		return this._stepOffset;
	}

	/**
	 * Sets the maximum step height for stair climbing.
	 */
	public set stepOffset(value: number) {
		this._stepOffset = Math.max(0, value);
	}

	/**
	 * Returns the skin width buffer.
	 */
	public get skinWidth(): number {
		return this._skinWidth;
	}

	/**
	 * Sets the skin width buffer.
	 */
	public set skinWidth(value: number) {
		this._skinWidth = Math.max(0.0001, value);
	}

	/**
	 * Returns the gravity vector.
	 */
	public get gravity(): Vector3 {
		return this._gravity;
	}

	/**
	 * Sets the gravity vector.
	 */
	public set gravity(value: Vector3) {
		this._gravity.copyFrom(value);
	}

	/**
	 * Returns the airborne control multiplier.
	 */
	public get airControl(): number {
		return this._airControl;
	}

	/**
	 * Sets the airborne control multiplier.
	 */
	public set airControl(value: number) {
		this._airControl = value;
	}

	/**
	 * Returns the current internal velocity vector.
	 */
	public get velocity(): Vector3 {
		return this._velocity;
	}

	/**
	 * Updates the gravity vector.
	 * @param gravity The new gravity vector.
	 */
	public setGravity(gravity: Vector3): void {
		this._gravity.copyFrom(gravity);
	}

	/**
	 * Instantly teleports the character to the given position and resets velocity.
	 * @param position World target position.
	 */
	public teleport(position: Vector3): void {
		this._velocity.set(0, 0, 0);
		this._state.velocity.set(0, 0, 0);
		this._node.position.copyFrom(position);
		if (typeof this._node.computeWorldMatrix === "function") {
			this._node.computeWorldMatrix(true);
		}
	}

	/**
	 * Initiates a jump if the character is grounded and not on a steep slope.
	 * @param force Upward jump velocity in world units/sec.
	 * @returns True if the jump was successfully triggered, false otherwise.
	 */
	public jump(force: number): boolean {
		if (!Number.isFinite(force) || force <= 0) {
			return false;
		}
		if (this._state.isGrounded && !this._state.onSteepSlope) {
			this._velocity.y = force;
			this._state.velocity.y = force;
			this._state.isGrounded = false;
			return true;
		}

		return false;
	}

	/**
	 * Moves the character by the desired displacement over the given deltaTime.
	 * Handles ground detection, slope sliding, step climbing, wall deflection, and gravity accumulation.
	 * @param displacement Desired movement vector.
	 * @param deltaTime Elapsed frame time in seconds.
	 * @returns Updated movement state.
	 */
	public move(displacement: Vector3, deltaTime: number): ICharacterMovementState {
		if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
			return this._state;
		}

		if (!Number.isFinite(this._node.position.x) || !Number.isFinite(this._node.position.y) || !Number.isFinite(this._node.position.z)) {
			return this._state;
		}

		if (!Number.isFinite(displacement.x) || !Number.isFinite(displacement.y) || !Number.isFinite(displacement.z)) {
			return this._state;
		}

		if (typeof this._node.computeWorldMatrix === "function") {
			this._node.computeWorldMatrix(true);
		}
		const currentPos = this._node.getAbsolutePosition();
		const halfHeight = this._height * 0.5;
		const capsuleCenter = new Vector3(currentPos.x, currentPos.y + halfHeight, currentPos.z);

		// 1. Downward ground check (raycast from capsule center down through feet plus skinWidth)
		const checkDistance = halfHeight + (this._state.isGrounded ? Math.max(this._stepOffset, this._skinWidth) : this._skinWidth);
		const groundRay = new Ray(capsuleCenter, new Vector3(0, -1, 0), checkDistance);
		const groundPick = this._scene.pickWithRay(groundRay, (mesh) => this._meshPredicate(mesh), false);

		let isGrounded = false;
		let groundDistance = Number.POSITIVE_INFINITY;
		let groundNormal = Vector3.Up();
		const floorDepenetration = Vector3.Zero();

		if (this._velocity.y <= 0 && groundPick && groundPick.hit && groundPick.pickedPoint) {
			const rawNormal = groundPick.getNormal(true, true);
			if (rawNormal && rawNormal.lengthSquared() >= 0.0001 && rawNormal.y >= 0) {
				groundNormal = rawNormal.normalize();
			} else {
				groundNormal = Vector3.Up();
			}

			if (groundPick.distance < halfHeight) {
				// Upward ground depenetration
				const depth = halfHeight - groundPick.distance;
				floorDepenetration.y = depth;
				groundDistance = 0;
				isGrounded = true;
			} else {
				groundDistance = groundPick.distance - halfHeight;
				if (groundDistance <= this._skinWidth + 0.001) {
					isGrounded = true;
				} else if (this._state.isGrounded && groundDistance <= this._stepOffset + this._skinWidth) {
					isGrounded = true;
				}
			}
		} else if (groundPick && groundPick.hit) {
			if (groundPick.distance < halfHeight) {
				const depth = halfHeight - groundPick.distance;
				floorDepenetration.y = depth;
				groundDistance = 0;
			} else {
				groundDistance = groundPick.distance - halfHeight;
			}
			const rawNormal = groundPick.getNormal(true, true);
			if (rawNormal && rawNormal.lengthSquared() >= 0.0001 && rawNormal.y >= 0) {
				groundNormal = rawNormal.normalize();
			} else {
				groundNormal = Vector3.Up();
			}
		}

		// 2. Slope angle calculation: angle = Math.acos(Vector3.Dot(groundNormal, Vector3.Up()))
		const normalDotUp = Math.min(Math.max(Vector3.Dot(groundNormal, Vector3.Up()), -1), 1);
		const slopeAngle = Math.acos(normalDotUp);
		const onSteepSlope = isGrounded && slopeAngle > this._maxSlopeAngle;
		const isSliding = onSteepSlope;

		let slideDisplacement = Vector3.Zero();
		if (onSteepSlope) {
			// Character slides down the slope plane
			const gravityDot = Vector3.Dot(this._gravity, groundNormal);
			const slideVelocity = this._gravity.subtract(groundNormal.scale(gravityDot));
			slideDisplacement = slideVelocity.scale(deltaTime);
		}

		// 3. Horizontal movement with step climbing & 4. Wall deflection
		let horizDisp = new Vector3(displacement.x, 0, displacement.z);
		if (!isGrounded) {
			horizDisp.scaleInPlace(this._airControl);
		}

		if (onSteepSlope) {
			const flatSlideDir = new Vector3(slideDisplacement.x, 0, slideDisplacement.z);
			if (flatSlideDir.lengthSquared() > 0.0001) {
				flatSlideDir.normalize();
			}
			const uphillDot = Vector3.Dot(horizDisp, flatSlideDir);
			if (uphillDot < 0) {
				horizDisp = horizDisp.subtract(flatSlideDir.scale(uphillDot));
			}
		}

		const horizLength = horizDisp.length();
		const stepUpDisplacement = Vector3.Zero();

		if (horizLength > 0.00001) {
			const moveDir = horizDisp.scale(1 / horizLength);
			const forwardCheckDist = this._radius + horizLength + this._skinWidth;

			// Low ray at foot/step level
			const lowOrigin = new Vector3(currentPos.x, currentPos.y + Math.max(0.05, this._skinWidth), currentPos.z);
			const lowRay = new Ray(lowOrigin, moveDir, forwardCheckDist);
			const lowHit = this._scene.pickWithRay(lowRay, (mesh) => this._meshPredicate(mesh), false);
			const lowBlocked = !!(lowHit && lowHit.hit && lowHit.distance - this._radius <= horizLength + this._skinWidth);

			// Body ray at capsule center
			const bodyRay = new Ray(capsuleCenter, moveDir, forwardCheckDist);
			const bodyHit = this._scene.pickWithRay(bodyRay, (mesh) => this._meshPredicate(mesh), false);
			const bodyBlocked = !!(bodyHit && bodyHit.hit && bodyHit.distance - this._radius <= horizLength + this._skinWidth);

			// Head ray near top of capsule (head height)
			const headOrigin = new Vector3(currentPos.x, currentPos.y + this._height - 0.1, currentPos.z);
			const headRay = new Ray(headOrigin, moveDir, forwardCheckDist);
			const headHit = this._scene.pickWithRay(headRay, (mesh) => this._meshPredicate(mesh), false);
			const headBlocked = !!(headHit && headHit.hit && headHit.distance - this._radius <= horizLength + this._skinWidth);

			if (lowBlocked && !bodyBlocked && !headBlocked) {
				// Horizontal obstacle hit within stepOffset height: cast ray from step height forward
				const stepOrigin = new Vector3(currentPos.x, currentPos.y + this._stepOffset + this._skinWidth, currentPos.z);
				const stepRay = new Ray(stepOrigin, moveDir, forwardCheckDist);
				const stepHit = this._scene.pickWithRay(stepRay, (mesh) => this._meshPredicate(mesh), false);
				const stepBlocked = !!(stepHit && stepHit.hit && stepHit.distance - this._radius <= horizLength + this._skinWidth);

				if (!stepBlocked) {
					// Clear at step height: check ledge top
					const forwardDist = (lowHit?.distance ?? this._radius) + this._skinWidth + 0.02;
					const ledgeOrigin = new Vector3(
						currentPos.x + moveDir.x * forwardDist,
						currentPos.y + this._stepOffset + this._skinWidth,
						currentPos.z + moveDir.z * forwardDist
					);
					const ledgeRay = new Ray(ledgeOrigin, new Vector3(0, -1, 0), this._stepOffset + this._skinWidth * 2);
					const ledgeHit = this._scene.pickWithRay(ledgeRay, (mesh) => this._meshPredicate(mesh), false);

					if (ledgeHit && ledgeHit.hit && ledgeHit.pickedPoint) {
						const stepHeight = ledgeHit.pickedPoint.y - currentPos.y;
						if (stepHeight > 0 && stepHeight <= this._stepOffset + this._skinWidth) {
							// Ceiling headroom check before applying stepUpDisplacement
							const capsuleTopOrigin = new Vector3(currentPos.x, currentPos.y + this._height, currentPos.z);
							const headroomRay = new Ray(capsuleTopOrigin, Vector3.Up(), stepHeight + this._skinWidth);
							const headroomHit = this._scene.pickWithRay(headroomRay, (mesh) => this._meshPredicate(mesh), false);

							if (headroomHit && headroomHit.hit && headroomHit.distance < stepHeight + this._skinWidth) {
								// Insufficient ceiling clearance: cancel step-up and deflect horizontally
								stepUpDisplacement.y = 0;
								horizDisp = this._deflectDisplacement(horizDisp, lowHit?.getNormal(true, true) ?? moveDir.scale(-1));
							} else {
								stepUpDisplacement.y = stepHeight + 0.001;
							}
						} else {
							// Step height out of bounds: deflect horizontally
							horizDisp = this._deflectDisplacement(horizDisp, lowHit?.getNormal(true, true) ?? moveDir.scale(-1));
						}
					} else {
						// Ledge ray missed: deflect horizontally (no blind fallback)
						horizDisp = this._deflectDisplacement(horizDisp, lowHit?.getNormal(true, true) ?? moveDir.scale(-1));
					}
				} else {
					// Obstacle is higher than stepOffset: wall deflection
					horizDisp = this._deflectDisplacement(horizDisp, stepHit?.getNormal(true, true) ?? moveDir.scale(-1));
				}
			} else if (headBlocked || bodyBlocked || lowBlocked) {
				// Obstacle is a wall (> stepOffset): wall deflection
				const hit = headBlocked ? headHit : bodyBlocked ? bodyHit : lowHit;
				horizDisp = this._deflectDisplacement(horizDisp, hit?.getNormal(true, true) ?? moveDir.scale(-1));
			}
		}

		// 5. Gravity accumulation when not grounded: velocity.y += gravity.y * deltaTime
		if (!isGrounded) {
			this._velocity.y += this._gravity.y * deltaTime;
		} else if (this._velocity.y < 0) {
			this._velocity.y = 0;
		}

		let verticalDisp = new Vector3(0, this._velocity.y * deltaTime, 0);
		if (displacement.y !== 0) {
			verticalDisp.y += displacement.y;
		}

		if (isGrounded && !isSliding && groundDistance > 0 && groundDistance <= this._stepOffset + this._skinWidth && stepUpDisplacement.y === 0) {
			verticalDisp.y -= groundDistance;
		}

		// Ceiling check if moving upward
		if (verticalDisp.y > 0) {
			const ceilRay = new Ray(capsuleCenter, Vector3.Up(), halfHeight + verticalDisp.y + this._skinWidth);
			const ceilHit = this._scene.pickWithRay(ceilRay, (mesh) => this._meshPredicate(mesh), false);
			if (ceilHit && ceilHit.hit) {
				const maxUp = Math.max(0, ceilHit.distance - halfHeight - this._skinWidth);
				if (verticalDisp.y > maxUp) {
					verticalDisp.y = maxUp;
					if (this._velocity.y > 0) {
						this._velocity.y = 0;
					}
				}
			}
		}

		// 6. Apply displacement to node: node.position.addInPlace(effectiveDisplacement)
		const effectiveDisplacement = horizDisp.add(verticalDisp).add(stepUpDisplacement).add(floorDepenetration);
		if (isSliding) {
			effectiveDisplacement.addInPlace(slideDisplacement);
		}

		this._node.position.addInPlace(effectiveDisplacement);
		if (typeof this._node.computeWorldMatrix === "function") {
			this._node.computeWorldMatrix(true);
		}

		// Update state
		this._state.isGrounded = isGrounded;
		this._state.isSliding = isSliding;
		this._state.onSteepSlope = onSteepSlope;
		this._state.groundNormal.copyFrom(groundNormal);
		this._state.groundDistance = groundDistance;
		this._state.velocity.copyFrom(effectiveDisplacement.scale(deltaTime > 0 ? 1 / deltaTime : 0));

		return this._state;
	}

	/**
	 * Disposes of controller state and clears references.
	 */
	public dispose(): void {
		this._velocity.set(0, 0, 0);
		this._state.velocity.set(0, 0, 0);
		this._collisionFilter = undefined;
	}

	/**
	 * Projects horizontal displacement onto a wall plane to allow smooth sliding without sticking.
	 * Formula: disp - normal * Dot(disp, normal)
	 */
	private _deflectDisplacement(displacement: Vector3, normal: Vector3): Vector3 {
		const flatNormal = new Vector3(normal.x, 0, normal.z);
		if (flatNormal.lengthSquared() > 0.0001) {
			flatNormal.normalize();
		} else {
			flatNormal.copyFrom(normal).normalize();
		}

		const dot = Vector3.Dot(displacement, flatNormal);
		if (dot < 0) {
			return displacement.subtract(flatNormal.scale(dot));
		}

		return displacement;
	}

	/**
	 * Raycast filter predicate excluding the character node itself, all descendants, and disabled meshes.
	 */
	private _meshPredicate(mesh: AbstractMesh): boolean {
		if (!mesh.isEnabled()) {
			return false;
		}

		if (mesh === this._node || mesh.isDescendantOf(this._node)) {
			return false;
		}

		if (!mesh.isPickable && !mesh.checkCollisions) {
			return false;
		}

		if (this._collisionFilter && !this._collisionFilter(mesh)) {
			return false;
		}

		return true;
	}
}
