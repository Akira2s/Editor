import { useEffect, useState } from "react";

import { FaLink } from "react-icons/fa";

import { Button } from "../../../ui/shadcn/ui/button";

import {
	exitPrefabEditedInPlace,
	getPrefabEditedInPlace,
	onPrefabEditedInPlaceChangedObservable,
	savePrefabEditedInPlace,
	setPrefabEditDimmingOthers,
} from "../../../tools/scene/prefab-edit";
import { isDimmingOthersPreferred } from "../../../tools/scene/prefab-dimming";

import { SceneLinkNode } from "../../nodes/scene-link";

import { Editor } from "../../main";

export interface IEditorPrefabEditBarProps {
	editor: Editor;
}

/**
 * Shown over the viewport while a prefab is edited in place: tells which prefab it is and saves, or gives up, what was changed.
 */
export function EditorPrefabEditBar(props: IEditorPrefabEditBarProps) {
	const [link, setLink] = useState<SceneLinkNode | null>(getPrefabEditedInPlace());
	const [busy, setBusy] = useState(false);
	const [dimOthers, setDimOthers] = useState(isDimmingOthersPreferred());

	useEffect(() => {
		const observer = onPrefabEditedInPlaceChangedObservable.add((l) => setLink(l));
		return () => {
			onPrefabEditedInPlaceChangedObservable.remove(observer);
		};
	}, []);

	if (!link) {
		return null;
	}

	const run = async (action: () => Promise<void>) => {
		setBusy(true);
		try {
			await action();
		} finally {
			setBusy(false);
		}
	};

	return (
		<div
			data-prefab-edit-bar
			className="absolute top-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/50 backdrop-blur text-sm"
		>
			<FaLink className="w-4 h-4 text-amber-400" />
			<div className="text-amber-300 whitespace-nowrap" title={link.relativePath ?? ""}>
				Editing prefab <b>{link.name}</b> in place
			</div>
			<Button
				variant={dimOthers ? "default" : "ghost"}
				size="sm"
				title="Grey out the objects that are not part of the prefab"
				onClick={() => {
					setPrefabEditDimmingOthers(props.editor, !dimOthers);
					setDimOthers(!dimOthers);
				}}
			>
				Dim others
			</Button>
			<Button variant="secondary" size="sm" disabled={busy} onClick={() => run(() => savePrefabEditedInPlace(props.editor, link))}>
				Save
			</Button>
			<Button variant="secondary" size="sm" disabled={busy} onClick={() => run(() => exitPrefabEditedInPlace(props.editor, link, true))}>
				Save &amp; Exit
			</Button>
			<Button variant="ghost" size="sm" disabled={busy} onClick={() => run(() => exitPrefabEditedInPlace(props.editor, link, false))}>
				Discard
			</Button>
		</div>
	);
}
