// Importa las dependencias necesarias
const TelegramBot = require('node-telegram-bot-api'); // Librería para el bot de Telegram
const axios = require('axios'); // Cliente HTTP para hacer peticiones
const fs = require('fs'); 
const path = require('path');
const { createReadStream } = require('fs');
const FormData = require('form-data');
const morgan = require('morgan'); // Middelware para logs
require('dotenv').config(); // Carga las variables de entorno
const { sendToOpenAIAssistant, transcribeAudio, sendToverificador } = require('./openai'); // Importa la función sendToOpenAIAssistant

// Configura tu token de Telegram Bot y API de OpenAI
const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
// const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;

// Configuración para WhatsApp (Webhook)
// const app = express();
// const PORT = process.env.PORT || 3000;
// app.use(bodyParser.json());

app.use(morgan('combined'));

// Función para enviar texto a un asistente de OpenAI
async function processRequest(userId, userMessage) { 
    try {
        const assistantResponse = await sendToOpenAIAssistant(userId, userMessage);
        const verificadorResponse = await sendToverificador(assistantResponse);
        

    } catch (error) {
        console.error('Error al enviar mensaje al asistente de OpenAI:', error);
        return 'Hubo un error al procesar tu solicitud.';
    }
}

// Escucha los mensajes entrantes
bot.on('message', async (msg) => {
    const chatId = msg.chat.id; // Guarda el ID del chat
    console.log(`ID del chat: ${chatId}`);

    // Si hay un mensaje valido
    if (msg.text || msg.voice) {
        // Si es texto
        if (msg.text) {
            const texto = msg.text;
            console.log(`Mensaje de texto recibido: ${texto}`);
            const openAIResponse = await processRequest(chatId, texto);
            bot.sendMessage(chatId, openAIResponse);
        
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
                    console.log('Audio descargado, enviando a Whisper...');
                    const transcribedText = await transcribeAudio(audioPath);
                    if (transcribedText) {
                        const openAIResponse = await processRequest(chatId, transcribedText);
                        bot.sendMessage(chatId, openAIResponse);
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

    // Si NO hay un mensaje valido
    } else {
        bot.sendMessage(chatId, 'Formato no soportado. Envía texto o un mensaje de voz.');
    }
});

// Webhook para recibir mensajes de WhatsApp
// app.post('/webhook/whatsapp', async (req, res) => {
//     const data = req.body;
//     console.log('Mensaje recibido de WhatsApp:', data);
  
//     if (data.entry && data.entry[0].changes) {
//       const message = data.entry[0].changes[0].value.messages[0];
  
//       if (message.type === 'text') {
//         const texto = message.text.body;
//         console.log(`Mensaje de texto recibido de WhatsApp: ${texto}`);
//         // Responde al mensaje de WhatsApp aquí si es necesario
//       } else if (message.type === 'audio') {
//         const audioUrl = message.audio.url; // URL del audio de WhatsApp
//         const audioPath = path.resolve(__dirname, 'whatsapp_audio.ogg');
  
//         try {
//           // Descarga el audio
//           const writer = fs.createWriteStream(audioPath);
//           const response = await axios({
//             url: audioUrl,
//             method: 'GET',
//             responseType: 'stream',
//             headers: { Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}` },
//           });
//           response.data.pipe(writer);
  
//           writer.on('finish', async () => {
//             console.log('Audio de WhatsApp descargado, enviando a Whisper...');
//             const transcribedText = await transcribeAudio(audioPath);
//             if (transcribedText) {
//               console.log(`Audio transcrito de WhatsApp: ${transcribedText}`);
//             }
//             fs.unlinkSync(audioPath); // Elimina el archivo temporal
//           });
//         } catch (error) {
//           console.error('Error al manejar el audio de WhatsApp:', error);
//         }
//       }
//     }
  
//     res.sendStatus(200);
// });
  
// // Inicia el servidor Express
// app.listen(PORT, () => {
//     console.log(`Servidor Express escuchando en el puerto ${PORT} para WhatsApp.`);
// });
  

console.log('Bot de Telegram iniciado. Escuchando mensajes...');
