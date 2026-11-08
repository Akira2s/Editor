import { Scene } from "@babylonjs/core/scene";
import { Node } from "@babylonjs/core/node";
import { Observer, Observable } from "@babylonjs/core/Misc/observable";
import { Tags } from "@babylonjs/core/Misc/tags";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import { ITriggerEvent, ITriggerVolumeOptions, TriggerDetectionMode, TriggerShape } from "./types";

export class TriggerVolume {
	public name: string;
	public node: TransformNode | null = null;
	public shape: TriggerShape = "box";
	public size: Vector3 = new Vector3(2, 2, 2);
	public radius: number = 1.5;
	public detectionMode: TriggerDetectionMode = "all";
	public tag?: string;
	public checkInterval: number = 1;

	public readonly onTriggerEnter: Observable<ITriggerEvent> = new Observable<ITriggerEvent>();
	public readonly onTriggerStay: Observable<ITriggerEvent> = new Observable<ITriggerEvent>();
	public readonly onTriggerExit: Observable<ITriggerEvent> = new Observable<ITriggerEvent>();

	private _scene: Scene;
	private _position: Vector3 = Vector3.Zero();
	private _enabled: boolean = true;
	private _isDisposed: boolean = false;
	private _frameCounter: number = 0;
	private _overlappingEntities: Set<TransformNode | AbstractMesh> = new Set<TransformNode | AbstractMesh>();
	private _sceneObserver: Observer<Scene> | null = null;
	private _sceneDisposeObserver: Observer<Scene> | null = null;
	private _nodeDisposeObserver: Observer<Node> | null = null;

	public constructor(name: string, scene: Scene, node?: TransformNode | null, options?: ITriggerVolumeOptions) {
		this.name = name;
		this._scene = scene;
		this.node = node ?? null;

		if (options) {
			if (options.shape !== undefined) {
				this.shape = options.shape;
			}
			if (options.size !== undefined) {
				this.size = options.size.clone();
			}
			if (options.radius !== undefined) {
				this.radius = options.radius;
			}
			if (options.detectionMode !== undefined) {
				this.detectionMode = options.detectionMode;
			} else if (options.tag !== undefined) {
				this.detectionMode = "taggedOnly";
			}
			if (options.tag !== undefined) {
				this.tag = options.tag;
			}
			if (options.enabled !== undefined) {
				this._enabled = options.enabled;
			}
			if (options.checkInterval !== undefined) {
				this.checkInterval = options.checkInterval;
			}
		}

		if (this._scene?.onBeforeRenderObservable) {
			this._sceneObserver = this._scene.onBeforeRenderObservable.add(() => {
				if (!this._enabled || this._isDisposed) {
					return;
				}
				this._frameCounter++;
				if (this._frameCounter % this.checkInterval === 0) {
					this.update();
				}
			});
		}

		if (this._scene?.onDisposeObservable) {
			this._sceneDisposeObserver = this._scene.onDisposeObservable.add(() => {
				this.dispose();
			});
		}

		if (this.node?.onDisposeObservable) {
			this._nodeDisposeObserver = this.node.onDisposeObservable.add(() => {
				this.dispose();
			});
		}
	}

	public get isEnabled(): boolean {
		return this._enabled;
	}

	public setEnabled(enabled: boolean): void {
		if (this._enabled === enabled) {
			return;
		}
		this._enabled = enabled;
		if (!enabled) {
			this._overlappingEntities.clear();
		}
	}

	public get isDisposed(): boolean {
		return this._isDisposed;
	}

	public get scene(): Scene {
		return this._scene;
	}

	public get position(): Vector3 {
		return this.node ? this.node.position : this._position;
	}

	public set position(value: Vector3) {
		if (this.node) {
			this.node.position = value;
		} else {
			this._position = value;
		}
	}

	public get overlappingEntities(): (TransformNode | AbstractMesh)[] {
		return Array.from(this._overlappingEntities).filter((e) => !(e as any).isDisposed?.());
	}

	private _matchesTag(target: TransformNode | AbstractMesh): boolean {
		if (!this.tag) {
			return false;
		}

		if (Tags.HasTags(target) && Tags.MatchesQuery(target, this.tag)) {
			return true;
		}

		const anyTarget = target as any;
		if (anyTarget.metadata) {
			if (anyTarget.metadata.tag === this.tag) {
				return true;
			}
			if (Array.isArray(anyTarget.metadata.tags) && anyTarget.metadata.tags.includes(this.tag)) {
				return true;
			}
			if (typeof anyTarget.metadata.tags === "string" && anyTarget.metadata.tags.split(" ").includes(this.tag)) {
				return true;
			}
		}

		if (anyTarget.tag === this.tag) {
			return true;
		}
		if (Array.isArray(anyTarget.tags) && anyTarget.tags.includes(this.tag)) {
			return true;
		}
		if (typeof anyTarget.tags === "string" && anyTarget.tags.split(" ").includes(this.tag)) {
			return true;
		}

		return false;
	}

	private _getTargetPosition(target: TransformNode | AbstractMesh): Vector3 {
		if (typeof target.computeWorldMatrix === "function") {
			target.computeWorldMatrix(true);
		}
		if (typeof target.getAbsolutePosition === "function") {
			return target.getAbsolutePosition();
		}
		if (target.absolutePosition) {
			return target.absolutePosition;
		}
		if (target.position) {
			return target.position;
		}
		return Vector3.Zero();
	}

	private _getTriggerPosition(): Vector3 {
		if (this.node) {
			if (typeof this.node.computeWorldMatrix === "function") {
				this.node.computeWorldMatrix(true);
			}
			if (typeof this.node.getAbsolutePosition === "function") {
				return this.node.getAbsolutePosition();
			}
			if (this.node.absolutePosition) {
				return this.node.absolutePosition;
			}
			if (this.node.position) {
				return this.node.position;
			}
		}
		return this._position;
	}

	private _getEffectiveRadius(): number {
		const baseRadius = Math.max(0, this.radius);
		if (this.node) {
			const scaling = this.node.scaling ?? Vector3.One();
			if (scaling.x !== 1 || scaling.y !== 1 || scaling.z !== 1) {
				const maxScale = Math.max(Math.abs(scaling.x), Math.abs(scaling.y), Math.abs(scaling.z));
				return baseRadius * maxScale;
			}
		}
		return baseRadius;
	}

	public isOverlapping(target: TransformNode | AbstractMesh, cachedInvMatrix?: Matrix): boolean {
		if (!target || !this._enabled || this._isDisposed) {
			return false;
		}
		if (target === this.node) {
			return false;
		}
		if ((target as any).isDisposed && (target as any).isDisposed()) {
			return false;
		}
		if (this.detectionMode === "taggedOnly" && !this._matchesTag(target)) {
			return false;
		}

		const targetPos = this._getTargetPosition(target);

		if (this.shape === "sphere") {
			const triggerPos = this._getTriggerPosition();
			const distanceSq = Vector3.DistanceSquared(targetPos, triggerPos);
			const effectiveRadius = this._getEffectiveRadius();
			return distanceSq <= effectiveRadius * effectiveRadius;
		}

		if (this.node) {
			let invMatrix: Matrix;
			if (cachedInvMatrix) {
				invMatrix = cachedInvMatrix;
			} else {
				this.node.computeWorldMatrix(true);
				invMatrix = this.node.getWorldMatrix().clone().invert();
			}
			const localPos = Vector3.TransformCoordinates(targetPos, invMatrix);
			const halfX = Math.abs(this.size.x) / 2;
			const halfY = Math.abs(this.size.y) / 2;
			const halfZ = Math.abs(this.size.z) / 2;
			return Math.abs(localPos.x) <= halfX && Math.abs(localPos.y) <= halfY && Math.abs(localPos.z) <= halfZ;
		}

		const triggerPos = this._position;
		const localX = Math.abs(targetPos.x - triggerPos.x);
		const localY = Math.abs(targetPos.y - triggerPos.y);
		const localZ = Math.abs(targetPos.z - triggerPos.z);
		const halfX = Math.abs(this.size.x) / 2;
		const halfY = Math.abs(this.size.y) / 2;
		const halfZ = Math.abs(this.size.z) / 2;
		return localX <= halfX && localY <= halfY && localZ <= halfZ;
	}

	public update(candidates?: (TransformNode | AbstractMesh)[]): void {
		if (!this._enabled || this._isDisposed) {
			return;
		}

		let candidateList: (TransformNode | AbstractMesh)[];
		if (candidates) {
			candidateList = candidates;
		} else if (this._scene) {
			candidateList = [...this._scene.meshes, ...this._scene.transformNodes];
		} else {
			candidateList = [];
		}

		let cachedInvMatrix: Matrix | undefined;
		if (this.shape === "box" && this.node) {
			this.node.computeWorldMatrix(true);
			cachedInvMatrix = this.node.getWorldMatrix().clone().invert();
		}

		const currentOverlaps = new Set<TransformNode | AbstractMesh>();
		for (const candidate of candidateList) {
			if (!candidate || candidate === this.node) {
				continue;
			}
			if (currentOverlaps.has(candidate)) {
				continue;
			}
			if (this.isOverlapping(candidate, cachedInvMatrix)) {
				currentOverlaps.add(candidate);
			}
		}

		const now = Date.now();

		for (const entity of currentOverlaps) {
			if (this._overlappingEntities.has(entity)) {
				this.onTriggerStay.notifyObservers({
					trigger: this,
					target: entity,
					state: "stay",
					timestamp: now,
				});
			} else {
				this._overlappingEntities.add(entity);
				this.onTriggerEnter.notifyObservers({
					trigger: this,
					target: entity,
					state: "enter",
					timestamp: now,
				});
			}
		}

		const exitedEntities: (TransformNode | AbstractMesh)[] = [];
		for (const entity of this._overlappingEntities) {
			if (!currentOverlaps.has(entity) || ((entity as any).isDisposed && (entity as any).isDisposed())) {
				exitedEntities.push(entity);
			}
		}

		for (const entity of exitedEntities) {
			this._overlappingEntities.delete(entity);
			this.onTriggerExit.notifyObservers({
				trigger: this,
				target: entity,
				state: "exit",
				timestamp: now,
			});
		}
	}

	public serialize(): any {
		return {
			name: this.name,
			nodeId: this.node?.id ?? null,
			nodeName: this.node?.name ?? null,
			shape: this.shape,
			size: [this.size.x, this.size.y, this.size.z],
			radius: this.radius,
			detectionMode: this.detectionMode,
			tag: this.tag ?? null,
			enabled: this._enabled,
			checkInterval: this.checkInterval,
			position: this.node ? undefined : [this._position.x, this._position.y, this._position.z],
		};
	}

	public static Parse(json: any, scene: Scene): TriggerVolume {
		let node: TransformNode | null = null;
		if (json.nodeId && typeof scene.getNodeById === "function") {
			node = (scene.getNodeById(json.nodeId) as TransformNode) ?? null;
		}
		if (!node && json.nodeName && typeof scene.getNodeByName === "function") {
			node = (scene.getNodeByName(json.nodeName) as TransformNode) ?? null;
		}

		let size: Vector3;
		if (Array.isArray(json.size)) {
			size = new Vector3(json.size[0], json.size[1], json.size[2]);
		} else if (json.size && typeof json.size.x === "number") {
			size = new Vector3(json.size.x, json.size.y, json.size.z);
		} else {
			size = new Vector3(2, 2, 2);
		}

		const options: ITriggerVolumeOptions = {
			shape: json.shape ?? "box",
			size,
			radius: typeof json.radius === "number" ? json.radius : 1.5,
			detectionMode: json.detectionMode ?? "all",
			tag: json.tag ?? undefined,
			enabled: json.enabled !== undefined ? json.enabled : true,
			checkInterval: typeof json.checkInterval === "number" ? json.checkInterval : 1,
		};

		const trigger = new TriggerVolume(json.name ?? "TriggerVolume", scene, node, options);
		if (!node && Array.isArray(json.position)) {
			trigger.position = new Vector3(json.position[0], json.position[1], json.position[2]);
		} else if (!node && json.position && typeof json.position.x === "number") {
			trigger.position = new Vector3(json.position.x, json.position.y, json.position.z);
		}

		return trigger;
	}

	public dispose(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;

		const now = Date.now();
		for (const entity of this._overlappingEntities) {
			if (!(entity as any).isDisposed?.()) {
				this.onTriggerExit.notifyObservers({
					trigger: this,
					target: entity,
					state: "exit",
					timestamp: now,
				});
			}
		}
		this._overlappingEntities.clear();

		if (this._sceneObserver && this._scene?.onBeforeRenderObservable) {
			this._scene.onBeforeRenderObservable.remove(this._sceneObserver);
			this._sceneObserver = null;
		}

		if (this._sceneDisposeObserver && this._scene?.onDisposeObservable) {
			this._scene.onDisposeObservable.remove(this._sceneDisposeObserver);
			this._sceneDisposeObserver = null;
		}

		if (this._nodeDisposeObserver && this.node?.onDisposeObservable) {
			this.node.onDisposeObservable.remove(this._nodeDisposeObserver);
			this._nodeDisposeObserver = null;
		}

		this.onTriggerEnter.clear();
		this.onTriggerStay.clear();
		this.onTriggerExit.clear();
	}
}

export { TriggerVolume as AreaZone, ITriggerVolumeOptions as IAreaZoneOptions };
