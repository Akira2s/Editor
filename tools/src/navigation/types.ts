export interface INavWaypoint {
	x: number;
	y: number;
	z: number;
}

export interface INavAgentOptions {
	radius?: number;
	height?: number;
	speed?: number;
	angularSpeed?: number;
	acceleration?: number;
	stoppingDistance?: number;
	autoBraking?: boolean;
	updateRotation?: boolean;
	obstacleAvoidance?: boolean;
	avoidanceRadius?: number;
	patrolWaypoints?: INavWaypoint[];
	patrolLoop?: boolean;
}

export interface INavAgentData extends INavAgentOptions {
	enabled?: boolean;
}
