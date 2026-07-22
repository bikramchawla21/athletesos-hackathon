export class AuthzError extends Error {
  status: number;
  code: string;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "AuthzError";
    this.code = code;
    this.status = status;
  }
}

export const AUTHZ_CODES = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN_WORKSPACE: "FORBIDDEN_WORKSPACE",
  FORBIDDEN_ROLE: "FORBIDDEN_ROLE",
  PERSON_SYNC_FAILED: "PERSON_SYNC_FAILED",
  WORKSPACE_NOT_FOUND: "WORKSPACE_NOT_FOUND",
  DATABASE_UNAVAILABLE: "DATABASE_UNAVAILABLE",
} as const;
