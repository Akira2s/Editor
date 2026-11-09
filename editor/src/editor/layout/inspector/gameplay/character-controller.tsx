import { Component, ReactNode } from "react";

import { TransformNode } from "babylonjs";

import { registerUndoRedo } from "../../../../tools/undoredo";

import { EditorInspectorSwitchField } from "../fields/switch";
import { EditorInspectorNumberField } from "../fields/number";
import { EditorInspectorSectionField } from "../fields/section";

export interface IEditorCharacterControllerInspectorProps {
	object: TransformNode;
}

export class EditorCharacterControllerInspector extends Component<IEditorCharacterControllerInspectorProps> {
	public constructor(props: IEditorCharacterControllerInspectorProps) {
		super(props);

		this.props.object.metadata ??= {};
	}

	public render(): ReactNode {
		const metadata = (this.props.object.metadata ??= {});
		const cc = metadata.characterController;

		const o = {
			enabled: Boolean(cc?.enabled),
		};

		return (
			<EditorInspectorSectionField title="Character Controller">
				<EditorInspectorSwitchField object={o} property="enabled" label="Enabled" noUndoRedo onChange={() => this._handleEnabledChange()} />

				{cc?.enabled && (
					<>
						<EditorInspectorNumberField object={cc} property="radius" label="Radius" min={0.01} step={0.05} />
						<EditorInspectorNumberField object={cc} property="height" label="Height" min={0.1} step={0.1} />
						<EditorInspectorNumberField object={cc} property="mass" label="Mass" min={0.1} step={1} />
						<EditorInspectorNumberField object={cc} property="maxSlopeAngle" label="Max Slope Angle" asDegrees min={0} max={Math.PI / 2} step={1} />
						<EditorInspectorNumberField object={cc} property="stepOffset" label="Step Offset" min={0} step={0.05} />
						<EditorInspectorNumberField object={cc} property="skinWidth" label="Skin Width" min={0.001} step={0.01} />
						<EditorInspectorNumberField object={cc} property="airControl" label="Air Control" min={0} max={1} step={0.05} />
					</>
				)}
			</EditorInspectorSectionField>
		);
	}

	private _handleEnabledChange(): void {
		const currentMetadata = (this.props.object.metadata ??= {});
		const previousConfig = currentMetadata.characterController
			? {
					...currentMetadata.characterController,
					gravity: Array.isArray(currentMetadata.characterController.gravity) ? [...currentMetadata.characterController.gravity] : undefined,
				}
			: undefined;

		registerUndoRedo({
			executeRedo: true,
			action: () => this.forceUpdate(),
			undo: () => {
				const metadata = (this.props.object.metadata ??= {});
				if (previousConfig) {
					metadata.characterController = {
						...previousConfig,
						gravity: Array.isArray(previousConfig.gravity) ? [...previousConfig.gravity] : undefined,
					};
				} else {
					delete metadata.characterController;
				}
			},
			redo: () => {
				const metadata = (this.props.object.metadata ??= {});
				if (previousConfig?.enabled) {
					delete metadata.characterController;
				} else {
					metadata.characterController = {
						enabled: true,
						radius: 0.5,
						height: 1.8,
						mass: 70,
						maxSlopeAngle: Math.PI / 4,
						stepOffset: 0.3,
						skinWidth: 0.05,
						airControl: 0.3,
					};
				}
			},
		});

		this.forceUpdate();
	}
}
