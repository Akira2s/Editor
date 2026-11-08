import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

export type TriggerShape = "box" | "sphere";

export type TriggerDetectionMode = "all" | "taggedOnly";

export interface ITriggerVolumeOptions {
	shape?: TriggerShape;
	size?: Vector3;
	radius?: number;
	detectionMode?: TriggerDetectionMode;
	tag?: string;
	enabled?: boolean;
	checkInterval?: number;
}

export interface ITriggerEvent {
	trigger: any;
	target: TransformNode | AbstractMesh;
	state: "enter" | "stay" | "exit";
	timestamp: number;
}
