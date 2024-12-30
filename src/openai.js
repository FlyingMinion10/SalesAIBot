// Importar dependencias
const { OpenAI } = require("openai");
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const { createReadStream } = fs;
const path = require('path');
const { getThread, registerThread } = require('./database.js'); 
require("dotenv").config();

// Importar variables de entorno
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID_REST;


// Importar texto de instrucciones
const pathPrompt = path.join(__dirname, "../src/prompts", "/formatPrompt.txt");
const prompt = fs.readFileSync(pathPrompt, "utf8")

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

// Función para enviar audio a Whisper de OpenAI
async function transcribeAudio(audioFilePath) {
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
module.exports = { sendToOpenAIAssistant, transcribeAudio, sendToverificador };