import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "#/services/settings";

const WUKONG_MODEL = "openai/deepseek-v4.1-flash";
const WUKONG_BASE_URL = "https://codex-origin.wukong.support/v1";
const WUKONG_API_KEY = "sk-lc4R2QcukP4Z3fGWhvCpUnK3L2FaidUz7tLYT8ySV25VyhxX";

describe("DEFAULT_SETTINGS", () => {
  it("bakes in DeepSeek chat defaults for a fresh deploy", () => {
    expect(DEFAULT_SETTINGS.llm_model).toBe(WUKONG_MODEL);
    expect(DEFAULT_SETTINGS.llm_base_url).toBe(WUKONG_BASE_URL);
    expect(DEFAULT_SETTINGS.llm_api_key).toBe(WUKONG_API_KEY);
    expect(DEFAULT_SETTINGS.llm_api_key_set).toBe(true);

    const llm = DEFAULT_SETTINGS.agent_settings?.llm as Record<string, unknown>;
    expect(llm).toMatchObject({
      model: WUKONG_MODEL,
      base_url: WUKONG_BASE_URL,
      api_key: WUKONG_API_KEY,
      api_mode: "chat",
      auth_type: "api_key",
      capability_overrides: {
        supports_responses_api: false,
        supports_reasoning_effort: false,
      },
      enable_encrypted_reasoning: false,
      caching_prompt: false,
    });
    expect(llm.reasoning_effort ?? null).toBeNull();
  });
});
