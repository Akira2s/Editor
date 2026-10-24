/**
 * Pure math helpers for the Unity-style editor camera controls (orbit and dolly around a pivot).
 * They only use plain numbers so they can be unit tested without Babylon.js.
 * The coordinate system is Babylon.js' (left-handed, Y up): an azimuth of 0 means "on the +Z side of the pivot".
 */

export interface IOrbitVector {
	x: number;
	y: number;
	z: number;
}

/**
 * The maximum elevation (in radians) the camera can reach when orbiting. Avoids flipping over the poles.
 */
export const orbitMaxElevation = (89 * Math.PI) / 180;

/**
 * Computes the new position of a camera that orbits around the given pivot.
 * The distance to the pivot is preserved. Dragging right (positive yaw) moves the camera to the left of the view,
 * dragging down (positive pitch) moves the camera up, which is how Unity's Alt+LMB orbit behaves.
 * @param position defines the current position of the camera.
 * @param pivot defines the point the camera orbits around.
 * @param yaw defines the rotation (radians) around the world Y axis.
 * @param pitch defines the change of elevation (radians), clamped to avoid reaching the poles.
 * @returns the new position of the camera.
 */
export function orbitAround(position: IOrbitVector, pivot: IOrbitVector, yaw: number, pitch: number): IOrbitVector {
	const ox = position.x - pivot.x;
	const oy = position.y - pivot.y;
	const oz = position.z - pivot.z;

	const distance = Math.sqrt(ox * ox + oy * oy + oz * oz);
	if (distance < 1e-6) {
		return { x: position.x, y: position.y, z: position.z };
	}

	const azimuth = Math.atan2(ox, oz) + yaw;
	const elevation = Math.max(-orbitMaxElevation, Math.min(orbitMaxElevation, Math.asin(oy / distance) + pitch));

	const horizontal = Math.cos(elevation) * distance;

	return {
		x: pivot.x + Math.sin(azimuth) * horizontal,
		y: pivot.y + Math.sin(elevation) * distance,
		z: pivot.z + Math.cos(azimuth) * horizontal,
	};
}

/**
 * Computes the distance to keep from the pivot after a dolly (zoom) of the given amount.
 * The change is proportional to the current distance so zooming feels the same at any scale.
 * @param distance defines the current distance between the camera and the pivot.
 * @param amount defines the dolly amount, positive moves the camera closer.
 * @param minDistance defines the minimum distance allowed.
 * @returns the new distance between the camera and the pivot.
 */
export function dollyDistance(distance: number, amount: number, minDistance: number = 0.05): number {
	return Math.max(minDistance, distance * Math.exp(-amount));
}
