import { Component, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { AiOutlinePlus, AiOutlineDelete, AiOutlineNodeIndex, AiOutlineAppstore, AiOutlineCheckCircle } from "react-icons/ai";

import { TransformNode } from "babylonjs";

import { Button } from "../../../../ui/shadcn/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../ui/shadcn/ui/dialog";

import { registerUndoRedo } from "../../../../tools/undoredo";

import { EditorInspectorListField } from "../fields/list";
import { EditorInspectorStringField } from "../fields/string";
import { EditorInspectorSwitchField } from "../fields/switch";
import { EditorInspectorNumberField } from "../fields/number";

export interface IEditorAnimationFSMGraphDialogProps {
	open: boolean;
	object: TransformNode;
	onClose: () => void;
	onModified: () => void;
}

export interface IEditorAnimationFSMSelectedTransition {
	stateIndex: number;
	transitionIndex: number;
}

export interface IEditorAnimationFSMGraphDialogState {
	selectedStateIndex: number | null;
	selectedTransition: IEditorAnimationFSMSelectedTransition | null;
	connectFromStateIndex: number | null;
}

const NODE_WIDTH = 176;
const NODE_HEIGHT = 82;

export class EditorAnimationFSMGraphDialog extends Component<IEditorAnimationFSMGraphDialogProps, IEditorAnimationFSMGraphDialogState> {
	private _draggingStateIndex: number | null = null;
	private _dragStartMouse: { x: number; y: number } = { x: 0, y: 0 };
	private _dragStartPos: { x: number; y: number } = { x: 0, y: 0 };

	private _mouseMoveListener: ((ev: MouseEvent) => void) | null = null;
	private _mouseUpListener: ((ev: MouseEvent) => void) | null = null;

	public constructor(props: IEditorAnimationFSMGraphDialogProps) {
		super(props);

		this.state = {
			selectedStateIndex: 0,
			selectedTransition: null,
			connectFromStateIndex: null,
		};
	}

	public componentWillUnmount(): void {
		this._cleanupDragListeners();
	}

	public render(): ReactNode {
		const sm = this.props.object.metadata?.animationStateMachine;
		if (!sm) {
			return null;
		}

		const states: any[] = Array.isArray(sm.states) ? sm.states : [];
		const parameters: any[] = Array.isArray(sm.parameters) ? sm.parameters : [];
		const hasSelectedState = this.state.selectedStateIndex !== null && Boolean(states[this.state.selectedStateIndex]);
		const hasSelectedTransition =
			this.state.selectedTransition !== null && Boolean(states[this.state.selectedTransition.stateIndex]?.transitions?.[this.state.selectedTransition.transitionIndex]);

		return (
			<Dialog
				open={this.props.open}
				onOpenChange={(open) => {
					if (!open) {
						this.props.onClose();
					}
				}}
			>
				<DialogContent className="max-w-5xl w-[90vw] h-[80vh] flex flex-col p-4">
					<DialogHeader className="flex flex-row items-center justify-between pr-6">
						<DialogTitle>Animation State Machine Graph — {this.props.object.name}</DialogTitle>
					</DialogHeader>

					{/* Top Toolbar */}
					<div className="flex flex-wrap items-center gap-2 pb-2 border-b border-border">
						<Button variant="outline" size="sm" data-testid="fsm-add-state-btn" className="flex items-center gap-1" onClick={() => this._handleAddState()}>
							<AiOutlinePlus className="w-3.5 h-3.5" />
							Add State
						</Button>

						<Button variant="outline" size="sm" data-testid="fsm-auto-layout-btn" className="flex items-center gap-1" onClick={() => this._handleAutoLayout()}>
							<AiOutlineAppstore className="w-3.5 h-3.5" />
							Auto-Layout
						</Button>

						<Button
							variant={this.state.connectFromStateIndex !== null ? "default" : "outline"}
							size="sm"
							data-testid="fsm-connect-transition-btn"
							disabled={!hasSelectedState && this.state.connectFromStateIndex === null}
							className="flex items-center gap-1"
							onClick={() => this._handleToggleConnectMode()}
						>
							<AiOutlineNodeIndex className="w-3.5 h-3.5" />
							{this.state.connectFromStateIndex !== null ? "Click Target State (Cancel)" : "Connect Transition"}
						</Button>

						<Button
							variant="outline"
							size="sm"
							data-testid="fsm-set-initial-state-btn"
							disabled={!hasSelectedState}
							className="flex items-center gap-1"
							onClick={() => this._handleSetInitialState()}
						>
							<AiOutlineCheckCircle className="w-3.5 h-3.5" />
							Set as Initial State
						</Button>

						<Button
							variant="destructive"
							size="sm"
							data-testid="fsm-delete-selected-btn"
							disabled={!hasSelectedState && !hasSelectedTransition}
							className="flex items-center gap-1 ml-auto"
							onClick={() => this._handleDeleteSelected()}
						>
							<AiOutlineDelete className="w-3.5 h-3.5" />
							Delete Selected
						</Button>
					</div>

					{/* Main Split View */}
					<div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
						{/* Interactive Graph Canvas */}
						<div
							className="flex-1 relative bg-zinc-950/90 border border-border rounded-lg overflow-auto select-none"
							onClick={() => {
								if (this.state.connectFromStateIndex !== null) {
									this.setState({ connectFromStateIndex: null });
								}
							}}
						>
							<div className="relative min-w-[1100px] min-h-[700px] w-full h-full">
								{/* SVG Transitions Layer */}
								<svg className="absolute inset-0 w-full h-full pointer-events-none">
									<defs>
										<marker id="fsm-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
											<path d="M 0 1 L 10 5 L 0 9 z" fill="#94a3b8" />
										</marker>
										<marker id="fsm-arrow-selected" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
											<path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
										</marker>
									</defs>

									{this._renderTransitionEdges(states)}
								</svg>

								{/* Draggable State Nodes */}
								{states.map((state, idx) => this._renderStateNode(state, idx, sm.initialState))}
							</div>
						</div>

						{/* Right Side Inspector Panel */}
						<div className="w-80 border border-border rounded-lg p-3 overflow-y-auto flex flex-col gap-3 bg-muted/10">
							{this._renderRightInspector(sm, states, parameters)}
						</div>
					</div>
				</DialogContent>
			</Dialog>
		);
	}

	private _getNodePosition(state: any, index: number): { x: number; y: number } {
		const x = typeof state?.position?.x === "number" ? state.position.x : 60 + (index % 3) * 230;
		const y = typeof state?.position?.y === "number" ? state.position.y : 80 + Math.floor(index / 3) * 140;
		return { x, y };
	}

	private _renderTransitionEdges(states: any[]): ReactNode {
		const elements: ReactNode[] = [];

		states.forEach((sourceState, sIdx) => {
			const transitions: any[] = Array.isArray(sourceState.transitions) ? sourceState.transitions : [];
			const srcPos = this._getNodePosition(sourceState, sIdx);
			const sx = srcPos.x + NODE_WIDTH / 2;
			const sy = srcPos.y + NODE_HEIGHT / 2;

			transitions.forEach((tr, tIdx) => {
				const targetIdx = states.findIndex((st) => st.name === tr.targetState);
				if (targetIdx === -1) {
					return;
				}

				const targetState = states[targetIdx];
				const tgtPos = this._getNodePosition(targetState, targetIdx);
				const tx = tgtPos.x + NODE_WIDTH / 2;
				const ty = tgtPos.y + NODE_HEIGHT / 2;

				const dx = tx - sx;
				const dy = ty - sy;
				const dist = Math.max(1, Math.hypot(dx, dy));
				const nx = -dy / dist;
				const ny = dx / dist;

				// Offset bidirectional edges slightly so they don't overlap
				const curveOffset = 18 + tIdx * 10;
				const cx = (sx + tx) / 2 + nx * curveOffset;
				const cy = (sy + ty) / 2 + ny * curveOffset;

				const startX = sx + (dx / dist) * (NODE_WIDTH * 0.42);
				const startY = sy + (dy / dist) * (NODE_HEIGHT * 0.45);
				const endX = tx - (dx / dist) * (NODE_WIDTH * 0.45);
				const endY = ty - (dy / dist) * (NODE_HEIGHT * 0.48);

				const isSelected = this.state.selectedTransition?.stateIndex === sIdx && this.state.selectedTransition?.transitionIndex === tIdx;

				const pathD = `M ${startX} ${startY} Q ${cx} ${cy} ${endX} ${endY}`;
				const midX = 0.25 * startX + 0.5 * cx + 0.25 * endX;
				const midY = 0.25 * startY + 0.5 * cy + 0.25 * endY;

				const condCount = Array.isArray(tr.conditions) ? tr.conditions.length : 0;
				const labelText = condCount > 0 ? `${condCount} cond (${tr.duration ?? 0.2}s)` : `${tr.duration ?? 0.2}s`;

				elements.push(
					<g key={`${sIdx}-${tIdx}`}>
						<path
							d={pathD}
							fill="none"
							stroke={isSelected ? "#38bdf8" : "#94a3b8"}
							strokeWidth={isSelected ? 2.5 : 1.75}
							markerEnd={isSelected ? "url(#fsm-arrow-selected)" : "url(#fsm-arrow)"}
						/>
						<g
							className="pointer-events-auto cursor-pointer"
							onClick={(ev) => {
								ev.stopPropagation();
								this.setState({
									selectedStateIndex: null,
									selectedTransition: { stateIndex: sIdx, transitionIndex: tIdx },
								});
							}}
						>
							<rect
								x={midX - 42}
								y={midY - 10}
								width={84}
								height={20}
								rx={5}
								fill={isSelected ? "#0284c7" : "#18181b"}
								stroke={isSelected ? "#38bdf8" : "#3f3f46"}
								strokeWidth={1}
							/>
							<text x={midX} y={midY + 4} textAnchor="middle" fill="#f4f4f5" fontSize={10}>
								{labelText}
							</text>
						</g>
					</g>
				);
			});
		});

		return elements;
	}

	private _renderStateNode(state: any, index: number, initialStateName: string): ReactNode {
		const pos = this._getNodePosition(state, index);
		const isSelected = this.state.selectedStateIndex === index;
		const isInitial = initialStateName === state.name;
		const isBlendTree = state.type === "blendTree" || Boolean(state.blendTree);
		const transitionsCount = Array.isArray(state.transitions) ? state.transitions.length : 0;

		return (
			<div
				key={index}
				style={{
					left: `${pos.x}px`,
					top: `${pos.y}px`,
					width: `${NODE_WIDTH}px`,
					minHeight: `${NODE_HEIGHT}px`,
				}}
				onMouseDown={(ev) => this._handleNodeMouseDown(ev, index)}
				onClick={(ev) => {
					ev.stopPropagation();
					if (this.state.connectFromStateIndex !== null) {
						this._handleCompleteConnectTransition(this.state.connectFromStateIndex, index);
						return;
					}
					this.setState({
						selectedStateIndex: index,
						selectedTransition: null,
					});
				}}
				className={`
					absolute rounded-lg p-2.5 cursor-grab active:cursor-grabbing border transition-shadow
					${isSelected ? "border-sky-400 ring-2 ring-sky-400/30 bg-zinc-900" : "border-zinc-700 bg-zinc-900/90 hover:border-zinc-500"}
				`}
			>
				<div className="flex items-center justify-between gap-1 mb-1">
					<div className="font-semibold text-xs text-white truncate">{state.name || `State_${index + 1}`}</div>
					{isInitial && <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">INITIAL</span>}
				</div>

				<div className="text-[11px] text-zinc-400 truncate">{isBlendTree ? "1D Blend Tree" : `Clip: ${state.animationGroupName || "None"}`}</div>

				<div className="flex items-center justify-between mt-2 text-[10px] text-zinc-500">
					<span>{`${state.speed ?? 1}x ${state.loop !== false ? "↻" : "→"}`}</span>
					<span>{`${transitionsCount} trans`}</span>
				</div>
			</div>
		);
	}

	private _renderRightInspector(sm: any, states: any[], parameters: any[]): ReactNode {
		if (this.state.selectedTransition !== null) {
			const { stateIndex, transitionIndex } = this.state.selectedTransition;
			const sourceState = states[stateIndex];
			const transition = sourceState?.transitions?.[transitionIndex];
			if (!sourceState || !transition) {
				return <div className="text-xs text-muted-foreground">Select a state or transition to inspect.</div>;
			}

			const conditions: any[] = Array.isArray(transition.conditions) ? transition.conditions : [];
			const stateItems = states.map((st) => ({
				text: st.name || "Unnamed",
				value: st.name || "",
			}));
			const paramItems = parameters.map((p) => ({
				text: p.name || "param",
				value: p.name || "",
			}));

			return (
				<div className="flex flex-col gap-2">
					<div className="font-semibold text-sm border-b border-border pb-1">
						Transition: {sourceState.name} → {transition.targetState || "?"}
					</div>

					<EditorInspectorListField object={transition} property="targetState" label="Target State" items={stateItems} onChange={() => this._notifyModified()} />
					<EditorInspectorNumberField object={transition} property="duration" label="Duration (s)" min={0} step={0.05} onChange={() => this._notifyModified()} />
					<EditorInspectorSwitchField object={transition} property="hasExitTime" label="Has Exit Time" onChange={() => this._notifyModified()} />
					{transition.hasExitTime && (
						<EditorInspectorNumberField object={transition} property="exitTime" label="Exit Time" min={0} max={1} step={0.05} onChange={() => this._notifyModified()} />
					)}

					<div className="flex justify-between items-center mt-2">
						<div className="font-semibold text-xs">Conditions</div>
						<Button variant="outline" size="sm" className="h-7 text-xs flex gap-1 items-center" onClick={() => this._handleAddCondition(transition)}>
							<AiOutlinePlus className="w-3 h-3" />
							Add Condition
						</Button>
					</div>

					{conditions.map((cond, cIdx) => (
						<div key={cIdx} className="flex flex-col gap-1 p-2 rounded bg-background/60 border border-border">
							<div className="flex justify-between items-center">
								<span className="text-[11px] text-muted-foreground">Condition #{cIdx + 1}</span>
								<Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => this._handleRemoveCondition(transition, cIdx)}>
									<AiOutlineDelete className="w-3.5 h-3.5" />
								</Button>
							</div>
							{paramItems.length > 0 ? (
								<EditorInspectorListField object={cond} property="parameter" label="Parameter" items={paramItems} onChange={() => this._notifyModified()} />
							) : (
								<EditorInspectorStringField object={cond} property="parameter" label="Parameter" onChange={() => this._notifyModified()} />
							)}
							<EditorInspectorListField
								object={cond}
								property="operator"
								label="Operator"
								items={[
									{ text: ">", value: ">" },
									{ text: "<", value: "<" },
									{ text: "==", value: "==" },
									{ text: "!=", value: "!=" },
									{ text: ">=", value: ">=" },
									{ text: "<=", value: "<=" },
								]}
								onChange={() => this._notifyModified()}
							/>
							{typeof cond.threshold === "boolean" ? (
								<EditorInspectorSwitchField object={cond} property="threshold" label="Threshold" onChange={() => this._notifyModified()} />
							) : (
								<EditorInspectorNumberField object={cond} property="threshold" label="Threshold" step={0.1} onChange={() => this._notifyModified()} />
							)}
						</div>
					))}
				</div>
			);
		}

		if (this.state.selectedStateIndex !== null && states[this.state.selectedStateIndex]) {
			const state = states[this.state.selectedStateIndex];
			state.type ??= state.blendTree ? "blendTree" : "clip";
			const transitions: any[] = Array.isArray(state.transitions) ? state.transitions : [];
			const events: any[] = Array.isArray(state.events) ? state.events : [];
			const previousName = state.name;

			return (
				<div className="flex flex-col gap-2">
					<div className="font-semibold text-sm border-b border-border pb-1">State Inspector</div>

					<EditorInspectorStringField
						object={state}
						property="name"
						label="Name"
						onChange={(newName) => {
							if (sm.initialState === previousName) {
								sm.initialState = newName;
							}
							states.forEach((st) => {
								if (Array.isArray(st.transitions)) {
									st.transitions.forEach((tr: any) => {
										if (tr.targetState === previousName) {
											tr.targetState = newName;
										}
									});
								}
							});
							this._notifyModified();
						}}
					/>

					<EditorInspectorListField
						object={state}
						property="type"
						label="Type"
						items={[
							{ text: "Animation Clip", value: "clip" },
							{ text: "1D Blend Tree", value: "blendTree" },
						]}
						onChange={(newType) => {
							if (newType === "blendTree") {
								state.blendTree ??= {
									parameter: parameters[0]?.name ?? "speed",
									motions: [],
								};
							}
							this._notifyModified();
						}}
					/>

					{state.type === "blendTree" ? (
						<div className="flex flex-col gap-2 p-2 rounded bg-background/50 border border-border">
							<EditorInspectorStringField
								object={(state.blendTree ??= { parameter: "speed", motions: [] })}
								property="parameter"
								label="Parameter"
								onChange={() => this._notifyModified()}
							/>
							<div className="flex justify-between items-center">
								<span className="text-xs font-medium">Blend Motions</span>
								<Button variant="outline" size="sm" className="h-7 text-xs flex gap-1 items-center" onClick={() => this._handleAddBlendMotion(state)}>
									<AiOutlinePlus className="w-3 h-3" />
									Add Motion
								</Button>
							</div>
							{(Array.isArray(state.blendTree?.motions) ? state.blendTree.motions : []).map((motion: any, mIdx: number) => (
								<div key={mIdx} className="flex flex-col gap-1 p-1.5 rounded border border-border/60">
									<div className="flex justify-between items-center">
										<span className="text-[11px] text-muted-foreground">Motion #{mIdx + 1}</span>
										<Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => this._handleRemoveBlendMotion(state, mIdx)}>
											<AiOutlineDelete className="w-3.5 h-3.5" />
										</Button>
									</div>
									<EditorInspectorStringField object={motion} property="animationGroupName" label="Clip" onChange={() => this._notifyModified()} />
									<EditorInspectorNumberField object={motion} property="threshold" label="Threshold" step={0.1} onChange={() => this._notifyModified()} />
								</div>
							))}
						</div>
					) : (
						<EditorInspectorStringField object={state} property="animationGroupName" label="Animation Group" onChange={() => this._notifyModified()} />
					)}

					<EditorInspectorNumberField object={state} property="speed" label="Speed" step={0.1} onChange={() => this._notifyModified()} />
					<EditorInspectorSwitchField object={state} property="loop" label="Loop" onChange={() => this._notifyModified()} />

					{/* Outgoing Transitions */}
					<div className="flex justify-between items-center mt-2 pt-2 border-t border-border">
						<div className="font-semibold text-xs">Transitions</div>
						<Button
							variant="outline"
							size="sm"
							className="h-7 text-xs flex gap-1 items-center"
							onClick={() => this._handleAddTransitionFromState(this.state.selectedStateIndex!)}
						>
							<AiOutlinePlus className="w-3 h-3" />
							Add Transition
						</Button>
					</div>

					{transitions.map((tr, tIdx) => (
						<div
							key={tIdx}
							onClick={() =>
								this.setState({
									selectedTransition: { stateIndex: this.state.selectedStateIndex!, transitionIndex: tIdx },
									selectedStateIndex: null,
								})
							}
							className="flex items-center justify-between p-2 rounded bg-background/60 border border-border hover:border-sky-400 cursor-pointer text-xs"
						>
							<span>→ {tr.targetState || "(None)"}</span>
							<span className="text-muted-foreground">{tr.duration ?? 0.2}s</span>
						</div>
					))}

					{/* Animation Events */}
					<div className="flex justify-between items-center mt-2 pt-2 border-t border-border">
						<div className="font-semibold text-xs">Animation Events</div>
						<Button variant="outline" size="sm" className="h-7 text-xs flex gap-1 items-center" onClick={() => this._handleAddEvent(state)}>
							<AiOutlinePlus className="w-3 h-3" />
							Add Event
						</Button>
					</div>

					{events.map((evItem, eIdx) => (
						<div key={eIdx} className="flex flex-col gap-1 p-2 rounded bg-background/60 border border-border">
							<div className="flex justify-between items-center">
								<span className="text-[11px] text-muted-foreground">Event #{eIdx + 1}</span>
								<Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => this._handleRemoveEvent(state, eIdx)}>
									<AiOutlineDelete className="w-3.5 h-3.5" />
								</Button>
							</div>
							<EditorInspectorStringField object={evItem} property="name" label="Event Name" onChange={() => this._notifyModified()} />
							<EditorInspectorNumberField
								object={evItem}
								property="time"
								label="Normalized Time"
								min={0}
								max={1}
								step={0.05}
								onChange={() => this._notifyModified()}
							/>
						</div>
					))}
				</div>
			);
		}

		return <div className="text-xs text-muted-foreground">Select a state node or transition arrow in the graph to edit its properties.</div>;
	}

	private _handleNodeMouseDown(ev: ReactMouseEvent<HTMLDivElement>, index: number): void {
		if (ev.button !== 0 || this.state.connectFromStateIndex !== null) {
			return;
		}

		const sm = this.props.object.metadata?.animationStateMachine;
		const state = sm?.states?.[index];
		if (!state) {
			return;
		}

		const startPos = this._getNodePosition(state, index);
		const initialPos = { x: startPos.x, y: startPos.y };
		this._draggingStateIndex = index;
		this._dragStartMouse = { x: ev.clientX, y: ev.clientY };
		this._dragStartPos = { x: startPos.x, y: startPos.y };

		this._cleanupDragListeners();

		this._mouseMoveListener = (moveEv: MouseEvent) => {
			if (this._draggingStateIndex === null) {
				return;
			}
			const st = this.props.object.metadata?.animationStateMachine?.states?.[this._draggingStateIndex];
			if (!st) {
				return;
			}
			const dx = moveEv.clientX - this._dragStartMouse.x;
			const dy = moveEv.clientY - this._dragStartMouse.y;
			st.position = {
				x: Math.max(12, Math.round(this._dragStartPos.x + dx)),
				y: Math.max(12, Math.round(this._dragStartPos.y + dy)),
			};
			this.forceUpdate();
		};

		this._mouseUpListener = () => {
			const dragIdx = this._draggingStateIndex;
			this._draggingStateIndex = null;
			this._cleanupDragListeners();

			const st = dragIdx !== null ? this.props.object.metadata?.animationStateMachine?.states?.[dragIdx] : null;
			if (st?.position && (st.position.x !== initialPos.x || st.position.y !== initialPos.y)) {
				const finalPos = { x: st.position.x, y: st.position.y };
				registerUndoRedo({
					executeRedo: false,
					action: () => {
						this.forceUpdate();
						this.props.onModified();
					},
					undo: () => {
						st.position = { ...initialPos };
					},
					redo: () => {
						st.position = { ...finalPos };
					},
				});
				this.props.onModified();
			}
		};

		window.addEventListener("mousemove", this._mouseMoveListener);
		window.addEventListener("mouseup", this._mouseUpListener);
	}

	private _cleanupDragListeners(): void {
		if (this._mouseMoveListener) {
			window.removeEventListener("mousemove", this._mouseMoveListener);
			this._mouseMoveListener = null;
		}
		if (this._mouseUpListener) {
			window.removeEventListener("mouseup", this._mouseUpListener);
			this._mouseUpListener = null;
		}
	}

	private _handleAddState(): void {
		const sm = this.props.object.metadata?.animationStateMachine;
		if (!sm) {
			return;
		}

		sm.states ??= [];
		const idx = sm.states.length;
		const newState = {
			name: `State_${idx + 1}`,
			type: "clip",
			animationGroupName: "",
			speed: 1,
			loop: true,
			position: {
				x: 80 + (idx % 3) * 220,
				y: 100 + Math.floor(idx / 3) * 140,
			},
			transitions: [],
			events: [],
		};

		registerUndoRedo({
			executeRedo: true,
			action: () => this._notifyModified(),
			undo: () => {
				sm.states.pop();
				this.setState({ selectedStateIndex: null });
			},
			redo: () => {
				sm.states.push(newState);
				this.setState({ selectedStateIndex: sm.states.length - 1, selectedTransition: null });
			},
		});

		this._notifyModified();
	}

	private _handleAutoLayout(): void {
		const sm = this.props.object.metadata?.animationStateMachine;
		if (!sm || !Array.isArray(sm.states)) {
			return;
		}

		const oldPositions = sm.states.map((st: any, idx: number) => ({ ...this._getNodePosition(st, idx) }));
		registerUndoRedo({
			executeRedo: true,
			action: () => this._notifyModified(),
			undo: () => {
				sm.states.forEach((st: any, idx: number) => {
					st.position = { ...oldPositions[idx] };
				});
			},
			redo: () => {
				sm.states.forEach((st: any, idx: number) => {
					st.position = {
						x: 60 + (idx % 3) * 240,
						y: 80 + Math.floor(idx / 3) * 150,
					};
				});
			},
		});

		this._notifyModified();
	}

	private _handleToggleConnectMode(): void {
		if (this.state.connectFromStateIndex !== null) {
			this.setState({ connectFromStateIndex: null });
			return;
		}
		if (this.state.selectedStateIndex !== null) {
			this.setState({ connectFromStateIndex: this.state.selectedStateIndex });
		}
	}

	private _handleCompleteConnectTransition(sourceIndex: number, targetIndex: number): void {
		const sm = this.props.object.metadata?.animationStateMachine;
		const sourceState = sm?.states?.[sourceIndex];
		const targetState = sm?.states?.[targetIndex];
		if (!sourceState || !targetState) {
			this.setState({ connectFromStateIndex: null });
			return;
		}

		sourceState.transitions ??= [];
		const newTransition = {
			targetState: targetState.name,
			duration: 0.2,
			hasExitTime: false,
			exitTime: 0.9,
			conditions: [],
		};

		registerUndoRedo({
			executeRedo: true,
			action: () => this._notifyModified(),
			undo: () => {
				sourceState.transitions.pop();
			},
			redo: () => {
				sourceState.transitions.push(newTransition);
			},
		});

		this.setState({
			connectFromStateIndex: null,
			selectedStateIndex: null,
			selectedTransition: {
				stateIndex: sourceIndex,
				transitionIndex: sourceState.transitions.length - 1,
			},
		});
		this._notifyModified();
	}

	private _handleAddTransitionFromState(stateIndex: number): void {
		const sm = this.props.object.metadata?.animationStateMachine;
		const sourceState = sm?.states?.[stateIndex];
		if (!sourceState) {
			return;
		}

		const fallbackTarget = sm.states.find((_: any, idx: number) => idx !== stateIndex)?.name ?? sourceState.name;
		sourceState.transitions ??= [];
		const newTransition = {
			targetState: fallbackTarget,
			duration: 0.2,
			hasExitTime: false,
			exitTime: 0.9,
			conditions: [],
		};

		registerUndoRedo({
			executeRedo: true,
			action: () => this._notifyModified(),
			undo: () => {
				sourceState.transitions.pop();
			},
			redo: () => {
				sourceState.transitions.push(newTransition);
			},
		});

		this.setState({
			selectedStateIndex: null,
			selectedTransition: {
				stateIndex,
				transitionIndex: sourceState.transitions.length - 1,
			},
		});
		this._notifyModified();
	}

	private _handleSetInitialState(): void {
		const sm = this.props.object.metadata?.animationStateMachine;
		if (!sm || this.state.selectedStateIndex === null) {
			return;
		}

		const state = sm.states?.[this.state.selectedStateIndex];
		if (!state) {
			return;
		}

		const oldInitial = sm.initialState;
		const newInitial = state.name;

		registerUndoRedo({
			executeRedo: true,
			action: () => this._notifyModified(),
			undo: () => {
				sm.initialState = oldInitial;
			},
			redo: () => {
				sm.initialState = newInitial;
			},
		});

		this._notifyModified();
	}

	private _handleDeleteSelected(): void {
		const sm = this.props.object.metadata?.animationStateMachine;
		if (!sm) {
			return;
		}

		if (this.state.selectedTransition !== null) {
			const { stateIndex, transitionIndex } = this.state.selectedTransition;
			const sourceState = sm.states?.[stateIndex];
			if (!sourceState || !Array.isArray(sourceState.transitions)) {
				return;
			}
			const removed = sourceState.transitions[transitionIndex];
			registerUndoRedo({
				executeRedo: true,
				action: () => this._notifyModified(),
				undo: () => {
					sourceState.transitions.splice(transitionIndex, 0, removed);
				},
				redo: () => {
					sourceState.transitions.splice(transitionIndex, 1);
				},
			});
			this.setState({ selectedTransition: null, selectedStateIndex: stateIndex });
			this._notifyModified();
			return;
		}

		if (this.state.selectedStateIndex !== null && Array.isArray(sm.states)) {
			const idx = this.state.selectedStateIndex;
			if (!sm.states[idx]) {
				return;
			}
			const removed = sm.states[idx];
			const oldInitial = sm.initialState;
			registerUndoRedo({
				executeRedo: true,
				action: () => this._notifyModified(),
				undo: () => {
					sm.states.splice(idx, 0, removed);
					sm.initialState = oldInitial;
				},
				redo: () => {
					sm.states.splice(idx, 1);
					if (sm.initialState === removed.name) {
						sm.initialState = sm.states[0]?.name ?? "";
					}
				},
			});
			this.setState({ selectedStateIndex: null, selectedTransition: null });
			this._notifyModified();
		}
	}

	private _handleAddCondition(transition: any): void {
		const sm = this.props.object.metadata?.animationStateMachine;
		const defaultParam = sm?.parameters?.[0]?.name ?? "speed";
		transition.conditions ??= [];
		const newCond = {
			parameter: defaultParam,
			operator: ">",
			threshold: 0.1,
		};

		registerUndoRedo({
			executeRedo: true,
			action: () => this._notifyModified(),
			undo: () => {
				transition.conditions.pop();
			},
			redo: () => {
				transition.conditions.push(newCond);
			},
		});

		this._notifyModified();
	}

	private _handleRemoveCondition(transition: any, index: number): void {
		if (!Array.isArray(transition.conditions)) {
			return;
		}
		const removed = transition.conditions[index];
		registerUndoRedo({
			executeRedo: true,
			action: () => this._notifyModified(),
			undo: () => {
				transition.conditions.splice(index, 0, removed);
			},
			redo: () => {
				transition.conditions.splice(index, 1);
			},
		});
		this._notifyModified();
	}

	private _handleAddBlendMotion(state: any): void {
		state.blendTree ??= { parameter: "speed", motions: [] };
		state.blendTree.motions ??= [];
		const newMotion = {
			animationGroupName: "",
			threshold: state.blendTree.motions.length * 1.0,
		};

		registerUndoRedo({
			executeRedo: true,
			action: () => this._notifyModified(),
			undo: () => {
				state.blendTree.motions.pop();
			},
			redo: () => {
				state.blendTree.motions.push(newMotion);
			},
		});
		this._notifyModified();
	}

	private _handleRemoveBlendMotion(state: any, index: number): void {
		if (!Array.isArray(state.blendTree?.motions)) {
			return;
		}
		const removed = state.blendTree.motions[index];
		registerUndoRedo({
			executeRedo: true,
			action: () => this._notifyModified(),
			undo: () => {
				state.blendTree.motions.splice(index, 0, removed);
			},
			redo: () => {
				state.blendTree.motions.splice(index, 1);
			},
		});
		this._notifyModified();
	}

	private _handleAddEvent(state: any): void {
		state.events ??= [];
		const newEvent = {
			name: `onEvent_${state.events.length + 1}`,
			time: 0.5,
		};
		registerUndoRedo({
			executeRedo: true,
			action: () => this._notifyModified(),
			undo: () => {
				state.events.pop();
			},
			redo: () => {
				state.events.push(newEvent);
			},
		});
		this._notifyModified();
	}

	private _handleRemoveEvent(state: any, index: number): void {
		if (!Array.isArray(state.events)) {
			return;
		}
		const removed = state.events[index];
		registerUndoRedo({
			executeRedo: true,
			action: () => this._notifyModified(),
			undo: () => {
				state.events.splice(index, 0, removed);
			},
			redo: () => {
				state.events.splice(index, 1);
			},
		});
		this._notifyModified();
	}

	private _notifyModified(): void {
		this.forceUpdate();
		this.props.onModified();
	}
}
