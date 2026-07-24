export type DeleteResult = {
  success: boolean;
  deleted: string[];
  deactivated: string[];
  message: string;
};

export const initialDeleteResult: DeleteResult = {
  success: false,
  deleted: [],
  deactivated: [],
  message: "",
};

export function selectedIds(formData: FormData): number[] {
  return [...new Set(formData.getAll("ids").map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}
