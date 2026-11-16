/** Wording for poll phases and voting events in the admin portal. */

export const PHASE_LABEL: Record<string, string> = {
  draft: "Draft",
  upcoming: "Upcoming",
  active: "Voting open",
  closed: "Closed",
  archived: "Archived",
};

export const PHASE_STYLE: Record<string, string> = {
  draft: "bg-soft text-body",
  upcoming: "bg-[#e3ecff] text-[#1d3d8f]",
  active: "bg-[#e1f4e8] text-[#14532d]",
  closed: "bg-notice text-notice-ink",
  archived: "bg-soft text-muted",
};

export const EVENT_LABEL: Record<string, string> = {
  DUPLICATE_ATTEMPT: "Tried to vote again from the same device",
  RATE_LIMITED: "Too many votes from one network",
  FRESH_DEVICE_BURST: "Many brand-new devices from one network",
  INVALID_DEVICE_TOKEN: "Missing or tampered device cookie",
  TOO_FAST: "Voted too quickly after arriving",
  HONEYPOT: "Automated form filling detected",
  NOT_OPEN: "Voting was not open",
};
