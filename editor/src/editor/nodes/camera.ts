import { Node, FreeCamera, FreeCameraKeyboardMoveInput, FreeCameraMouseInput, Scene, Vector3 } from "babylonjs";
import { EditorFreeCameraPanInput } from "./camera-pan-input";
import { EditorFreeCameraUnityInput } from "./camera-unity-input";

import { isDomTextInputFocused } from "../../tools/dom";

const DEFAULT_KEYS = {
	keysUp: [87], // W - Forward
	keysDown: [83], // S - Backward
	keysLeft: [65], // A - Left
	keysRight: [68], // D - Right
	keysUpward: [69], // E - Up
	keysDownward: [81], // Q - Down
};

export class EditorCamera extends FreeCamera {
	private _savedSpeed: number | null = null;
	private _panInput: EditorFreeCameraPanInput;
	private _unityInput: EditorFreeCameraUnityInput;
	private _unityControls: boolean = false;

	private _isAttached: boolean = false;
	private _isControlDown: boolean = false;
	private _noPreventDefault: boolean | undefined = undefined;

	private _keyboardUpListener: (ev: KeyboardEvent) => void;
	private _keyboardDownListener: (ev: KeyboardEvent) => void;

	/**
	 * Constructor.
	 * @param name defines the name of the camera.
	 * @param position defines the start position of the camera.
	 * @param scene defines the reference to the scene where to add the camera.
	 * @param setActiveOnSceneIfNoneActive defines wether or not camera should be set as active
	 */
	public constructor(name: string, position: Vector3, scene: Scene, setActiveOnSceneIfNoneActive?: boolean) {
		super(name, position, scene, setActiveOnSceneIfNoneActive);

		this._setDefaultKeys();

		this.inputs.addMouseWheel();
		this._panInput = new EditorFreeCameraPanInput();

		this._unityInput = new EditorFreeCameraUnityInput();
		this._unityInput.onFlyingChanged = (flying) => this._setFlyKeysActive(!this._unityControls || flying);

		window.addEventListener(
			"keydown",
			(this._keyboardDownListener = (ev) => {
				if ((ev.ctrlKey || ev.metaKey) && !this._isControlDown && this._isAttached) {
					this._isControlDown = true;
					return super.detachControl();
				}

				if (ev.key !== "Shift" || isDomTextInputFocused()) {
					return;
				}

				if (this._savedSpeed === null) {
					this._savedSpeed = this.speed;
					// Shift slows the camera down by default and speeds it up with the Unity-style controls, like Unity does.
					this.speed *= this._unityControls ? 3 : 0.1;
				}
			})
		);

		window.addEventListener(
			"keyup",
			(this._keyboardUpListener = (ev) => {
				if (!ev.ctrlKey && !ev.metaKey && this._isControlDown && this._isAttached) {
					this._isControlDown = false;
					return this._attachInputs();
				}

				if (ev.key === "Shift" && this._savedSpeed !== null) {
					this.speed = this._savedSpeed;
					this._savedSpeed = null;
				}
			})
		);
	}

	/**
	 * Override attachControl to ensure pan input is attached
	 */
	public attachControl(noPreventDefault?: boolean): void {
		this._isAttached = true;
		this._noPreventDefault = noPreventDefault;

		this._attachInputs();
	}

	private _attachInputs(): void {
		super.attachControl(this._noPreventDefault);

		// Add pan input after camera is attached
		if (this._panInput && !this.inputs.attached.editorPan) {
			this.inputs.add(this._panInput);
		}

		this._applyUnityControls();
	}

	public detachControl(): void {
		this._isAttached = false;
		super.detachControl();
	}

	/**
	 * Some preferences for the editor's camera are saved in the local storage in order
	 * to be global for each project. This function tries to get the preferences from the local storage
	 * and applies it to the camera.
	 */
	public configureFromPreferences(): void {
		try {
			const keys = JSON.parse(localStorage.getItem("editor-camera-controls") as string);

			this.unityControls = keys?.unityControls === true;

			if (keys && keys.keysUp && keys.keysDown && keys.keysLeft && keys.keysRight && keys.keysUpward && keys.keysDownward) {
				this.keysUp = keys.keysUp;
				this.keysDown = keys.keysDown;
				this.keysLeft = keys.keysLeft;
				this.keysRight = keys.keysRight;
				this.keysUpward = keys.keysUpward;
				this.keysDownward = keys.keysDownward;
			} else {
				this._setDefaultKeysFromLayout();
			}

			// Load pan sensitivity multiplier if available
			if (keys && keys.panSensitivityMultiplier !== undefined) {
				this.panSensitivityMultiplier = keys.panSensitivityMultiplier;
			}
		} catch (e) {
			// If no preferences found or error occurred, use defaults
			this._setDefaultKeysFromLayout();
		}
	}

	/**
	 * Destroy the camera and release the current resources hold by it.
	 */
	public dispose(): void {
		super.dispose();

		window.removeEventListener("keyup", this._keyboardUpListener);
		window.removeEventListener("keydown", this._keyboardDownListener);
	}

	/**
	 * Gets the current object class name.
	 * @return the class name
	 */
	public getClassName(): string {
		return "EditorCamera";
	}

	/**
	 * Gets the pan sensitivity multiplier for the camera pan input.
	 * @returns the current pan sensitivity multiplier value.
	 */
	public get panSensitivityMultiplier(): number {
		return this._panInput.panSensitivityMultiplier;
	}

	/**
	 * Sets the pan sensitivity multiplier for the camera pan input.
	 * @param value defines the new pan sensitivity multiplier value.
	 */
	public set panSensitivityMultiplier(value: number) {
		this._panInput.panSensitivityMultiplier = value;
	}

	/**
	 * Gets whether or not the Unity-style controls are enabled:
	 * Alt + LMB orbits, Alt + RMB zooms, RMB enables the fly mode (the movement keys only work while it is held)
	 * and Q / W / E / R / F select the tools and focus the selection.
	 */
	public get unityControls(): boolean {
		return this._unityControls;
	}

	/**
	 * Sets whether or not the Unity-style controls are enabled.
	 */
	public set unityControls(value: boolean) {
		this._unityControls = value;
		this._applyUnityControls();
	}

	/**
	 * Gets whether or not the fly mode (right mouse button held with the Unity-style controls) is active.
	 */
	public get isFlying(): boolean {
		return this._unityControls && this._unityInput.isFlying;
	}

	private _applyUnityControls(): void {
		const attached = this.inputs.attached;

		this._panInput.altLeftPans = !this._unityControls;

		if (this._unityControls) {
			if (!attached.editorUnity) {
				this.inputs.add(this._unityInput);
			}
		} else if (attached.editorUnity) {
			this.inputs.remove(this._unityInput);
		}

		// With the Unity-style controls only the right button looks around: the left button is used to select and orbit.
		const mouse = attached.mouse as FreeCameraMouseInput | undefined;
		if (mouse) {
			mouse.buttons = this._unityControls ? [2] : [0, 1, 2];
		}

		this._setFlyKeysActive(!this._unityControls || this._unityInput.isFlying);
	}

	/**
	 * Enables or disables the movement keys. They are only active while flying with the Unity-style controls,
	 * so W / E / Q can be used as tool shortcuts the rest of the time.
	 */
	private _setFlyKeysActive(active: boolean): void {
		const keyboard = this.inputs.attached.keyboard as FreeCameraKeyboardMoveInput | undefined;
		if (!keyboard || !this._isAttached || this._isControlDown) {
			return;
		}

		if (active) {
			keyboard.attachControl(this._noPreventDefault);
		} else {
			keyboard.detachControl();
		}
	}

	private _setDefaultKeys(): void {
		this.keysUp = DEFAULT_KEYS.keysUp;
		this.keysDown = DEFAULT_KEYS.keysDown;
		this.keysLeft = DEFAULT_KEYS.keysLeft;
		this.keysRight = DEFAULT_KEYS.keysRight;
		this.keysUpward = DEFAULT_KEYS.keysUpward;
		this.keysDownward = DEFAULT_KEYS.keysDownward;
	}

	private _setDefaultKeysFromLayout(): void {
		this._setDefaultKeys();

		navigator.keyboard?.getLayoutMap().then((layout) => {
			const keyUp = layout.get("KeyW")?.toUpperCase().charCodeAt(0);
			if (keyUp) {
				this.keysUp = [keyUp];
			}

			const keyDown = layout.get("KeyS")?.toUpperCase().charCodeAt(0);
			if (keyDown) {
				this.keysDown = [keyDown];
			}

			const keyLeft = layout.get("KeyA")?.toUpperCase().charCodeAt(0);
			if (keyLeft) {
				this.keysLeft = [keyLeft];
			}

			const keyRight = layout.get("KeyD")?.toUpperCase().charCodeAt(0);
			if (keyRight) {
				this.keysRight = [keyRight];
			}

			const keyUpward = layout.get("KeyE")?.toUpperCase().charCodeAt(0);
			if (keyUpward) {
				this.keysUpward = [keyUpward];
			}

			const keyDownward = layout.get("KeyQ")?.toUpperCase().charCodeAt(0);
			if (keyDownward) {
				this.keysDownward = [keyDownward];
			}
		});
	}
}

Node.AddNodeConstructor("EditorCamera", (name, scene) => {
	return () => new EditorCamera(name, Vector3.Zero(), scene);
});
