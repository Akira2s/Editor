import { FreeCamera, ICameraInput, Vector3 } from "babylonjs";

import { dollyDistance, flySpeedFactor, orbitAround } from "./camera-orbit-math";

type UnityCameraMode = "none" | "orbit" | "dolly" | "fly";

/**
 * FreeCamera input implementing Unity's scene view navigation:
 * - Alt + Left Mouse Button: orbit around the pivot.
 * - Alt + Right Mouse Button: dolly (zoom) toward the pivot.
 * - Right Mouse Button: fly mode (the mouse looks around, the camera's movement keys are active).
 * - Mouse wheel while flying: changes the fly speed instead of zooming.
 * The middle mouse button pan and the mouse wheel (outside of the fly mode) are handled by the other editor camera inputs.
 */
export class EditorFreeCameraUnityInput implements ICameraInput<FreeCamera> {
	public camera!: FreeCamera;

	/**
	 * Defines the orbit speed in radians per pixel of mouse movement.
	 */
	public orbitSensitivity: number = 0.005;
	/**
	 * Defines the dolly speed (exponential, per pixel of mouse movement).
	 */
	public dollySensitivity: number = 0.01;

	/**
	 * Called when the fly mode starts or stops.
	 */
	public onFlyingChanged: ((flying: boolean) => void) | null = null;

	/**
	 * Called with the factor to apply to the fly speed when the mouse wheel moves while flying.
	 */
	public onFlySpeedChanged: ((factor: number) => void) | null = null;

	private _canvas: HTMLCanvasElement | null = null;

	private _mode: UnityCameraMode = "none";
	private _pivot: Vector3 = Vector3.Zero();
	private _lastDistance: number = 8;

	private _lastClientX: number = 0;
	private _lastClientY: number = 0;
	private _startClientX: number = 0;
	private _startClientY: number = 0;
	private _hasDragged: boolean = false;

	private _suppressContextMenu: boolean = false;
	private _suppressContextMenuTimeoutId: number = -1;

	private _detachedMouseInput: any | null = null;

	private _pointerDownListener: ((ev: PointerEvent) => void) | null = null;
	private _pointerMoveListener: ((ev: PointerEvent) => void) | null = null;
	private _pointerUpListener: ((ev: PointerEvent) => void) | null = null;
	private _contextMenuListener: ((ev: MouseEvent) => void) | null = null;
	private _wheelListener: ((ev: WheelEvent) => void) | null = null;
	private _blurListener: (() => void) | null = null;

	private static readonly _dragThresholdInPixels: number = 4;
	private static readonly _maxPickDistance: number = 1000;

	/**
	 * Gets whether or not the fly mode (right mouse button held) is currently active.
	 */
	public get isFlying(): boolean {
		return this._mode === "fly";
	}

	public getClassName(): string {
		return "EditorFreeCameraUnityInput";
	}

	public getSimpleName(): string {
		return "editorUnity";
	}

	public attachControl(noPreventDefault?: boolean): void {
		const scene = this.camera.getScene();
		this._canvas = scene.getEngine().inputElement as HTMLCanvasElement;
		if (!this._canvas) {
			return;
		}

		document.addEventListener("pointerdown", (this._pointerDownListener = (ev) => this._handlePointerDown(ev, noPreventDefault)), true);
		document.addEventListener("pointermove", (this._pointerMoveListener = (ev) => this._handlePointerMove(ev)), true);
		document.addEventListener("pointerup", (this._pointerUpListener = (ev) => this._handlePointerUp(ev)), true);
		document.addEventListener("pointercancel", this._pointerUpListener, true);

		// Releasing the right button fires a context menu event. It must only open when the button was clicked, not after a drag.
		document.addEventListener(
			"contextmenu",
			(this._contextMenuListener = (ev) => {
				if (!this._suppressContextMenu) {
					return;
				}

				this._suppressContextMenu = false;
				ev.preventDefault();
				ev.stopPropagation();
			}),
			true
		);

		// The wheel changes the fly speed instead of zooming: it must not reach the wheel input of the camera.
		document.addEventListener(
			"wheel",
			(this._wheelListener = (ev) => {
				if (this._mode !== "fly") {
					return;
				}

				ev.preventDefault();
				ev.stopPropagation();

				this.onFlySpeedChanged?.(flySpeedFactor(ev.deltaY, ev.deltaMode));
			}),
			{ capture: true, passive: false }
		);

		window.addEventListener("blur", (this._blurListener = () => this._end()));
	}

	public detachControl(): void {
		this._end();

		if (this._pointerDownListener) {
			document.removeEventListener("pointerdown", this._pointerDownListener, true);
			this._pointerDownListener = null;
		}
		if (this._pointerMoveListener) {
			document.removeEventListener("pointermove", this._pointerMoveListener, true);
			this._pointerMoveListener = null;
		}
		if (this._pointerUpListener) {
			document.removeEventListener("pointerup", this._pointerUpListener, true);
			document.removeEventListener("pointercancel", this._pointerUpListener, true);
			this._pointerUpListener = null;
		}
		if (this._contextMenuListener) {
			document.removeEventListener("contextmenu", this._contextMenuListener, true);
			this._contextMenuListener = null;
		}
		if (this._wheelListener) {
			document.removeEventListener("wheel", this._wheelListener, true);
			this._wheelListener = null;
		}
		if (this._blurListener) {
			window.removeEventListener("blur", this._blurListener);
			this._blurListener = null;
		}

		this._canvas = null;
	}

	public checkInputs(): void {
		// Nothing to do per frame, everything is event driven.
	}

	private _handlePointerDown(ev: PointerEvent, noPreventDefault?: boolean): void {
		if (ev.target !== this._canvas || this._mode !== "none" || ev.ctrlKey || ev.metaKey) {
			return;
		}

		let mode: UnityCameraMode = "none";
		if (ev.altKey && ev.button === 0) {
			mode = "orbit";
		} else if (ev.altKey && ev.button === 2) {
			mode = "dolly";
		} else if (!ev.altKey && ev.button === 2) {
			mode = "fly";
		}

		if (mode === "none") {
			return;
		}

		this._mode = mode;
		this._hasDragged = false;
		this._lastClientX = this._startClientX = ev.clientX;
		this._lastClientY = this._startClientY = ev.clientY;

		if (mode === "fly") {
			// The camera's own mouse input rotates the view while the right button is held.
			this.onFlyingChanged?.(true);
			return;
		}

		this._pivot = this._computePivot();

		// Orbit and dolly are driven here: keep the camera's own mouse look out of the way.
		const attached = (this.camera.inputs as any).attached;
		this._detachedMouseInput = attached?.mouse ?? null;
		try {
			this._detachedMouseInput?.detachControl?.();
		} catch {}

		try {
			(ev.target as any)?.setPointerCapture?.(ev.pointerId);
		} catch {}

		if (!noPreventDefault) {
			ev.preventDefault();
			ev.stopPropagation();
		}

		document.body.style.cursor = "grabbing";
	}

	private _handlePointerMove(ev: PointerEvent): void {
		if (this._mode === "none") {
			return;
		}

		if (!this._hasDragged && Math.hypot(ev.clientX - this._startClientX, ev.clientY - this._startClientY) > EditorFreeCameraUnityInput._dragThresholdInPixels) {
			this._hasDragged = true;
		}

		if (this._mode === "fly") {
			return;
		}

		ev.preventDefault();
		ev.stopPropagation();

		// Clamp single-step jumps (missed frames).
		const dx = Math.max(-60, Math.min(60, ev.clientX - this._lastClientX));
		const dy = Math.max(-60, Math.min(60, ev.clientY - this._lastClientY));
		this._lastClientX = ev.clientX;
		this._lastClientY = ev.clientY;

		if (dx === 0 && dy === 0) {
			return;
		}

		if (this._mode === "orbit") {
			this._orbit(dx, dy);
		} else if (this._mode === "dolly") {
			this._dolly(dx, dy);
		}
	}

	private _handlePointerUp(ev: PointerEvent): void {
		if (this._mode === "none") {
			return;
		}

		const mode = this._mode;
		const dragged = this._hasDragged;

		if (mode !== "orbit") {
			// A right button gesture ends with a context menu event. Only a plain click (no drag, no Alt) may open the menu.
			this._armContextMenuSuppression(dragged || mode === "dolly");
		}

		if (mode !== "fly") {
			ev.preventDefault();
			ev.stopPropagation();

			try {
				(ev.target as any)?.releasePointerCapture?.(ev.pointerId);
			} catch {}
		}

		this._end();
	}

	private _end(): void {
		const wasFlying = this._mode === "fly";
		this._mode = "none";

		try {
			this._detachedMouseInput?.attachControl?.();
		} catch {}
		this._detachedMouseInput = null;

		if (wasFlying) {
			this.onFlyingChanged?.(false);
		}

		try {
			document.body.style.cursor = "default";
		} catch {}
	}

	private _armContextMenuSuppression(suppress: boolean): void {
		window.clearTimeout(this._suppressContextMenuTimeoutId);
		this._suppressContextMenu = suppress;

		if (suppress) {
			// If no context menu event follows (e.g. another platform), do not swallow a later, unrelated one.
			this._suppressContextMenuTimeoutId = window.setTimeout(() => (this._suppressContextMenu = false), 400);
		}
	}

	private _computePivot(): Vector3 {
		const scene = this.camera.getScene();
		const canvas = this._canvas!;

		const pick = scene.pick(canvas.clientWidth / 2, canvas.clientHeight / 2, (m) => m.isEnabled() && m.isVisible && m.isPickable, false, this.camera);
		if (pick?.hit && pick.pickedPoint) {
			const distance = Vector3.Distance(this.camera.globalPosition, pick.pickedPoint);
			if (distance > 0.01 && distance < EditorFreeCameraUnityInput._maxPickDistance) {
				this._lastDistance = distance;
				return pick.pickedPoint.clone();
			}
		}

		return this.camera.globalPosition.add(this.camera.getDirection(Vector3.Forward()).scale(this._lastDistance));
	}

	private _orbit(dx: number, dy: number): void {
		const position = orbitAround(this.camera.position, this._pivot, dx * this.orbitSensitivity, dy * this.orbitSensitivity);

		this.camera.position.copyFromFloats(position.x, position.y, position.z);
		this.camera.setTarget(this._pivot);
	}

	private _dolly(dx: number, dy: number): void {
		const toPivot = this._pivot.subtract(this.camera.position);
		const distance = toPivot.length();
		if (distance < 1e-6) {
			return;
		}

		// Dragging right or up zooms in.
		const newDistance = dollyDistance(distance, (dx - dy) * this.dollySensitivity);
		this.camera.position.copyFrom(this._pivot.subtract(toPivot.scale(newDistance / distance)));
		this._lastDistance = newDistance;
	}
}
