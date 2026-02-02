/**
 * SDB Commands - Shared types
 */

export interface CommandContext {
  human: boolean;
  debug: boolean;
  dryRun?: boolean;
}
