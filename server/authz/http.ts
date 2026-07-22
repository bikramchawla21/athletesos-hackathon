import { NextResponse } from "next/server";
import { AuthzError } from "./errors";

export function authzErrorResponse(error: unknown) {
  if (error instanceof AuthzError) {
    return NextResponse.json(
      {
        error: error.message,
        message: error.message,
        code: error.code,
      },
      { status: error.status },
    );
  }
  return null;
}
