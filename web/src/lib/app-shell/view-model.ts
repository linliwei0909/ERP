import { ROLE_CODES } from "@/lib/auth/constants";
import type { RequestContext } from "@/lib/auth/session";
import { buildNavigation, type NavigationGroup } from "@/lib/navigation/registry";

export type ShellCompany = {
  id: string;
  code: string;
  name: string;
};

export type ShellContextViewModel = {
  username: string;
  roleLabels: string[];
  isAdmin: boolean;
  authorizedCompanies: ShellCompany[];
  selectedCompany: ShellCompany | null;
  navigation: NavigationGroup[];
  requestId: string;
};

const roleLabels: Record<string, string> = {
  [ROLE_CODES.ADMIN]: "系統管理員",
  [ROLE_CODES.ORDER_ENTRY]: "訂單作業人員",
};

export function toShellContextViewModel(
  context: RequestContext,
): ShellContextViewModel {
  return {
    username: context.actor.username,
    roleLabels: context.roleCodes
      .map((roleCode) => roleLabels[roleCode])
      .filter((label): label is string => Boolean(label)),
    isAdmin: context.roleCodes.includes(ROLE_CODES.ADMIN),
    authorizedCompanies: context.authorizedCompanies.map((company) => ({
      id: company.id,
      code: company.code,
      name: company.name,
    })),
    selectedCompany: context.selectedCompany
      ? {
          id: context.selectedCompany.id,
          code: context.selectedCompany.code,
          name: context.selectedCompany.name,
        }
      : null,
    navigation: buildNavigation(context.roleCodes),
    requestId: context.requestId,
  };
}
