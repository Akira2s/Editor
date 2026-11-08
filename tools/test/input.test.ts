import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { Observable } from "@babylonjs/core/Misc/observable";
import { Scene } from "@babylonjs/core/scene";
import { KeyboardEventTypes, KeyboardInfo } from "@babylonjs/core/Events/keyboardEvents";
import { PointerEventTypes, PointerInfo } from "@babylonjs/core/Events/pointerEvents";

import { InputManager, IInputActionMap } from "../src/input";

describe("InputManager", () => {
	let mockScene: any;
	let keyboardObservable: Observable<KeyboardInfo>;
	let pointerObservable: Observable<PointerInfo>;
	let beforeRenderObservable: Observable<Scene>;
	let disposeObservable: Observable<Scene>;

	beforeEach(() => {
		keyboardObservable = new Observable<KeyboardInfo>();
		pointerObservable = new Observable<PointerInfo>();
		beforeRenderObservable = new Observable<Scene>();
		disposeObservable = new Observable<Scene>();

		mockScene = {
			onKeyboardObservable: keyboardObservable,
			onPointerObservable: pointerObservable,
			onBeforeRenderObservable: beforeRenderObservable,
			onDisposeObservable: disposeObservable,
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("Action Map Management", () => {
		test("should register default action map on initialization", () => {
			const manager = new InputManager(mockScene);
			const map = manager.getActionMap("PlayerControls");

			expect(map).toBeDefined();
			expect(map?.enabled).toBe(true);
			expect(map?.actions.some((a) => a.name === "Move")).toBe(true);
			expect(map?.actions.some((a) => a.name === "Look")).toBe(true);
			expect(map?.actions.some((a) => a.name === "Jump")).toBe(true);

			manager.dispose();
		});

		test("should register and unregister custom action maps", () => {
			const manager = new InputManager(mockScene);
			const customMap: IInputActionMap = {
				name: "CustomMap",
				enabled: true,
				actions: [
					{
						name: "Interact",
						type: "button",
						bindings: [{ device: "keyboard", key: "KeyE" }],
					},
				],
			};

			manager.registerActionMap(customMap);
			expect(manager.getActionMap("CustomMap")).toBe(customMap);

			manager.unregisterActionMap("CustomMap");
			expect(manager.getActionMap("CustomMap")).toBeNull();

			manager.dispose();
		});

		test("should respect disabled action maps", () => {
			const manager = new InputManager(mockScene);

			keyboardObservable.notifyObservers({
				type: KeyboardEventTypes.KEYDOWN,
				event: { code: "Space", key: " " } as KeyboardEvent,
			} as KeyboardInfo);
			manager.update();

			expect(manager.isButtonDown("Jump")).toBe(true);

			manager.setActionMapEnabled("PlayerControls", false);
			expect(manager.isButtonDown("Jump")).toBe(false);
			expect(manager.isButtonPressed("Jump")).toBe(false);
			expect(manager.getAxis2D("Move").x).toBe(0);
			expect(manager.getAxis2D("Move").y).toBe(0);

			manager.setActionMapEnabled("PlayerControls", true);
			expect(manager.isButtonDown("Jump")).toBe(true);

			manager.dispose();
		});
	});

	describe("Button States (Down, Pressed, Released)", () => {
		test("should correctly transition button pressed, down, and released states across frames", () => {
			const manager = new InputManager(mockScene);

			expect(manager.isButtonDown("Jump")).toBe(false);
			expect(manager.isButtonPressed("Jump")).toBe(false);

			// Key down
			keyboardObservable.notifyObservers({
				type: KeyboardEventTypes.KEYDOWN,
				event: { code: "Space", key: " " } as KeyboardEvent,
			} as KeyboardInfo);

			expect(manager.isButtonDown("Jump")).toBe(true);
			expect(manager.isButtonPressed("Jump")).toBe(false); // Before update()

			// Frame 1
			manager.update();
			expect(manager.isButtonDown("Jump")).toBe(true);
			expect(manager.isButtonPressed("Jump")).toBe(true);
			expect(manager.isButtonReleased("Jump")).toBe(false);

			// Frame 2 (held)
			manager.update();
			expect(manager.isButtonDown("Jump")).toBe(true);
			expect(manager.isButtonPressed("Jump")).toBe(false);
			expect(manager.isButtonReleased("Jump")).toBe(false);

			// Key up
			keyboardObservable.notifyObservers({
				type: KeyboardEventTypes.KEYUP,
				event: { code: "Space", key: " " } as KeyboardEvent,
			} as KeyboardInfo);

			expect(manager.isButtonDown("Jump")).toBe(false);

			// Frame 3 (released)
			manager.update();
			expect(manager.isButtonDown("Jump")).toBe(false);
			expect(manager.isButtonPressed("Jump")).toBe(false);
			expect(manager.isButtonReleased("Jump")).toBe(true);

			// Frame 4 (idle)
			manager.update();
			expect(manager.isButtonDown("Jump")).toBe(false);
			expect(manager.isButtonReleased("Jump")).toBe(false);

			manager.dispose();
		});
	});

	describe("2D Axis Evaluation", () => {
		test("should return Vector2(0, 0) when no inputs are active", () => {
			const manager = new InputManager(mockScene);
			const axis = manager.getAxis2D("Move");

			expect(axis).toBeDefined();
			expect(axis.x).toBe(0);
			expect(axis.y).toBe(0);

			manager.dispose();
		});

		test("should evaluate WASD composite 2D movement and cancel opposite keys", () => {
			const manager = new InputManager(mockScene);

			// Press W (Forward / +Y)
			keyboardObservable.notifyObservers({
				type: KeyboardEventTypes.KEYDOWN,
				event: { code: "KeyW", key: "w" } as KeyboardEvent,
			} as KeyboardInfo);
			manager.update();

			let move = manager.getAxis2D("Move");
			expect(move.x).toBe(0);
			expect(move.y).toBe(1);

			// Press D (+X) -> Diagonal W + D
			keyboardObservable.notifyObservers({
				type: KeyboardEventTypes.KEYDOWN,
				event: { code: "KeyD", key: "d" } as KeyboardEvent,
			} as KeyboardInfo);
			manager.update();

			move = manager.getAxis2D("Move");
			expect(move.x).toBe(1);
			expect(move.y).toBe(1);

			// Also press S (-Y) -> W + S cancel out to y = 0
			keyboardObservable.notifyObservers({
				type: KeyboardEventTypes.KEYDOWN,
				event: { code: "KeyS", key: "s" } as KeyboardEvent,
			} as KeyboardInfo);
			manager.update();

			move = manager.getAxis2D("Move");
			expect(move.x).toBe(1);
			expect(move.y).toBe(0);

			manager.dispose();
		});
	});

	describe("Mouse Look & Pointer Deltas", () => {
		test("should accumulate mouse movement and evaluate look axis", () => {
			const manager = new InputManager(mockScene);

			pointerObservable.notifyObservers({
				type: PointerEventTypes.POINTERMOVE,
				event: { movementX: 10, movementY: -5 } as MouseEvent,
			} as unknown as PointerInfo);

			pointerObservable.notifyObservers({
				type: PointerEventTypes.POINTERMOVE,
				event: { movementX: 5, movementY: 2 } as MouseEvent,
			} as unknown as PointerInfo);

			manager.update();

			const look = manager.getAxis2D("Look");
			expect(look.x).toBe(15);
			expect(look.y).toBe(-3);

			// Next frame without movement should reset to 0
			manager.update();
			const lookNext = manager.getAxis2D("Look");
			expect(lookNext.x).toBe(0);
			expect(lookNext.y).toBe(0);

			manager.dispose();
		});
	});

	describe("Gamepad Polling & Deadzones", () => {
		test("should filter gamepad axis within deadzone and scale outside deadzone", () => {
			const manager = new InputManager(mockScene);

			const mockGamepad: any = {
				connected: true,
				buttons: new Array(17).fill(null).map(() => ({ pressed: false, value: 0 })),
				axes: [0.1, -0.6, 0, 0], // axes[0] = 0.1 (within 0.15 deadzone), axes[1] = -0.6 (outside deadzone)
			};

			vi.stubGlobal("navigator", {
				getGamepads: () => [mockGamepad],
			});

			manager.update();

			const move = manager.getAxis2D("Move");
			// axes[0] (0.1) <= deadzone (0.15) -> 0
			expect(move.x).toBe(0);

			// axes[1] is LeftStickY: -0.6.
			// deadzone filtered: -1 * ((0.6 - 0.15) / 0.85) = -0.45 / 0.85 ≈ -0.5294.
			// LeftStickY has scale: -1 in default map -> -(-0.5294) ≈ +0.5294.
			expect(move.y).toBeCloseTo(0.5294, 3);

			manager.dispose();
		});
	});

	describe("Disposal & Lifecycle", () => {
		test("should cleanly unsubscribe all observers on dispose", () => {
			const manager = new InputManager(mockScene);

			expect(keyboardObservable.hasObservers()).toBe(true);
			expect(pointerObservable.hasObservers()).toBe(true);
			expect(beforeRenderObservable.hasObservers()).toBe(true);
			expect(disposeObservable.hasObservers()).toBe(true);

			manager.dispose();

			expect(keyboardObservable.hasObservers()).toBe(false);
			expect(pointerObservable.hasObservers()).toBe(false);
			expect(beforeRenderObservable.hasObservers()).toBe(false);
			expect(disposeObservable.hasObservers()).toBe(false);
		});

		test("should return safe values when queried after disposal", () => {
			const manager = new InputManager(mockScene);
			manager.dispose();

			expect(manager.isButtonDown("Jump")).toBe(false);
			expect(manager.isButtonPressed("Jump")).toBe(false);
			expect(manager.isButtonReleased("Jump")).toBe(false);
			expect(manager.getAxis1D("Move")).toBe(0);

			const axis = manager.getAxis2D("Move");
			expect(axis.x).toBe(0);
			expect(axis.y).toBe(0);
		});

		test("should automatically dispose when scene is disposed", () => {
			const manager = new InputManager(mockScene);
			const disposeSpy = vi.spyOn(manager, "dispose");

			disposeObservable.notifyObservers(mockScene);

			expect(disposeSpy).toHaveBeenCalledTimes(1);
			expect(keyboardObservable.hasObservers()).toBe(false);
		});
	});

	describe("Adversarial Edge Cases", () => {
		test("should guard deadzone >= 1.0 and NaN axis values against division by zero", () => {
			const manager = new InputManager(mockScene);
			manager.registerActionMap({
				name: "EdgeDeadzone",
				enabled: true,
				actions: [
					{
						name: "Stick",
						type: "axis1d",
						bindings: [{ device: "gamepad", gamepadAxis: 0, deadzone: 1.0 }],
					},
				],
			});

			const mockGamepad: any = {
				connected: true,
				buttons: new Array(17).fill({ pressed: false, value: 0 }),
				axes: [1.5, Number.NaN, 0, 0],
			};

			vi.stubGlobal("navigator", {
				getGamepads: () => [mockGamepad],
			});

			manager.update();
			expect(manager.getAxis1D("Stick")).toBe(0);
			expect(Number.isNaN(manager.getAxis2D("Move").y)).toBe(false);

			manager.dispose();
		});

		test("should detect isButtonPressed and isButtonReleased for gamepadAxis bindings", () => {
			const manager = new InputManager(mockScene);
			manager.registerActionMap({
				name: "TriggerButton",
				enabled: true,
				actions: [
					{
						name: "Fire",
						type: "button",
						bindings: [{ device: "gamepad", gamepadAxis: 2, deadzone: 0.5 }],
					},
				],
			});

			const mockGamepad: any = {
				connected: true,
				buttons: new Array(17).fill({ pressed: false, value: 0 }),
				axes: [0, 0, 0, 0],
			};

			vi.stubGlobal("navigator", {
				getGamepads: () => [mockGamepad],
			});

			// Frame 1: axis idle
			manager.update();
			expect(manager.isButtonDown("Fire")).toBe(false);
			expect(manager.isButtonPressed("Fire")).toBe(false);

			// Frame 2: axis crosses threshold -> pressed & down
			mockGamepad.axes[2] = 0.8;
			manager.update();
			expect(manager.isButtonDown("Fire")).toBe(true);
			expect(manager.isButtonPressed("Fire")).toBe(true);
			expect(manager.isButtonReleased("Fire")).toBe(false);

			// Frame 3: axis held -> down, not pressed
			manager.update();
			expect(manager.isButtonDown("Fire")).toBe(true);
			expect(manager.isButtonPressed("Fire")).toBe(false);

			// Frame 4: axis released -> released
			mockGamepad.axes[2] = 0.1;
			manager.update();
			expect(manager.isButtonDown("Fire")).toBe(false);
			expect(manager.isButtonReleased("Fire")).toBe(true);

			manager.dispose();
		});

		test("should keep generic Shift alias held when releasing ShiftRight while ShiftLeft is still held", () => {
			const manager = new InputManager(mockScene);
			manager.registerActionMap({
				name: "ModifierMap",
				enabled: true,
				actions: [
					{
						name: "AnyShift",
						type: "button",
						bindings: [{ device: "keyboard", key: "Shift" }],
					},
				],
			});

			// Hold ShiftLeft and ShiftRight
			keyboardObservable.notifyObservers({
				type: KeyboardEventTypes.KEYDOWN,
				event: { code: "ShiftLeft", key: "Shift" } as KeyboardEvent,
			} as KeyboardInfo);
			keyboardObservable.notifyObservers({
				type: KeyboardEventTypes.KEYDOWN,
				event: { code: "ShiftRight", key: "Shift" } as KeyboardEvent,
			} as KeyboardInfo);
			manager.update();
			expect(manager.isButtonDown("AnyShift")).toBe(true);

			// Release ShiftRight while ShiftLeft remains held
			keyboardObservable.notifyObservers({
				type: KeyboardEventTypes.KEYUP,
				event: { code: "ShiftRight", key: "Shift" } as KeyboardEvent,
			} as KeyboardInfo);
			manager.update();
			expect(manager.isButtonDown("AnyShift")).toBe(true);

			// Release ShiftLeft -> now generic Shift should be released
			keyboardObservable.notifyObservers({
				type: KeyboardEventTypes.KEYUP,
				event: { code: "ShiftLeft", key: "Shift" } as KeyboardEvent,
			} as KeyboardInfo);
			manager.update();
			expect(manager.isButtonDown("AnyShift")).toBe(false);
			expect(manager.isButtonReleased("AnyShift")).toBe(true);

			manager.dispose();
		});
	});
});
