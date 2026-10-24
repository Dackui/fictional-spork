const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

/* =========================
   EXPRESS / HEALTHCHECK
========================= */

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (_req, res) => {
  res.send('Bot activo 😎');
});

app.get('/healthz', (_req, res) => {
  res.status(200).send('ok');
});

app.listen(PORT, () => {
  console.log(`🌐 Express escuchando en puerto ${PORT}`);
});

/* =========================
   DISCORD CLIENT
========================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers
  ]
});

/* =========================
   ESTADO / MEMORIA
========================= */

const state = {
  userMessageCounts: new Map(),
  lastReplyByUser: new Map(),
  triggerCooldowns: new Map(),
  lastResponseByGroup: new Map()
};

/* =========================
   CONFIGURACIÓN
========================= */

// auto = zombie en octubre
// normal = siempre normal
// halloween = siempre zombie
const MODO_BOT = 'auto';

// Cooldown general por usuario
const USER_REPLY_COOLDOWN_MS = 7 * 60 * 1000;

// Cooldowns por trigger
const TRIGGER_COOLDOWNS = {
  saludo: 5 * 60 * 1000,
  erga: 5 * 60 * 1000,
  trece: 5 * 60 * 1000,
  cinco: 5 * 60 * 1000,
  hueva: 6 * 60 * 1000,
  calor: 6 * 60 * 1000,
  frio: 6 * 60 * 1000,
  blanco: 5 * 60 * 1000,
  huevos: 5 * 60 * 1000,
  sed: 5 * 60 * 1000,
  mention: 3 * 60 * 1000,
  sticker_esta: 5 * 60 * 1000,
  sticker_pooh: 5 * 60 * 1000,
  define: 5 * 1000,
  consejo: 5 * 1000,
  ortografia: 5 * 1000,
  flood: 10 * 60 * 1000
};

// Probabilidades de respuesta
const DEFAULT_REPLY_PROBABILITY = 0.35;
const MENTION_REPLY_PROBABILITY = 0.85;
const DEFINE_REPLY_PROBABILITY = 1;
const FLOOD_REPLY_PROBABILITY = 0.9;
const STICKER_REPLY_PROBABILITY = 0.6;

/* =========================
   HELPERS
========================= */

function now() {
  return Date.now();
}

function stripDiscordCustomEmojis(text) {
  return text.replace(/<a?:\w+:\d+>/g, '').trim();
}

function isOnlyEmojiLike(text) {
  const cleaned = stripDiscordCustomEmojis(text)
    .replace(/\s/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '');

  return cleaned.length === 0 && text.trim().length > 0;
}

function hasAttachmentsOrEmbeds(message) {
  return (
    message.attachments.size > 0 ||
    message.embeds.length > 0 ||
    message.stickers.size > 0
  );
}

function isTextOnlyMessage(message) {
  if (hasAttachmentsOrEmbeds(message)) return false;
  if (!message.content || !message.content.trim()) return false;
  if (isOnlyEmojiLike(message.content)) return false;

  return true;
}

function userCanReceiveReply(userId) {
  const last = state.lastReplyByUser.get(userId) || 0;
  return now() - last >= USER_REPLY_COOLDOWN_MS;
}

function markUserReply(userId) {
  state.lastReplyByUser.set(userId, now());
}

function triggerKey(guildId, channelId, triggerName) {
  return `${guildId || 'dm'}:${channelId}:${triggerName}`;
}

function triggerAvailable(message, triggerName) {
  const key = triggerKey(
    message.guildId,
    message.channelId,
    triggerName
  );

  const last = state.triggerCooldowns.get(key) || 0;
  const cooldown = TRIGGER_COOLDOWNS[triggerName] || 60000;

  return now() - last >= cooldown;
}

function markTrigger(message, triggerName) {
  const key = triggerKey(
    message.guildId,
    message.channelId,
    triggerName
  );

  state.triggerCooldowns.set(key, now());
}

function shouldReply(probability = DEFAULT_REPLY_PROBABILITY) {
  return Math.random() < probability;
}

/* =========================
   RESPUESTAS ALEATORIAS
========================= */

function pickRandom(groupName, arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;

  const last = state.lastResponseByGroup.get(groupName);

  if (arr.length === 1) {
    state.lastResponseByGroup.set(groupName, arr[0]);
    return arr[0];
  }

  let choice = null;
  let tries = 0;

  do {
    choice = arr[Math.floor(Math.random() * arr.length)];
    tries++;
  } while (choice === last && tries < 10);

  state.lastResponseByGroup.set(groupName, choice);

  return choice;
}

/* =========================
   DETECTOR DE HALLOWEEN
========================= */

function esHalloween() {
  if (MODO_BOT === 'halloween') return true;
  if (MODO_BOT === 'normal') return false;

  const mes = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City',
      month: 'numeric'
    }).format(new Date())
  );

  return mes === 10;
}

/* =========================
   SELECCIÓN DE PERSONALIDAD
========================= */

function seleccionarRespuestas(clave, respuestasNormales) {
  if (
    esHalloween() &&
    Array.isArray(RESPUESTAS_HALLOWEEN[clave]) &&
    RESPUESTAS_HALLOWEEN[clave].length > 0
  ) {
    return RESPUESTAS_HALLOWEEN[clave];
  }

  return respuestasNormales;
}

/* =========================
   RESPUESTAS CON CONTROL
========================= */

async function replyWithControl(
  message,
  triggerName,
  responseGroup,
  responses,
  probability = DEFAULT_REPLY_PROBABILITY
) {
  if (!userCanReceiveReply(message.author.id)) return false;
  if (!triggerAvailable(message, triggerName)) return false;
  if (!shouldReply(probability)) return false;

  let clave = triggerName;

  if (triggerName === 'saludo') {
    if (responses === RESPUESTAS.saludoManana) {
      clave = 'saludoManana';
    } else if (responses === RESPUESTAS.saludoTarde) {
      clave = 'saludoTarde';
    } else {
      clave = 'saludoNoche';
    }
  }

  if (triggerName === 'define') {
    clave = 'definePrompt';
  }

  const respuestasFinales = seleccionarRespuestas(
    clave,
    responses
  );

  const text = pickRandom(
    responseGroup,
    respuestasFinales
  );

  if (!text) return false;

  await message.reply(text);

  markUserReply(message.author.id);
  markTrigger(message, triggerName);

  return true;
}

function getTriggerRemainingMs(message, triggerName) {
  const key = triggerKey(
    message.guildId,
    message.channelId,
    triggerName
  );

  const last = state.triggerCooldowns.get(key) || 0;
  const cooldown = TRIGGER_COOLDOWNS[triggerName] || 60000;
  const remaining = cooldown - (now() - last);

  return remaining > 0 ? remaining : 0;
}

/* =========================
   RESPUESTAS NORMALES
========================= */

const RESPUESTAS = {
  bienvenida: [
    "_Quiúbole, ya cayó otro al desmadre. Pásale, nomás no andes de sensible._ 😎",
    "_Ya llegó la bandita. Guarda cartera y celular, ya te la sabes._ 🔫",
    "_Órale, uno más pal barrio digital. Siéntese donde no estorbe._ 🪑",
    "_Bienvenido al congal, mi rey. Aquí puro fino caballero de Iztapalapa._ 🏙️",
    "_Pásele, pásele. No hay devoluciones ni cambios de personalidad._ 🛒",
    "_Otro más pa'l cotorreo. A ver si sí aguanta vara._ 😏"
  ],

  despedida: [
    "_Ya se peló el tilico. Que le vaya recio._ 💨",
    "_Se nos fue, como quincena en Coppel._ 🧾",
    "_Otro que no aguantó el barrio. Ni modo._ 👋",
    "_Ya salió fugado. Cierren la cortina._ 🚪",
    "_Duró menos que oferta de tianguis._ 🛍️"
  ],

  saludoManana: [
    "_Buenos días, mi tamal oaxaqueño._ ☀️",
    "_Quiúbole, ya andas al tiro desde temprano, mi rey._ ☕",
    "_Buenos días, mi café aguado del Oxxo._ 🥤",
    "_Ya amanecimos, gracias a Dios y al ruido de la combi._ 🚌"
  ],

  saludoTarde: [
    "_Buenas, mi chacalón consentido._ 😎",
    "_Qué Pachuca por Toluca, mi banda._ 🌮",
    "_Buenas tardes, mi torta de milanesa._ 🥪",
    "_Qué tranza, ya saliste del jale o nomás te estás haciendo güey._ 😏"
  ],

  saludoNoche: [
    "_Buenas noches, mi cobija del San Marcos._ 🌙",
    "_Qué onda, ya vas pa' la meme o qué show._ 🛏️",
    "_Buenas noches, mi foco ahorrador._ 💡",
    "_A esta hora ya huele a taco y decisiones malas._ 🌮"
  ],

  erga: [
    "_¡Comes!_ 😏",
    "_¡Provecho, goloso!_ 🥴",
    "_¡Chupas!_ 💦",
    "_¿Con eso desayunas o nomás lo contemplas?_ 👀",
    "_Ya salió el catador oficial del barrio._ 🎩",
    "_Se ve que traes el tema bien estudiado, mi rey._ 📚"
  ],

  trece: [
    "_¡Entre más me la mamas, más me crece!_ 😏",
    "_¡Dilo sin miedo, cobarde!_ 😂",
    "_¡No te me frenes en curva, campeón!_ 🛞",
    "_Ya salió el matemático del albúr._ 🧠",
    "_Ese número viene con jiribilla, mi todo tibio._ 😌"
  ],

  cinco: [
    "_Cinco... y por el culo te la hinco._ 😮‍💨",
    "_Cinquito y quedas viendo pa' Cuauhtémoc._ 👀",
    "_Cinco, pero de dignidad te faltan como tres kilos._ 🪙",
    "_Ya te vi, contando con intenciones raras._ 🤨"
  ],

  hueva: [
    "_No mames, traes más hueva que burócrata en viernes._ 🪑",
    "_Ándale pues, mi rey, tú nomás no naciste pa' la productividad._ 📉",
    "_Te pesa más la existencia que una bolsa del tianguis._ 🛍️",
    "_Con esa actitud ni el micro te hace la parada._ 🚌",
    "_Traes una flojera marca Tepito edición limitada._ 😴"
  ],

  calor: [
    "_No inventes, está haciendo un calor de la chingada._ 🔥",
    "_Con este calor hasta el diablo pide Bonafont._ 🧃",
    "_Ya huele a axila y desesperación, mi rey._ 🥵",
    "_Está pa' freír quesadillas en el cofre._ 🌞"
  ],

  frio: [
    "_Está helando macizo, mi todo tieso._ 🥶",
    "_Con este frío hasta el tamalero trae chamarra._ 🧣",
    "_Ya parece clima de azotea en Ecatepec._ ❄️",
    "_Hace un frillazo que ni ganas de ser persona._ ☕"
  ],

  blanco: [
    "_¿Blanco? Como pared de vecindad recién pintada._ 🎨",
    "_Blanco, pero no tanto como tus intenciones raras._ 👀",
    "_Eso ya sonó a albúr de albañil fino._ 🧱",
    "_Uy, ya salió el yesero sentimental._ 😏"
  ],

  huevos: [
    "_¡Chupas y dejas nuevos!_ 😏",
    "_¡Cromas, mi brillante sin futuro!_ 🧽",
    "_¡Te sientas y se acomodan!_ 🪑",
    "_Ya salió el especialista en tanatología de barrio._ 🥚",
    "_Con razón hablas con tanta confianza del tema._ 🤨"
  ],

  sed: [
    "_¡De la peligrosa!_ 😈",
    "_¡De la que destruye hogares!_ 🍻",
    "_¡De la mala, mi cuervo en celo!_ 🐦‍⬛",
    "_No es sed, ya es trámite notarial._ 🧾",
    "_Eso ya no es sed, es vocación._ 😂"
  ],

  mention: [
    "_¿Qué pasó, mi rey? ¿Ya te dio ansiedad o qué?_ 😌",
    "_Háblame bonito, que no soy de palo._ 🪵",
    "_¿Ahora qué quieres, mi becario del barrio?_ 🧃",
    "_Nomás me arrobaste y ya huele a pedo ajeno._ 💨",
    "_A ver, escúpelo ya, mi filósofo de combi._ 🚌"
  ],

  stickerEsta: [
    "_¡Ah chinga, ya sacó la longaniza del metro!_ 🚇",
    "_¿Tienes frío o así está siempre?_ 🥶",
    "_¡Guárdala, que espantas a los niños!_ 😳",
    "_¿Eso es de exhibición o sí jala?_ 🤨",
    "_¡Órale! Hasta se me cayó el chicle del susto._ 😮",
    "_Cálmate, mi rey, que esto no es vitrina._ 🪟",
    "_Aguas, luego lo confunden con poste de luz._ 🚧",
    "_¿Eso viene con manual o nomás presumes?_ 📖"
  ],

  stickerPooh: [
    "_Ya llegó el jefe de Temu, banda._ 🛍️",
    "_Ese no es Pooh, es el licenciado del arroz._ 🍚",
    "_Con ese sticker ya te aprobaron el crédito social._ 🧧",
    "_Ya cayó el oso de importación, mi camarada._ 🐻",
    "_Con eso ya te dan descuento en mercancía que no pasa aduana._ 📦"
  ],

  flood: [
    "_Ya siéntese, mi todo tibio._ 🪑",
    "_Cálmese, que esto no es su diario personal._ 📓",
    "_Ya bájale dos rayitas, mi teclado con patas._ ⌨️",
    "_Mi rey, no estás cobrando por mensaje._ 😮‍💨",
    "_Nomás te falta narrar tu propia biografía._ 🎬"
  ],

  definePrompt: [
    "_Dime qué quieres que te defina, mi enciclopedia pirata._ 📚",
    "_Échame la palabra, mi sabio del tianguis._ 🤓",
    "_¿Qué ocupas saber, mi Wikipedia de microbús?_ 🚌",
    "_A ver, pregúntame bien, mi intelectual del puesto de jugos._ 🍊"
  ],

  defineFail: [
    "_Ni doña pelos sabe qué es eso, mi rey._ 🤯",
    "_Eso ya está muy underground hasta pa' mí._ 🫠",
    "_No encontré ni madres, la neta._ 🫥",
    "_Eso ni el diccionario de Tepito lo trae._ 📕"
  ],

  defineError: [
    "_Se cayó el diccionario del barrio, ahorita no jalo._ 👶🏻",
    "_No pude buscar eso, me falló el cerebrito._ 🧠",
    "_Ahorita no traigo datos, mi rey._ 📵"
  ],

  defineRemate: [
    "_Con eso ya puedes aparentar en la peda._ 🍻",
    "_Ahora sí, ya puedes tirar verbo sin fundamento._ 😎",
    "_Pa' que no se diga que no se aprende en el barrio._ 📚",
    "_Ya con eso te sientes académico del tianguis._ 🎓"
  ],

  deleted: [
    "_Ya se te frunció el mensaje, ¿eh?_ 🤏",
    "_Si vas a rajar, mejor ni escribas, mi tibio._ 💅",
    "_No le saques, pecho palomo._ 🕊️",
    "_Ay, ya se arrepintió la criatura._ 🫢",
    "_Eso no se borra ni con jabón Zote._ 🧼",
    "_Se echó pa' atrás el poeta del barrio._ 🎭"
  ],

  consejos: [
    "_Consejo del día: nunca confíes en alguien que dice 'ahorita llego' desde Indios Verdes._ 🚌",
    "_Consejo fino: si ya dijiste 'última chela', todavía faltan tres._ 🍻",
    "_Consejo de barrio: el que se enoja, pierde; el que se ríe, cobra._ 😎",
    "_Consejo espiritual: no tomes decisiones importantes con hambre y doce pesos en la cuenta._ 🧾",
    "_Consejo de microbús: agárrate bien, porque la vida no frena en topes._ 🚐",
    "_Consejo de oro: no le escribas a tu ex, mejor cómprate unos tacos._ 🌮",
    "_Consejo de la calle: si algo suena demasiado barato, probablemente viene sin cargador._ 📦",
    "_Consejo godín: no abras Excel después de las 6 si todavía valoras tu alma._ 💻"
  ],

  ortografia: [
    "_¿Yoyis?_",
    "_Mi rey, esa palabra salió atropellada por un microbús._ 🚌",
    "_Escríbelo otra vez, pero ahora sin aventarlo por las escaleras._ 🪜",
    "_No entendí si preguntaste o invocaste un demonio del Metro._ 🚇",
    "_Eso no fue falta de ortografía, fue crimen lingüístico._ 🚔",
    "_La RAE acaba de bloquearte, mi todo teclado._ 📚",
    "_Mi compa, esa frase llegó en combi pirata y sin placas._ 🚐",
    "_Repite eso, pero usando las manos y no el codo._ ✍️",
    "_¿Eso era español o contraseña del WiFi de una fonda?_ 📶"
  ]
};

/* =========================
   STICKERS !PINCHE
========================= */

const PINCHES = [
  {
    nombre: 'val',
    aliases: ['val', 'valark'],
    url: 'https://media.discordapp.net/attachments/1385452767954604042/1501583980556976219/image-1.png'
  },
  {
    nombre: 'jagg',
    aliases: ['jagg', 'jagger', 'jaggerr', 'grimm'],
    url: 'https://media.discordapp.net/attachments/1441884248234655766/1501404101106335745/image.png'
  },
  {
    nombre: 'meen',
    aliases: ['meen', 'meenah', 'meena', 'min'],
    url: 'https://media.discordapp.net/attachments/1441884248234655766/1501404772408885350/image.png'
  },
  {
    nombre: 'lic',
    aliases: ['lic', 'licenciado', 'nahual', 'lisensiado'],
    url: 'https://media.discordapp.net/attachments/1441884248234655766/1501404772757143672/image.png'
  },
  {
    nombre: 'yoyis',
    aliases: ['yoyis', 'iois', 'yoyo'],
    url: 'https://media.discordapp.net/attachments/1441884248234655766/1501405529136697515/image.png'
  },
  {
    nombre: 'akmo',
    aliases: ['akmo', 'akm', 'akmodhan', 'akmodan'],
    url: 'https://media.discordapp.net/attachments/1441884248234655766/1501405530256572558/image.png'
  },
  {
    nombre: 'gato',
    aliases: ['gato', 'gatito', 'lavadora'],
    url: 'https://media.discordapp.net/attachments/1441884248234655766/1501788597194588180/image.png'
  },
  {
    nombre: 'coco',
    aliases: ['coco', 'cocodrilo', 'cocoloco'],
    url: 'https://media.discordapp.net/attachments/1441884248234655766/1501788770264158308/image.png'
  }
];

const PINCHES_RANDOM = [
  'https://media.discordapp.net/attachments/1441884248234655766/1501404101576233091/image.png',
  'https://pbs.twimg.com/media/FxoZPTsXwAAxJen.jpg'
];

/* =========================
   RESPUESTAS HALLOWEEN
========================= */

const RESPUESTAS_HALLOWEEN = {
  bienvenida: [
    "_Aaaaagh... otro pendejo que cayó al cementerio. Pásale, carnal._ 🧟",
    "_Quiúbole, pinche vivo. ¿Vienes a cotorrear o a donar los sesos?_ 🧠",
    "_Grrrr... ¡CARNE FRESCA, BANDA! Ya llegó otro._",
    "_Pásale al panteón, cabrón. Aquí enterramos hasta las deudas._",
    "_No mames, otro vivo. Ya ni en la tumba lo dejan descansar a uno._"
  ],

  despedida: [
    "_Aaaaagh... ya se peló el culero. Ni muerto aguantó._",
    "_Grrrr... otro que se fue sin dejar los sesos._ 🧠",
    "_¡Cámara, cadáver! Que te vaya de la verga._",
    "_Ya se nos fue. Échenle tierra, que empieza a oler._",
    "_Duró menos que un zombie en Ecatepec sin tenis._"
  ],

  saludoManana: [
    "_Aaaaagh... ¿qué pasó, pinche vivo? ¿Ya vienes a chingar?_",
    "_Quiúbole, cabrón. ¿Traes sesos o nomás el cráneo de adorno?_ 🧠",
    "_Grrrr... buenos días, mi cadáver mal enterrado._",
    "_No mames, apenas salgo de la tumba y ya estás mamando._"
  ],

  saludoTarde: [
    "_Aaaaagh... ¿qué tranza, carnal? ¿Ya comiste o te como?_",
    "_Grrrr... buenas tardes, mi muerto de hambre._",
    "_¿Qué hubo, pinche sobreviviente? ¿Todavía no te cargó la chingada?_",
    "_Quiúbole, mi costal de huesos. ¿Qué se arma o qué?_"
  ],

  saludoNoche: [
    "_Aaaaagh... ahora sí, pinche vivo. Ya es hora de salir a espantar._",
    "_Grrrr... buenas noches, mi cadáver precioso._",
    "_¿Qué pasó, cabrón? ¿No te dejan dormir los muertos o qué?_",
    "_Cámara, que ya salió la banda del panteón._ 🪦"
  ],

  saludo: [
    "_Aaaaagh... ¿ora qué, pinche vivo?_ 🧟",
    "_Grrrr... ¿qué tranza, mi cadáver mal enterrado?_",
    "_¿Quiúbole, cabrón? ¿Vienes a donar sesos?_",
    "_No mames, ni muerto me dejan en paz._",
    "_Aaaaagh... ¡QUÉ PASÓ, MI REY! Grrrr._"
  ],

  erga: [
    "_Aaaaagh... ¡COMES, CARNAL!... grrrrr._",
    "_¡CHUPAAAAAS!... grrr... hasta los huesitos, cabrón._",
    "_Grrrr... ¡PROVECHO, PINCHE GOLOSO!_",
    "_Aaaaagh... ¿otra vez con eso en el hocico, cabrón?_",
    "_¡COMES!... y no me dejas ni los sesos, pinche tragón._",
    "_Grrrr... ¡TE SIENTAS!... aaaaagh._",
    "_¡CHUPAS!... pinche vivo mañoso._"
  ],

  trece: [
    "_¡ENTRE MÁS ME LA MAMAS, MÁS ME CRECE!... grrrrr._",
    "_Aaaaagh... ¡TRECE! ¡Ni muerto se me desvanece!_",
    "_Grrrr... ¡Entre más me la chupas, más me crece, cabrón!_",
    "_¡TRECE!... aaaaagh... hasta los muertos conocen ese._"
  ],

  cinco: [
    "_Aaaaagh... ¡CINCO! ¡POR EL CULO TE LA HINCO!_",
    "_Grrrr... cinco... ¡y te la arrimo aunque esté muerto!_",
    "_¡CINCO, CABRÓN!... ¿Te la arrimo o te la brinco?_",
    "_Aaaaagh... cinco... y hasta de la tumba te la hinco._"
  ],

  hueva: [
    "_No mames, llevo tres días enterrado y tengo más ganas de jalar que tú._",
    "_Aaaaagh... ¡LEVÁNTATE, CABRÓN! Hasta los muertos chambeamos._",
    "_Grrrr... pinche huevón, mejor te entierro de una vez._",
    "_Yo sin piernas y tú sin ganas de trabajar. No chingues._",
    "_Hasta los zombies andan buscando cerebros y tú nomás estás acostado._",
    "_Aaaaagh... ni para morirte sirves, pinche flojo._"
  ],

  calor: [
    "_Aaaaagh... se me está derritiendo la pinche carne._",
    "_Grrrr... con este calor ya huelo a cadáver de tres días._",
    "_No mames, se me cayó un huevo del calor, carnal._",
    "_Aaaaagh... ya parezco carnitas olvidadas en el sol._",
    "_Pinche calor, hasta los gusanos pidieron vacaciones._"
  ],

  frio: [
    "_Grrrr... ¿frío? Frío el pinche ataúd donde duermo._",
    "_Aaaaagh... se me congelaron hasta los huesos, cabrón._",
    "_No mames, estoy muerto y todavía me da un chingo de frío._",
    "_Grrrr... préstame tu chamarra, que la mortaja no abriga._",
    "_Con este frío hasta los gusanos se me escondieron._"
  ],

  blanco: [
    "_Aaaaagh... blanco como mis nalgas de cadáver._",
    "_Grrrr... ¿blanco? Así traigo los huesos, cabrón._",
    "_Blanco te voy a dejar del susto, pinche vivo._",
    "_Aaaaagh... blanco como la cara que pusiste cuando te la arrimé._"
  ],

  huevos: [
    "_¡CHUPAAAAAS!... grrrrr... y dejas los huesos nuevos._",
    "_Aaaaagh... ¡CROMAS, CARNAL! Aunque estén podridos._",
    "_¡TE SIENTAS!... grrr... y se acomodan solitos._",
    "_Grrrr... ¡CHUPAS Y DEJAS NUEVOS, PINCHE VIVO!_",
    "_Aaaaagh... cuidado, que esos ya llevan tres días enterrados._"
  ],

  sed: [
    "_Aaaaagh... ¡DE LA PELIGROSA, CABRÓN!_ 🍻",
    "_Grrrr... traigo sed de chela y de cerebros._ 🧠",
    "_¡DE LA QUE DESTRUYE HOGARES!... y panteones también._",
    "_Aaaaagh... pásame una caguama, que la sangre ya me empalagó._",
    "_Grrrr... otra peda y ahora sí me terminan de enterrar._"
  ],

  mention: [
    "_Aaaaagh... ¿ora qué chingados quieres, carnal?_",
    "_Grrrr... estaba tragando sesos, no estés mamando._",
    "_¿Qué pasó, pinche vivo? ¿Ya te aburriste de respirar?_",
    "_Aaaaagh... habla rápido, cabrón, que se me está cayendo la mandíbula._",
    "_¿Otra vez tú? Ni en el pinche panteón me dejas descansar._",
    "_Grrrr... ¿qué traes o qué, mi todo tieso?_"
  ],

  sticker_esta: [
    "_Aaaaagh... ¡GUARDA ESA MADRE, CABRÓN!_",
    "_Grrrr... ¿eso es una lombriz o qué chingados?_",
    "_No mames, hasta se me cayó la mandíbula del susto._",
    "_Aaaaagh... ¡ÉCHALE TIERRA, QUE TODAVÍA SE MUEVE!_",
    "_Grrrr... con eso ni los gusanos se llenan._"
  ],

  sticker_pooh: [
    "_Aaaaagh... ¿ese oso ya está embalsamado o qué pedo?_",
    "_Grrrr... pinche oso, parece que lo sacaron de una tumba._",
    "_No mames, ese Pooh ya lleva tres reencarnaciones._",
    "_Aaaaagh... hasta el oso viene por cerebros._",
    "_Grrrr... échenle tierra al oso, cabrones._"
  ],

  flood: [
    "_Aaaaagh... ¡YA CÁLLATE, CABRÓN! Ni los muertos hablan tanto._",
    "_Grrrr... te voy a enterrar con todo y teclado._",
    "_No mames, hablas más que alma en pena._",
    "_Aaaaagh... ya bájale, pinche radio de ultratumba._",
    "_Cállate tantito, cabrón, que ni muerto me dejas descansar._"
  ],

  definePrompt: [
    "_Aaaaagh... ¿qué quieres saber, pinche vivo?_",
    "_Grrrr... suelta la palabra, que se me pudre el cerebro._",
    "_¿Qué chingados te explico, carnal? Habla._"
  ],

  defineFail: [
    "_Aaaaagh... no encontré ni madres, cabrón._",
    "_Grrrr... ni en el pinche inframundo saben qué es eso._",
    "_No mames, eso ni los muertos lo conocen._",
    "_Aaaaagh... mi cerebro podrido no trae esa información._"
  ],

  defineError: [
    "_Grrrr... se me cayó el cerebro, inténtalo otra vez._",
    "_Aaaaagh... se murió el diccionario, cabrón._",
    "_No mames, hasta la Wikipedia se fue al otro mundo._"
  ],

  defineRemate: [
    "_Aaaaagh... ya aprendiste algo, pinche vivo._",
    "_Grrrr... ahora sí puedes hacerte el inteligente._",
    "_Cámara, cabrón. Con eso ya tienes más cerebro que yo._"
  ],

  consejos: [
    "_Consejo del más allá: si tu ex te busca, hazte el muerto. A mí me funciona._",
    "_Aaaaagh... nunca te fíes de alguien que dice 'nomás una chela'._",
    "_Consejo zombie: si la vida te da la espalda, muérdele una nalga._",
    "_Grrrr... no gastes toda tu quincena, que hasta el entierro sale caro._",
    "_Si vas a hacer una pendejada, por lo menos que esté cagada._",
    "_Consejo del panteón: no le tengas miedo a los muertos, tenle miedo a Coppel._",
    "_Aaaaagh... no persigas a quien no te quiere. Persigue cerebros, cabrón._"
  ],

  ortografia: [
    "_Aaaaagh... ¡¿QUÉ CHINGADOS ESCRIBISTE?!_",
    "_Grrrr... ni con el cerebro podrido escribo esas mamadas._",
    "_¿Yoyis?... aaaaagh... ¿eres tú, cabrón?_",
    "_No mames, hasta un cadáver sin dedos escribe mejor._",
    "_Aaaaagh... ¡REGRESA A LA PRIMARIA, PINCHE VIVO!_",
    "_Grrrr... se me pudrieron los ojos leyendo esa madre._",
    "_¿Eso es español o estás invocando a otro pinche muerto?_"
  ],

  deleted: [
    "_Aaaaagh... ¿por qué borraste el mensaje, culero?_",
    "_Grrrr... no seas culo, déjalo, cabrón._",
    "_Hasta los muertos tenemos más huevos que tú._",
    "_Aaaaagh... se arrepintió el pinche vivo._",
    "_No mames, lo borraste más rápido que yo perdí la vida._",
    "_Grrrr... ya te dio frío en el fundillo, ¿verdad?_"
  ]
};

/* =========================
   EVENTOS DE DISCORD
========================= */

client.once('ready', () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
});

client.on('error', (err) => {
  console.error('Discord client error:', err);
});

client.on('warn', (info) => {
  console.warn('Discord warning:', info);
});

/* =========================
   BIENVENIDAS
========================= */

client.on('guildMemberAdd', async (member) => {
  const canal = member.guild.systemChannel;
  if (!canal) return;

  const respuestas = seleccionarRespuestas(
    'bienvenida',
    RESPUESTAS.bienvenida
  );

  const msg = pickRandom('bienvenida', respuestas);

  if (msg) {
    await canal.send(`${member} ${msg}`);
  }
});

/* =========================
   DESPEDIDAS
========================= */

client.on('guildMemberRemove', async (member) => {
  const canal = member.guild.systemChannel;
  if (!canal) return;

  const respuestas = seleccionarRespuestas(
    'despedida',
    RESPUESTAS.despedida
  );

  const msg = pickRandom('despedida', respuestas);

  if (msg) {
    await canal.send(`${member.user.username} ${msg}`);
  }
});

/* =========================
   MENSAJES
========================= */

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;

    const texto = (message.content || '').toLowerCase().trim();
    const isPlainText = isTextOnlyMessage(message);

    /* =========================
       COMANDO !CONSEJO
    ========================= */

    if (texto === '!consejo') {
      if (!triggerAvailable(message, 'consejo')) return;

      const respuestas = seleccionarRespuestas(
        'consejos',
        RESPUESTAS.consejos
      );

      const consejo = pickRandom(
        'consejos_group',
        respuestas
      );

      if (!consejo) return;

      await message.reply(consejo);
      markTrigger(message, 'consejo');

      return;
    }

    /* =========================
       COMANDO !PINCHE
    ========================= */

    if (texto.startsWith('!pinche')) {
      const partes = texto.split(' ');
      const argumento = partes[1]?.toLowerCase().trim();

      if (!argumento) {
        const randomUrl = pickRandom(
          'pinches_random_group',
          PINCHES_RANDOM
        );

        await message.reply(randomUrl);
        return;
      }

      const pinche = PINCHES.find(
        p => p.aliases.includes(argumento)
      );

      if (pinche) {
        await message.reply(pinche.url);
        return;
      }

      const randomUrl = pickRandom(
        'pinches_random_group',
        PINCHES_RANDOM
      );

      await message.reply(randomUrl);
      return;
    }

    /* =========================
       COMANDO !DEFINE
    ========================= */

    if (texto.startsWith('!define')) {
      const remaining = getTriggerRemainingMs(
        message,
        'define'
      );

      if (remaining > 0) {
        const seconds = Math.ceil(remaining / 1000);

        await message.reply(
          `_Aguanta ${seconds}s, mi diccionario de combi todavía está cargando._ 🚌`
        );

        return;
      }

      const query = texto.replace('!define', '').trim();

      if (!query) {
        await replyWithControl(
          message,
          'define',
          'definePrompt',
          RESPUESTAS.definePrompt,
          DEFINE_REPLY_PROBABILITY
        );

        return;
      }

      try {
        let definicion = null;
        let fuente = null;

        /* ===== WIKIPEDIA ===== */

        try {
          const wikiUrl =
            `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;

          const wikiRes = await axios.get(wikiUrl, {
            headers: {
              'User-Agent': 'DiscordBotChaca/1.0'
            }
          });

          if (
            wikiRes.data &&
            wikiRes.data.extract &&
            !wikiRes.data.type?.includes('disambiguation')
          ) {
            definicion = wikiRes.data.extract;
            fuente = 'Wikipedia';
          }
        } catch (wikiErr) {
          if (wikiErr.response?.status !== 404) {
            console.log(
              'Wikipedia no encontró definición:',
              wikiErr.message
            );
          }
        }

        /* ===== DUCKDUCKGO ===== */

        if (!definicion) {
          try {
            const ddgUrl =
              `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&kl=es-es`;

            const ddgRes = await axios.get(ddgUrl);
            const data = ddgRes.data;

            definicion =
              data.Abstract ||
              data.Definition ||
              data.RelatedTopics?.[0]?.Text ||
              null;

            if (definicion) {
              fuente = 'DuckDuckGo';
            }
          } catch (ddgErr) {
            console.log(
              'DuckDuckGo tampoco encontró definición:',
              ddgErr.message
            );
          }
        }

        /* ===== SIN RESULTADOS ===== */

        if (!definicion) {
          const respuestas = seleccionarRespuestas(
            'defineFail',
            RESPUESTAS.defineFail
          );

          const fail = pickRandom(
            'defineFail',
            respuestas
          );

          await message.reply(
            fail || "_No encontré ni madres, la neta._ 🫥"
          );

          markTrigger(message, 'define');

          return;
        }

        /* ===== DEFINICIÓN ENCONTRADA ===== */

        const remates = seleccionarRespuestas(
          'defineRemate',
          RESPUESTAS.defineRemate
        );

        const remate = pickRandom(
          'defineRemate',
          remates
        );

        const definicionCorta =
          definicion.length > 700
            ? definicion.slice(0, 700).trim() + '...'
            : definicion;

        await message.reply(
          `**${query}:** ${definicionCorta}\n_Fuente: ${fuente}._\n${remate}`
        );

        markTrigger(message, 'define');

        return;
      } catch (err) {
        console.error(
          'Error en definición:',
          err.message
        );

        const respuestas = seleccionarRespuestas(
          'defineError',
          RESPUESTAS.defineError
        );

        const errorMsg = pickRandom(
          'defineError',
          respuestas
        );

        await message.reply(
          errorMsg || "_Ahorita no traigo datos, mi rey._ 📵"
        );

        markTrigger(message, 'define');

        return;
      }
    }

    /* =========================
       STICKERS DE DISCORD
    ========================= */

    if (message.stickers.size > 0) {
      const sticker = message.stickers.first();

      const stickerName =
        sticker?.name?.toLowerCase() || '';

      if (stickerName.includes('esta')) {
        await replyWithControl(
          message,
          'sticker_esta',
          'sticker_esta_group',
          RESPUESTAS.stickerEsta,
          STICKER_REPLY_PROBABILITY
        );

        return;
      }

      if (stickerName.includes('pooh')) {
        await replyWithControl(
          message,
          'sticker_pooh',
          'sticker_pooh_group',
          RESPUESTAS.stickerPooh,
          STICKER_REPLY_PROBABILITY
        );

        return;
      }

      return;
    }

    /* =========================
       FILTRO DE MENSAJES
    ========================= */

    if (!isPlainText) {
      return;
    }

    /* =========================
       ORTOGRAFÍA
    ========================= */

    if (/\b(prejunta|pregumta|preguntq|me justa|me guta|grasias|ola k ase|aber|haiga|haci|asiendo|enserio|encerio|vistes|fuistes|hicistes|dijistes|nadien|ocupo saber|ke|kiero|qiero)\b/.test(texto)) {
      const sent = await replyWithControl(
        message,
        'ortografia',
        'ortografia_group',
        RESPUESTAS.ortografia,
        0.6
      );

      if (sent) return;
    }

    /* =========================
       MENCIONES
    ========================= */

    let isReplyToBot = false;

    if (message.reference?.messageId) {
      try {
        const refMsg = await message.channel.messages.fetch(
          message.reference.messageId
        );

        isReplyToBot = refMsg.author.id === client.user.id;
      } catch {
        isReplyToBot = false;
      }
    }

    if (
      message.mentions.has(client.user) ||
      isReplyToBot
    ) {
      const sent = await replyWithControl(
        message,
        'mention',
        'mention_group',
        RESPUESTAS.mention,
        MENTION_REPLY_PROBABILITY
      );

      if (sent) return;
    }

    /* =========================
       SALUDOS
    ========================= */

    if (/(^|\s)(hola|buen[oa]s?\s?(d[ií]as?|tardes?|noches?)|qué onda|que onda|q onda)(\s|$)/.test(texto)) {
      const horaUTC = new Date().getUTCHours();
      const hora = (horaUTC + 18) % 24;

      const grupo =
        hora >= 5 && hora < 12
          ? RESPUESTAS.saludoManana
          : hora >= 12 && hora < 20
          ? RESPUESTAS.saludoTarde
          : RESPUESTAS.saludoNoche;

      const sent = await replyWithControl(
        message,
        'saludo',
        'saludo_group',
        grupo
      );

      if (sent) return;
    }

    /* =========================
       ALBUR: ERGA
    ========================= */

    if (/([bv]erga|pito|pitillo|pene|nepe)\b/.test(texto)) {
      const sent = await replyWithControl(
        message,
        'erga',
        'erga_group',
        RESPUESTAS.erga
      );

      if (sent) return;
    }

    /* =========================
       ALBUR: TRECE
    ========================= */

    if (/\b(13|12\+1|10\+3|trece|trese)\b/.test(texto)) {
      const sent = await replyWithControl(
        message,
        'trece',
        'trece_group',
        RESPUESTAS.trece
      );

      if (sent) return;
    }

    /* =========================
       ALBUR: CINCO
    ========================= */

    if (/\b(5|cinco|cinquito|quinto|3\+2)\b/.test(texto)) {
      const sent = await replyWithControl(
        message,
        'cinco',
        'cinco_group',
        RESPUESTAS.cinco
      );

      if (sent) return;
    }

    /* =========================
       HUEVA
    ========================= */

    if (/(no quiero trabajar|tengo sueño|ya me quiero ir|que hueva|qué hueva|que flojera|qué flojera|ando cansado|ya me cansé|me da flojera|odio los lunes)/.test(texto)) {
      const sent = await replyWithControl(
        message,
        'hueva',
        'hueva_group',
        RESPUESTAS.hueva
      );

      if (sent) return;
    }

    /* =========================
       CALOR
    ========================= */

    if (/(calor|calorcito|me estoy derritiendo|estoy sudando)/.test(texto)) {
      const sent = await replyWithControl(
        message,
        'calor',
        'calor_group',
        RESPUESTAS.calor
      );

      if (sent) return;
    }

    /* =========================
       FRÍO
    ========================= */

    if (/(frio|frío|friecito|me congelo|me estoy congelando)/.test(texto)) {
      const sent = await replyWithControl(
        message,
        'frio',
        'frio_group',
        RESPUESTAS.frio
      );

      if (sent) return;
    }

    /* =========================
       BLANCO
    ========================= */

    if (/(blanco|blanquito|color blanco|tan blanco)/.test(texto)) {
      const sent = await replyWithControl(
        message,
        'blanco',
        'blanco_group',
        RESPUESTAS.blanco
      );

      if (sent) return;
    }

    /* =========================
       HUEVOS
    ========================= */

    if (/([bh]uevos|tanates|testiculos|[hb]uevitos)/.test(texto)) {
      const sent = await replyWithControl(
        message,
        'huevos',
        'huevos_group',
        RESPUESTAS.huevos
      );

      if (sent) return;
    }

    /* =========================
       SED
    ========================= */

    if (/\bsed\b/.test(texto)) {
      const sent = await replyWithControl(
        message,
        'sed',
        'sed_group',
        RESPUESTAS.sed
      );

      if (sent) return;
    }

    /* =========================
       ANTIFLOOD
    ========================= */

    const key = `${message.channel.id}-${message.author.id}`;

    const last = state.userMessageCounts.get(key) || {
      count: 0
    };

    last.count += 1;

    state.userMessageCounts.set(key, last);

    try {
      const messages = await message.channel.messages.fetch({
        limit: 2
      });

      const msgs = Array.from(messages.values());

      if (
        msgs.length >= 2 &&
        msgs[1].author.id !== message.author.id
      ) {
        state.userMessageCounts.set(
          `${message.channel.id}-${msgs[1].author.id}`,
          { count: 0 }
        );
      }
    } catch {
      // Ignorar errores de lectura
    }

    if (last.count >= 6) {
      const sent = await replyWithControl(
        message,
        'flood',
        'flood_group',
        RESPUESTAS.flood,
        FLOOD_REPLY_PROBABILITY
      );

      if (sent) {
        state.userMessageCounts.set(key, {
          count: 0
        });

        return;
      }
    }
  } catch (err) {
    console.error(
      'Error en messageCreate:',
      err
    );
  }
});

/* =========================
   MENSAJES BORRADOS
========================= */

client.on('messageDelete', async (message) => {
  try {
    if (
      !message ||
      message.author?.bot ||
      !message.channel
    ) {
      return;
    }

    const respuestas = seleccionarRespuestas(
      'deleted',
      RESPUESTAS.deleted
    );

    const msg = pickRandom(
      'delete_group',
      respuestas
    );

    if (message.author?.id) {
      await message.channel.send(
        `<@${message.author.id}> ${msg}`
      );
    } else {
      await message.channel.send(msg);
    }
  } catch (err) {
    console.error(
      'Error en messageDelete:',
      err
    );
  }
});

/* =========================
   LOGIN
========================= */

console.log('🚀 Intentando iniciar sesión con Discord...');

client.login(process.env.TOKEN)
  .then(() => {
    console.log('🔐 Login a Discord enviado');
  })
  .catch(err => {
    console.error(
      '❌ Error al iniciar sesión con Discord:',
      err
    );
  });
