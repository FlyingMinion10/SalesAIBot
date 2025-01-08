// Importar dependencias
const { OpenAI } = require("openai");
const axios = require('axios');
const FormData = require('form-data');
const { createReadStream } = require('fs');
const path = require('path');
require("dotenv").config();

// Importaciones de funciones locales
const { getThread, registerThread } = require('./database.js'); 
const { asignarFechaHora } = require('./datetime.js'); 

// Importar texto de instrucciones
const pathPrompt = path.join(__dirname, "../src/prompts", "/formatPrompt.txt");
const prompt = fs.readFileSync(pathPrompt, "utf8")

// Importar variables de entorno
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID_REST;

// Conrfguración de modelos GPT
const models = {
    "audio": "whisper-1",
    "verificador": "gpt-4o",
    "autoparser": "gpt-4o-mini",
};

// Funcion print
function print(text) {
    console.log(text);
}

// Configurar conexión con OpenAI
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Definimos las funciones disponibles para el modelo
const functions = [
    {
        name: "schedule",
        description: "Programa un evento en una fecha y hora específicas",
        parameters: {
            type: "object",
            properties: {
                date: {
                    type: "string",
                    description: "Fecha del evento en formato YYYY-MM-DD",
                },
                time: {
                    type: "string",
                    description: "Hora del evento en formato HH:MM",
                },
            },
            required: ["date", "time"],
        },
    },
    {
        name: "sendMail",
        description: "Envía un correo electrónico con los detalles del evento",
        parameters: {
            type: "object",
            properties: {
                email: {
                    type: "string",
                    description: "Dirección de correo electrónico del destinatario",
                },
                date: {
                    type: "string",
                    description: "Fecha del evento en formato YYYY-MM-DD",
                },
                time: {
                    type: "string",
                    description: "Hora del evento en formato HH:MM",
                },
            },
            required: ["email", "date", "time"],
        },
    },
];

// --------------------------
//   FUNCIONES INTELIGENTES
// --------------------------

// Función para enviar audio a Whisper de OpenAI
async function sendToWhisper(audioFilePath) {
    const formData = new FormData();
    formData.append('file', createReadStream(audioFilePath));
    formData.append('model', models.audio);

    try {
        const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
            headers: {
                ...formData.getHeaders(),
                Authorization: `Bearer ${OPENAI_API_KEY}`
            }
        });
        return response.data.text;
    } catch (error) {
        console.error('Error al transcribir el audio:', error);
        return null;
    }
}

// Funcion para procesar las respuestas con el assistant
async function sendToOpenAIAssistant(userId, userMessage) {
    try {

        if (!userId || !userMessage) {
            console.error("Error:", "user_id y message son requeridos");
            return "Hubo un error al procesar tu solicitud.";
        }

        // Obtener o crear un thread
        let threadId = await getThread(userId);

        if (threadId === null) {
            print("Creando un nuevo thread...");
            const thread = await openai.beta.threads.create();
            threadId = thread.id;
            await registerThread(userId, threadId);
        }
        print(`Thread ID: ${threadId}`);

        // Crear un nuevo mensaje en el thread
        await openai.beta.threads.messages.create(threadId, {
            role: "user",
            content: userMessage,
        });

        // Ejecutar el assistant
        const run = await openai.beta.threads.runs.create(threadId, {
            assistant_id: OPENAI_ASSISTANT_ID,
        });

        // Polling para esperar la respuesta
        let runStatus;
        do {
            runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
            await new Promise((resolve) => setTimeout(resolve, 2000));
        } while (runStatus.status !== "completed");

        // Obtener la respuesta del assistant
        const messages = await openai.beta.threads.messages.list(threadId);
        const responseContent = messages.data[0]?.content[0]?.text.value || "No hay respuesta disponible.";

        return responseContent
    } catch (error) {
        console.error("Error:", error);
        return "Hubo un error al procesar tu solicitud.";
    }
};

function schedule(date, time) {
    var ISOdate = asignarFechaHora(date, time);
    console.log(`Evento programado para la fecha y hora: ${ISOdate}`);
};

// --------------------------
//   FUNCIONES OPERATIVAS
// --------------------------

// Dar formato a las verificaciones
async function formatear(assistantResponse, systemInstructions = `${prompt}` ) {
    try {
        const response = await openai.chat.completions.create({
            model: models.verificador, // Modelo usado
            messages: [
                {
                    role: "system",
                    content: systemInstructions
                },
                {
                    role: "user",
                    content: assistantResponse
                }
            ],
            response_format: { type: "json_object" }, // Asegura salida JSON
        });
        return JSON.parse(response.choices[0].message.content);
    } catch (error) {
        console.error("Error al parsear la respuesta del modelo:", error);
        throw new Error("No se pudo parsear la respuesta del modelo.");
    }
}

// Manager de verificacion a las respuestas del assistant
async function sendToverificador(assistantResponse) {
    try {
        console.log("\n Respuesta inicial del modelo:", assistantResponse);
        let formatedMsg = await formatear(assistantResponse);

        console.log("Respuesta formateada:", formatedMsg);


        return formatedMsg;
    } catch (error) {
        console.error("Error en sendToverificador:", error.message);
        return null;
    }
}


// Exportar la funcion
module.exports = { sendToOpenAIAssistant, sendToWhisper, sendToverificador };