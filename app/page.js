import Home from "./home-client";
import { loadPublicHighlight } from "../lib/public-highlight";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const { highlight, knowledgeCount } = await loadPublicHighlight();
  return <Home initialHighlight={highlight} knowledgeCount={knowledgeCount} />;
}
