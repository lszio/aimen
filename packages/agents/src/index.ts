export const name = '@aimen/agents';

export interface AgentConfig {
  name: string;
  model?: string;
}

export function createAgent(config: AgentConfig) {
  return {
    name: config.name,
    run: async (input: string): Promise<string> => {
      console.log(`[agents] ${config.name} run: ${input}`);
      return `processed: ${input}`;
    },
  };
}