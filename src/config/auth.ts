/** Administrator authentication settings. Changing these affects security; see docs/security.md. */
export const authConfig = {
  /** Sign out after this long without activity. */
  idleTimeoutHours: 12,
  /** Sign out after this long regardless of activity; the administrator must log in again. */
  absoluteTimeoutDays: 7,
  /** How often "last seen" is written back, to avoid a database write on every request. */
  touchIntervalMinutes: 5,
  /** Failed logins allowed for one account within the window before it is paused. */
  maxFailuresPerAccount: 5,
  /** Failed logins allowed from one network within the window (any account). */
  maxFailuresPerNetwork: 20,
  failureWindowMinutes: 15,
  minPasswordLength: 12,
  maxPasswordLength: 256,
} as const;
