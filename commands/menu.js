const settings = require('../settings');

const channelInfo = {
    forwardingScore: 1, isForwarded: true,
    forwardedNewsletterMessageInfo: {
        newsletterJid: '120363427860148318@newsletter',
        newsletterName: 'IB-SACKO', serverMessageId: -1
    }
};

async function menuCommand(sock, chatId, message) {
    const now = new Date();
    const heure = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const date = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const username = sock.user?.name || sock.user?.id?.split(':')[0].split('@')[0] || settings.botName;

    const text = `╔════✦𝗜𝗕-𝗦𝗔𝗖𝗞𝗢✦════✰
║»✰ *ʙᴏᴛ ɴᴀᴍᴇ* : ${settings.botName}
║»✰ *ᴜsᴇʀɴᴀᴍᴇ* : ${username}
║»✰ *ᴅᴇᴠᴇʟᴏᴘᴇʀ* : ${settings.developerName}
║»✰ *⏰ ʜᴇᴜʀᴇ* : ${heure}
║»✰ *📅 ᴅᴀᴛᴇ* : ${date}
╚══════════════════✰
               𝐂𝐄𝐍𝐓𝐑𝐀-𝐇𝐄𝐗
╔══════𝗚𝗘𝗡𝗘𝗥𝗔𝗟══════>
║❒ menu → afficher le menu
║❒ ping → vitesse du bot
║❒ owner → infos propriétaire
║❒ mode → public/privé
║❒ pair → code connexion
║❒ antidelete → suppression des messages
║❒ humm → capturer un média vue unique
║❒ waouh → capturer un média vue unique
╚══════════════════✰`;

    try {
        await sock.sendMessage(chatId, {
            image: { url: settings.menuImage },
            caption: text,
            contextInfo: channelInfo
        }, { quoted: message });
    } catch (e) {
        console.error('❌ [menu]', e.message);
        await sock.sendMessage(chatId, { text, contextInfo: channelInfo }, { quoted: message });
    }
}

module.exports = menuCommand;
