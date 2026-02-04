/**
 * SDB - Time and duration utilities
 */

import { errors } from './errors.js';

const DURATION_REGEX = /^(\d+)([smhdw])$/i;

const MULTIPLIERS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

export function parseDurationMs(input: string): number {
  const trimmed = input.trim();
  const match = trimmed.match(DURATION_REGEX);
  if (!match) {
    throw errors.invalidInput(
      `Invalid duration '${input}'. Use formats like 10s, 5m, 2h, 7d, 1w.`,
      { input }
    );
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = MULTIPLIERS[unit];

  if (!Number.isFinite(value)) {
    throw errors.invalidInput(`Invalid duration value '${match[1]}'`, { input });
  }

  if (value < 0) {
    throw errors.invalidInput(`Duration must be >= 0`, { input });
  }

  return value * multiplier;
}
