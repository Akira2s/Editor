import { Component, ReactNode } from "react";
import { IoCloseOutline } from "react-icons/io5";
import { AiOutlinePlus, AiOutlineReload } from "react-icons/ai";

import { Scene } from "babylonjs";
import { InputManager, IInputActionMap } from "babylonjs-editor-tools";

import { Button } from "../../../../ui/shadcn/ui/button";

import { registerUndoRedo } from "../../../../tools/undoredo";

import { EditorInspectorListField } from "../fields/list";
import { EditorInspectorStringField } from "../fields/string";
import { EditorInspectorSwitchField } from "../fields/switch";
import { EditorInspectorSectionField } from "../fields/section";

export interface IEditorSceneInputActionsInspectorProps {
	scene: Scene;
}

export class EditorSceneInputActionsInspector extends Component<IEditorSceneInputActionsInspectorProps> {
	public constructor(props: IEditorSceneInputActionsInspectorProps) {
		super(props);

		this.props.scene.metadata ??= {};
	}

	public render(): ReactNode {
		const metadata = (this.props.scene.metadata ??= {});

		const o = {
			enabled: Boolean(metadata.inputEnabled),
		};

		const actionMaps: IInputActionMap[] = Array.isArray(metadata.inputActionMaps) ? metadata.inputActionMaps : [];

		return (
			<EditorInspectorSectionField title="Input Actions">
				<EditorInspectorSwitchField object={o} property="enabled" label="Enabled" noUndoRedo onChange={() => this._handleEnabledChange()} />

				{metadata.inputEnabled && (
					<div className="flex flex-col gap-2 px-2 py-1">
						{actionMaps.map((map, mapIndex) => {
							const actions = map.actions ?? [];
							return (
								<div key={mapIndex} className="flex flex-col gap-2 p-2 rounded-lg bg-muted-foreground/5 border border-muted-foreground/15">
									<div className="flex justify-between items-center">
										<div className="font-semibold text-sm">{map.name}</div>
										<div className="text-xs text-muted-foreground">{actions.length} actions</div>
									</div>

									{actions.map((action, actionIndex) => (
										<div key={actionIndex} className="flex flex-col gap-1 p-2 rounded bg-background/40">
											<div className="flex justify-between items-center">
												<div className="text-xs font-medium text-muted-foreground">Action #{actionIndex + 1}</div>
												<Button variant="ghost" size="sm" onClick={() => this._handleRemoveAction(mapIndex, actionIndex)}>
													<IoCloseOutline className="w-4 h-4" />
												</Button>
											</div>
											<EditorInspectorStringField object={action} property="name" label="Action" onChange={() => this.forceUpdate()} />
											<EditorInspectorListField
												object={action}
												property="type"
												label="Type"
												items={[
													{ text: "Button", value: "button" },
													{ text: "Axis 1D", value: "axis1d" },
													{ text: "Axis 2D", value: "axis2d" },
												]}
												onChange={() => this.forceUpdate()}
											/>
										</div>
									))}

									<div className="flex gap-2">
										<Button variant="outline" size="sm" className="flex gap-1 items-center flex-1" onClick={() => this._handleAddAction(mapIndex)}>
											<AiOutlinePlus className="w-3 h-3" />
											Add Action
										</Button>
										<Button variant="ghost" size="sm" className="flex gap-1 items-center" onClick={() => this._handleResetDefaultControls()}>
											<AiOutlineReload className="w-3 h-3" />
											Reset Default Controls
										</Button>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</EditorInspectorSectionField>
		);
	}

	private _handleEnabledChange(): void {
		const currentMetadata = (this.props.scene.metadata ??= {});
		const previousEnabled = Boolean(currentMetadata.inputEnabled);
		const previousMaps = currentMetadata.inputActionMaps ? JSON.parse(JSON.stringify(currentMetadata.inputActionMaps)) : undefined;

		registerUndoRedo({
			executeRedo: true,
			action: () => this.forceUpdate(),
			undo: () => {
				const metadata = (this.props.scene.metadata ??= {});
				metadata.inputEnabled = previousEnabled;
				if (previousMaps) {
					metadata.inputActionMaps = JSON.parse(JSON.stringify(previousMaps));
				} else {
					delete metadata.inputActionMaps;
				}
			},
			redo: () => {
				const metadata = (this.props.scene.metadata ??= {});
				metadata.inputEnabled = !previousEnabled;
				if (!previousEnabled && !Array.isArray(metadata.inputActionMaps)) {
					metadata.inputActionMaps = [InputManager.CreateDefaultActionMap()];
				}
			},
		});

		this.forceUpdate();
	}

	private _handleAddAction(mapIndex: number): void {
		const currentMaps = this.props.scene.metadata?.inputActionMaps;
		const currentMap = Array.isArray(currentMaps) ? currentMaps[mapIndex] : undefined;
		if (!currentMap) {
			return;
		}

		currentMap.actions ??= [];
		const newAction = {
			name: `Action_${currentMap.actions.length + 1}`,
			type: "button" as const,
			bindings: [],
		};

		registerUndoRedo({
			executeRedo: true,
			action: () => this.forceUpdate(),
			undo: () => {
				const map = this.props.scene.metadata?.inputActionMaps?.[mapIndex];
				if (Array.isArray(map?.actions)) {
					map.actions.pop();
				}
			},
			redo: () => {
				const map = this.props.scene.metadata?.inputActionMaps?.[mapIndex];
				if (map) {
					map.actions ??= [];
					map.actions.push(newAction);
				}
			},
		});

		this.forceUpdate();
	}

	private _handleRemoveAction(mapIndex: number, actionIndex: number): void {
		const currentMap = this.props.scene.metadata?.inputActionMaps?.[mapIndex];
		if (!currentMap || !Array.isArray(currentMap.actions)) {
			return;
		}

		const removed = currentMap.actions[actionIndex];
		registerUndoRedo({
			executeRedo: true,
			action: () => this.forceUpdate(),
			undo: () => {
				const map = this.props.scene.metadata?.inputActionMaps?.[mapIndex];
				if (Array.isArray(map?.actions)) {
					map.actions.splice(actionIndex, 0, removed);
				}
			},
			redo: () => {
				const map = this.props.scene.metadata?.inputActionMaps?.[mapIndex];
				if (Array.isArray(map?.actions)) {
					map.actions.splice(actionIndex, 1);
				}
			},
		});

		this.forceUpdate();
	}

	private _handleResetDefaultControls(): void {
		const currentMetadata = (this.props.scene.metadata ??= {});
		const previousMaps = currentMetadata.inputActionMaps ? JSON.parse(JSON.stringify(currentMetadata.inputActionMaps)) : undefined;

		registerUndoRedo({
			executeRedo: true,
			action: () => this.forceUpdate(),
			undo: () => {
				const metadata = (this.props.scene.metadata ??= {});
				if (previousMaps) {
					metadata.inputActionMaps = JSON.parse(JSON.stringify(previousMaps));
				} else {
					delete metadata.inputActionMaps;
				}
			},
			redo: () => {
				const metadata = (this.props.scene.metadata ??= {});
				metadata.inputActionMaps = [InputManager.CreateDefaultActionMap()];
			},
		});

		this.forceUpdate();
	}
}
