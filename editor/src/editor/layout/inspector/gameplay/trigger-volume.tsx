import { Component, ReactNode } from "react";

import { TransformNode } from "babylonjs";

import { registerUndoRedo } from "../../../../tools/undoredo";

import { EditorInspectorListField } from "../fields/list";
import { EditorInspectorStringField } from "../fields/string";
import { EditorInspectorSwitchField } from "../fields/switch";
import { EditorInspectorNumberField } from "../fields/number";
import { EditorInspectorSectionField } from "../fields/section";

export interface IEditorTriggerVolumeInspectorProps {
	object: TransformNode;
}

export class EditorTriggerVolumeInspector extends Component<IEditorTriggerVolumeInspectorProps> {
	private _sizeProxy: { x: number; y: number; z: number };

	public constructor(props: IEditorTriggerVolumeInspectorProps) {
		super(props);

		this.props.object.metadata ??= {};

		const self = this;
		this._sizeProxy = {
			get x(): number {
				const tv = self.props.object.metadata?.triggerVolume;
				return Array.isArray(tv?.size) ? (tv.size[0] ?? 2) : 2;
			},
			set x(value: number) {
				const metadata = (self.props.object.metadata ??= {});
				const tv = (metadata.triggerVolume ??= {
					enabled: true,
					name: self.props.object.name,
					shape: "box",
					size: [2, 2, 2],
					radius: 1.5,
					detectionMode: "all",
					tag: "Player",
					checkInterval: 1,
				});
				if (!Array.isArray(tv.size)) {
					tv.size = [2, 2, 2];
				}
				tv.size[0] = value;
			},
			get y(): number {
				const tv = self.props.object.metadata?.triggerVolume;
				return Array.isArray(tv?.size) ? (tv.size[1] ?? 2) : 2;
			},
			set y(value: number) {
				const metadata = (self.props.object.metadata ??= {});
				const tv = (metadata.triggerVolume ??= {
					enabled: true,
					name: self.props.object.name,
					shape: "box",
					size: [2, 2, 2],
					radius: 1.5,
					detectionMode: "all",
					tag: "Player",
					checkInterval: 1,
				});
				if (!Array.isArray(tv.size)) {
					tv.size = [2, 2, 2];
				}
				tv.size[1] = value;
			},
			get z(): number {
				const tv = self.props.object.metadata?.triggerVolume;
				return Array.isArray(tv?.size) ? (tv.size[2] ?? 2) : 2;
			},
			set z(value: number) {
				const metadata = (self.props.object.metadata ??= {});
				const tv = (metadata.triggerVolume ??= {
					enabled: true,
					name: self.props.object.name,
					shape: "box",
					size: [2, 2, 2],
					radius: 1.5,
					detectionMode: "all",
					tag: "Player",
					checkInterval: 1,
				});
				if (!Array.isArray(tv.size)) {
					tv.size = [2, 2, 2];
				}
				tv.size[2] = value;
			},
		};
	}

	public render(): ReactNode {
		const metadata = (this.props.object.metadata ??= {});
		const tv = metadata.triggerVolume;

		const o = {
			enabled: Boolean(tv?.enabled),
		};

		return (
			<EditorInspectorSectionField title="Trigger Volume">
				<EditorInspectorSwitchField object={o} property="enabled" label="Enabled" noUndoRedo onChange={() => this._handleEnabledChange()} />

				{tv?.enabled && (
					<>
						<EditorInspectorListField
							object={tv}
							property="shape"
							label="Shape"
							items={[
								{ text: "Box", value: "box" },
								{ text: "Sphere", value: "sphere" },
							]}
							onChange={() => this.forceUpdate()}
						/>

						{tv.shape === "box" && (
							<>
								<EditorInspectorNumberField object={this._sizeProxy} property="x" label="Size X" min={0.01} step={0.1} />
								<EditorInspectorNumberField object={this._sizeProxy} property="y" label="Size Y" min={0.01} step={0.1} />
								<EditorInspectorNumberField object={this._sizeProxy} property="z" label="Size Z" min={0.01} step={0.1} />
							</>
						)}

						{tv.shape === "sphere" && <EditorInspectorNumberField object={tv} property="radius" label="Radius" min={0.01} step={0.1} />}

						<EditorInspectorListField
							object={tv}
							property="detectionMode"
							label="Detection Mode"
							items={[
								{ text: "All", value: "all" },
								{ text: "Tagged Only", value: "taggedOnly" },
							]}
							onChange={() => this.forceUpdate()}
						/>

						{tv.detectionMode === "taggedOnly" && <EditorInspectorStringField object={tv} property="tag" label="Tag" />}

						<EditorInspectorNumberField object={tv} property="checkInterval" label="Check Interval" min={1} step={1} />
					</>
				)}
			</EditorInspectorSectionField>
		);
	}

	private _handleEnabledChange(): void {
		const currentMetadata = (this.props.object.metadata ??= {});
		const previousConfig = currentMetadata.triggerVolume
			? {
					...currentMetadata.triggerVolume,
					size: Array.isArray(currentMetadata.triggerVolume.size) ? [...currentMetadata.triggerVolume.size] : [2, 2, 2],
				}
			: undefined;

		registerUndoRedo({
			executeRedo: true,
			action: () => this.forceUpdate(),
			undo: () => {
				const metadata = (this.props.object.metadata ??= {});
				if (previousConfig) {
					metadata.triggerVolume = {
						...previousConfig,
						size: [...previousConfig.size],
					};
				} else {
					delete metadata.triggerVolume;
				}
			},
			redo: () => {
				const metadata = (this.props.object.metadata ??= {});
				if (previousConfig?.enabled) {
					delete metadata.triggerVolume;
				} else {
					metadata.triggerVolume = {
						enabled: true,
						name: this.props.object.name,
						shape: "box",
						size: [2, 2, 2],
						radius: 1.5,
						detectionMode: "all",
						tag: "Player",
						checkInterval: 1,
					};
				}
			},
		});

		this.forceUpdate();
	}
}
