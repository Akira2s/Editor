import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { z } from "zod";

import { callTextTool } from "./helpers.mjs";

const instanceSelector = {
	linkId: z.string().optional().describe("Id of the prefab instance (scene link)."),
	linkName: z.string().optional().describe("Name of the prefab instance (scene link)."),
};

const prefabNodeSelector = {
	nodeId: z.string().optional().describe("Id of the node in the prefab (see `get_prefab_instance`)."),
	nodeName: z.string().optional().describe("Name of the node in the prefab."),
};

export function registerPrefabTools(server: McpServer): void {
	server.registerTool(
		"list_prefabs",
		{
			title: "List prefabs",
			description:
				"List the scene assets (`.scene` folders) of the project, prefabs included (`assets/prefabs/*.scene`). A prefab is a reusable group of nodes (meshes, lights, scripts...) " +
				"saved as a scene asset; place instances of it with `instantiate_prefab`. Call it before creating a new prefab to reuse what exists.",
			inputSchema: z.object({}),
			annotations: { readOnlyHint: true },
		},
		async (args): Promise<CallToolResult> => callTextTool("list_prefabs", args)
	);

	server.registerTool(
		"create_prefab",
		{
			title: "Create prefab",
			description:
				"Turn existing scene nodes (with their descendants) into a PREFAB: a reusable scene asset saved in `assets/prefabs/<name>.scene`. The nodes are replaced in the scene by a link " +
				"(an instance of the prefab) at the same place. Use it for anything that exists several times or is spawned by scripts (a unit, a tile, a pickup, a door...), like a Unity prefab. " +
				"Several nodes are grouped under a new root. The prefab keeps the scripts attached to its nodes. The user is asked to confirm because the nodes leave the scene (they live in the prefab).",
			inputSchema: z.object({
				name: z.string().describe("Name of the prefab (becomes the file name, like `Tree`)."),
				nodeIds: z.array(z.string()).optional().describe("Ids of the nodes to turn into the prefab."),
				nodeNames: z.array(z.string()).optional().describe("Names of the nodes to turn into the prefab (when ids are not known)."),
				nodeId: z.string().optional().describe("Id of the node to turn into the prefab."),
				nodeName: z.string().optional().describe("Name of the node to turn into the prefab."),
				directory: z.string().optional().describe("Folder of the prefab, relative to the project (default `assets/prefabs`)."),
			}),
		},
		async (args): Promise<CallToolResult> => callTextTool("create_prefab", args)
	);

	server.registerTool(
		"get_prefab_instance",
		{
			title: "Get prefab instance",
			description:
				"Describe a prefab instance (a scene link): the prefab it shows, the nodes of that prefab (name and id) and what this instance overrides. " +
				"Use it before `set_prefab_override` to find the node to change.",
			inputSchema: z.object({ ...instanceSelector }),
			annotations: { readOnlyHint: true },
		},
		async (args): Promise<CallToolResult> => callTextTool("get_prefab_instance", args)
	);

	server.registerTool(
		"set_prefab_override",
		{
			title: "Set prefab override",
			description:
				"Change a node of the prefab in ONE instance only (Unity's per-instance override): position, rotation, scaling, enabled or visible. The prefab and the other instances keep " +
				"their values. To change every instance, edit the prefab itself (or `apply_prefab_overrides`). The overrides are saved with the scene.",
			inputSchema: z.object({
				...instanceSelector,
				...prefabNodeSelector,
				position: z.array(z.number()).length(3).optional().describe("[x, y, z] local position."),
				rotation: z.array(z.number()).length(3).optional().describe("[x, y, z] local rotation, in radians."),
				scaling: z.array(z.number()).length(3).optional().describe("[x, y, z] local scaling."),
				isEnabled: z.boolean().optional().describe("Enable or disable the node."),
				isVisible: z.boolean().optional().describe("Show or hide the mesh."),
			}),
		},
		async (args): Promise<CallToolResult> => callTextTool("set_prefab_override", args)
	);

	server.registerTool(
		"revert_prefab_overrides",
		{
			title: "Revert prefab overrides",
			description: "Put a node of the prefab (`nodeId`/`nodeName`), or all of them when omitted, back as the prefab defines it in one instance.",
			inputSchema: z.object({ ...instanceSelector, ...prefabNodeSelector }),
		},
		async (args): Promise<CallToolResult> => callTextTool("revert_prefab_overrides", args)
	);

	server.registerTool(
		"apply_prefab_overrides",
		{
			title: "Apply prefab overrides",
			description:
				"Write what an instance overrides (a node, or all of them when `nodeId`/`nodeName` are omitted) in the prefab itself: every instance then shows it. The user is asked to confirm because the prefab asset is modified.",
			inputSchema: z.object({ ...instanceSelector, ...prefabNodeSelector }),
		},
		async (args): Promise<CallToolResult> => callTextTool("apply_prefab_overrides", args)
	);

	server.registerTool(
		"unpack_prefab",
		{
			title: "Unpack prefab",
			description:
				"Turn a prefab instance into plain nodes of the scene (with what it overrides), not connected to the prefab anymore, so they can be edited freely. The user is asked to confirm because the link to the prefab is lost.",
			inputSchema: z.object({ ...instanceSelector }),
		},
		async (args): Promise<CallToolResult> => callTextTool("unpack_prefab", args)
	);

	server.registerTool(
		"instantiate_prefab",
		{
			title: "Instantiate prefab",
			description:
				"Place an instance of a prefab (a scene asset) in the scene, like dragging it into the viewport: a scene link that shows the prefab at the given transform. " +
				"Editing the prefab updates every instance. Instances are real in the packed game: the runtime instantiates the prefab and runs the scripts attached to its nodes. " +
				"Scripts attached to the link itself (with `attach_script`) are per-instance components, with their own Inspector values.",
			inputSchema: z.object({
				prefab: z
					.string()
					.describe("Path of the scene asset (`assets/prefabs/Tree.scene`, see `list_prefabs`) or the name of a prefab created by `create_prefab` (`Tree`)."),
				name: z.string().optional().describe("Name of the instance in the graph (default: the prefab name)."),
				position: z.array(z.number()).length(3).optional().describe("[x, y, z] position of the instance."),
				rotation: z.array(z.number()).length(3).optional().describe("[x, y, z] rotation of the instance, in radians."),
				scaling: z.array(z.number()).length(3).optional().describe("[x, y, z] scaling of the instance."),
				parentId: z.string().optional().describe("Id of the node to parent the instance to."),
				parentName: z.string().optional().describe("Name of the node to parent the instance to."),
			}),
		},
		async (args): Promise<CallToolResult> => callTextTool("instantiate_prefab", args)
	);
}
