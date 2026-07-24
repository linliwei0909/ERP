export type LoginFailureState = {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
};

export function nextLoginFailureState(input: {
  currentAttempts: number;
  threshold: number;
  lockMinutes: number;
  now: Date;
}): LoginFailureState {
  const failedLoginAttempts = input.currentAttempts + 1;

  return {
    failedLoginAttempts,
    lockedUntil:
      failedLoginAttempts >= input.threshold
        ? new Date(input.now.getTime() + input.lockMinutes * 60 * 1000)
        : null,
  };
}

export function resetLoginFailureState(): LoginFailureState {
  return {
    failedLoginAttempts: 0,
    lockedUntil: null,
  };
}

export function isAccountTemporarilyLocked(
  lockedUntil: Date | null,
  now: Date,
): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}
