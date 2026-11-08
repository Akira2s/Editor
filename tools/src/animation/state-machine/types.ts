export type AnimationParameterType = "float" | "int" | "bool" | "trigger";

export type ComparisonOperator = ">" | "<" | "==" | "!=" | ">=" | "<=";

export interface IAnimationParameter {
	name: string;
	type: AnimationParameterType;
	value: number | boolean;
}

export interface ITransitionCondition {
	parameter: string;
	operator: ComparisonOperator;
	threshold: number | boolean;
}

export interface IAnimationTransition {
	targetState: string;
	conditions: ITransitionCondition[];
	duration: number;
	hasExitTime: boolean;
	exitTime?: number;
}

export interface IAnimationEvent {
	time: number;
	name: string;
	parameter?: any;
}

export interface IBlendTree1DMotion {
	animationGroupName: string;
	threshold: number;
}

export interface IBlendTree1D {
	parameter: string;
	motions: IBlendTree1DMotion[];
}

export interface IAnimationState {
	name: string;
	animationGroupName?: string;
	blendTree?: IBlendTree1D;
	speed?: number;
	loop?: boolean;
	transitions: IAnimationTransition[];
	events?: IAnimationEvent[];
}

export interface IAnimationStateMachineData {
	initialState?: string | null;
	currentState?: string | null;
	parameters: IAnimationParameter[];
	states: IAnimationState[];
}
