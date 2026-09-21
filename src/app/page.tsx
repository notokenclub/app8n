import { ChatView } from "@/components/chat/chat-view";
import { PageHeader } from "@/components/shell/page-header";

/**
 * Chat is the home route because it is the only interface a new user needs:
 * every other surface in the app exists to inspect or correct something that
 * started here.
 */
export default function Home() {
  return (
    <>
      <PageHeader title="app8n" subtitle="Your Workspace, on autopilot" />
      <ChatView />
    </>
  );
}
