export const SESSION_COOKIE_NAME = "ragic_session";
export const SESSION_IDLE_HOURS = 8;

export const ROLE_CODES = {
  ADMIN: "ADMIN",
  ORDER_ENTRY: "ORDER_ENTRY",
} as const;

export type RoleCode = (typeof ROLE_CODES)[keyof typeof ROLE_CODES];
