// Default Gmail that receives all emails not listed below
export const DEFAULT_FORWARD_TO = "your-email@gmail.com";

// Map custom emails to specific Gmail addresses
export const EMAIL_MAP: Record<string, string> = {
	"you@yourdomain.com": "your-email@gmail.com",
	"other@yourdomain.com": "other-email@gmail.com",
};
