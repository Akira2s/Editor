import { Component, ReactNode } from "react";
import { AiOutlinePlus, AiOutlineDelete, AiOutlineNodeIndex } from "react-icons/ai";

import { TransformNode } from "babylonjs";

import { Editor } from "../../../main";

import { Button } from "../../../../ui/shadcn/ui/button";

import { registerUndoRedo } from "../../../../tools/undoredo";

import { EditorInspectorListField } from "../fields/list";
import { EditorInspectorStringField } from "../fields/string";
import { EditorInspectorSwitchField } from "../fields/switch";
import { EditorInspectorNumberField } from "../fields/number";
import { EditorInspectorSectionField } from "../fields/section";

import { EditorAnimationFSMGraphDialog } from "./animation-fsm-graph";

export interface IEditorAnimationStateMachineInspectorProps {
	editor?: Editor;
	object: TransformNode;
}

export interface IEditorAnimationStateMachineInspectorState {
	graphOpen: boolean;
}

export class EditorAnimationStateMachineInspector extends Component<IEditorAnimationStateMachineInspectorProps, IEditorAnimationStateMachineInspectorState> {
	public constructor(props: IEditorAnimationStateMachineInspectorProps) {
		super(props);

		this.props.object.metadata ??= {};
		this.state = {
			graphOpen: false,
		};
	}

	public render(): ReactNode {
		const metadata = (this.props.object.metadata ??= {});
		const sm = metadata.animationStateMachine;

		const o = {
			enabled: Boolean(sm?.enabled),
		};

		const parameters: any[] = Array.isArray(sm?.parameters) ? sm.parameters : [];
		const states: any[] = Array.isArray(sm?.states) ? sm.states : [];

		return (
			<EditorInspectorSectionField title="Animation State Machine">
				<EditorInspectorSwitchField object={o} property="enabled" label="Enabled" noUndoRedo onChange={() => this._handleEnabledChange()} />

				{sm?.enabled && (
					<>
						<div className="px-2 py-1">
							<Button
								variant="secondary"
								size="sm"
								data-testid="open-fsm-graph-btn"
								className="w-full flex items-center justify-center gap-2"
								onClick={() => this.setState({ graphOpen: true })}
							>
								<AiOutlineNodeIndex className="w-4 h-4" />
								Open State Machine Graph Editor
							</Button>
						</div>

						<EditorAnimationFSMGraphDialog
							open={this.state.graphOpen}
							object={this.props.object}
							onClose={() => this.setState({ graphOpen: false })}
							onModified={() => this.forceUpdate()}
						/>

						<EditorInspectorStringField object={sm} property="initialState" label="Initial State" />

						<div className="flex flex-col gap-2 px-2 py-1">
							<div className="flex justify-between items-center">
								<div className="font-semibold text-sm">Parameters</div>
								<Button variant="outline" size="sm" className="flex gap-1 items-center" onClick={() => this._handleAddParameter()}>
									<AiOutlinePlus className="w-3 h-3" />
									Add Parameter
								</Button>
							</div>

							{parameters.map((param, index) => (
								<div key={index} className="flex flex-col gap-1 p-2 rounded-lg bg-muted-foreground/5 border border-muted-foreground/15">
									<div className="flex justify-between items-center">
										<div className="text-xs font-medium text-muted-foreground">Parameter #{index + 1}</div>
										<Button variant="ghost" size="sm" onClick={() => this._handleRemoveParameter(index)}>
											<AiOutlineDelete className="w-4 h-4" />
										</Button>
									</div>
									<EditorInspectorStringField object={param} property="name" label="Name" />
									<EditorInspectorListField
										noUndoRedo
										object={param}
										property="type"
										label="Type"
										items={[
											{ text: "Float", value: "float" },
											{ text: "Int", value: "int" },
											{ text: "Bool", value: "bool" },
											{ text: "Trigger", value: "trigger" },
										]}
										onChange={(newType, oldType) => {
											const oldValue = param.value;
											const newValue = newType === "bool" || newType === "trigger" ? false : 0;

											registerUndoRedo({
												executeRedo: true,
												action: () => this.forceUpdate(),
												undo: () => {
													param.type = oldType;
													param.value = oldValue;
												},
												redo: () => {
													param.type = newType;
													param.value = newValue;
												},
											});

											this.forceUpdate();
										}}
									/>
									{(param.type === "float" || param.type === "int") && (
										<EditorInspectorNumberField object={param} property="value" label="Default Value" step={param.type === "int" ? 1 : 0.1} />
									)}
									{param.type === "bool" && <EditorInspectorSwitchField object={param} property="value" label="Default Value" />}
								</div>
							))}
						</div>

						<div className="flex flex-col gap-2 px-2 py-1">
							<div className="flex justify-between items-center">
								<div className="font-semibold text-sm">States</div>
								<Button variant="outline" size="sm" className="flex gap-1 items-center" onClick={() => this._handleAddState()}>
									<AiOutlinePlus className="w-3 h-3" />
									Add State
								</Button>
							</div>

							{states.map((state, index) => (
								<div key={index} className="flex flex-col gap-1 p-2 rounded-lg bg-muted-foreground/5 border border-muted-foreground/15">
									<div className="flex justify-between items-center">
										<div className="text-xs font-medium text-muted-foreground">State: {state.name || `#${index + 1}`}</div>
										<Button variant="ghost" size="sm" onClick={() => this._handleRemoveState(index)}>
											<AiOutlineDelete className="w-4 h-4" />
										</Button>
									</div>
									<EditorInspectorStringField object={state} property="name" label="Name" onChange={() => this.forceUpdate()} />
									<EditorInspectorStringField object={state} property="animationGroupName" label="Animation Group" />
									<EditorInspectorNumberField object={state} property="speed" label="Speed" step={0.1} />
									<EditorInspectorSwitchField object={state} property="loop" label="Loop" />
								</div>
							))}
						</div>
					</>
				)}
			</EditorInspectorSectionField>
		);
	}

	private _handleEnabledChange(): void {
		const currentMetadata = (this.props.object.metadata ??= {});
		const previousConfig = currentMetadata.animationStateMachine ? JSON.parse(JSON.stringify(currentMetadata.animationStateMachine)) : undefined;

		registerUndoRedo({
			executeRedo: true,
			action: () => this.forceUpdate(),
			undo: () => {
				const metadata = (this.props.object.metadata ??= {});
				if (previousConfig) {
					metadata.animationStateMachine = JSON.parse(JSON.stringify(previousConfig));
				} else {
					delete metadata.animationStateMachine;
				}
			},
			redo: () => {
				const metadata = (this.props.object.metadata ??= {});
				if (previousConfig?.enabled) {
					delete metadata.animationStateMachine;
				} else {
					metadata.animationStateMachine = {
						enabled: true,
						initialState: "Idle",
						parameters: [{ name: "speed", type: "float", value: 0 }],
						states: [{ name: "Idle", animationGroupName: "", speed: 1, loop: true, transitions: [] }],
					};
				}
			},
		});

		this.forceUpdate();
	}

	private _handleAddParameter(): void {
		const currentSm = this.props.object.metadata?.animationStateMachine;
		if (!currentSm) {
			return;
		}

		currentSm.parameters ??= [];
		const newParam = {
			name: `param_${currentSm.parameters.length + 1}`,
			type: "float",
			value: 0,
		};

		registerUndoRedo({
			executeRedo: true,
			action: () => this.forceUpdate(),
			undo: () => {
				const sm = this.props.object.metadata?.animationStateMachine;
				if (Array.isArray(sm?.parameters)) {
					sm.parameters.pop();
				}
			},
			redo: () => {
				const sm = this.props.object.metadata?.animationStateMachine;
				if (sm) {
					sm.parameters ??= [];
					sm.parameters.push(newParam);
				}
			},
		});

		this.forceUpdate();
	}

	private _handleRemoveParameter(index: number): void {
		const currentSm = this.props.object.metadata?.animationStateMachine;
		if (!currentSm || !Array.isArray(currentSm.parameters)) {
			return;
		}

		const removed = currentSm.parameters[index];
		registerUndoRedo({
			executeRedo: true,
			action: () => this.forceUpdate(),
			undo: () => {
				const sm = this.props.object.metadata?.animationStateMachine;
				if (Array.isArray(sm?.parameters)) {
					sm.parameters.splice(index, 0, removed);
				}
			},
			redo: () => {
				const sm = this.props.object.metadata?.animationStateMachine;
				if (Array.isArray(sm?.parameters)) {
					sm.parameters.splice(index, 1);
				}
			},
		});

		this.forceUpdate();
	}

	private _handleAddState(): void {
		const currentSm = this.props.object.metadata?.animationStateMachine;
		if (!currentSm) {
			return;
		}

		currentSm.states ??= [];
		const newState = {
			name: `State_${currentSm.states.length + 1}`,
			animationGroupName: "",
			speed: 1,
			loop: true,
			transitions: [],
		};

		registerUndoRedo({
			executeRedo: true,
			action: () => this.forceUpdate(),
			undo: () => {
				const sm = this.props.object.metadata?.animationStateMachine;
				if (Array.isArray(sm?.states)) {
					sm.states.pop();
				}
			},
			redo: () => {
				const sm = this.props.object.metadata?.animationStateMachine;
				if (sm) {
					sm.states ??= [];
					sm.states.push(newState);
				}
			},
		});

		this.forceUpdate();
	}

	private _handleRemoveState(index: number): void {
		const currentSm = this.props.object.metadata?.animationStateMachine;
		if (!currentSm || !Array.isArray(currentSm.states)) {
			return;
		}

		const removed = currentSm.states[index];
		registerUndoRedo({
			executeRedo: true,
			action: () => this.forceUpdate(),
			undo: () => {
				const sm = this.props.object.metadata?.animationStateMachine;
				if (Array.isArray(sm?.states)) {
					sm.states.splice(index, 0, removed);
				}
			},
			redo: () => {
				const sm = this.props.object.metadata?.animationStateMachine;
				if (Array.isArray(sm?.states)) {
					sm.states.splice(index, 1);
				}
			},
		});

		this.forceUpdate();
	}
}
