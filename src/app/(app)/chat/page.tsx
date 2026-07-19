import { ChatStarter } from "@/components/chat-starter";
import { getAvailableModels, getDefaultModel } from "@/lib/llm/registry";
import { listProfiles } from "@/server/profiles";
import { getActiveProfile, getHouseholdSession } from "@/server/session";

export default async function NewChatPage() {
  const session = await getHouseholdSession();
  if (!session) return null;
  const active = await getActiveProfile(session);
  if (!active) return null;
  return <div><p className="prompt-line mb-5">somm@cellar:~$ new-session</p><ChatStarter profiles={listProfiles(session.user.id)} activeProfileId={active.id} models={getAvailableModels()} defaultModel={getDefaultModel()} /></div>;
}
