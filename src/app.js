// Importa las dependencias necesarias
const TelegramBot = require('node-telegram-bot-api'); // Librería para el bot de Telegram
const axios = require('axios'); // Cliente HTTP para hacer peticiones
const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');

// Importaciones locales
require('dotenv').config(); // Carga las variables de entorno
const { sendToCeoAgent, sendToWhisper, sendToverificador } = require('./openai'); // Funciones personalizadas
const progressManager = require('./progressManager'); // Importar el ProgressManager
const { l, f, flat } = require('./tools/utils');

// Credenciales de Telegram
const BOT_TOKEN = process.env.BOT_TOKEN_NEXORA;
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Credenciales de Twilio
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER; // Formato: 'whatsapp:+14155238886'
const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// --------------------------
// Función principal de lógica
// --------------------------

async function processRequest(userId, userMessage) {
  try {
    const assistantResponse = await sendToCeoAgent(userId, userMessage);
    // const assistantResponse = 'Puedes decirme de que color es el cielo chat?'; // MFD
    const output = await sendToverificador(assistantResponse);
    return output;

  } catch (error) {
    console.error('Error al enviar mensaje al asistente de OpenAI:', error);
    return 'Hubo un error al procesar tu solicitud.';
  }
}

// ----------------------------------
// Lógica de TELEGRAM
// ----------------------------------
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  // console.log(`\n(Telegram) ID del chat: ${chatId}`);

  // Verifica si es texto o un mensaje de voz
  if (msg.text || msg.voice) {
    // Si es texto
    if (msg.text) {
      const texto = msg.text;
      console.log('\n','- - '.repeat(30));
      console.log(`(Telegram) - ${chatId} Mensaje: ${f.green(texto)}`);
      

      const openAIResponse = await processRequest(chatId, texto);
      // const openAIResponse = 
      // {
      //   part1: '¡Claro! En **Nexora** creamos **robots** que ayudan a las **empresas** a responder **preguntas** de los clientes y a gestionar **tareas**, como agendar citas. Esto les permite **ahorrar tiempo** y **mejorar su servicio**.',
      //   part2: 'Si necesitas más información o algo específico, házmelo saber.',
      //   part3: ''
      // } // MFD

      if (openAIResponse) {
        for (const parte in openAIResponse) {
          if (openAIResponse.hasOwnProperty(parte) && openAIResponse[parte] !== '') {
            const mensaje = openAIResponse[parte];
            await bot.sendMessage(chatId, mensaje, { parse_mode: 'Markdown' });
          }
        }

      } else {
          bot.sendMessage(chatId, 'No se pudo obtener una respuesta válida.');
      }

    // Si es un mensaje de voz
    } else if (msg.voice) {
      try {
        const fileId = msg.voice.file_id;
        const fileLink = await bot.getFileLink(fileId);

        // Descarga el archivo de audio
        const audioPath = path.resolve(__dirname, 'audio.ogg');
        const writer = fs.createWriteStream(audioPath);
        const response = await axios({
          url: fileLink,
          method: 'GET',
          responseType: 'stream',
        });
        response.data.pipe(writer);

        writer.on('finish', async () => {
          console.log('(Telegram) Audio descargado, enviando a Whisper...');
          const transcribedText = await sendToWhisper(audioPath);
          if (transcribedText) {
            const openAIResponse = await processRequest(chatId, transcribedText);
            if (openAIResponse) {
              for (const parte in openAIResponse) {
                if (openAIResponse.hasOwnProperty(parte)) {
                  const mensaje = openAIResponse[parte];
                  await bot.sendMessage(chatId, mensaje, { parse_mode: 'Markdown' });
                }
              }
            } else {
              bot.sendMessage(chatId, 'No se pudo obtener una respuesta válida.');
            }
          } else {
            bot.sendMessage(chatId, 'No se pudo transcribir el audio.');
          }
          fs.unlinkSync(audioPath); // Elimina el archivo temporal
        });
      } catch (error) {
        console.error('Error al manejar el mensaje de voz:', error);
        bot.sendMessage(chatId, 'Ocurrió un error al procesar el audio.');
      }
    }
  } else {
    bot.sendMessage(chatId, 'Formato no soportado. Envía texto o un mensaje de voz.');
  }
});

// ----------------------------------
// Lógica de TWILIO (WhatsApp)
// ----------------------------------
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Ruta que Twilio llama cuando llega un mensaje de WhatsApp
app.post('/whatsapp', async (req, res) => {
  try {
    // 'Body' es el texto del mensaje, 'From' es el número de quien envía
    const messageBody = req.body.Body;
    const fromNumber = req.body.From; // Formato: 'whatsapp:+123456789'
    console.log(`(WhatsApp) Mensaje recibido de ${fromNumber}: ${messageBody}`);

    // Usa la misma función central para procesar la solicitud
    const openAIResponse = await processRequest(fromNumber, messageBody);

    // Armamos la respuesta a enviar por WhatsApp usando Twilio
    if (openAIResponse) {
      // En caso de que openAIResponse sea un objeto con varias partes:
      for (const parte in openAIResponse) {
        if (openAIResponse.hasOwnProperty(parte)) {
          const mensaje = openAIResponse[parte];
          await client.messages.create({
            from: TWILIO_WHATSAPP_NUMBER, // Ej: 'whatsapp:+14155238886'
            to: fromNumber,
            body: mensaje,
          });
        }
      }
    } else {
      await client.messages.create({
        from: TWILIO_WHATSAPP_NUMBER,
        to: fromNumber,
        body: 'No se pudo obtener una respuesta válida.',
      });
    }

    // Twilio requiere una respuesta (200 OK) para terminar el webhook
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error al manejar mensaje de WhatsApp:', error);
    res.status(500).send('Error interno al procesar la solicitud.');
  }
});

// Inicia el servidor en el puerto que desees, p. ej. 3000
const PORT = process.env.PORT || 3030;
app.listen(PORT, () => {

  // eliminar las ultimas 4 lineas de la consola
  process.stdout.write('\x1bc');
  console.log('Bot de Telegram iniciado. Escuchando mensajes...');
});

// --------------------------
module.exports = {f, l};