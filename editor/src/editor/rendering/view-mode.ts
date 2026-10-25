import { AbstractMesh, Material, MaterialDefines, MaterialPluginBase, PBRBaseMaterial, RegisterMaterialPlugin, Scene, ShaderLanguage, StandardMaterial } from "babylonjs";

/**
 * Debug view modes of the editor viewport, like the "Draw Mode" of Unity or the "View Mode" of Unreal Engine.
 * The shading is replaced by one surface attribute (albedo, normals, roughness...). It is done by a material plugin
 * that is attached to every Standard and PBR material of the editor scene: the materials, the scene and the saved
 * project are not modified.
 */
export type ViewModeId =
	| "lit"
	| "albedo"
	| "lighting"
	| "normals"
	| "roughness"
	| "metallic"
	| "specular"
	| "ao"
	| "emissive"
	| "opacity"
	| "uv"
	| "uvChecker"
	| "texelDensity"
	| "vertexColor"
	| "depth";

export interface IViewMode {
	id: ViewModeId;
	/**
	 * The value of the EDITOR_VIEWMODE define in the shaders. 0 is the regular shading.
	 */
	shaderValue: number;
	label: string;
	description: string;
	group: "Shading" | "Material" | "Geometry";
}

export const viewModes: IViewMode[] = [
	{ id: "lit", shaderValue: 0, label: "Lit", description: "Regular shading", group: "Shading" },
	{ id: "albedo", shaderValue: 1, label: "Albedo (Unlit)", description: "Base color without any lighting", group: "Shading" },
	{ id: "lighting", shaderValue: 2, label: "Lighting Only", description: "Lights and shadows on a neutral grey material", group: "Shading" },

	{ id: "normals", shaderValue: 3, label: "World Normals", description: "Final surface normal in world space (normal maps included)", group: "Material" },
	{ id: "roughness", shaderValue: 4, label: "Roughness", description: "Roughness (white is rough, black is a mirror)", group: "Material" },
	{ id: "metallic", shaderValue: 5, label: "Metallic", description: "Metallic (white is metal)", group: "Material" },
	{ id: "specular", shaderValue: 6, label: "Specular", description: "Specular color (reflectance at normal incidence)", group: "Material" },
	{ id: "ao", shaderValue: 7, label: "Ambient Occlusion", description: "Baked ambient occlusion of the material", group: "Material" },
	{ id: "emissive", shaderValue: 8, label: "Emissive", description: "Emissive color", group: "Material" },
	{ id: "opacity", shaderValue: 9, label: "Opacity", description: "Alpha (white is opaque)", group: "Material" },

	{ id: "uv", shaderValue: 10, label: "UV Coordinates", description: "First UV set as red and green", group: "Geometry" },
	{ id: "uvChecker", shaderValue: 11, label: "UV Checker", description: "Checker pattern over the first UV set", group: "Geometry" },
	{
		id: "texelDensity",
		shaderValue: 12,
		label: "Texel Density",
		description: "Checker colored by UV size on screen per meter: blue is stretched, green is 1 UV per meter, red is dense",
		group: "Geometry",
	},
	{ id: "vertexColor", shaderValue: 13, label: "Vertex Color", description: "Vertex colors (white when the mesh has none)", group: "Geometry" },
	{ id: "depth", shaderValue: 14, label: "Depth", description: "Distance to the camera (white is near)", group: "Geometry" },
];

export function getViewMode(id: ViewModeId): IViewMode {
	return viewModes.find((m) => m.id === id) ?? viewModes[0];
}

const pluginName = "EditorViewMode";

const state = {
	mode: viewModes[0],
	scene: null as Scene | null,
	plugins: new Set<ViewModePlugin>(),
	/**
	 * Value of "postProcessesEnabled" before the first debug mode was selected. Post-processes (tone mapping, bloom,
	 * SSAO...) would change the values that are shown, so they are paused while a debug mode is active.
	 */
	postProcessesEnabled: null as boolean | null,
};

/**
 * Converts a GLSL snippet written in the restricted style used below to WGSL.
 */
function toWgsl(glsl: string): string {
	return glsl
		.replace(/\bfloat (\w+)\s*=/g, "var $1: f32=")
		.replace(/\b(vec[234]) (\w+)\s*=/g, "var $2: $1f=")
		.replace(/\b(vec[234])\(/g, "$1f(")
		.replace(/\bdFdx\(/g, "dpdx(")
		.replace(/\bdFdy\(/g, "dpdy(")
		.replace(/(?<![.\w])(vPositionW|vDbgUV|vColor)\b/g, "fragmentInputs.$1")
		.replace(/(?<![.\w])vEyePosition\b/g, "scene.vEyePosition");
}

// Snippets shared by both kinds of material. They use the variables "dbgBase" (albedo, in the space of the material),
// "dbgGamma" (1 when the albedo is already encoded for display) and "dbgColor" (the result).
const uvModes = `
#ifdef UV1
vec2 dbgUV=vDbgUV;
vec2 dbgCell=floor(dbgUV*8.);
float dbgOdd=(dbgCell.x+dbgCell.y)-2.*floor((dbgCell.x+dbgCell.y)/2.);
#if EDITOR_VIEWMODE==10
dbgColor=vec3(dbgUV.x,dbgUV.y,0.);
#elif EDITOR_VIEWMODE==11
dbgColor=vec3(mix(0.2,0.8,dbgOdd));
#elif EDITOR_VIEWMODE==12
float dbgWorld=max(length(dFdx(vPositionW)),length(dFdy(vPositionW)));
float dbgUv=max(length(dFdx(dbgUV)),length(dFdy(dbgUV)));
float dbgHeat=clamp(log2(max(dbgUv,0.000001)/max(dbgWorld,0.000001))*0.25+0.5,0.,1.);
vec3 dbgLow=mix(vec3(0.,0.,1.),vec3(0.,1.,0.),clamp(dbgHeat*2.,0.,1.));
vec3 dbgHigh=mix(vec3(0.,1.,0.),vec3(1.,0.,0.),clamp(dbgHeat*2.-1.,0.,1.));
dbgColor=mix(dbgLow,dbgHigh,step(0.5,dbgHeat))*mix(0.55,1.,dbgOdd);
#endif
#else
#if EDITOR_VIEWMODE==10 || EDITOR_VIEWMODE==11 || EDITOR_VIEWMODE==12
dbgColor=vec3(1.,0.,1.);
#endif
#endif
#if EDITOR_VIEWMODE==13
#if defined(VERTEXCOLOR) || defined(INSTANCESCOLOR) && defined(INSTANCES)
dbgColor=vColor.rgb;
#else
dbgColor=vec3(1.,1.,1.);
#endif
#elif EDITOR_VIEWMODE==14
float dbgDistance=length(vPositionW-vEyePosition.xyz);
dbgColor=vec3(1./(1.+dbgDistance*0.05));
#endif
`;

const pbrFragColor = `
#if EDITOR_VIEWMODE>=1 && EDITOR_VIEWMODE!=2
vec3 dbgColor=vec3(0.,0.,0.);
float dbgGamma=1./2.2;
#ifdef UNLIT
vec3 dbgBase=surfaceAlbedo;
#else
vec3 dbgBase=baseColor;
#endif
#if EDITOR_VIEWMODE==1
dbgColor=pow(max(dbgBase,vec3(0.)),vec3(dbgGamma));
#elif EDITOR_VIEWMODE==3
dbgColor=normalW*0.5+0.5;
#elif EDITOR_VIEWMODE==4
#ifndef UNLIT
dbgColor=vec3(reflectivityOut.roughness);
#endif
#elif EDITOR_VIEWMODE==5
#ifndef UNLIT
dbgColor=vec3(reflectivityOut.metallic);
#endif
#elif EDITOR_VIEWMODE==6
#ifndef UNLIT
#ifdef METALLICWORKFLOW
dbgColor=pow(mix(vec3(0.04),max(dbgBase,vec3(0.)),reflectivityOut.metallic),vec3(dbgGamma));
#else
dbgColor=pow(max(reflectivityOut.surfaceReflectivityColor,vec3(0.)),vec3(dbgGamma));
#endif
#endif
#elif EDITOR_VIEWMODE==7
dbgColor=aoOut.ambientOcclusionColor;
#elif EDITOR_VIEWMODE==8
dbgColor=pow(clamp(finalEmissive,vec3(0.),vec3(1.)),vec3(dbgGamma));
#elif EDITOR_VIEWMODE==9
dbgColor=vec3(alpha);
#endif
${uvModes}
finalColor=vec4(dbgColor,1.);
#endif
`;

const standardFragColor = `
#if EDITOR_VIEWMODE>=1 && EDITOR_VIEWMODE!=2
vec3 dbgColor=vec3(0.,0.,0.);
#if EDITOR_VIEWMODE==1
dbgColor=baseColor.rgb*diffuseColor;
#elif EDITOR_VIEWMODE==3
dbgColor=normalW*0.5+0.5;
#elif EDITOR_VIEWMODE==4
dbgColor=vec3(1.-clamp(glossiness/128.,0.,1.));
#elif EDITOR_VIEWMODE==5
dbgColor=vec3(0.,0.,0.);
#elif EDITOR_VIEWMODE==6
dbgColor=specularColor;
#elif EDITOR_VIEWMODE==7
dbgColor=baseAmbientColor;
#elif EDITOR_VIEWMODE==8
dbgColor=clamp(emissiveColor,vec3(0.),vec3(1.));
#elif EDITOR_VIEWMODE==9
dbgColor=vec3(alpha);
#endif
${uvModes}
color=vec4(dbgColor,1.);
#endif
`;

const pbrBeforeLights = `
#if EDITOR_VIEWMODE==2
surfaceAlbedo=vec3(0.5,0.5,0.5);
#endif
`;

const standardUpdateDiffuse = `
#if EDITOR_VIEWMODE==2
baseColor=vec4(0.5,0.5,0.5,baseColor.a);
diffuseColor=vec3(1.,1.,1.);
#endif
`;

class ViewModePlugin extends MaterialPluginBase {
	private _isStandard: boolean;

	public constructor(material: Material) {
		super(material, pluginName, 2000, { EDITOR_VIEWMODE: 0 });

		this._isStandard = material instanceof StandardMaterial;

		// The plugin only exists for the viewport: it is never written in the project.
		this.doNotSerialize = true;
		this._enable(true);

		state.plugins.add(this);
	}

	public override getClassName(): string {
		return "EditorViewModePlugin";
	}

	public override isCompatible(shaderLanguage: ShaderLanguage): boolean {
		return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL;
	}

	public override prepareDefinesBeforeAttributes(defines: MaterialDefines, scene: Scene, mesh: AbstractMesh): void {
		const value = scene === state.scene ? state.mode.shaderValue : 0;

		defines["EDITOR_VIEWMODE"] = value;

		// The UV modes carry their own varying: the "main UV" of the material only exists when a texture shares it.
		if (value >= 10 && value <= 12 && mesh.isVerticesDataPresent("uv")) {
			defines["UV1"] = true;
			defines["_needUVs"] = true;
		}
	}

	public override getCustomCode(shaderType: string, shaderLanguage?: ShaderLanguage): { [pointName: string]: string } | null {
		const wgsl = shaderLanguage === ShaderLanguage.WGSL;
		const convert = (code: string) => (wgsl ? toWgsl(code) : code);

		if (shaderType === "vertex") {
			return {
				CUSTOM_VERTEX_DEFINITIONS: wgsl ? "varying vDbgUV: vec2f;" : "varying vec2 vDbgUV;",
				CUSTOM_VERTEX_MAIN_END: wgsl
					? `#if defined(UV1) && EDITOR_VIEWMODE>=10 && EDITOR_VIEWMODE<=12
vertexOutputs.vDbgUV=vertexInputs.uv;
#endif`
					: `#if defined(UV1) && EDITOR_VIEWMODE>=10 && EDITOR_VIEWMODE<=12
vDbgUV=uv;
#endif`,
			};
		}

		if (shaderType !== "fragment") {
			return null;
		}

		const uvVarying = wgsl ? "varying vDbgUV: vec2f;" : "varying vec2 vDbgUV;";

		if (this._isStandard) {
			return {
				CUSTOM_FRAGMENT_DEFINITIONS: uvVarying,
				CUSTOM_FRAGMENT_UPDATE_DIFFUSE: convert(standardUpdateDiffuse),
				CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: convert(standardFragColor),
			};
		}

		return {
			CUSTOM_FRAGMENT_DEFINITIONS: uvVarying,
			CUSTOM_FRAGMENT_BEFORE_LIGHTS: convert(pbrBeforeLights),
			CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: convert(pbrFragColor),
		};
	}

	public override dispose(): void {
		state.plugins.delete(this);
	}
}

let registered = false;

/**
 * Registers the plugin to all the Standard and PBR materials created from now on. Call it before the scene is created.
 */
export function registerViewModePlugin(): void {
	if (registered) {
		return;
	}

	registered = true;

	RegisterMaterialPlugin(pluginName, (material) => {
		if (material instanceof StandardMaterial || material instanceof PBRBaseMaterial) {
			return new ViewModePlugin(material);
		}

		return null;
	});
}

/**
 * Makes the given scene the one that shows the view modes. Materials that already exist get the plugin.
 */
export function attachViewModeToScene(scene: Scene): void {
	registerViewModePlugin();

	state.scene = scene;
	state.postProcessesEnabled = null;

	[...scene.materials, scene.defaultMaterial].forEach((material) => {
		if (!(material instanceof StandardMaterial || material instanceof PBRBaseMaterial)) {
			return;
		}

		if (!material.pluginManager?.getPlugin(pluginName)) {
			new ViewModePlugin(material);
		}
	});
}

export function getCurrentViewMode(): IViewMode {
	return state.mode;
}

/**
 * Switches the viewport of the editor to the given mode.
 */
export function setViewMode(id: ViewModeId): IViewMode {
	const mode = getViewMode(id);
	const scene = state.scene;
	const changed = mode !== state.mode;

	state.mode = mode;

	if (!scene) {
		return mode;
	}

	if (mode.shaderValue !== 0 && state.postProcessesEnabled === null) {
		state.postProcessesEnabled = scene.postProcessesEnabled;
		scene.postProcessesEnabled = false;
	} else if (mode.shaderValue === 0 && state.postProcessesEnabled !== null) {
		scene.postProcessesEnabled = state.postProcessesEnabled;
		state.postProcessesEnabled = null;
	}

	if (changed) {
		state.plugins.forEach((plugin) => plugin.markAllDefinesAsDirty());
	}

	return mode;
}
