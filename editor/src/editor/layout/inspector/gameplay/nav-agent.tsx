import { Component, ReactNode } from "react";
import { AiOutlinePlus, AiOutlineDelete } from "react-icons/ai";

import { TransformNode } from "babylonjs";

import { Editor } from "../../../main";

import { Button } from "../../../../ui/shadcn/ui/button";

import { registerUndoRedo } from "../../../../tools/undoredo";

import { EditorInspectorSwitchField } from "../fields/switch";
import { EditorInspectorNumberField } from "../fields/number";
import { EditorInspectorSectionField } from "../fields/section";

export interface IEditorNavAgentInspectorProps {
	editor?: Editor;
	object: TransformNode;
}

export class EditorNavAgentInspector extends Component<IEditorNavAgentInspectorProps> {
	public constructor(props: IEditorNavAgentInspectorProps) {
		super(props);

		this.props.object.metadata ??= {};
	}

	public render(): ReactNode {
		const metadata = (this.props.object.metadata ??= {});
		const nav = metadata.navAgent;

		const o = {
			enabled: Boolean(nav?.enabled),
		};

		const waypoints: any[] = Array.isArray(nav?.patrolWaypoints) ? nav.patrolWaypoints : [];

		return (
			<EditorInspectorSectionField title="Navigation Agent">
				<EditorInspectorSwitchField object={o} property="enabled" label="Enabled" noUndoRedo onChange={() => this._handleEnabledChange()} />

				{nav?.enabled && (
					<>
						<EditorInspectorNumberField object={nav} property="speed" label="Speed" min={0} step={0.1} />
						<EditorInspectorNumberField object={nav} property="angularSpeed" label="Angular Speed" min={1} step={10} />
						<EditorInspectorNumberField object={nav} property="acceleration" label="Acceleration" min={0.1} step={0.5} />
						<EditorInspectorNumberField
							object={nav}
							property="stoppingDistance"
							label="Stopping Distance"
							min={0.01}
							step={0.05}
							onChange={() => this._refreshGizmo()}
						/>
						<EditorInspectorNumberField object={nav} property="radius" label="Radius" min={0.05} step={0.05} onChange={() => this._refreshGizmo()} />
						<EditorInspectorNumberField object={nav} property="height" label="Height" min={0.1} step={0.1} onChange={() => this._refreshGizmo()} />
						<EditorInspectorSwitchField object={nav} property="autoBraking" label="Auto Braking" />
						<EditorInspectorSwitchField object={nav} property="obstacleAvoidance" label="Obstacle Avoidance" onChange={() => this.forceUpdate()} />
						{nav.obstacleAvoidance && <EditorInspectorNumberField object={nav} property="avoidanceRadius" label="Avoidance Radius" min={0.1} step={0.1} />}
						<EditorInspectorSwitchField object={nav} property="patrolLoop" label="Patrol Loop" onChange={() => this._refreshGizmo()} />

						<div className="flex flex-col gap-2 px-2 py-1">
							<div className="flex justify-between items-center">
								<div className="font-semibold text-sm">Patrol Waypoints</div>
								<Button variant="outline" size="sm" className="flex gap-1 items-center" onClick={() => this._handleAddWaypoint()}>
									<AiOutlinePlus className="w-3 h-3" />
									Add Waypoint
								</Button>
							</div>

							{waypoints.map((wp, index) => (
								<div key={index} className="flex flex-col gap-1 p-2 rounded-lg bg-muted-foreground/5 border border-muted-foreground/15">
									<div className="flex justify-between items-center">
										<div className="text-xs font-medium text-muted-foreground">Waypoint #{index + 1}</div>
										<Button variant="ghost" size="sm" onClick={() => this._handleRemoveWaypoint(index)}>
											<AiOutlineDelete className="w-4 h-4" />
										</Button>
									</div>
									<EditorInspectorNumberField object={wp} property="x" label="X" step={0.25} onChange={() => this._refreshGizmo()} />
									<EditorInspectorNumberField object={wp} property="y" label="Y" step={0.25} onChange={() => this._refreshGizmo()} />
									<EditorInspectorNumberField object={wp} property="z" label="Z" step={0.25} onChange={() => this._refreshGizmo()} />
								</div>
							))}
						</div>
					</>
				)}
			</EditorInspectorSectionField>
		);
	}

	private _refreshGizmo(): void {
		this.props.editor?.layout?.preview?.gizmo?.refreshGameplayGizmo();
	}

	private _handleEnabledChange(): void {
		const currentMetadata = (this.props.object.metadata ??= {});
		const previousConfig = currentMetadata.navAgent ? JSON.parse(JSON.stringify(currentMetadata.navAgent)) : undefined;

		registerUndoRedo({
			executeRedo: true,
			action: () => {
				this._refreshGizmo();
				this.forceUpdate();
			},
			undo: () => {
				const metadata = (this.props.object.metadata ??= {});
				if (previousConfig) {
					metadata.navAgent = JSON.parse(JSON.stringify(previousConfig));
				} else {
					delete metadata.navAgent;
				}
			},
			redo: () => {
				const metadata = (this.props.object.metadata ??= {});
				if (previousConfig?.enabled) {
					delete metadata.navAgent;
				} else {
					metadata.navAgent = {
						enabled: true,
						radius: 0.5,
						height: 1.8,
						speed: 3.5,
						angularSpeed: 360,
						acceleration: 8.0,
						stoppingDistance: 0.2,
						autoBraking: true,
						obstacleAvoidance: true,
						avoidanceRadius: 1.5,
						patrolLoop: true,
						patrolWaypoints: [],
					};
				}
			},
		});

		this._refreshGizmo();
		this.forceUpdate();
	}

	private _handleAddWaypoint(): void {
		const nav = this.props.object.metadata?.navAgent;
		if (!nav) {
			return;
		}

		nav.patrolWaypoints ??= [];
		const pos = this.props.object.position;
		const newWaypoint = {
			x: Number(pos.x.toFixed(2)),
			y: Number(pos.y.toFixed(2)),
			z: Number(pos.z.toFixed(2)),
		};

		registerUndoRedo({
			executeRedo: true,
			action: () => {
				this._refreshGizmo();
				this.forceUpdate();
			},
			undo: () => {
				const currentNav = this.props.object.metadata?.navAgent;
				if (Array.isArray(currentNav?.patrolWaypoints)) {
					currentNav.patrolWaypoints.pop();
				}
			},
			redo: () => {
				const currentNav = this.props.object.metadata?.navAgent;
				if (currentNav) {
					currentNav.patrolWaypoints ??= [];
					currentNav.patrolWaypoints.push(newWaypoint);
				}
			},
		});

		this._refreshGizmo();
		this.forceUpdate();
	}

	private _handleRemoveWaypoint(index: number): void {
		const nav = this.props.object.metadata?.navAgent;
		if (!nav || !Array.isArray(nav.patrolWaypoints)) {
			return;
		}

		const removed = nav.patrolWaypoints[index];
		registerUndoRedo({
			executeRedo: true,
			action: () => {
				this._refreshGizmo();
				this.forceUpdate();
			},
			undo: () => {
				const currentNav = this.props.object.metadata?.navAgent;
				if (Array.isArray(currentNav?.patrolWaypoints)) {
					currentNav.patrolWaypoints.splice(index, 0, removed);
				}
			},
			redo: () => {
				const currentNav = this.props.object.metadata?.navAgent;
				if (Array.isArray(currentNav?.patrolWaypoints)) {
					currentNav.patrolWaypoints.splice(index, 1);
				}
			},
		});

		this._refreshGizmo();
		this.forceUpdate();
	}
}
