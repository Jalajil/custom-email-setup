import { EmailMessage } from "cloudflare:email";
import PostalMime from "postal-mime";
import { DEFAULT_FORWARD_TO, EMAIL_MAP } from "./email-routes";

export interface Env {
	SEB: SendEmail;
}

function buildMimeMessage(opts: {
	from: string;
	fromName: string;
	to: string;
	replyTo: string;
	subject: string;
	textBody?: string;
	htmlBody?: string;
}): string {
	const boundary = "----=_Part_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
	const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@${opts.from.split("@")[1]}>`;

	const hasText = !!opts.textBody;
	const hasHtml = !!opts.htmlBody;
	const isMultipart = hasText && hasHtml;

	let mime = "";
	mime += `From: =?UTF-8?B?${btoa(unescape(encodeURIComponent(opts.fromName)))}?= <${opts.from}>\r\n`;
	mime += `To: ${opts.to}\r\n`;
	mime += `Reply-To: ${opts.replyTo}\r\n`;
	mime += `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(opts.subject)))}?=\r\n`;
	mime += `Message-ID: ${messageId}\r\n`;
	mime += `MIME-Version: 1.0\r\n`;

	if (isMultipart) {
		mime += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n`;
		mime += `\r\n`;
		mime += `--${boundary}\r\n`;
		mime += `Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
		mime += `${btoa(unescape(encodeURIComponent(opts.textBody!)))}\r\n`;
		mime += `--${boundary}\r\n`;
		mime += `Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
		mime += `${btoa(unescape(encodeURIComponent(opts.htmlBody!)))}\r\n`;
		mime += `--${boundary}--\r\n`;
	} else if (hasHtml) {
		mime += `Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
		mime += `${btoa(unescape(encodeURIComponent(opts.htmlBody!)))}\r\n`;
	} else {
		mime += `Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
		mime += `${btoa(unescape(encodeURIComponent(opts.textBody || "")))}\r\n`;
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

			const mimeStr = buildMimeMessage({
				from: recipientAddr,
				fromName: senderName,
				to: forwardTo,
				replyTo: senderAddr,
				subject: subject,
				textBody: email.text || undefined,
				htmlBody: email.html || undefined,
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