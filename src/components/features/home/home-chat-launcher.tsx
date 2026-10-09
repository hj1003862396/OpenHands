import { useTranslation } from "react-i18next";
import { CustomChatInput } from "#/components/features/chat/custom-chat-input";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useModelInterceptor } from "#/hooks/chat/use-model-interceptor";
import { HOME_PROMPT_DRAFT_KEY } from "#/hooks/chat/use-draft-persistence";
import { useChatAttachmentUpload } from "#/hooks/chat/use-chat-attachment-upload";
import { useConversationStore } from "#/stores/conversation-store";
import { setPendingTaskAttachments } from "#/stores/pending-task-attachments-store";
import { enqueueHomeTaskPendingMessage } from "#/utils/enqueue-home-task-pending-message";
import { useOptimisticUserMessageStore } from "#/stores/optimistic-user-message-store";
import { sendMessageWithAttachments } from "#/utils/send-message-with-attachments";
import { useNavigation } from "#/context/navigation-context";
import { useIsCreatingConversation } from "#/hooks/use-is-creating-conversation";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { HomeHeaderTitle } from "./home-header/home-header-title";
import { SkillShareCodeControls } from "./skill-share-code-controls";

export function HomeChatLauncher() {
  const { t } = useTranslation("openhands");
  const { backend } = useActiveBackend();
  const { navigate } = useNavigation();
  const isLocal = backend.kind === "local";

  const { mutateAsync: createConversation, isPending } =
    useCreateConversation();
  const isCreatingElsewhere = useIsCreatingConversation();
  const isCreating = isPending || isCreatingElsewhere;
  // Model is baked into defaults; don't block the launcher on LLM setup.
  const llmBlocked = false;
  const { images, files, imagesMarkedUploadAsFile, clearAllFiles } =
    useConversationStore();
  const { handleUpload } = useChatAttachmentUpload();

  const handleSubmit = (message: string) => {
    const trimmed = message.trim();
    const hasAttachments = images.length > 0 || files.length > 0;
    if ((!trimmed && !hasAttachments) || isCreating) return;

    // Safety net: the input is disabled when there's no usable LLM, but never
    // create a conversation that can't run (it would fail with a cryptic
    // API-key error on the first turn).
    if (llmBlocked) return;

    const attachmentSnapshot = {
      images: [...images],
      files: [...files],
    };

    // Workspace/repo selector is hidden on the home page — create from scratch
    // (no working dir / no repo). When attachments are present the first user
    // message is sent afterward via sendMessageWithAttachments /
    // flushPendingTaskAttachments. Passing query here would create a
    // duplicate text-only initial_message.
    const variables: Parameters<typeof createConversation>[0] = {
      query: hasAttachments ? undefined : trimmed || undefined,
      entryPoint: "home_chat_launcher",
    };

    // Optimistic shell: jump into a provisional conversation route immediately
    // so the click feels instant. createConversation still runs in the
    // background; we reassign the pending bubble and replace the URL once the
    // real id lands.
    const optimisticId = `pending-${crypto.randomUUID()}`;
    try {
      sessionStorage.removeItem(HOME_PROMPT_DRAFT_KEY);
    } catch {
      // sessionStorage not available
    }

    void (async () => {
      try {
        if (trimmed || attachmentSnapshot.images.length > 0) {
          await enqueueHomeTaskPendingMessage({
            conversationId: optimisticId,
            text: trimmed,
            images: attachmentSnapshot.images,
            imagesMarkedUploadAsFile,
          });
        }
        navigate(`/conversations/${optimisticId}`);

        const data = await createConversation(variables);
        const targetConversationId = data.conversation_id;
        const isTaskConversation = targetConversationId.startsWith("task-");

        useOptimisticUserMessageStore
          .getState()
          .reassignPendingMessages(optimisticId, targetConversationId);

        if (hasAttachments) {
          // Cloud sandboxes provision asynchronously; uploads and the first
          // message must target the runtime URL, not the bundled local server.
          const shouldDeferAttachments = !isLocal || isTaskConversation;

          if (shouldDeferAttachments) {
            const taskId =
              data.task_id ??
              (isTaskConversation
                ? targetConversationId.slice("task-".length)
                : null);

            if (!taskId) {
              displayErrorToast(null);
              navigate("/");
              return;
            }

            setPendingTaskAttachments(taskId, {
              content: trimmed,
              images: attachmentSnapshot.images,
              files: attachmentSnapshot.files,
              imagesMarkedUploadAsFile: [...imagesMarkedUploadAsFile],
            });
            clearAllFiles();
            navigate(`/conversations/${targetConversationId}`, {
              replace: true,
            });
            return;
          }

          try {
            await sendMessageWithAttachments({
              conversationId: targetConversationId,
              content: trimmed,
              images: attachmentSnapshot.images,
              files: attachmentSnapshot.files,
              imagesMarkedUploadAsFile,
              t,
            });
            clearAllFiles();
          } catch (error) {
            displayErrorToast(error instanceof Error ? error.message : null);
            navigate(`/conversations/${targetConversationId}`, {
              replace: true,
            });
            return;
          }
        }

        navigate(`/conversations/${targetConversationId}`, { replace: true });
      } catch (error) {
        useOptimisticUserMessageStore.getState().clearPendingMessages();
        displayErrorToast(error instanceof Error ? error.message : null);
        navigate("/");
      }
    })();
  };

  // Without this wrapper a `/model NAME` typed here would become the first
  // user message of the new conversation. The interceptor activates the
  // profile globally (null conversationId path) so the next conversation
  // launches with it.
  const handleSubmitWithModelGuard = useModelInterceptor(null, handleSubmit);

  return (
    <div
      data-testid="home-chat-launcher"
      className="flex w-full flex-col items-center pt-[max(4rem,28vh)] pb-10"
    >
      <div className="flex w-full max-w-[800px] flex-col gap-4 md:px-4">
        <div className="flex w-full justify-center">
          <HomeHeaderTitle />
        </div>

        <div className="w-full">
          <CustomChatInput
            onSubmit={handleSubmitWithModelGuard}
            onFilesPaste={handleUpload}
            disabled={isCreating || llmBlocked}
          />
        </div>

        <div className="flex flex-col items-start gap-2">
          <SkillShareCodeControls disabled={isCreating || llmBlocked} />
        </div>
      </div>
    </div>
  );
}
