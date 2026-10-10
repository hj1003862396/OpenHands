import { SandboxStatus } from "#/api/conversation-service/agent-server-conversation-service.types";
import { isArchivedSandboxStatus } from "#/utils/conversation-archive-status";
import { ConversationCardTitle } from "./conversation-card-title";

interface ConversationCardHeaderProps {
  title: string;
  titleMode: "view" | "edit";
  onTitleSave: (title: string) => void;
  /** Kept for call-site compatibility; status icon column is hidden. */
  executionStatus?: unknown;
  sandboxStatus?: SandboxStatus | null;
}

export function ConversationCardHeader({
  title,
  titleMode,
  onTitleSave,
  sandboxStatus,
}: ConversationCardHeaderProps) {
  const isArchived = isArchivedSandboxStatus(sandboxStatus);
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
      <ConversationCardTitle
        title={title}
        titleMode={titleMode}
        onSave={onTitleSave}
        isConversationArchived={isArchived}
      />
    </div>
  );
}
