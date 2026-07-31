import "server-only";

import { getPageSessionContext } from "@/lib/auth/request-context";
import {
  toShellContextViewModel,
  type ShellContextViewModel,
} from "@/lib/app-shell/view-model";

export async function loadShellContext(): Promise<ShellContextViewModel> {
  const context = await getPageSessionContext();
  return toShellContextViewModel(context);
}

export type { ShellCompany, ShellContextViewModel } from "@/lib/app-shell/view-model";
