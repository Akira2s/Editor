import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Observable, Observer } from "@babylonjs/core/Misc/observable";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";

import { IAnimationEvent, IAnimationParameter, IAnimationState, IAnimationStateMachineData, IAnimationTransition, IBlendTree1D, ITransitionCondition } from "./types";

interface IActiveTransition {
	fromState: IAnimationState;
	toState: IAnimationState;
	duration: number;
	elapsedTime: number;
}

export class AnimationStateMachine {
	public readonly onStateChanged: Observable<{ from: string; to: string }> = new Observable<{ from: string; to: string }>();
	public readonly onAnimationEvent: Observable<IAnimationEvent> = new Observable<IAnimationEvent>();

	private _scene: Scene | null = null;
	private _node: TransformNode | null = null;
	private _sceneDisposeObserver: Observer<Scene> | null = null;
	private _parameters: Map<string, IAnimationParameter> = new Map<string, IAnimationParameter>();
	private _states: Map<string, IAnimationState> = new Map<string, IAnimationState>();
	private _initialState: string | null = null;
	private _currentState: IAnimationState | null = null;
	private _currentTransition: IActiveTransition | null = null;
	private _stateTime: number = 0;
	private _firedEvents: Set<IAnimationEvent> = new Set<IAnimationEvent>();
	private _isDisposed: boolean = false;
	private _animationGroups: Map<string, AnimationGroup> = new Map<string, AnimationGroup>();

	public constructor(scene?: Scene | null, node?: TransformNode | null) {
		this._scene = scene ?? null;
		this._node = node ?? null;

		if (this._scene?.onDisposeObservable) {
			this._sceneDisposeObserver = this._scene.onDisposeObservable.addOnce(() => {
				this.dispose();
			});
		}
	}

	public get scene(): Scene | null {
		return this._scene;
	}

	public get node(): TransformNode | null {
		return this._node;
	}

	public get isDisposed(): boolean {
		return this._isDisposed;
	}

	public get initialState(): string | null {
		return this._initialState;
	}

	public get currentState(): IAnimationState | null {
		return this._currentState;
	}

	public get normalizedTime(): number {
		if (!this._currentState) {
			return 0;
		}
		const duration = this._getStateDuration(this._currentState);
		if (duration <= 0) {
			return 0;
		}
		return Math.min(1.0, this._stateTime / duration);
	}

	public get states(): IAnimationState[] {
		return Array.from(this._states.values());
	}

	// ---------------------------------------------------------------------------
	// Parameters (Blackboard)
	// ---------------------------------------------------------------------------

	public setFloat(name: string, value: number): void {
		if (!Number.isFinite(value)) {
			return;
		}
		const param = this._parameters.get(name);
		if (param) {
			param.type = "float";
			param.value = value;
		} else {
			this._parameters.set(name, { name, type: "float", value });
		}
	}

	public setInt(name: string, value: number): void {
		if (!Number.isFinite(value)) {
			return;
		}
		const intVal = Math.trunc(value);
		const param = this._parameters.get(name);
		if (param) {
			param.type = "int";
			param.value = intVal;
		} else {
			this._parameters.set(name, { name, type: "int", value: intVal });
		}
	}

	public setBool(name: string, value: boolean): void {
		const boolVal = Boolean(value);
		const param = this._parameters.get(name);
		if (param) {
			param.type = "bool";
			param.value = boolVal;
		} else {
			this._parameters.set(name, { name, type: "bool", value: boolVal });
		}
	}

	public setTrigger(name: string): void {
		const param = this._parameters.get(name);
		if (param) {
			param.type = "trigger";
			param.value = true;
		} else {
			this._parameters.set(name, { name, type: "trigger", value: true });
		}
	}

	public resetTrigger(name: string): void {
		const param = this._parameters.get(name);
		if (param && param.type === "trigger") {
			param.value = false;
		}
	}

	public getFloat(name: string): number {
		const param = this._parameters.get(name);
		if (!param) {
			return 0;
		}
		if (typeof param.value === "number") {
			return Number.isFinite(param.value) ? param.value : 0;
		}
		return param.value ? 1 : 0;
	}

	public getInt(name: string): number {
		const param = this._parameters.get(name);
		if (!param) {
			return 0;
		}
		if (typeof param.value === "number") {
			return Number.isFinite(param.value) ? Math.trunc(param.value) : 0;
		}
		return param.value ? 1 : 0;
	}

	public getBool(name: string): boolean {
		const param = this._parameters.get(name);
		if (!param) {
			return false;
		}
		return Boolean(param.value);
	}

	public hasParameter(name: string): boolean {
		return this._parameters.has(name);
	}

	public addParameter(parameter: IAnimationParameter): void {
		this._parameters.set(parameter.name, { ...parameter });
	}

	public getParameters(): IAnimationParameter[] {
		return Array.from(this._parameters.values());
	}

	// ---------------------------------------------------------------------------
	// State setup
	// ---------------------------------------------------------------------------

	public addState(state: IAnimationState): void {
		if (state.events) {
			for (const event of state.events) {
				if (event.time < 0 || event.time > 1.0) {
					console.warn(
						`AnimationStateMachine: Event "${event.name}" in state "${state.name}" has normalized time ${event.time} out of bounds [0, 1]. It will never fire.`
					);
				}
			}
		}
		this._states.set(state.name, state);
		if (this._initialState === state.name && !this._currentState) {
			this._enterState(state);
		}
	}

	public setInitialState(name: string): void {
		this._initialState = name;
		const state = this.getState(name);
		if (state) {
			if (this._currentTransition) {
				this._stopStateAnimations(this._currentTransition.fromState);
				this._stopStateAnimations(this._currentTransition.toState);
				this._currentTransition = null;
			}
			if (this._currentState && this._currentState !== state) {
				this._stopStateAnimations(this._currentState);
			}
			this._enterState(state);
		}
	}

	public getState(name: string): IAnimationState | null {
		return this._states.get(name) ?? null;
	}

	public transitionTo(stateName: string, duration: number = 0): void {
		const targetState = this.getState(stateName);
		if (!targetState) {
			return;
		}
		if (!this._currentState) {
			this._enterState(targetState);
			return;
		}
		if (this._currentState === targetState) {
			return;
		}
		this._startTransition(this._currentState, targetState, duration);
	}

	// ---------------------------------------------------------------------------
	// Animation Groups
	// ---------------------------------------------------------------------------

	public registerAnimationGroup(animationGroup: AnimationGroup): void {
		this._animationGroups.set(animationGroup.name, animationGroup);
	}

	public getAnimationGroup(name: string): AnimationGroup | null {
		return this._getAnimationGroup(name);
	}

	private _getAnimationGroup(name?: string): AnimationGroup | null {
		if (!name) {
			return null;
		}
		if (this._animationGroups.has(name)) {
			return this._animationGroups.get(name)!;
		}
		if (this._scene) {
			return this._scene.getAnimationGroupByName(name) ?? null;
		}
		return null;
	}

	// ---------------------------------------------------------------------------
	// 1D Blend Tree evaluation
	// ---------------------------------------------------------------------------

	public computeBlendTreeWeights(blendTree: IBlendTree1D): Map<string, number> {
		const weights = new Map<string, number>();
		if (!blendTree.motions || blendTree.motions.length === 0) {
			return weights;
		}

		const motions = [...blendTree.motions].sort((a, b) => a.threshold - b.threshold);
		const rawParam = this.getFloat(blendTree.parameter);
		const paramValue = Number.isFinite(rawParam) ? rawParam : 0;

		for (const motion of motions) {
			weights.set(motion.animationGroupName, 0);
		}

		if (motions.length === 1) {
			weights.set(motions[0].animationGroupName, 1.0);
			return weights;
		}

		if (paramValue <= motions[0].threshold) {
			weights.set(motions[0].animationGroupName, 1.0);
			return weights;
		}

		const lastIndex = motions.length - 1;
		if (paramValue >= motions[lastIndex].threshold) {
			weights.set(motions[lastIndex].animationGroupName, 1.0);
			return weights;
		}

		for (let i = 0; i < lastIndex; i++) {
			const m1 = motions[i];
			const m2 = motions[i + 1];

			if (paramValue >= m1.threshold && paramValue <= m2.threshold) {
				const range = m2.threshold - m1.threshold;
				if (range <= 0) {
					weights.set(m1.animationGroupName, 1.0);
				} else {
					const alpha = (paramValue - m1.threshold) / range;
					weights.set(m1.animationGroupName, (weights.get(m1.animationGroupName) ?? 0) + (1.0 - alpha));
					weights.set(m2.animationGroupName, (weights.get(m2.animationGroupName) ?? 0) + alpha);
				}
				break;
			}
		}

		return weights;
	}

	public getBlendTreeWeights(stateOrName?: IAnimationState | string | null): Map<string, number> {
		let state: IAnimationState | null = null;
		if (typeof stateOrName === "string") {
			state = this.getState(stateOrName);
		} else if (stateOrName) {
			state = stateOrName;
		} else {
			state = this._currentState;
		}

		if (state?.blendTree) {
			return this.computeBlendTreeWeights(state.blendTree);
		}

		return new Map<string, number>();
	}

	// ---------------------------------------------------------------------------
	// Runtime evaluation
	// ---------------------------------------------------------------------------

	public update(deltaTime: number): void {
		if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
			return;
		}

		if (this._isDisposed || !this._currentState) {
			return;
		}

		// 1. Advance crossfade transition if active
		if (this._currentTransition) {
			this._currentTransition.elapsedTime += deltaTime;
			const progress = Math.min(1.0, this._currentTransition.elapsedTime / this._currentTransition.duration);
			const outgoingWeight = 1.0 - progress;
			const incomingWeight = progress;

			this._applyStateWeight(this._currentTransition.fromState, outgoingWeight);
			this._applyStateWeight(this._currentTransition.toState, incomingWeight);

			if (progress >= 1.0) {
				this._applyStateWeight(this._currentTransition.fromState, 0.0);
				this._stopStateAnimations(this._currentTransition.fromState);
				this._applyStateWeight(this._currentTransition.toState, 1.0);
				this._currentTransition = null;
			}
		} else {
			this._applyStateWeight(this._currentState, 1.0);
		}

		// 2. Advance state time & dispatch animation events
		const speed = this._currentState.speed ?? 1.0;
		const prevTime = this._stateTime;
		const newTime = prevTime + deltaTime * speed;
		const duration = this._getStateDuration(this._currentState);
		const prevNorm = duration > 0 ? prevTime / duration : 0;
		const rawNorm = duration > 0 ? newTime / duration : 1.0;
		const isLoop = this._currentState.loop !== false;

		if (isLoop) {
			if (rawNorm >= 1.0) {
				this._checkEvents(prevNorm, 1.0);
				this._firedEvents.clear();
				this._stateTime = duration > 0 ? newTime % duration : 0;
				const wrappedNorm = duration > 0 ? this._stateTime / duration : 0;
				if (wrappedNorm > 0) {
					this._checkEvents(0, wrappedNorm);
				}
			} else {
				this._stateTime = newTime;
				this._checkEvents(prevNorm, rawNorm);
			}
		} else {
			this._stateTime = Math.min(newTime, duration);
			const clampedNorm = Math.min(1.0, rawNorm);
			this._checkEvents(prevNorm, clampedNorm);
		}

		// 3. Evaluate outgoing transitions (only if not currently transitioning)
		if (!this._currentTransition && this._currentState.transitions) {
			for (const transition of this._currentState.transitions) {
				if (this._evaluateTransition(transition, rawNorm)) {
					const targetState = this.getState(transition.targetState);
					if (targetState) {
						this._consumeTriggers(transition.conditions);
						this._startTransition(this._currentState, targetState, transition.duration);
						break;
					}
				}
			}
		}
	}

	private _enterState(state: IAnimationState): void {
		this._currentState = state;
		this._stateTime = 0;
		this._firedEvents.clear();
		this._startStateAnimations(state, 1.0);
	}

	private _startTransition(fromState: IAnimationState, toState: IAnimationState, duration: number): void {
		const fromName = fromState.name;
		const toName = toState.name;

		if (this._currentTransition) {
			this._stopStateAnimations(this._currentTransition.fromState);
			if (this._currentTransition.toState !== fromState && this._currentTransition.toState !== toState) {
				this._stopStateAnimations(this._currentTransition.toState);
			}
			this._currentTransition = null;
		}

		if (duration <= 0) {
			this._stopStateAnimations(fromState);
			this._currentState = toState;
			this._stateTime = 0;
			this._firedEvents.clear();
			this._startStateAnimations(toState, 1.0);
			this.onStateChanged.notifyObservers({ from: fromName, to: toName });
			return;
		}

		this._currentTransition = {
			fromState,
			toState,
			duration,
			elapsedTime: 0,
		};
		this._currentState = toState;
		this._stateTime = 0;
		this._firedEvents.clear();

		this._startStateAnimations(toState, 0.0);
		this._applyStateWeight(fromState, 1.0);

		this.onStateChanged.notifyObservers({ from: fromName, to: toName });
	}

	private _evaluateTransition(transition: IAnimationTransition, rawNorm: number): boolean {
		if (transition.hasExitTime) {
			const exitTime = transition.exitTime ?? 1.0;
			if (rawNorm < exitTime) {
				return false;
			}
		}

		if (transition.conditions && transition.conditions.length > 0) {
			for (const condition of transition.conditions) {
				if (!this._evaluateCondition(condition)) {
					return false;
				}
			}
		} else if (!transition.hasExitTime) {
			return false;
		}

		return true;
	}

	private _evaluateCondition(condition: ITransitionCondition): boolean {
		const param = this._parameters.get(condition.parameter);
		if (!param) {
			return false;
		}

		if (typeof condition.threshold === "boolean" || param.type === "bool" || param.type === "trigger") {
			const paramBool = Boolean(param.value);
			const threshBool = Boolean(condition.threshold);
			if (condition.operator === "==") {
				return paramBool === threshBool;
			}
			if (condition.operator === "!=") {
				return paramBool !== threshBool;
			}
			return false;
		}

		const paramNum = Number(param.value);
		const threshNum = Number(condition.threshold);

		switch (condition.operator) {
			case ">":
				return paramNum > threshNum;
			case "<":
				return paramNum < threshNum;
			case ">=":
				return paramNum >= threshNum;
			case "<=":
				return paramNum <= threshNum;
			case "==":
				return paramNum === threshNum;
			case "!=":
				return paramNum !== threshNum;
			default:
				return false;
		}
	}

	private _consumeTriggers(conditions: ITransitionCondition[]): void {
		for (const condition of conditions) {
			const param = this._parameters.get(condition.parameter);
			if (param && param.type === "trigger") {
				param.value = false;
			}
		}
	}

	private _checkEvents(fromNorm: number, toNorm: number): void {
		if (!this._currentState?.events) {
			return;
		}
		for (const event of this._currentState.events) {
			if (this._firedEvents.has(event)) {
				continue;
			}
			const inRange = (fromNorm === 0 && event.time === 0) || (event.time > fromNorm && event.time <= toNorm);
			if (inRange) {
				this._firedEvents.add(event);
				this.onAnimationEvent.notifyObservers(event);
			}
		}
	}

	private _getStateDuration(state: IAnimationState): number {
		if (state.animationGroupName) {
			const group = this._getAnimationGroup(state.animationGroupName);
			if (group) {
				try {
					if (group.targetedAnimations && group.targetedAnimations.length > 0) {
						const length = group.getLength();
						if (Number.isFinite(length) && length > 0) {
							return length;
						}
					}
				} catch {
					// fallback if targetedAnimations is empty
				}
				if (Number.isFinite(group.from) && Number.isFinite(group.to) && group.to > group.from) {
					return (group.to - group.from) / 60;
				}
			}
		} else if (state.blendTree && state.blendTree.motions.length > 0) {
			for (const motion of state.blendTree.motions) {
				const group = this._getAnimationGroup(motion.animationGroupName);
				if (group) {
					try {
						if (group.targetedAnimations && group.targetedAnimations.length > 0) {
							const length = group.getLength();
							if (Number.isFinite(length) && length > 0) {
								return length;
							}
						}
					} catch {
						// fallback if targetedAnimations is empty
					}
					if (Number.isFinite(group.from) && Number.isFinite(group.to) && group.to > group.from) {
						return (group.to - group.from) / 60;
					}
				}
			}
		}
		return 1.0;
	}

	private _startStateAnimations(state: IAnimationState, initialWeight: number = 1.0): void {
		if (state.blendTree) {
			const weights = this.computeBlendTreeWeights(state.blendTree);
			for (const motion of state.blendTree.motions) {
				const group = this._getAnimationGroup(motion.animationGroupName);
				if (group) {
					if (!group.isPlaying && typeof group.start === "function") {
						group.start(state.loop ?? true, state.speed ?? 1.0);
					}
					const motionWeight = weights.get(motion.animationGroupName) ?? 0;
					const effectiveWeight = motionWeight * initialWeight;
					if (typeof group.setWeightForAllAnimatables === "function") {
						group.setWeightForAllAnimatables(effectiveWeight);
					}
					group.weight = effectiveWeight;
				}
			}
		} else if (state.animationGroupName) {
			const group = this._getAnimationGroup(state.animationGroupName);
			if (group) {
				if (!group.isPlaying && typeof group.start === "function") {
					group.start(state.loop ?? true, state.speed ?? 1.0);
				}
				if (typeof group.setWeightForAllAnimatables === "function") {
					group.setWeightForAllAnimatables(initialWeight);
				}
				group.weight = initialWeight;
			}
		}
	}

	private _applyStateWeight(state: IAnimationState, stateWeight: number): void {
		if (state.blendTree) {
			const weights = this.computeBlendTreeWeights(state.blendTree);
			for (const [groupName, motionWeight] of weights.entries()) {
				const effectiveWeight = motionWeight * stateWeight;
				const group = this._getAnimationGroup(groupName);
				if (group) {
					if (effectiveWeight > 0 && !group.isPlaying && typeof group.start === "function") {
						group.start(state.loop ?? true, state.speed ?? 1.0);
					}
					if (typeof group.setWeightForAllAnimatables === "function") {
						group.setWeightForAllAnimatables(effectiveWeight);
					}
					group.weight = effectiveWeight;
				}
			}
		} else if (state.animationGroupName) {
			const group = this._getAnimationGroup(state.animationGroupName);
			if (group) {
				if (stateWeight > 0 && !group.isPlaying && typeof group.start === "function") {
					group.start(state.loop ?? true, state.speed ?? 1.0);
				}
				if (typeof group.setWeightForAllAnimatables === "function") {
					group.setWeightForAllAnimatables(stateWeight);
				}
				group.weight = stateWeight;
			}
		}
	}

	private _stopStateAnimations(state: IAnimationState): void {
		if (state.blendTree) {
			for (const motion of state.blendTree.motions) {
				const group = this._getAnimationGroup(motion.animationGroupName);
				if (group) {
					if (typeof group.setWeightForAllAnimatables === "function") {
						group.setWeightForAllAnimatables(0);
					}
					group.weight = 0;
					if (typeof group.stop === "function") {
						group.stop();
					}
				}
			}
		} else if (state.animationGroupName) {
			const group = this._getAnimationGroup(state.animationGroupName);
			if (group) {
				if (typeof group.setWeightForAllAnimatables === "function") {
					group.setWeightForAllAnimatables(0);
				}
				group.weight = 0;
				if (typeof group.stop === "function") {
					group.stop();
				}
			}
		}
	}

	private _stopAllAnimations(): void {
		if (this._currentState) {
			this._stopStateAnimations(this._currentState);
		}
		if (this._currentTransition) {
			this._stopStateAnimations(this._currentTransition.fromState);
			this._stopStateAnimations(this._currentTransition.toState);
		}
		for (const group of this._animationGroups.values()) {
			if (typeof group.stop === "function") {
				group.stop();
			}
		}
	}

	// ---------------------------------------------------------------------------
	// Serialization
	// ---------------------------------------------------------------------------

	public serialize(): IAnimationStateMachineData {
		return {
			initialState: this._initialState,
			currentState: this._currentState?.name ?? null,
			parameters: Array.from(this._parameters.values()).map((p) => ({
				name: p.name,
				type: p.type,
				value: p.value,
			})),
			states: Array.from(this._states.values()).map((s) => ({
				name: s.name,
				animationGroupName: s.animationGroupName,
				blendTree: s.blendTree
					? {
							parameter: s.blendTree.parameter,
							motions: s.blendTree.motions.map((m) => ({
								animationGroupName: m.animationGroupName,
								threshold: m.threshold,
							})),
						}
					: undefined,
				speed: s.speed,
				loop: s.loop,
				transitions: s.transitions.map((t) => ({
					targetState: t.targetState,
					duration: t.duration,
					hasExitTime: t.hasExitTime,
					exitTime: t.exitTime,
					conditions: t.conditions.map((c) => ({
						parameter: c.parameter,
						operator: c.operator,
						threshold: c.threshold,
					})),
				})),
				events: s.events
					? s.events.map((e) => ({
							time: e.time,
							name: e.name,
							parameter: e.parameter,
						}))
					: undefined,
			})),
		};
	}

	public static Parse(json: any, scene?: Scene | null, node?: TransformNode | null): AnimationStateMachine {
		const sm = new AnimationStateMachine(scene, node);
		if (!json) {
			return sm;
		}

		if (Array.isArray(json.parameters)) {
			for (const param of json.parameters) {
				sm.addParameter({
					name: param.name,
					type: param.type,
					value: param.value,
				});
			}
		}

		if (Array.isArray(json.states)) {
			for (const state of json.states) {
				sm.addState({
					name: state.name,
					animationGroupName: state.animationGroupName,
					blendTree: state.blendTree
						? {
								parameter: state.blendTree.parameter,
								motions: Array.isArray(state.blendTree.motions)
									? state.blendTree.motions.map((m: any) => ({
											animationGroupName: m.animationGroupName,
											threshold: m.threshold,
										}))
									: [],
							}
						: undefined,
					speed: state.speed,
					loop: state.loop,
					transitions: Array.isArray(state.transitions)
						? state.transitions.map((t: any) => ({
								targetState: t.targetState,
								duration: t.duration ?? 0,
								hasExitTime: Boolean(t.hasExitTime),
								exitTime: t.exitTime,
								conditions: Array.isArray(t.conditions)
									? t.conditions.map((c: any) => ({
											parameter: c.parameter,
											operator: c.operator,
											threshold: c.threshold,
										}))
									: [],
							}))
						: [],
					events: Array.isArray(state.events)
						? state.events.map((e: any) => ({
								time: e.time,
								name: e.name,
								parameter: e.parameter,
							}))
						: undefined,
				});
			}
		}

		if (json.initialState) {
			sm.setInitialState(json.initialState);
		}

		return sm;
	}

	// ---------------------------------------------------------------------------
	// Cleanup
	// ---------------------------------------------------------------------------

	public dispose(): void {
		if (this._isDisposed) {
			return;
		}
		if (this._sceneDisposeObserver && this._scene?.onDisposeObservable) {
			this._scene.onDisposeObservable.remove(this._sceneDisposeObserver);
			this._sceneDisposeObserver = null;
		}
		this._stopAllAnimations();
		this.onStateChanged.clear();
		this.onAnimationEvent.clear();
		this._states.clear();
		this._parameters.clear();
		this._animationGroups.clear();
		this._currentTransition = null;
		this._currentState = null;
		this._firedEvents.clear();
		this._scene = null;
		this._node = null;
		this._isDisposed = true;
	}
}
