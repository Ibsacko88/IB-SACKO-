// humm.js — IB-SACKO-V2
// Ne fonctionne QUE sur une réponse à un média "vue unique" (view once).
// Envoie le média uniquement dans le MP de la personne qui tape la commande —
// jamais dans la conversation, jamais vers un tiers, aucune suppression.
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

function extractViewOnceMedia(quotedMessage) {
    if (!quotedMessage) return null;
    const unwrapped =
        quotedMessage.viewOnceMessageV2?.message ||
        quotedMessage.viewOnceMessageV2Extension?.message ||
        quotedMessage.viewOnceMessage?.message ||
        quotedMessage;

    if (unwrapped.imageMessage && (unwrapped.imageMessage.viewOnce || quotedMessage.viewOnceMessageV2 || quotedMessage.viewOnceMessage)) {
        return { type: 'image', content: unwrapped.imageMessage };
    }
    if (unwrapped.videoMessage && (unwrapped.videoMessage.viewOnce || quotedMessage.viewOnceMessageV2 || quotedMessage.viewOnceMessage)) {
        return { type: 'video', content: unwrapped.videoMessage };
    }
    return null;
}

async function hummCommand(sock, chatId, senderId, replyMessage, message) {
    const viewOnce = extractViewOnceMedia(replyMessage);
    if (!viewOnce) return; // pas une vue unique → silence total

    try {
        const { type, content } = viewOnce;
        const stream = await downloadContentFromMessage(content, type);
        let buf = Buffer.from([]);
        for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);

        await sock.sendMessage(senderId, {
            [type]: buf,
            caption: `🥷 *IB-SACKO* — vue unique récupérée (humm)`
        });
    } catch (e) {
        console.error('❌ [humm]', e.message);
    }
}

module.exports = hummCommand;
