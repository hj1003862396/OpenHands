import { Settings } from "#/types/settings";

export const LATEST_SETTINGS_VERSION = 5;

export const DEFAULT_SETTINGS: Settings = {
  llm_model: "openai/deepseek-v4.1-flash",
  llm_base_url: "https://codex-origin.wukong.support/v1",
  agent: "CodeActAgent",
  language: "zh-CN",
  llm_api_key: "sk-lc4R2QcukP4Z3fGWhvCpUnK3L2FaidUz7tLYT8ySV25VyhxX",
  llm_api_key_set: true,
  search_api_key_set: false,
  confirmation_mode: false,
  security_analyzer: "llm",
  max_iterations: null,
  remote_runtime_resource_factor: 1,
  provider_tokens_set: {},
  enable_default_condenser: true,
  condenser_max_size: 240,
  enable_sound_notifications: false,
  user_consents_to_analytics: null,
  enable_proactive_conversation_starters: false,
  enable_solvability_analysis: false,
  search_api_key: "",
  is_new_user: true,
  disabled_skills: [],
  mcp_config: {},
  max_budget_per_task: null,
  email: "",
  email_verified: true,
  git_user_name: "openhands",
  git_user_email: "openhands@all-hands.dev",
  title_llm_profile: null,
  agent_settings_schema: null,
  agent_settings: {
    schema_version: 6,
    agent_kind: "openhands",
    agent: "CodeActAgent",
    llm: {
      model: "openai/deepseek-v4.1-flash",
      base_url: "https://codex-origin.wukong.support/v1",
      api_key: "sk-lc4R2QcukP4Z3fGWhvCpUnK3L2FaidUz7tLYT8ySV25VyhxX",
      api_mode: "chat",
      auth_type: "api_key",
      capability_overrides: {
        supports_responses_api: false,
        supports_reasoning_effort: false,
      },
      enable_encrypted_reasoning: false,
      caching_prompt: false,
    },
    condenser: {
      enabled: true,
      max_size: 240,
    },
    verification: {
      critic_enabled: false,
      enable_iterative_refinement: false,
    },
    enable_sub_agents: false,
    enable_switch_llm_tool: true,
    mcp_config: {},
  },
  conversation_settings_schema: null,
  conversation_settings: {
    schema_version: 1,
    confirmation_mode: false,
    security_analyzer: "llm",
  },
};

/**
 * Get the default settings
 */
export const getDefaultSettings = (): Settings => DEFAULT_SETTINGS;
