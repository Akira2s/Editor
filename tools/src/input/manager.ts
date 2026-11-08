import { Scene } from "@babylonjs/core/scene";
import { Vector2 } from "@babylonjs/core/Maths/math.vector";
import { Observer } from "@babylonjs/core/Misc/observable";
import { KeyboardEventTypes, KeyboardInfo } from "@babylonjs/core/Events/keyboardEvents";
import { PointerEventTypes, PointerInfo } from "@babylonjs/core/Events/pointerEvents";

import {
	GamepadAxisIndex,
	GamepadButtonIndex,
	IInputActionMap,
	IInputBinding,
} from "./types";

/**
 * Unified Input Action Manager supporting keyboard, mouse, gamepad, and custom action maps.
 */
export class InputManager {
	private _scene: Scene | null = null;
	private _actionMaps: Map<string, IInputActionMap> = new Map<string, IInputActionMap>();

	// Keyboard tracking
	private _heldKeys: Set<string> = new Set<string>();
	private _pressedKeys: Set<string> = new Set<string>();
	private _releasedKeys: Set<string> = new Set<string>();
	private _keysDownQueue: Set<string> = new Set<string>();
	private _keysUpQueue: Set<string> = new Set<string>();

	// Mouse tracking
	private _heldMouseButtons: Set<number> = new Set<number>();
	private _mousePressedButtons: Set<number> = new Set<number>();
	private _mouseReleasedButtons: Set<number> = new Set<number>();
	private _mouseDownQueue: Set<number> = new Set<number>();
	private _mouseUpQueue: Set<number> = new Set<number>();
	private _mouseDelta: Vector2 = new Vector2(0, 0);
	private _accumulatedPointerDeltaX: number = 0;
	private _accumulatedPointerDeltaY: number = 0;
	private _lastPointerX: number | null = null;
	private _lastPointerY: number | null = null;

	// Gamepad tracking
	private _currentGamepadButtons: boolean[] = new Array(17).fill(false);
	private _previousGamepadButtons: boolean[] = new Array(17).fill(false);
	private _currentGamepadAxes: number[] = new Array(4).fill(0);

	// Babylon observers
	private _keyboardObserver: Observer<KeyboardInfo> | null = null;
	private _pointerObserver: Observer<PointerInfo> | null = null;
	private _beforeRenderObserver: Observer<Scene> | null = null;
	private _sceneDisposeObserver: Observer<Scene> | null = null;

	// Window event listeners (fallback when scene is null)
	private _windowKeyDownHandler: ((event: KeyboardEvent) => void) | null = null;
	private _windowKeyUpHandler: ((event: KeyboardEvent) => void) | null = null;
	private _windowMouseDownHandler: ((event: MouseEvent) => void) | null = null;
	private _windowMouseUpHandler: ((event: MouseEvent) => void) | null = null;
	private _windowMouseMoveHandler: ((event: MouseEvent) => void) | null = null;

	private _isDisposed: boolean = false;

	/**
	 * Instantiates a new InputManager attached to the optional Babylon.js Scene.
	 * If no scene is provided, window listeners are used when running in a browser environment.
	 * Registers default action map upon initialization.
	 */
	public constructor(scene?: Scene | null) {
		this._scene = scene ?? null;

		if (this._scene) {
			this._keyboardObserver = this._scene.onKeyboardObservable.add((kbInfo: KeyboardInfo) => {
				this._handleKeyboardInfo(kbInfo);
			});

			this._pointerObserver = this._scene.onPointerObservable.add((pInfo: PointerInfo) => {
				this._handlePointerInfo(pInfo);
			});

			this._beforeRenderObserver = this._scene.onBeforeRenderObservable.add(() => {
				this.update();
			});

			this._sceneDisposeObserver = this._scene.onDisposeObservable.addOnce(() => {
				this.dispose();
			});
		} else if (typeof window !== "undefined") {
			this._windowKeyDownHandler = (event: KeyboardEvent): void => {
				this._processKeyDown(event.code, event.key);
			};
			this._windowKeyUpHandler = (event: KeyboardEvent): void => {
				this._processKeyUp(event.code, event.key);
			};
			this._windowMouseDownHandler = (event: MouseEvent): void => {
				this._processMouseDown(event.button);
			};
			this._windowMouseUpHandler = (event: MouseEvent): void => {
				this._processMouseUp(event.button);
			};
			this._windowMouseMoveHandler = (event: MouseEvent): void => {
				this._processMouseMove(event.movementX, event.movementY, event.clientX, event.clientY);
			};

			window.addEventListener("keydown", this._windowKeyDownHandler);
			window.addEventListener("keyup", this._windowKeyUpHandler);
			window.addEventListener("mousedown", this._windowMouseDownHandler);
			window.addEventListener("mouseup", this._windowMouseUpHandler);
			window.addEventListener("mousemove", this._windowMouseMoveHandler);
		}

		this.registerActionMap(InputManager.CreateDefaultActionMap());
	}

	/**
	 * Gets the attached Babylon.js Scene, if any.
	 */
	public get scene(): Scene | null {
		return this._scene;
	}

	/**
	 * Returns true if the action's button is currently held down.
	 */
	public isButtonDown(actionName: string): boolean {
		if (this._isDisposed) {
			return false;
		}

		for (const map of this._actionMaps.values()) {
			if (!map.enabled) {
				continue;
			}

			for (const action of map.actions) {
				if (action.name !== actionName) {
					continue;
				}

				for (const binding of action.bindings) {
					if (this._isBindingDown(binding)) {
						return true;
					}
				}
			}
		}

		return false;
	}

	/**
	 * Returns true if the action's button was pressed down during the current frame.
	 */
	public isButtonPressed(actionName: string): boolean {
		if (this._isDisposed) {
			return false;
		}

		for (const map of this._actionMaps.values()) {
			if (!map.enabled) {
				continue;
			}

			for (const action of map.actions) {
				if (action.name !== actionName) {
					continue;
				}

				for (const binding of action.bindings) {
					if (this._isBindingPressed(binding)) {
						return true;
					}
				}
			}
		}

		return false;
	}

	/**
	 * Returns true if the action's button was released during the current frame.
	 */
	public isButtonReleased(actionName: string): boolean {
		if (this._isDisposed) {
			return false;
		}

		for (const map of this._actionMaps.values()) {
			if (!map.enabled) {
				continue;
			}

			for (const action of map.actions) {
				if (action.name !== actionName) {
					continue;
				}

				for (const binding of action.bindings) {
					if (this._isBindingReleased(binding)) {
						return true;
					}
				}
			}
		}

		return false;
	}

	/**
	 * Evaluates and returns the aggregated 1D scalar value for the specified action.
	 */
	public getAxis1D(actionName: string): number {
		if (this._isDisposed) {
			return 0;
		}

		let total: number = 0;

		for (const map of this._actionMaps.values()) {
			if (!map.enabled) {
				continue;
			}

			for (const action of map.actions) {
				if (action.name !== actionName) {
					continue;
				}

				for (const binding of action.bindings) {
					const scale = binding.scale ?? 1.0;

					switch (binding.device) {
						case "keyboard":
							if (binding.key && this._isKeyHeld(binding.key)) {
								total += 1.0 * scale;
							}
							break;

						case "mouse":
							if (binding.mouseButton !== undefined) {
								if (this._heldMouseButtons.has(binding.mouseButton)) {
									total += 1.0 * scale;
								}
							} else if (binding.axis === "y") {
								total += this._mouseDelta.y * scale;
							} else {
								total += this._mouseDelta.x * scale;
							}
							break;

						case "gamepad":
							if (binding.gamepadAxis !== undefined) {
								const raw = this._currentGamepadAxes[binding.gamepadAxis] ?? 0;
								const filtered = this._applyDeadzone(raw, binding.deadzone ?? 0.15);
								total += filtered * scale;
							} else if (binding.gamepadButton !== undefined && this._currentGamepadButtons[binding.gamepadButton]) {
								total += 1.0 * scale;
							}
							break;
					}
				}
			}
		}

		return total;
	}

	/**
	 * Evaluates and returns the aggregated 2D vector value for the specified action.
	 */
	public getAxis2D(actionName: string): Vector2 {
		const result: Vector2 = new Vector2(0, 0);
		if (this._isDisposed) {
			return result;
		}

		for (const map of this._actionMaps.values()) {
			if (!map.enabled) {
				continue;
			}

			for (const action of map.actions) {
				if (action.name !== actionName) {
					continue;
				}

				for (const binding of action.bindings) {
					const scale = binding.scale ?? 1.0;

					switch (binding.device) {
						case "keyboard":
							if (binding.key && this._isKeyHeld(binding.key)) {
								if (binding.axis === "x") {
									result.x += 1.0 * scale;
								} else if (binding.axis === "y") {
									result.y += 1.0 * scale;
								} else {
									const k = binding.key.toLowerCase();
									if (k === "keyd" || k === "arrowright" || k === "d") {
										result.x += 1.0 * scale;
									} else if (k === "keya" || k === "arrowleft" || k === "a") {
										result.x -= 1.0 * scale;
									} else if (k === "keyw" || k === "arrowup" || k === "w") {
										result.y += 1.0 * scale;
									} else if (k === "keys" || k === "arrowdown" || k === "s") {
										result.y -= 1.0 * scale;
									}
								}
							}
							break;

						case "mouse":
							if (binding.axis === "x") {
								result.x += this._mouseDelta.x * scale;
							} else if (binding.axis === "y") {
								result.y += this._mouseDelta.y * scale;
							} else {
								result.x += this._mouseDelta.x * scale;
								result.y += this._mouseDelta.y * scale;
							}
							break;

						case "gamepad":
							if (binding.gamepadAxis !== undefined) {
								const raw = this._currentGamepadAxes[binding.gamepadAxis] ?? 0;
								const filtered = this._applyDeadzone(raw, binding.deadzone ?? 0.15);
								const val = filtered * scale;

								if (binding.axis === "x") {
									result.x += val;
								} else if (binding.axis === "y") {
									result.y += val;
								} else if (binding.gamepadAxis === GamepadAxisIndex.LeftStickX || binding.gamepadAxis === GamepadAxisIndex.RightStickX) {
									result.x += val;
								} else if (binding.gamepadAxis === GamepadAxisIndex.LeftStickY || binding.gamepadAxis === GamepadAxisIndex.RightStickY) {
									result.y += val;
								}
							}
							break;
					}
				}
			}
		}

		return result;
	}

	/**
	 * Registers a new action map, overwriting any map with an identical name.
	 */
	public registerActionMap(map: IInputActionMap): void {
		this._actionMaps.set(map.name, map);
	}

	/**
	 * Unregisters an action map by its name.
	 */
	public unregisterActionMap(mapName: string): void {
		this._actionMaps.delete(mapName);
	}

	/**
	 * Sets the enabled status of the specified action map.
	 */
	public setActionMapEnabled(mapName: string, enabled: boolean): void {
		const map = this._actionMaps.get(mapName);
		if (map) {
			map.enabled = enabled;
		}
	}

	/**
	 * Retrieves an action map by name, or null if not registered.
	 */
	public getActionMap(mapName: string): IInputActionMap | null {
		return this._actionMaps.get(mapName) ?? null;
	}

	/**
	 * Updates the frame-based delta states (pressed/released deltas, mouse deltas, gamepad polling).
	 * Automatically called by Scene.onBeforeRenderObservable when a scene is provided.
	 */
	public update(): void {
		if (this._isDisposed) {
			return;
		}

		// Transfer queued keyboard state
		this._pressedKeys.clear();
		for (const k of this._keysDownQueue) {
			this._pressedKeys.add(k);
		}
		this._keysDownQueue.clear();

		this._releasedKeys.clear();
		for (const k of this._keysUpQueue) {
			this._releasedKeys.add(k);
		}
		this._keysUpQueue.clear();

		// Transfer queued mouse button state
		this._mousePressedButtons.clear();
		for (const b of this._mouseDownQueue) {
			this._mousePressedButtons.add(b);
		}
		this._mouseDownQueue.clear();

		this._mouseReleasedButtons.clear();
		for (const b of this._mouseUpQueue) {
			this._mouseReleasedButtons.add(b);
		}
		this._mouseUpQueue.clear();

		// Apply accumulated mouse delta
		this._mouseDelta.x = this._accumulatedPointerDeltaX;
		this._mouseDelta.y = this._accumulatedPointerDeltaY;
		this._accumulatedPointerDeltaX = 0;
		this._accumulatedPointerDeltaY = 0;

		// Poll gamepad
		this._pollGamepad();
	}

	/**
	 * Disposes the input manager, unregistering all observables and event listeners.
	 */
	public dispose(): void {
		if (this._isDisposed) {
			return;
		}

		this._isDisposed = true;

		if (this._keyboardObserver && this._scene) {
			this._scene.onKeyboardObservable?.remove(this._keyboardObserver);
			this._keyboardObserver = null;
		}

		if (this._pointerObserver && this._scene) {
			this._scene.onPointerObservable?.remove(this._pointerObserver);
			this._pointerObserver = null;
		}

		if (this._beforeRenderObserver && this._scene) {
			this._scene.onBeforeRenderObservable?.remove(this._beforeRenderObserver);
			this._beforeRenderObserver = null;
		}

		if (this._sceneDisposeObserver && this._scene) {
			this._scene.onDisposeObservable?.remove(this._sceneDisposeObserver);
			this._sceneDisposeObserver = null;
		}

		if (typeof window !== "undefined") {
			if (this._windowKeyDownHandler) {
				window.removeEventListener("keydown", this._windowKeyDownHandler);
				this._windowKeyDownHandler = null;
			}
			if (this._windowKeyUpHandler) {
				window.removeEventListener("keyup", this._windowKeyUpHandler);
				this._windowKeyUpHandler = null;
			}
			if (this._windowMouseDownHandler) {
				window.removeEventListener("mousedown", this._windowMouseDownHandler);
				this._windowMouseDownHandler = null;
			}
			if (this._windowMouseUpHandler) {
				window.removeEventListener("mouseup", this._windowMouseUpHandler);
				this._windowMouseUpHandler = null;
			}
			if (this._windowMouseMoveHandler) {
				window.removeEventListener("mousemove", this._windowMouseMoveHandler);
				this._windowMouseMoveHandler = null;
			}
		}

		this._actionMaps.clear();
		this._heldKeys.clear();
		this._pressedKeys.clear();
		this._releasedKeys.clear();
		this._keysDownQueue.clear();
		this._keysUpQueue.clear();
		this._heldMouseButtons.clear();
		this._mousePressedButtons.clear();
		this._mouseReleasedButtons.clear();
		this._mouseDownQueue.clear();
		this._mouseUpQueue.clear();

		this._lastPointerX = null;
		this._lastPointerY = null;
		this._mouseDelta.set(0, 0);
		this._accumulatedPointerDeltaX = 0;
		this._accumulatedPointerDeltaY = 0;

		this._currentGamepadButtons.fill(false);
		this._previousGamepadButtons.fill(false);
		this._currentGamepadAxes.fill(0);

		this._scene = null;
	}

	/**
	 * Creates a default action map preconfigured with standard WASD/Arrows for Move,
	 * Mouse/RightStick for Look, Space/GamepadA for Jump, and LeftShift/GamepadB for Sprint.
	 */
	public static CreateDefaultActionMap(): IInputActionMap {
		return {
			name: "PlayerControls",
			enabled: true,
			actions: [
				{
					name: "Move",
					type: "axis2d",
					bindings: [
						// Keyboard WASD
						{ device: "keyboard", key: "KeyW", axis: "y", scale: 1 },
						{ device: "keyboard", key: "KeyS", axis: "y", scale: -1 },
						{ device: "keyboard", key: "KeyA", axis: "x", scale: -1 },
						{ device: "keyboard", key: "KeyD", axis: "x", scale: 1 },
						// Keyboard Arrow keys
						{ device: "keyboard", key: "ArrowUp", axis: "y", scale: 1 },
						{ device: "keyboard", key: "ArrowDown", axis: "y", scale: -1 },
						{ device: "keyboard", key: "ArrowLeft", axis: "x", scale: -1 },
						{ device: "keyboard", key: "ArrowRight", axis: "x", scale: 1 },
						// Gamepad Left Stick
						{ device: "gamepad", gamepadAxis: GamepadAxisIndex.LeftStickX, axis: "x", deadzone: 0.15, scale: 1 },
						{ device: "gamepad", gamepadAxis: GamepadAxisIndex.LeftStickY, axis: "y", deadzone: 0.15, scale: -1 },
					],
				},
				{
					name: "Look",
					type: "axis2d",
					bindings: [
						// Mouse delta
						{ device: "mouse", scale: 1 },
						// Gamepad Right Stick
						{ device: "gamepad", gamepadAxis: GamepadAxisIndex.RightStickX, axis: "x", deadzone: 0.15, scale: 1 },
						{ device: "gamepad", gamepadAxis: GamepadAxisIndex.RightStickY, axis: "y", deadzone: 0.15, scale: -1 },
					],
				},
				{
					name: "Jump",
					type: "button",
					bindings: [
						{ device: "keyboard", key: "Space" },
						{ device: "gamepad", gamepadButton: GamepadButtonIndex.A },
					],
				},
				{
					name: "Sprint",
					type: "button",
					bindings: [
						{ device: "keyboard", key: "ShiftLeft" },
						{ device: "gamepad", gamepadButton: GamepadButtonIndex.B },
					],
				},
			],
		};
	}

	// ==========================================
	// Private Helper Methods
	// ==========================================

	private _handleKeyboardInfo(kbInfo: KeyboardInfo): void {
		const evt = kbInfo.event;
		if (!evt) {
			return;
		}

		if (kbInfo.type === KeyboardEventTypes.KEYDOWN) {
			this._processKeyDown(evt.code, evt.key);
		} else if (kbInfo.type === KeyboardEventTypes.KEYUP) {
			this._processKeyUp(evt.code, evt.key);
		}
	}

	private _handlePointerInfo(pInfo: PointerInfo): void {
		const evt = pInfo.event as PointerEvent | MouseEvent | undefined;
		if (!evt) {
			return;
		}

		if (pInfo.type === PointerEventTypes.POINTERDOWN) {
			this._processMouseDown(evt.button);
		} else if (pInfo.type === PointerEventTypes.POINTERUP) {
			this._processMouseUp(evt.button);
		} else if (pInfo.type === PointerEventTypes.POINTERMOVE) {
			this._processMouseMove(evt.movementX, evt.movementY, evt.clientX, evt.clientY);
		}
	}

	private _normalizeKey(key: string): string[] {
		const result: string[] = [key, key.toLowerCase()];
		if (key.startsWith("Key") && key.length === 4) {
			const char = key.substring(3);
			result.push(char, char.toLowerCase());
		}
		if (key.startsWith("Digit") && key.length === 6) {
			const char = key.substring(5);
			result.push(char);
		}
		if (key === " " || key.toLowerCase() === "space") {
			result.push(" ", "Space", "space");
		}
		if (key === "ShiftLeft" || key.toLowerCase() === "shiftleft") {
			result.push("ShiftLeft", "shiftleft", "Shift", "shift");
		} else if (key === "ShiftRight" || key.toLowerCase() === "shiftright") {
			result.push("ShiftRight", "shiftright", "Shift", "shift");
		} else if (key.toLowerCase() === "shift") {
			result.push("Shift", "shift");
		}

		if (key === "ControlLeft" || key.toLowerCase() === "controlleft") {
			result.push("ControlLeft", "controlleft", "Control", "control");
		} else if (key === "ControlRight" || key.toLowerCase() === "controlright") {
			result.push("ControlRight", "controlright", "Control", "control");
		} else if (key.toLowerCase() === "control") {
			result.push("Control", "control");
		}

		if (key === "AltLeft" || key.toLowerCase() === "altleft") {
			result.push("AltLeft", "altleft", "Alt", "alt");
		} else if (key === "AltRight" || key.toLowerCase() === "altright") {
			result.push("AltRight", "altright", "Alt", "alt");
		} else if (key.toLowerCase() === "alt") {
			result.push("Alt", "alt");
		}
		return result;
	}

	private _processKeyDown(code?: string, key?: string): void {
		const candidates: string[] = [];
		if (code) {
			candidates.push(...this._normalizeKey(code));
		}
		if (key) {
			candidates.push(...this._normalizeKey(key));
		}

		const aliases = new Set<string>(candidates);
		for (const alias of aliases) {
			if (!this._heldKeys.has(alias)) {
				this._keysDownQueue.add(alias);
			}
			this._heldKeys.add(alias);
		}
	}

	private _processKeyUp(code?: string, key?: string): void {
		const candidates: string[] = [];
		if (code) {
			candidates.push(...this._normalizeKey(code));
		}
		if (key) {
			candidates.push(...this._normalizeKey(key));
		}

		const aliases = new Set<string>(candidates);
		for (const alias of aliases) {
			if (this._heldKeys.has(alias)) {
				this._keysUpQueue.add(alias);
			}
			this._heldKeys.delete(alias);
		}
	}

	private _processMouseDown(button?: number): void {
		if (button === undefined || button < 0) {
			return;
		}

		if (!this._heldMouseButtons.has(button)) {
			this._mouseDownQueue.add(button);
		}
		this._heldMouseButtons.add(button);
	}

	private _processMouseUp(button?: number): void {
		if (button === undefined || button < 0) {
			return;
		}

		if (this._heldMouseButtons.has(button)) {
			this._mouseUpQueue.add(button);
		}
		this._heldMouseButtons.delete(button);
	}

	private _processMouseMove(movementX?: number, movementY?: number, clientX?: number, clientY?: number): void {
		let dx = movementX;
		let dy = movementY;

		if (dx === undefined || dy === undefined) {
			if (clientX !== undefined && clientY !== undefined && this._lastPointerX !== null && this._lastPointerY !== null) {
				dx = clientX - this._lastPointerX;
				dy = clientY - this._lastPointerY;
			} else {
				dx = 0;
				dy = 0;
			}
		}

		if (clientX !== undefined && clientY !== undefined) {
			this._lastPointerX = clientX;
			this._lastPointerY = clientY;
		}

		this._accumulatedPointerDeltaX += dx;
		this._accumulatedPointerDeltaY += dy;
	}

	private _pollGamepad(): void {
		for (let i = 0; i < 17; i++) {
			this._previousGamepadButtons[i] = this._currentGamepadButtons[i] || false;
		}

		if (typeof navigator === "undefined" || !navigator.getGamepads) {
			return;
		}

		const gamepads = navigator.getGamepads();
		let activeGamepad: Gamepad | null = null;

		for (let i = 0; i < gamepads.length; i++) {
			const gp = gamepads[i];
			if (gp && gp.connected) {
				activeGamepad = gp;
				break;
			}
		}

		if (activeGamepad) {
			for (let i = 0; i < 17; i++) {
				const btn = activeGamepad.buttons[i];
				this._currentGamepadButtons[i] = (btn?.pressed || (btn?.value ?? 0) > 0.5) ?? false;
			}

			for (let i = 0; i < 4; i++) {
				this._currentGamepadAxes[i] = activeGamepad.axes[i] ?? 0;
			}
		} else {
			this._currentGamepadButtons.fill(false);
			this._currentGamepadAxes.fill(0);
		}
	}

	private _isKeyHeld(key?: string): boolean {
		if (!key) {
			return false;
		}
		return this._heldKeys.has(key) || this._heldKeys.has(key.toLowerCase());
	}

	private _isKeyPressed(key?: string): boolean {
		if (!key) {
			return false;
		}
		return this._pressedKeys.has(key) || this._pressedKeys.has(key.toLowerCase());
	}

	private _isKeyReleased(key?: string): boolean {
		if (!key) {
			return false;
		}
		return this._releasedKeys.has(key) || this._releasedKeys.has(key.toLowerCase());
	}

	private _isBindingDown(binding: IInputBinding): boolean {
		switch (binding.device) {
			case "keyboard":
				return this._isKeyHeld(binding.key);

			case "mouse":
				return binding.mouseButton !== undefined ? this._heldMouseButtons.has(binding.mouseButton) : false;

			case "gamepad":
				if (binding.gamepadButton !== undefined) {
					return this._currentGamepadButtons[binding.gamepadButton] === true;
				}
				if (binding.gamepadAxis !== undefined) {
					const threshold = binding.deadzone ?? 0.5;
					const axisVal = this._currentGamepadAxes[binding.gamepadAxis] ?? 0;
					return (binding.scale !== undefined && binding.scale < 0) ? axisVal < -threshold : axisVal > threshold;
				}
				return false;

			default:
				return false;
		}
	}

	private _isBindingPressed(binding: IInputBinding): boolean {
		switch (binding.device) {
			case "keyboard":
				return this._isKeyPressed(binding.key);

			case "mouse":
				return binding.mouseButton !== undefined ? this._mousePressedButtons.has(binding.mouseButton) : false;

			case "gamepad":
				if (binding.gamepadButton !== undefined) {
					return this._currentGamepadButtons[binding.gamepadButton] === true && !this._previousGamepadButtons[binding.gamepadButton];
				}
				return false;

			default:
				return false;
		}
	}

	private _isBindingReleased(binding: IInputBinding): boolean {
		switch (binding.device) {
			case "keyboard":
				return this._isKeyReleased(binding.key);

			case "mouse":
				return binding.mouseButton !== undefined ? this._mouseReleasedButtons.has(binding.mouseButton) : false;

			case "gamepad":
				if (binding.gamepadButton !== undefined) {
					return !this._currentGamepadButtons[binding.gamepadButton] && this._previousGamepadButtons[binding.gamepadButton] === true;
				}
				return false;

			default:
				return false;
		}
	}

	private _applyDeadzone(value: number, deadzone: number): number {
		const abs = Math.abs(value);
		if (abs <= deadzone) {
			return 0;
		}
		const sign = Math.sign(value);
		return sign * ((abs - deadzone) / (1.0 - deadzone));
	}
}
