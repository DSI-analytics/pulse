import { NextResponse, type NextRequest } from "next/server";
import { destroySession } from "@/lib/auth";

// GET /logout — clears the session and returns to the login screen.
export async function GET(req: NextRequest) {
  await destroySession();
  return NextResponse.redirect(new URL("/login", req.url));
}
