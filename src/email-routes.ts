// Default Gmail that receives all emails not listed below
export const DEFAULT_FORWARD_TO = "fall-back-email@gmail.com";

// Map custom emails to specific Gmail addresses
export const EMAIL_MAP: Record<string, string> = {
	"any@custom-domain.com": "your-email@gmail.com",
	"any2@custom-domain.com": "other-email@gmail.com",
};
