import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatSendButton } from "#/components/features/chat/chat-send-button";

describe("ChatSendButton", () => {
  it("uses the foreground token so the arrow stays visible in light mode", () => {
    render(
      <ChatSendButton
        buttonClassName=""
        handleSubmit={() => {}}
        disabled={false}
      />,
    );

    const button = screen.getByTestId("submit-button");

    expect(button.className).toContain("border-[var(--oh-foreground)]");
    expect(button.className).toContain("text-[var(--oh-foreground)]");
    expect(button.className).not.toContain("border-white");
    expect(button.querySelector("svg")?.getAttribute("color")).toBeNull();
  });
});
