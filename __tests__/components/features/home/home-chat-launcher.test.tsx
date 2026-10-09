import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { HomeChatLauncher } from "#/components/features/home/home-chat-launcher";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";

const mockNavigate = vi.fn();
const mockUseActiveBackend = vi.fn();
const sendMessageWithAttachments = vi.fn();
const mockClearAllFiles = vi.fn();
const enqueueHomeTaskPendingMessage = vi.fn();
const mockDisplayErrorToast = vi.fn();

let mockImages: File[] = [];
let mockFiles: File[] = [];

vi.mock("#/utils/send-message-with-attachments", () => ({
  sendMessageWithAttachments: (...args: unknown[]) =>
    sendMessageWithAttachments(...args),
}));

vi.mock("#/utils/enqueue-home-task-pending-message", () => ({
  enqueueHomeTaskPendingMessage: (...args: unknown[]) =>
    enqueueHomeTaskPendingMessage(...args),
}));

vi.mock("#/stores/conversation-store", () => ({
  useConversationStore: () => ({
    images: mockImages,
    files: mockFiles,
    imagesMarkedUploadAsFile: [],
    clearAllFiles: mockClearAllFiles,
  }),
}));

vi.mock("#/utils/custom-toast-handlers", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("#/utils/custom-toast-handlers")>();
  return {
    ...actual,
    displayErrorToast: (...args: unknown[]) => mockDisplayErrorToast(...args),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("#/context/navigation-context", () => ({
  useNavigation: () => ({
    currentPath: "/",
    conversationId: null,
    isNavigating: false,
    navigate: mockNavigate,
  }),
}));

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => mockUseActiveBackend(),
}));

vi.mock("#/hooks/use-is-creating-conversation", () => ({
  useIsCreatingConversation: () => false,
}));

vi.mock("#/hooks/use-tracking", () => ({
  useTracking: () => ({
    trackConversationCreated: vi.fn(),
  }),
}));

// Stub CustomChatInput as a simple button so the test can submit without
// exercising the rich contenteditable / draft-persistence stack — those are
// covered by their own unit tests. Pressing the stub button is the same
// signal: "user submitted `hello world`".
vi.mock("#/components/features/chat/custom-chat-input", () => ({
  CustomChatInput: ({
    onSubmit,
    disabled,
  }: {
    onSubmit: (msg: string) => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      data-testid="stub-chat-submit"
      disabled={disabled}
      onClick={() => onSubmit("hello world")}
    >
      stub submit
    </button>
  ),
}));

vi.mock("#/components/features/home/skill-share-code-controls", () => ({
  SkillShareCodeControls: ({ disabled }: { disabled?: boolean }) => (
    <div
      data-testid="skill-share-code-controls"
      data-disabled={disabled ? "true" : "false"}
    />
  ),
}));

const renderLauncher = () =>
  render(<HomeChatLauncher />, {
    wrapper: ({ children }) => (
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          })
        }
      >
        {children}
      </QueryClientProvider>
    ),
  });

function makeConversationResponse(
  overrides: Record<string, unknown> = {},
): never {
  return {
    id: "conv-abc",
    created_by_user_id: null,
    status: "READY",
    detail: null,
    app_conversation_id: "conv-abc",
    agent_server_url: "http://agent-server.local",
    request: { initial_message: undefined, plugins: null },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as never;
}

const localBackend = {
  backend: {
    id: "local-id",
    name: "Local",
    host: "http://localhost",
    apiKey: "test",
    kind: "local" as const,
  },
  orgId: null,
};

const cloudBackend = {
  backend: {
    id: "cloud-id",
    name: "Cloud",
    host: "https://cloud",
    apiKey: "test",
    kind: "cloud" as const,
  },
  orgId: null,
};

describe("HomeChatLauncher", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mockImages = [];
    mockFiles = [];
    mockUseActiveBackend.mockReturnValue(localBackend);
    enqueueHomeTaskPendingMessage.mockResolvedValue(undefined);
    sendMessageWithAttachments.mockResolvedValue({
      text: "hello world",
      content: "hello world",
      imageUrls: ["data:image/png;base64,abc"],
      fileUrls: [],
      timestamp: "2020-01-01T00:00:00.000Z",
    });
  });

  afterEach(() => {
    toast.remove();
  });

  it("creates a conversation with just the typed query and navigates when no workspace is selected", async () => {
    const createSpy = vi
      .spyOn(AgentServerConversationService, "createConversation")
      .mockResolvedValue(makeConversationResponse());

    renderLauncher();
    const user = userEvent.setup();

    await user.click(screen.getByTestId("stub-chat-submit"));

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    expect(createSpy).toHaveBeenCalledWith({
      initialUserMsg: "hello world",
      metadata: null,
    });
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/conversations/conv-abc"),
    );
  });

  it("does not pass query to createConversation when attachments are present", async () => {
    mockImages = [new File(["x"], "shot.png", { type: "image/png" })];
    const createSpy = vi
      .spyOn(AgentServerConversationService, "createConversation")
      .mockResolvedValue(makeConversationResponse());

    renderLauncher();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("stub-chat-submit"));

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    expect(createSpy).toHaveBeenCalledWith({
      metadata: null,
    });
    await waitFor(() =>
      expect(sendMessageWithAttachments).toHaveBeenCalledTimes(1),
    );
    expect(mockClearAllFiles).toHaveBeenCalled();
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/conversations/conv-abc"),
    );
  });

  it("surfaces a toast and skips navigation when conversation creation fails", async () => {
    vi.spyOn(
      AgentServerConversationService,
      "createConversation",
    ).mockRejectedValue(new Error("Network down"));

    renderLauncher();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("stub-chat-submit"));

    await waitFor(() => expect(mockDisplayErrorToast).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("enqueues an optimistic pending message when cloud returns a start task", async () => {
    mockUseActiveBackend.mockReturnValue(cloudBackend);
    const createSpy = vi
      .spyOn(AgentServerConversationService, "createConversation")
      .mockResolvedValue(
        makeConversationResponse({
          id: "start-task-1",
          app_conversation_id: null,
        }),
      );

    renderLauncher();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("stub-chat-submit"));

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(enqueueHomeTaskPendingMessage).toHaveBeenCalledWith({
        conversationId: "task-start-task-1",
        text: "hello world",
        images: [],
        imagesMarkedUploadAsFile: [],
      }),
    );
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        "/conversations/task-start-task-1",
      ),
    );
  });

  it("defers attachments and enqueues an optimistic pending message for cloud start tasks", async () => {
    mockUseActiveBackend.mockReturnValue(cloudBackend);
    mockImages = [new File(["x"], "shot.png", { type: "image/png" })];
    const createSpy = vi
      .spyOn(AgentServerConversationService, "createConversation")
      .mockResolvedValue(
        makeConversationResponse({
          id: "start-task-2",
          app_conversation_id: null,
        }),
      );

    renderLauncher();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("stub-chat-submit"));

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    expect(createSpy).toHaveBeenCalledWith({
      metadata: null,
    });
    expect(sendMessageWithAttachments).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(enqueueHomeTaskPendingMessage).toHaveBeenCalledWith({
        conversationId: "task-start-task-2",
        text: "hello world",
        images: mockImages,
        imagesMarkedUploadAsFile: [],
      }),
    );
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        "/conversations/task-start-task-2",
      ),
    );
  });

  it("renders skill share code controls and hides workspace/plugin pickers", () => {
    renderLauncher();

    expect(screen.getByTestId("skill-share-code-controls")).toBeInTheDocument();
    expect(screen.queryByTestId("open-plugin-picker")).not.toBeInTheDocument();
    expect(screen.queryByTestId("open-workspace-button")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("open-repository-button"),
    ).not.toBeInTheDocument();
  });
});
