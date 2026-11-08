import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

export interface ICharacterControllerOptions {
	/**
	 * Capsule radius in world units.
	 * @default 0.5
	 */
	radius?: number;

	/**
	 * Total capsule height in world units.
	 * @default 1.8
	 */
	height?: number;

	/**
	 * Mass of the character in kg.
	 * @default 70
	 */
	mass?: number;

	/**
	 * Maximum walkable slope angle in radians.
	 * Slopes steeper than this angle cause the character to slide.
	 * @default Math.PI / 4 (45 degrees)
	 */
	maxSlopeAngle?: number;

	/**
	 * Maximum height of obstacles or stairs the character can step onto without jumping.
	 * @default 0.3
	 */
	stepOffset?: number;

	/**
	 * Collision buffer/cushion thickness around the capsule.
	 * @default 0.05
	 */
	skinWidth?: number;

	/**
	 * Gravity vector applied when airborne or sliding down slopes.
	 * @default Vector3(0, -9.81, 0)
	 */
	gravity?: Vector3;

	/**
	 * Movement control multiplier while airborne (0..1).
	 * @default 0.3
	 */
	airControl?: number;

	/**
	 * Optional custom predicate to filter meshes for collision raycasting.
	 */
	collisionFilter?: (mesh: AbstractMesh) => boolean;
}

export interface ICharacterMovementState {
	/**
	 * Whether the character is currently standing on a walkable ground surface.
	 */
	isGrounded: boolean;

	/**
	 * Whether the character is currently sliding down a steep slope.
	 */
	isSliding: boolean;

	/**
	 * Whether the current ground surface angle exceeds maxSlopeAngle.
	 */
	onSteepSlope: boolean;

	/**
	 * Normal vector of the picked ground surface beneath the character.
	 */
	groundNormal: Vector3;

	/**
	 * Distance from the bottom of the capsule (feet) to the ground surface.
	 */
	groundDistance: number;

	/**
	 * Current velocity of the character in world space.
	 */
	velocity: Vector3;
}
