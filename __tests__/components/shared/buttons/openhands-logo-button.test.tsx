import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "test-utils";
import { OpenHandsLogoButton } from "#/components/shared/buttons/openhands-logo-button";

describe("OpenHandsLogoButton", () => {
  it("paints the wordmark with the foreground token", () => {
    renderWithProviders(<OpenHandsLogoButton />);

    const wordmark = screen.getByText("BRANDING$SITE");

    expect(wordmark.className).toContain("text-[var(--oh-foreground)]");
    expect(wordmark.className).not.toContain("text-white");
  });
});
