import { describe, test, expect } from "vitest";

import { orbitAround, dollyDistance, flySpeedFactor, orbitMaxElevation } from "../../../src/editor/nodes/camera-orbit-math";

const distance = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe("editor/nodes/camera-orbit-math", () => {
	const pivot = { x: 2, y: 1, z: 3 };
	// Camera on the -Z side of the pivot, looking toward +Z.
	const behind = { x: 2, y: 1, z: -7 };

	describe("orbitAround", () => {
		test("keeps the distance to the pivot", () => {
			expect(distance(orbitAround(behind, pivot, 0.3, 0), pivot)).toBeCloseTo(10, 9);
			expect(distance(orbitAround(behind, pivot, 0, 0.4), pivot)).toBeCloseTo(10, 9);

			let position = behind;
			for (let i = 0; i < 200; i++) {
				position = orbitAround(position, pivot, 0.05, 0.01);
			}
			expect(distance(position, pivot)).toBeCloseTo(10, 9);
		});

		test("moves the camera to its left when dragging right (positive yaw)", () => {
			const result = orbitAround(behind, pivot, 0.3, 0);
			// Babylon.js is left-handed: looking toward +Z, the right side is +X.
			expect(result.x).toBeLessThan(pivot.x);
			expect(result.y).toBeCloseTo(pivot.y, 9);
		});

		test("moves the camera up when dragging down (positive pitch)", () => {
			const result = orbitAround(behind, pivot, 0, 0.4);
			expect(result.y).toBeGreaterThan(pivot.y);
			expect(result.x).toBeCloseTo(pivot.x, 9);
		});

		test("clamps the elevation so the camera never reaches a pole", () => {
			const up = orbitAround(behind, pivot, 0, 10);
			expect((up.y - pivot.y) / 10).toBeCloseTo(Math.sin(orbitMaxElevation), 9);

			const down = orbitAround(behind, pivot, 0, -10);
			expect((down.y - pivot.y) / 10).toBeCloseTo(-Math.sin(orbitMaxElevation), 9);
		});

		test("a full turn returns to the start and a half turn ends on the opposite side", () => {
			expect(distance(orbitAround(behind, pivot, Math.PI * 2, 0), behind)).toBeCloseTo(0, 9);

			const half = orbitAround(behind, pivot, Math.PI, 0);
			expect(half.z).toBeCloseTo(pivot.z + 10, 9);
			expect(half.x).toBeCloseTo(pivot.x, 9);
		});

		test("does not produce NaN when the camera is at the pivot", () => {
			const result = orbitAround(pivot, pivot, 1, 1);
			expect(Number.isFinite(result.x + result.y + result.z)).toBe(true);
		});
	});

	describe("dollyDistance", () => {
		test("zooms in with a positive amount and out with a negative one", () => {
			expect(dollyDistance(10, 0.5)).toBeLessThan(10);
			expect(dollyDistance(10, -0.5)).toBeGreaterThan(10);
		});

		test("never goes below the minimum distance", () => {
			expect(dollyDistance(0.06, 5)).toBe(0.05);
			expect(dollyDistance(0.06, 5, 0.2)).toBe(0.2);
		});

		test("is proportional to the current distance", () => {
			expect(dollyDistance(100, 0.3) / 100).toBeCloseTo(dollyDistance(1, 0.3), 12);
		});
	});
});

describe("flySpeedFactor", () => {
	test("a wheel notch changes the speed by 10%, scrolling up speeds up", () => {
		expect(flySpeedFactor(-100)).toBeCloseTo(1.1, 6);
		expect(flySpeedFactor(100)).toBeCloseTo(1 / 1.1, 6);
		expect(flySpeedFactor(0)).toBe(1);
	});

	test("opposite movements cancel out", () => {
		expect(flySpeedFactor(-250) * flySpeedFactor(250)).toBeCloseTo(1, 10);
	});

	test("line and page deltas are scaled", () => {
		expect(flySpeedFactor(-3, 1)).toBeCloseTo(flySpeedFactor(-99), 6);
		expect(flySpeedFactor(-1, 2)).toBeCloseTo(flySpeedFactor(-100), 6);
	});
});
