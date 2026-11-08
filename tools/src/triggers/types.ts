import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import type { TriggerVolume } from "./trigger-volume";

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
	trigger: TriggerVolume;
	target: TransformNode | AbstractMesh;
	state: "enter" | "stay" | "exit";
	timestamp: number;
}
