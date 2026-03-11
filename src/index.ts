import { EmailMessage } from "cloudflare:email";
import PostalMime from "postal-mime";
import { DEFAULT_FORWARD_TO, EMAIL_MAP } from "./email-routes";

export interface Env {
	SEB: SendEmail;
}

interface EmailAttachment {
	filename: string;
	mimeType: string;
	content: Uint8Array;
	contentId?: string;
	disposition?: "inline" | "attachment";
	related?: boolean;
}

function arrayBufferToBase64(buffer: Uint8Array): string {
	let binary = "";
	const bytes = new Uint8Array(buffer);
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

function buildMimeMessage(opts: {
	from: string;
	fromName: string;
	to: string;
	replyTo: string;
	subject: string;
	textBody?: string;
	htmlBody?: string;
	attachments?: EmailAttachment[];
}): string {
	const boundaryMixed = "----=_Part_Mixed_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
	const boundaryAlt = "----=_Part_Alt_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
	const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@${opts.from.split("@")[1]}>`;

	const hasText = !!opts.textBody;
	const hasHtml = !!opts.htmlBody;
	const hasAttachments = opts.attachments && opts.attachments.length > 0;
	const isMultipart = hasText && hasHtml;

	// Check for inline images (attachments with contentId)
	const hasInlineImages = opts.attachments?.some(a => a.contentId && a.disposition === "inline");

	let mime = "";
	mime += `From: =?UTF-8?B?${btoa(unescape(encodeURIComponent(opts.fromName)))}?= <${opts.from}>\r\n`;
	mime += `To: ${opts.to}\r\n`;
	mime += `Reply-To: ${opts.replyTo}\r\n`;
	mime += `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(opts.subject)))}?=\r\n`;
	mime += `Message-ID: ${messageId}\r\n`;
	mime += `MIME-Version: 1.0\r\n`;

	// If we have attachments, use multipart/mixed structure
	if (hasAttachments) {
		mime += `Content-Type: multipart/mixed; boundary="${boundaryMixed}"\r\n`;
		mime += `\r\n`;

		// Add the text/html body part first
		mime += `--${boundaryMixed}\r\n`;

		if (isMultipart) {
			mime += `Content-Type: multipart/alternative; boundary="${boundaryAlt}"\r\n`;
			mime += `\r\n`;
			mime += `--${boundaryAlt}\r\n`;
			mime += `Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
			mime += `${btoa(unescape(encodeURIComponent(opts.textBody!)))}\r\n`;
			mime += `--${boundaryAlt}\r\n`;
			mime += `Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
			mime += `${btoa(unescape(encodeURIComponent(opts.htmlBody!)))}\r\n`;
			mime += `--${boundaryAlt}--\r\n`;
		} else if (hasHtml) {
			mime += `Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
			mime += `${btoa(unescape(encodeURIComponent(opts.htmlBody!)))}\r\n`;
		} else {
			mime += `Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
			mime += `${btoa(unescape(encodeURIComponent(opts.textBody || "")))}\r\n`;
		}

		// Add each attachment
		for (const attachment of opts.attachments!) {
			const base64Content = arrayBufferToBase64(attachment.content);
			const filenameEncoded = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(attachment.filename)))}?=`;

			mime += `--${boundaryMixed}\r\n`;
			mime += `Content-Type: ${attachment.mimeType}; name="${filenameEncoded}"\r\n`;
			mime += `Content-Transfer-Encoding: base64\r\n`;

			// Handle inline vs regular attachment
			if (attachment.contentId && attachment.disposition === "inline") {
				mime += `Content-Disposition: inline; filename="${filenameEncoded}"\r\n`;
				mime += `Content-ID: <${attachment.contentId}>\r\n`;
			} else {
				mime += `Content-Disposition: attachment; filename="${filenameEncoded}"\r\n`;
			}

			mime += `\r\n`;
			// Split base64 into lines of 76 characters for MIME compliance
			const lines = base64Content.match(/.{1,76}/g) || [];
			mime += lines.join("\r\n") + "\r\n";
		}

		mime += `--${boundaryMixed}--\r\n`;
	} else {
		// No attachments - use original structure
		if (isMultipart) {
			mime += `Content-Type: multipart/alternative; boundary="${boundaryAlt}"\r\n`;
			mime += `\r\n`;
			mime += `--${boundaryAlt}\r\n`;
			mime += `Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
			mime += `${btoa(unescape(encodeURIComponent(opts.textBody!)))}\r\n`;
			mime += `--${boundaryAlt}\r\n`;
			mime += `Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
			mime += `${btoa(unescape(encodeURIComponent(opts.htmlBody!)))}\r\n`;
			mime += `--${boundaryAlt}--\r\n`;
		} else if (hasHtml) {
			mime += `Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
			mime += `${btoa(unescape(encodeURIComponent(opts.htmlBody!)))}\r\n`;
		} else {
			mime += `Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
			mime += `${btoa(unescape(encodeURIComponent(opts.textBody || "")))}\r\n`;
		}
	}

	return mime;
}

export default {
	async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
		try {
			const rawEmail = new Response(message.raw);
			const arrayBuffer = await rawEmail.arrayBuffer();
			const email = await PostalMime.parse(arrayBuffer);

			const senderAddr = email.from?.address || message.from;
			const senderName = email.from?.name || senderAddr;
			const subject = email.subject || "(no subject)";

			// Use the original recipient address (preserves which domain received the email)
			const recipientAddr = message.to.toLowerCase();
			const forwardTo = EMAIL_MAP[recipientAddr] || DEFAULT_FORWARD_TO;

			// Process attachments from PostalMime
			const attachments: EmailAttachment[] = (email.attachments || []).map((att: any) => ({
				filename: att.filename || "attachment",
				mimeType: att.mimeType || "application/octet-stream",
				content: att.content,
				contentId: att.contentId,
				disposition: att.contentDisposition as "inline" | "attachment" | undefined,
				related: att.related,
			}));

			const mimeStr = buildMimeMessage({
				from: recipientAddr,
				fromName: senderName,
				to: forwardTo,
				replyTo: senderAddr,
				subject: subject,
				textBody: email.text || undefined,
				htmlBody: email.html || undefined,
				attachments: attachments,
			});

			const newMessage = new EmailMessage(
				recipientAddr,
				forwardTo,
				mimeStr
			);

			await env.SEB.send(newMessage);
		} catch (e) {
			const errMsg = e instanceof Error ? e.message : String(e);
			console.log("Worker error:", errMsg);
			message.setReject("Forwarding failed: " + errMsg);
		}
	},
} satisfies ExportedHandler<Env>;
