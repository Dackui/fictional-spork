// ============================
// CONFIGURACIÓN Y CLIENTE DISCORD
// ============================
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();
const axios = require('axios');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ]
});

console.log('🚀 Intentando iniciar sesión con Discord...');
client.login(process.env.TOKEN)
  .then(() => console.log('✅ Login promesa resuelta'))
  .catch(err => {
    console.error('❌ Error directo al hacer login:', err);
    process.exit(1);
  });

client.on('ready', () => {
  console.log(`🎉 Bot conectado correctamente como ${client.user.tag}`);
});
client.on('error', (err) => console.error('🚨 Discord client error:', err));
client.on('shardError', (err) => console.error('🚨 Shard error:', err));
client.on('warn', (info) => console.warn('⚠️ Discord client warning:', info));

// ============================
// FLAGS PARA ANTI-SPAM
// ============================
const userMessageCounts = new Map();
const flags = {
  respondedSticker: false,
  respondedMention: false,
  responderSaludo: false,
  responderErga: false,
  responderHuevo: false,
  responderSed: false,
  responder13: false,
  responderCalor: false,
  responderFrio: false,
  responderBlanco: false,
  responderCinco: false,
  responderHueva: false,
  responderDefine: false
};

// ============================
// RESPUESTAS A MENSAJES
// ============================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const texto = message.content.toLowerCase();

  // ========== DEFINICIONES ==========
  if (texto.startsWith('!define')) {
    const query = texto.replace('!define', '').trim();
    if (!query) {
      const respuestasDefine = [
        '_Dime qué quieres que te defina, mi wikipedia sin conexión 📚_',
        '_Pregúntame, caón, pregúntame 💪🏻_',
        "_¿Qué quieres que te defina? Si no, te lo resumo_ 🥴",
        "_¿A poco no te la sabes? Échate la pregunta 👊🏽_"
      ];
      message.reply(respuestasDefine[Math.floor(Math.random() * respuestasDefine.length)]);
      return;
    }

    try {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&kl=es-es`;
      const res = await axios.get(url);
      const data = res.data;

      let definicion = data.Abstract || data.Definition || 
                       (data.RelatedTopics?.length ? data.RelatedTopics[0].Text : null);

      if (!definicion) {
        message.reply("_Ni doña pelos sabe qué es eso, mijares 🤯_");
      } else {
        const remate = [
          "_Con eso ya puedes aparentar en la peda 🍻_",
          "_Ahora sí, a fingir que ya te la sábanas, mi todo tibio 🙌🏽_",
          "_Pa' que no se diga que no se veiene a aprender en este cuchitril, mi jardín 🤓_",
          "_Con eso y una mona de guayaba, serás el más sácatelas de la cuadra 🤧_"
        ];
        message.reply(`**${query}:** ${definicion}\n${remate[Math.floor(Math.random() * remate.length)]}`);
      }
    } catch (err) {
      console.error("Error en definición: ", err.message);
      message.reply("_Se cayó el diccionario de tepito, es que me tiraron de cabeza de morrito 👶🏻_");
    }
    return;
  }

  // ========== SALUDO ==========
  if (!flags.responderSaludo && /(hola|buen[oa]s?\s?(d[ií]as?|tardes?|noches?)|qué onda|que onda|q onda)/.test(texto)) {
    flags.responderSaludo = true;
    const horaUTC = new Date().getUTCHours();
    const hora = (horaUTC + 18) % 24;
    let respuestasSaludo = hora < 12 ?
      ["_¡Buenos días, mi café con pan!_ ☕🥖", "_¿Qué tal amaneció la banda?_", "_Cámara, no hay cruda que aguante este saludo mañanero_ 🌅"] :
      hora < 20 ?
      ["_¡Buenas las tortas, mi rey!_ 🥪", "_¿Qué Pachuca por Toluca esta tarde?_"] :
      ["_¡Buenas noches, mi cobija con hoyos!_ 🛌", "_¿Qué onda? ¿Ya sacaste la pijama del PRI?_"];
    message.reply(respuestasSaludo[Math.floor(Math.random() * respuestasSaludo.length)]);
    setTimeout(() => flags.responderSaludo = false, 5000);
    return;
  }

  // ========== ALBURES ==========
  if (!flags.responderErga && /([bv]erga|pito|pitillo|pene|nepe)/.test(texto)) {
    flags.responderErga = true;
    message.reply("_¡Comes!_ 😏");
    setTimeout(() => flags.responderErga = false, 5000);
    return;
  }

  if (!flags.responder13 && /(13|12+1|10+3|trece|trese)/.test(texto)) {
    flags.responder13 = true;
    message.reply("_¡Entre más me la mamas, más me crece!_ 😏");
    setTimeout(() => flags.responder13 = false, 5000);
    return;
  }

  // ========== STICKERS ==========
  if (message.stickers.size > 0 && !flags.respondedSticker) {
    const sticker = message.stickers.first();
    if (sticker.name.toLowerCase().includes('esta')) {
      flags.respondedSticker = true;
      message.reply("_¡Ah chinga, ya sacó la longaniza del metro!_ 🚇");
      setTimeout(() => flags.respondedSticker = false, 5000);
    }
    return;
  }

  // ========== MENSAJES REPETIDOS ==========
  const key = `${message.channel.id}-${message.author.id}`;
  const last = userMessageCounts.get(key) || { count: 0 };
  last.count += 1;
  userMessageCounts.set(key, last);
  if (last.count >= 6) {
    message.reply("_Ya siéntese, mi todo tibio_ 🪑");
    userMessageCounts.set(key, { count: 0 });
  }
});

app.get('/', (req, res) => res.send('Bot activo 😎'));
app.listen(PORT, () => console.log(`Keep-alive listo en puerto ${PORT}`));

function keepAlive() {
  axios.get(SELF_URL)
    .then(res => console.log(`[KEEP-ALIVE] Ping OK: ${res.status}`))
    .catch(err => console.error(`[KEEP-ALIVE] Error:`, err.message));
}
setInterval(keepAlive, 30 * 1000);
