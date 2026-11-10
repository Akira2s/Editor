import { AbstractMesh, Color3, LinesMesh, MeshBuilder, Node, Observer, Quaternion, Scene, TransformNode, UtilityLayerRenderer, Vector3 } from "babylonjs";

import { isAbstractMesh, isTransformNode } from "../../../../tools/guards/nodes";

export class EditorGameplayGizmo {
	private _gizmosLayer: UtilityLayerRenderer;
	private _attachedNode: Node | null = null;
	private _rootNode: TransformNode | null = null;
	private _linesMeshes: LinesMesh[] = [];
	private _renderObserver: Observer<Scene> | null = null;

	public constructor(gizmosLayer: UtilityLayerRenderer) {
		this._gizmosLayer = gizmosLayer;
	}

	/**
	 * Sets the node currently attached to the gameplay gizmo and refreshes wireframe overlays.
	 * @param node defines the node to attach, or null to detach.
	 */
	public setAttachedNode(node: Node | null): void {
		this._attachedNode = node;
		this.refresh();
	}

	/**
	 * Rebuilds the gameplay wireframe gizmos for the currently attached node.
	 */
	public refresh(): void {
		this._clear();

		if (!this._attachedNode || (!isTransformNode(this._attachedNode) && !isAbstractMesh(this._attachedNode))) {
			return;
		}

		const transformNode = this._attachedNode as TransformNode | AbstractMesh;
		const metadata = transformNode.metadata;
		if (!metadata) {
			return;
		}

		const hasCC = Boolean(metadata.characterController?.enabled);
		const hasTV = Boolean(metadata.triggerVolume && metadata.triggerVolume.enabled !== false);
		const hasNav = Boolean(metadata.navAgent?.enabled);

		if (!hasCC && !hasTV && !hasNav) {
			return;
		}

		const utilityScene = this._gizmosLayer.utilityLayerScene;
		this._rootNode = new TransformNode("gameplayGizmoRoot", utilityScene);

		const syncTransform = (): void => {
			if (!this._rootNode || !this._attachedNode || this._attachedNode.isDisposed()) {
				return;
			}

			const worldMatrix = transformNode.computeWorldMatrix(true);
			const scale = Vector3.Zero();
			const rotation = Quaternion.Identity();
			const position = Vector3.Zero();
			worldMatrix.decompose(scale, rotation, position);

			this._rootNode.position.copyFrom(position);
			this._rootNode.rotationQuaternion = rotation;
		};

		syncTransform();
		this._renderObserver = utilityScene.onBeforeRenderObservable.add(() => {
			syncTransform();
		});

		if (hasCC) {
			this._buildCharacterControllerGizmo(metadata.characterController, utilityScene);
		}

		if (hasTV) {
			this._buildTriggerVolumeGizmo(metadata.triggerVolume, transformNode, utilityScene);
		}

		if (hasNav) {
			this._buildNavAgentGizmo(metadata.navAgent, utilityScene);
		}
	}

	/**
	 * Disposes all gameplay gizmo meshes, root nodes, and render observers.
	 */
	public dispose(): void {
		this._clear();
		this._attachedNode = null;
	}

	private _clear(): void {
		if (this._renderObserver) {
			this._gizmosLayer.utilityLayerScene.onBeforeRenderObservable.remove(this._renderObserver);
			this._renderObserver = null;
		}

		for (const mesh of this._linesMeshes) {
			mesh.dispose();
		}
		this._linesMeshes = [];

		if (this._rootNode) {
			this._rootNode.dispose();
			this._rootNode = null;
		}
	}

	private _finiteNumber(value: unknown, fallback: number): number {
		const n = Number(value);
		return Number.isFinite(n) ? n : fallback;
	}

	private _buildCharacterControllerGizmo(cc: any, scene: Scene): void {
		const radius = Math.max(0.05, this._finiteNumber(cc.radius, 0.4));
		const height = Math.max(radius * 2, this._finiteNumber(cc.height, 1.8));
		const stepOffset = Math.max(0, this._finiteNumber(cc.stepOffset, 0.35));
		const halfCylinder = Math.max(0, height / 2 - radius);

		const lines: Vector3[][] = [];

		// Top and bottom horizontal rings
		lines.push(this._createCirclePoints(radius, halfCylinder, "xz", 32));
		lines.push(this._createCirclePoints(radius, -halfCylinder, "xz", 32));

		// 4 vertical side lines
		lines.push([new Vector3(radius, -halfCylinder, 0), new Vector3(radius, halfCylinder, 0)]);
		lines.push([new Vector3(-radius, -halfCylinder, 0), new Vector3(-radius, halfCylinder, 0)]);
		lines.push([new Vector3(0, -halfCylinder, radius), new Vector3(0, halfCylinder, radius)]);
		lines.push([new Vector3(0, -halfCylinder, -radius), new Vector3(0, halfCylinder, -radius)]);

		// Top hemisphere arcs (XY and YZ)
		lines.push(this._createArcPoints(radius, halfCylinder, 0, Math.PI, "xy", 16));
		lines.push(this._createArcPoints(radius, halfCylinder, 0, Math.PI, "yz", 16));

		// Bottom hemisphere arcs (XY and YZ)
		lines.push(this._createArcPoints(radius, -halfCylinder, Math.PI, Math.PI * 2, "xy", 16));
		lines.push(this._createArcPoints(radius, -halfCylinder, Math.PI, Math.PI * 2, "yz", 16));

		const capsuleWireframe = MeshBuilder.CreateLineSystem("ccWireframe", { lines }, scene);
		capsuleWireframe.color = new Color3(0.2, 0.95, 0.4);
		capsuleWireframe.isPickable = false;
		capsuleWireframe.parent = this._rootNode;
		this._linesMeshes.push(capsuleWireframe);

		// Step offset ring
		const stepY = -height / 2 + stepOffset;
		const stepLines: Vector3[][] = [this._createCirclePoints(radius * 1.02, stepY, "xz", 32)];
		const stepWireframe = MeshBuilder.CreateLineSystem("ccStepWireframe", { lines: stepLines }, scene);
		stepWireframe.color = new Color3(1.0, 0.85, 0.2);
		stepWireframe.isPickable = false;
		stepWireframe.parent = this._rootNode;
		this._linesMeshes.push(stepWireframe);
	}

	private _buildTriggerVolumeGizmo(tv: any, transformNode: TransformNode | AbstractMesh, scene: Scene): void {
		const lines: Vector3[][] = [];
		const worldScale = new Vector3(1, 1, 1);
		transformNode.computeWorldMatrix(true).decompose(worldScale);

		const absScaleX = Math.abs(worldScale.x || 1);
		const absScaleY = Math.abs(worldScale.y || 1);
		const absScaleZ = Math.abs(worldScale.z || 1);

		if (tv.shape === "sphere") {
			const maxScale = Math.max(absScaleX, absScaleY, absScaleZ);
			const radius = Math.max(0.05, this._finiteNumber(tv.radius, 2)) * maxScale;
			lines.push(this._createCirclePoints(radius, 0, "xz", 36));
			lines.push(this._createCirclePoints(radius, 0, "xy", 36));
			lines.push(this._createCirclePoints(radius, 0, "yz", 36));
		} else {
			const rawX = Array.isArray(tv.size) ? tv.size[0] : tv.size?.x;
			const rawY = Array.isArray(tv.size) ? tv.size[1] : tv.size?.y;
			const rawZ = Array.isArray(tv.size) ? tv.size[2] : tv.size?.z;

			const sx = Math.max(0.01, this._finiteNumber(rawX, 2)) * absScaleX;
			const sy = Math.max(0.01, this._finiteNumber(rawY, 2)) * absScaleY;
			const sz = Math.max(0.01, this._finiteNumber(rawZ, 2)) * absScaleZ;

			const hx = sx / 2;
			const hy = sy / 2;
			const hz = sz / 2;

			const b0 = new Vector3(-hx, -hy, -hz);
			const b1 = new Vector3(hx, -hy, -hz);
			const b2 = new Vector3(hx, -hy, hz);
			const b3 = new Vector3(-hx, -hy, hz);

			const t0 = new Vector3(-hx, hy, -hz);
			const t1 = new Vector3(hx, hy, -hz);
			const t2 = new Vector3(hx, hy, hz);
			const t3 = new Vector3(-hx, hy, hz);

			// Bottom face
			lines.push([b0, b1], [b1, b2], [b2, b3], [b3, b0]);
			// Top face
			lines.push([t0, t1], [t1, t2], [t2, t3], [t3, t0]);
			// Vertical edges
			lines.push([b0, t0], [b1, t1], [b2, t2], [b3, t3]);
		}

		const tvWireframe = MeshBuilder.CreateLineSystem("tvWireframe", { lines }, scene);
		tvWireframe.color = new Color3(0.15, 0.85, 1.0);
		tvWireframe.isPickable = false;
		tvWireframe.parent = this._rootNode;
		this._linesMeshes.push(tvWireframe);
	}

	private _buildNavAgentGizmo(nav: any, scene: Scene): void {
		const radius = Math.max(0.05, this._finiteNumber(nav.radius, 0.5));
		const height = Math.max(0.1, this._finiteNumber(nav.height, 1.8));
		const stoppingDistance = Math.max(0.05, this._finiteNumber(nav.stoppingDistance, 0.2));
		const halfHeight = height / 2;

		const cylinderLines: Vector3[][] = [
			this._createCirclePoints(radius, -halfHeight, "xz", 32),
			this._createCirclePoints(radius, halfHeight, "xz", 32),
			[new Vector3(radius, -halfHeight, 0), new Vector3(radius, halfHeight, 0)],
			[new Vector3(-radius, -halfHeight, 0), new Vector3(-radius, halfHeight, 0)],
			[new Vector3(0, -halfHeight, radius), new Vector3(0, halfHeight, radius)],
			[new Vector3(0, -halfHeight, -radius), new Vector3(0, halfHeight, -radius)],
		];

		const navCylinder = MeshBuilder.CreateLineSystem("navAgentCylinder", { lines: cylinderLines }, scene);
		navCylinder.color = new Color3(0.3, 0.6, 1.0);
		navCylinder.isPickable = false;
		navCylinder.parent = this._rootNode;
		this._linesMeshes.push(navCylinder);

		const stopLines: Vector3[][] = [this._createCirclePoints(stoppingDistance, -halfHeight, "xz", 32)];
		const stopRing = MeshBuilder.CreateLineSystem("navAgentStopRing", { lines: stopLines }, scene);
		stopRing.color = new Color3(1.0, 0.55, 0.15);
		stopRing.isPickable = false;
		stopRing.parent = this._rootNode;
		this._linesMeshes.push(stopRing);

		if (Array.isArray(nav.patrolWaypoints) && nav.patrolWaypoints.length > 0) {
			const waypointLines: Vector3[][] = [];
			const points: Vector3[] = nav.patrolWaypoints.map((wp: any) => {
				if (Array.isArray(wp)) {
					return new Vector3(this._finiteNumber(wp[0], 0), this._finiteNumber(wp[1], 0), this._finiteNumber(wp[2], 0));
				}
				return new Vector3(this._finiteNumber(wp?.x, 0), this._finiteNumber(wp?.y, 0), this._finiteNumber(wp?.z, 0));
			});

			if (points.length > 1) {
				const pathPoints = [...points];
				if (nav.patrolLoop !== false) {
					pathPoints.push(points[0].clone());
				}
				waypointLines.push(pathPoints);
			}

			const markerSize = 0.25;
			for (const pt of points) {
				waypointLines.push([
					new Vector3(pt.x - markerSize, pt.y, pt.z),
					new Vector3(pt.x, pt.y + markerSize, pt.z),
					new Vector3(pt.x + markerSize, pt.y, pt.z),
					new Vector3(pt.x, pt.y - markerSize, pt.z),
					new Vector3(pt.x - markerSize, pt.y, pt.z),
				]);
				waypointLines.push([
					new Vector3(pt.x, pt.y, pt.z - markerSize),
					new Vector3(pt.x + markerSize, pt.y, pt.z),
					new Vector3(pt.x, pt.y, pt.z + markerSize),
					new Vector3(pt.x - markerSize, pt.y, pt.z),
					new Vector3(pt.x, pt.y, pt.z - markerSize),
				]);
			}

			const patrolMesh = MeshBuilder.CreateLineSystem("navAgentPatrolWaypoints", { lines: waypointLines }, scene);
			patrolMesh.color = new Color3(1.0, 0.9, 0.2);
			patrolMesh.isPickable = false;
			this._linesMeshes.push(patrolMesh);
		}
	}

	private _createCirclePoints(radius: number, offset: number, plane: "xz" | "xy" | "yz", segments: number): Vector3[] {
		const pts: Vector3[] = [];
		for (let i = 0; i <= segments; i++) {
			const angle = (i / segments) * Math.PI * 2;
			const c = Math.cos(angle) * radius;
			const s = Math.sin(angle) * radius;
			if (plane === "xz") {
				pts.push(new Vector3(c, offset, s));
			} else if (plane === "xy") {
				pts.push(new Vector3(c, s, offset));
			} else {
				pts.push(new Vector3(offset, c, s));
			}
		}
		return pts;
	}

	private _createArcPoints(radius: number, yCenter: number, startAngle: number, endAngle: number, plane: "xy" | "yz", segments: number): Vector3[] {
		const pts: Vector3[] = [];
		for (let i = 0; i <= segments; i++) {
			const angle = startAngle + (i / segments) * (endAngle - startAngle);
			const c = Math.cos(angle) * radius;
			const s = Math.sin(angle) * radius;
			if (plane === "xy") {
				pts.push(new Vector3(c, yCenter + s, 0));
			} else {
				pts.push(new Vector3(0, yCenter + s, c));
			}
		}
		return pts;
	}
}
