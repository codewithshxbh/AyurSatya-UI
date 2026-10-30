import Home from "./home-client";
import { getCurrentUser } from "../lib/auth-server";
import { loadPublicHighlight } from "../lib/public-highlight";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    avatar_url: user.avatar_url,
    avatar_public_id: user.avatar_public_id
  };
}

export default async function Page() {
  let user = null;
  try {
    user = await getCurrentUser();
  } catch (error) {
    console.error("Session lookup failed", error);
  }
  if (user) return <Home initialUser={publicUser(user)} />;
  const { highlight, knowledgeCount } = await loadPublicHighlight();
  return <Home initialHighlight={highlight} knowledgeCount={knowledgeCount} />;
}
