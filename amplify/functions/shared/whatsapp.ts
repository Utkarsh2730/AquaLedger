import {
  CreateWhatsAppMessageTemplateCommand,
  GetLinkedWhatsAppBusinessAccountPhoneNumberCommand,
  ListWhatsAppMessageTemplatesCommand,
  SendWhatsAppMessageCommand,
  SocialMessagingClient,
} from "@aws-sdk/client-socialmessaging";
import { whatsappTemplateDefinition, whatsappTemplateMessage, WHATSAPP_TEMPLATE } from "../../../lib/core/residents";

/**
 * Automatic WhatsApp through AWS End User Messaging Social (the WhatsApp Business Platform).
 * Optional: switched on by AQUALEDGER_WHATSAPP_PHONE_ID. Without it, the committee still sends
 * logins on WhatsApp from its own phone with one tap per flat (click-to-chat links, free).
 */
export const whatsapp = new SocialMessagingClient(process.env.WHATSAPP_REGION ? { region: process.env.WHATSAPP_REGION } : {});
export const whatsappPhoneId = () => process.env.WHATSAPP_PHONE_ID || "";
const templateName = () => process.env.WHATSAPP_TEMPLATE || WHATSAPP_TEMPLATE.name;
const templateLanguage = () => process.env.WHATSAPP_LANGUAGE || WHATSAPP_TEMPLATE.language;
const META_API_VERSION = "v20.0";

export async function sendWhatsApp(o: { to: string; societyName: string; flat: string; code: string; link: string }) {
  const payload = whatsappTemplateMessage({ ...o, template: templateName(), language: templateLanguage() });
  await whatsapp.send(
    new SendWhatsAppMessageCommand({
      originationPhoneNumberId: whatsappPhoneId(),
      message: new TextEncoder().encode(JSON.stringify(payload)),
      metaApiVersion: META_API_VERSION,
    })
  );
}

export function explainWhatsAppError(err: unknown): string {
  const e = err as { name?: string; message?: string };
  const msg = e.message ?? String(err);
  if (/template/i.test(msg)) return `The WhatsApp template "${templateName()}" isn't approved yet (Settings → System check).`;
  if (/not.*(registered|whatsapp)|invalid.*(recipient|phone)|131026/i.test(msg)) return "This number isn't on WhatsApp.";
  return `${e.name ?? "Error"}: ${msg.slice(0, 200)}`;
}

/** For the System check: the sending number, and the login template's status (submitted for review if missing). */
export async function whatsappStatus() {
  const phone = await whatsapp.send(new GetLinkedWhatsAppBusinessAccountPhoneNumberCommand({ id: whatsappPhoneId() }));
  const wabaId = phone.linkedWhatsAppBusinessAccountId!;
  const templates = [];
  let nextToken: string | undefined;
  do {
    const page = await whatsapp.send(new ListWhatsAppMessageTemplatesCommand({ id: wabaId, nextToken, maxResults: 100 }));
    templates.push(...(page.templates ?? []));
    nextToken = page.nextToken;
  } while (nextToken);
  let template = templates.find((t) => t.templateName === templateName() && (!t.templateLanguage || t.templateLanguage.startsWith(templateLanguage())));
  let submitted = false;
  if (!template && templateName() === WHATSAPP_TEMPLATE.name) {
    await whatsapp.send(
      new CreateWhatsAppMessageTemplateCommand({
        id: wabaId,
        templateDefinition: new TextEncoder().encode(JSON.stringify(whatsappTemplateDefinition(templateName(), templateLanguage()))),
      })
    );
    submitted = true;
    template = { templateName: templateName(), templateStatus: "PENDING" };
  }
  return { number: phone.phoneNumber?.displayPhoneNumber ?? phone.phoneNumber?.phoneNumber, quality: phone.phoneNumber?.qualityRating, template: templateName(), status: template?.templateStatus ?? "MISSING", submitted };
}
