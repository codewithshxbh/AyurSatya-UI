import { cookies } from "next/headers";
import { AUTH_COOKIE } from "../lib/auth-server";
import { WorkspaceSkeleton } from "./workspace-loading";

export default function Loading() {
  const hasSession = Boolean(cookies().get(AUTH_COOKIE)?.value);
  if (!hasSession) return null;
  return <WorkspaceSkeleton />;
}
