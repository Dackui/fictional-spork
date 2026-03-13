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
console.log('Token cargado:', process.env.TOKEN ? 'SÍ existe' : 'NO existe o está vacío');
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
   
  if (!flags.responderhuevos && /(huevos|buebos|huevitos|buebitos)/.test(texto)) {
    flags.responderhuevos = true;
    const respuestas = [
        "_¡Chupas y dejas nuevos!_ 😏",
        "_¡De esos no te faltan!_ 🥚",
        "_¡Dos, bien puestos!_ 😏"
    ];
    message.reply(respuestas[Math.floor(Math.random() * respuestas.length)]);
    setTimeout(() => flags.responderhuevos = false, 5000);
    return;
  }

  if (texto.startsWith('!consejo')) {
    const consejos = [
        "_Si tienes frío, párate en una esquina, que las esquinas son 90 grados_ 🌡️",
        "_Nunca discutas con un idiota, te bajará a su nivel y te ganará con experiencia_ 🧠",
        "_Si la vida te da limones, véndelos, ahorita están caros_ 🍋",
        "_El que madruga, amanece cansado_ 😴",
        "_Antes de hablar, asegúrate de tener algo que decir_ 🤐",
        "_Si algo puede salir mal, sal corriendo_ 🏃",
        "_El dinero no da la felicidad, pero es mejor llorar en un Uber que en el camión_ 🚗",
        "_No dejes para mañana lo que puedes echarle la culpa a otro hoy_ 👆",
        "_El amor es ciego, pero los vecinos no_ 👀",
        "_Si te caes, levántate. Si no puedes, quédate ahí, alguien te tomará foto_ 📸"
    ];
    message.reply(consejos[Math.floor(Math.random() * consejos.length)]);
    return;
  }

  // ========== STICKERS ==========
if (message.stickers.size > 0 && !flags.respondedSticker) {
  const sticker = message.stickers.first();
  if (sticker.name.toLowerCase().includes('esta')) {
    flags.respondedSticker = true;

    const respuestas = [
      "_¡Ah chinga, ya sacó la longaniza del metro!_ 🚇",
      "_¿Tienes frío o así está siempre?_ 🥶",
      "_¡Guárdala, que espantas a los niños!_ 😳",
      "_¿Eso es de exhibición o sí sirve?_ 🤨",
      "_¡Órale! Hasta se me cayó el chicle del susto._ 😮",
      "_Cálmate, mi rey, que esto no es vitrina._ 🪟",
      "_¡Aguas! Que luego lo confunden con poste._ 🚧",
      "_¿Eso viene con manual o nomás presumes?_ 📖",
      "_¡Tranquilo campeón, que aquí no es concurso!_ 🏆",
      "_¿Eso es tamaño real o versión inflable?_ 🎈"
    ];

    const respuesta = respuestas[Math.floor(Math.random() * respuestas.length)];
    message.reply(respuesta);

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
