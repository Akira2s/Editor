import { Component, ReactNode } from "react";
import { Root, createRoot } from "react-dom/client";

import { Progress } from "../../ui/shadcn/ui/progress";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../ui/shadcn/ui/alert-dialog";

const openedDialogs = new Set<LoadSceneProgressComponent>();

export function showLoadSceneProgressDialog(name: string): Promise<LoadSceneProgressComponent> {
	return new Promise<LoadSceneProgressComponent>((resolve) => {
		const div = document.createElement("div");
		document.body.appendChild(div);

		const root = createRoot(div);
		root.render(
			<LoadSceneProgressComponent
				name={name}
				ref={(r) => {
					if (r) {
						openedDialogs.add(r);
						resolve(r);
					}
				}}
				root={root}
				container={div}
			/>
		);
	});
}

/**
 * Closes the progress dialogs that are still opened. Called when a load of a scene ends, successfully or not, so a load
 * that failed or was interrupted never leaves its dialog on the screen.
 */
export function disposeLoadSceneProgressDialogs(): void {
	Array.from(openedDialogs).forEach((dialog) => dialog.dispose());
}

export interface ILoadSceneProgressComponentProps {
	name: string;
	root: Root;
	container: HTMLDivElement;
}

export interface ILoadSceneProgressComponentState {
	name: string;
	progress: number;
}

export class LoadSceneProgressComponent extends Component<ILoadSceneProgressComponentProps, ILoadSceneProgressComponentState> {
	private _step: number = 0;
	private _disposed: boolean = false;

	public constructor(props: ILoadSceneProgressComponentProps) {
		super(props);

		this.state = {
			progress: 0,
			name: props.name,
		};
	}

	public render(): ReactNode {
		return (
			<AlertDialog open>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{this.state.name}...</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<Progress value={this.state.progress} />
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter></AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		);
	}

	public step(step: number): void {
		this._step += step;
		this.setState({ progress: this._step });
	}

	public setName(name: string): void {
		this.setState({ name });
	}

	public dispose(): void {
		if (this._disposed) {
			return;
		}

		this._disposed = true;
		openedDialogs.delete(this);

		this.props.root.unmount();
		this.props.container.remove();
	}
}
