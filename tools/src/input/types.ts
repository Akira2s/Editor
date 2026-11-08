/**
 * Defines the supported types of input actions.
 */
export type InputActionType = "button" | "axis1d" | "axis2d";

/**
 * Defines the supported device types for input bindings.
 */
export type InputDeviceType = "keyboard" | "mouse" | "gamepad" | "touch";

/**
 * Common mouse button indices.
 */
export enum MouseButtonIndex {
	Left = 0,
	Middle = 1,
	Right = 2,
}

/**
 * Standard W3C Gamepad button indices.
 */
export enum GamepadButtonIndex {
	A = 0,
	B = 1,
	X = 2,
	Y = 3,
	LeftBumper = 4,
	RightBumper = 5,
	LeftTrigger = 6,
	RightTrigger = 7,
	Back = 8,
	Start = 9,
	LeftStick = 10,
	RightStick = 11,
	DPadUp = 12,
	DPadDown = 13,
	DPadLeft = 14,
	DPadRight = 15,
	Home = 16,
}

/**
 * Standard W3C Gamepad axis indices.
 */
export enum GamepadAxisIndex {
	LeftStickX = 0,
	LeftStickY = 1,
	RightStickX = 2,
	RightStickY = 3,
}

/**
 * Defines an individual input binding connecting a physical device input to an action.
 */
export interface IInputBinding {
	/**
	 * Physical device providing input.
	 */
	device: InputDeviceType;

	/**
	 * Keyboard key identifier (e.g. "KeyW", "Space", "ShiftLeft", "KeyA", "KeyS", "KeyD").
	 */
	key?: string;

	/**
	 * Mouse button index (0: Left, 1: Middle, 2: Right).
	 */
	mouseButton?: number;

	/**
	 * Gamepad button index (0 to 16 standard gamepad buttons).
	 */
	gamepadButton?: number;

	/**
	 * Gamepad axis index (0: LeftStickX, 1: LeftStickY, 2: RightStickX, 3: RightStickY).
	 */
	gamepadAxis?: number;

	/**
	 * Multiplier for the input value (e.g. -1 to invert or reverse).
	 */
	scale?: number;

	/**
	 * Threshold below which stick values are treated as 0 (default 0.15 for sticks).
	 */
	deadzone?: number;

	/**
	 * Target axis contribution for composite 2D or 1D actions ("x" or "y").
	 */
	axis?: "x" | "y";
}

/**
 * Defines an input action that groups multiple device bindings.
 */
export interface IInputAction {
	/**
	 * Name of the action (e.g. "Move", "Look", "Jump", "Fire").
	 */
	name: string;

	/**
	 * The action value type ("button", "axis1d", or "axis2d").
	 */
	type: InputActionType;

	/**
	 * List of physical input bindings associated with this action.
	 */
	bindings: IInputBinding[];
}

/**
 * Defines an action map representing a named context of actions (e.g. "PlayerControls", "UI").
 */
export interface IInputActionMap {
	/**
	 * Name of the action map.
	 */
	name: string;

	/**
	 * List of actions belonging to this map.
	 */
	actions: IInputAction[];

	/**
	 * Whether this action map is currently enabled and evaluated.
	 */
	enabled: boolean;
}
