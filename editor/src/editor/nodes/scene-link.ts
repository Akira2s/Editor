import { join, dirname } from "path/posix";

import { GetClass, Matrix, Node, Scene, SerializationHelper, serialize, Tools, TransformNode, Tags } from "babylonjs";

import { UniqueNumber } from "../../tools/tools";

import { projectConfiguration } from "../../project/configuration";
import { loadScene, SceneLoadResult } from "../../project/load/scene";

import { applyPrefabNodeOverride, diffPrefabNode, IPrefabNodeOverride, PrefabOverrides, snapshotPrefabNode } from "../../tools/scene/prefab-overrides";

import { Editor } from "../main";

export class SceneLinkNode extends TransformNode {
	private _editor: Editor;

	private _lastLoadResult: SceneLoadResult | null = null;

	// What this instance changes on the nodes of the prefab, keyed by the id of the nodes in the prefab (the ones not found in the prefab are kept).
	private _overrides: PrefabOverrides = {};
	// The nodes of the prefab as it defines them, to know what the instance changed.
	private _baselines: Map<string, IPrefabNodeOverride> = new Map<string, IPrefabNodeOverride>();
	private _prefabNodes: Map<string, Node> = new Map<string, Node>();

	@serialize()
	private _relativePath: string | null = null;

	public get relativePath(): string | null {
		return this._relativePath;
	}

	/**
	 * Constructor.
	 * @param name defines the name of the scene component.
	 * @param scene defines the reference to the scene where to add the scene component.
	 */
	public constructor(name: string, scene: Scene, editor: Editor) {
		super(name, scene);

		this._editor = editor;

		this.id = Tools.RandomId();
		this.uniqueId = UniqueNumber.Get();
	}

	public async setRelativePath(relativePath: string): Promise<SceneLoadResult | null> {
		if (relativePath === this._relativePath) {
			return null;
		}

		// The overrides belong to the prefab they were made on.
		if (this._relativePath) {
			this._overrides = {};
		}

		this._relativePath = relativePath;

		return this.reload();
	}

	public async reload(): Promise<SceneLoadResult | null> {
		if (!projectConfiguration.path || !this._relativePath) {
			return null;
		}

		// What the instance changed is kept through the reload.
		this._overrides = this.getOverrides();

		this._disposeLastLoadResult();

		const projectDir = dirname(projectConfiguration.path);
		const absolutePath = join(projectDir, this._relativePath);

		this._lastLoadResult = await loadScene(this._editor, projectDir, absolutePath, {
			asLink: true,
		});

		this._lastLoadResult?.meshes.forEach((mesh) => !mesh.parent && (mesh.parent = this));
		this._lastLoadResult?.lights.forEach((light) => !light.parent && (light.parent = this));
		this._lastLoadResult?.cameras.forEach((camera) => !camera.parent && (camera.parent = this));
		this._lastLoadResult?.transformNodes.forEach((transformNode) => !transformNode.parent && (transformNode.parent = this));

		this._lastLoadResult.animationGroups.forEach((animationGroup) => {
			Tags.AddTagsTo(animationGroup, "from-scene-link");
		});

		this._captureBaselines();
		this._applyOverrides();

		return this._lastLoadResult;
	}

	private _applyOverrides(): void {
		Object.entries(this._overrides).forEach(([id, override]) => {
			const node = this._prefabNodes.get(id);
			if (node) {
				applyPrefabNodeOverride(node, override);
			}
		});
	}

	/**
	 * Returns the nodes of the prefab this link shows (the ones of a prefab linked by the prefab are not part of it).
	 */
	public getPrefabNodes(): Node[] {
		return Array.from(this._prefabNodes.values());
	}

	private _captureBaselines(): void {
		this._baselines.clear();
		this._prefabNodes.clear();

		const visit = (node: Node) => {
			node.getChildren().forEach((child) => {
				this._baselines.set(child.id, snapshotPrefabNode(child));
				this._prefabNodes.set(child.id, child);

				if (child.getClassName() !== "SceneLinkNode") {
					visit(child);
				}
			});
		};

		visit(this);
	}

	/**
	 * Returns what this instance changes on the nodes of the prefab, keyed by the id of the nodes in the prefab.
	 */
	public getOverrides(): PrefabOverrides {
		const overrides: PrefabOverrides = {};

		// The overrides of nodes the prefab doesn't have (anymore) are kept: the prefab may come back.
		Object.entries(this._overrides).forEach(([id, override]) => {
			if (!this._prefabNodes.has(id)) {
				overrides[id] = override;
			}
		});

		this._prefabNodes.forEach((node, id) => {
			const diff = diffPrefabNode(this._baselines.get(id)!, snapshotPrefabNode(node));
			if (diff) {
				overrides[id] = diff;
			}
		});

		return overrides;
	}

	/**
	 * Returns the override of the given node of the prefab, or null when the instance doesn't change it.
	 */
	public getNodeOverride(node: Node): IPrefabNodeOverride | null {
		const baseline = this._baselines.get(node.id);
		return baseline && this._prefabNodes.get(node.id) === node ? diffPrefabNode(baseline, snapshotPrefabNode(node)) : null;
	}

	/**
	 * Puts the given node of the prefab (or all of them) back as the prefab defines it.
	 * @returns the nodes that changed.
	 */
	public revertOverrides(node?: Node): Node[] {
		const reverted: Node[] = [];

		(node ? [node] : Array.from(this._prefabNodes.values())).forEach((prefabNode) => {
			const baseline = this._baselines.get(prefabNode.id);
			if (!baseline || this._prefabNodes.get(prefabNode.id) !== prefabNode || !diffPrefabNode(baseline, snapshotPrefabNode(prefabNode))) {
				return;
			}

			applyPrefabNodeOverride(prefabNode, baseline);
			if (!baseline.scripts && prefabNode.metadata?.scripts) {
				prefabNode.metadata.scripts = [];
			}

			reverted.push(prefabNode);
		});

		reverted.forEach((n) => delete this._overrides[n.id]);

		return reverted;
	}

	/**
	 * Gives up the content of the prefab this link shows without disposing it (it is not part of the link anymore). Used to unpack a prefab.
	 */
	public releaseContent(): SceneLoadResult | null {
		const result = this._lastLoadResult;
		this._lastLoadResult = null;

		this._baselines.clear();
		this._prefabNodes.clear();

		return result;
	}

	public serialize(): any {
		const data = super.serialize();

		const overrides = this.getOverrides();
		data.metadata = { ...(data.metadata ?? {}) };

		if (Object.keys(overrides).length) {
			data.metadata.overrides = overrides;
		} else {
			delete data.metadata.overrides;
		}

		return data;
	}

	private _disposeLastLoadResult(): void {
		this._baselines.clear();
		this._prefabNodes.clear();

		if (this._lastLoadResult) {
			this._lastLoadResult.meshes.forEach((mesh) => mesh.dispose(true, false));
			this._lastLoadResult.lights.forEach((light) => light.dispose(true, true));
			this._lastLoadResult.cameras.forEach((camera) => camera.dispose(true, true));
			this._lastLoadResult.transformNodes.forEach((transformNode) => transformNode.dispose(true, true));
			this._lastLoadResult.sceneLinks.forEach((sceneLink) => sceneLink.dispose());
			this._lastLoadResult.animationGroups.forEach((animationGroup) => animationGroup.dispose());
			this._lastLoadResult.particleSystems.forEach((particleSystem) => particleSystem.dispose());

			this._lastLoadResult = null;
		}
	}

	/**
	 * Releases resources associated with this scene link.
	 */
	public dispose(): void {
		this._disposeLastLoadResult();
		super.dispose(false, true);
	}

	/**
	 * Gets the current object class name.
	 * @return the class name
	 */
	public getClassName(): string {
		return "SceneLinkNode";
	}

	public parse(data: any): void {
		SerializationHelper.Parse(() => this, data, this._scene, "");

		this._overrides = data.metadata?.overrides ?? {};
		if (this.metadata?.overrides) {
			delete this.metadata.overrides;
		}

		// A scene being loaded creates the link (which loads the prefab) before it parses what the link saved.
		this._applyOverrides();

		if (data.localMatrix) {
			this.setPreTransformMatrix(Matrix.FromArray(data.localMatrix));
		} else if (data.pivotMatrix) {
			this.setPivotMatrix(Matrix.FromArray(data.pivotMatrix));
		}

		this.setEnabled(data.isEnabled);

		this._waitingParsedUniqueId = data.uniqueId;

		// Parent
		if (data.parentId !== undefined) {
			this._waitingParentId = data.parentId;
		}

		if (data.parentInstanceIndex !== undefined) {
			this._waitingParentInstanceIndex = data.parentInstanceIndex;
		}

		// Animations
		if (data.animations) {
			for (let animationIndex = 0; animationIndex < data.animations.length; animationIndex++) {
				const parsedAnimation = data.animations[animationIndex];
				const internalClass = GetClass("BABYLON.Animation");
				if (internalClass) {
					this.animations.push(internalClass.Parse(parsedAnimation));
				}
			}
			Node.ParseAnimationRanges(this, data, this._scene);
		}

		if (data.autoAnimate) {
			this._scene.beginAnimation(this, data.autoAnimateFrom, data.autoAnimateTo, data.autoAnimateLoop, data.autoAnimateSpeed || 1.0);
		}
	}
}
