import { Node } from "@babylonjs/core/node";

/**
 * Returns the path of the scene (.scene asset) the given node links to, or null when the node is not a scene link.
 * The CLI packs the scene links created in the editor (scene assets dropped in a scene) as transform nodes holding the path
 * of the linked scene in their metadata.
 * @param node defines the reference to the node to check.
 */
export function getSceneLinkPath(node: Node): string | null {
	const path = node.metadata?.sceneLink;
	return typeof path === "string" && path ? path : null;
}
