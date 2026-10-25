import { Component, ReactNode } from "react";

import { LuEye } from "react-icons/lu";

import { Button } from "../../../ui/shadcn/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../ui/shadcn/ui/tooltip";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../../../ui/shadcn/ui/dropdown-menu";

import { getCurrentViewMode, setViewMode, ViewModeId, viewModes } from "../../rendering/view-mode";

export class EditorPreviewViewMode extends Component {
	public render(): ReactNode {
		const current = getCurrentViewMode();
		const groups = [...new Set(viewModes.map((m) => m.group))];

		return (
			<DropdownMenu>
				<Tooltip>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" className={current.shaderValue !== 0 ? "px-2 h-9 gap-2 bg-primary/20" : "px-2 h-9 gap-2"}>
								<LuEye className="w-5 h-5" />
								<span className="text-sm">{current.label}</span>
							</Button>
						</DropdownMenuTrigger>
					</TooltipTrigger>
					<TooltipContent>View mode: {current.description}</TooltipContent>
				</Tooltip>

				<DropdownMenuContent>
					<DropdownMenuRadioGroup
						value={current.id}
						onValueChange={(value) => {
							setViewMode(value as ViewModeId);
							this.forceUpdate();
						}}
					>
						{groups.map((group, index) => (
							<div key={group}>
								{index > 0 && <DropdownMenuSeparator />}
								<DropdownMenuLabel className="text-xs text-muted-foreground">{group}</DropdownMenuLabel>
								{viewModes
									.filter((m) => m.group === group)
									.map((mode) => (
										<DropdownMenuRadioItem key={mode.id} value={mode.id} title={mode.description}>
											{mode.label}
										</DropdownMenuRadioItem>
									))}
							</div>
						))}
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>
		);
	}
}
