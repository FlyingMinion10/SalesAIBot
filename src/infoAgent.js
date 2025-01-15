// Dependencies
const { DateTime } = require("luxon");
// Importar dependencias
const { OpenAI } = require("openai");
const fs = require('fs');
const path = require('path');
require("dotenv").config();

// Importaciones de funciones locales
const { l, f, flat } = require('./tools/utils');

// Importar variables de entorno
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID_Info;

// Configurar conexión con OpenAI
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});
const client = openai;




// Función principal modificada
async function sendToInfoAgent(threadId, userMessage) {
    try {
        await client.beta.threads.messages.create(threadId, {
            role: "user",
            content: userMessage
        });

        // Crear y ejecutar el run
        let run = await client.beta.threads.runs.create(threadId, {
            assistant_id: OPENAI_ASSISTANT_ID
        });

        // Manejar el estado del run
        let runStatus;
        do {
            runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
            await new Promise((resolve) => setTimeout(resolve, 2000));
            if (runStatus.status === "requires_action") {
                // await handleRequiresAction(runStatus, threadId);}
                l.red('ERORR: infoAgent requires acction', 'Unexpected action');
            }
        } while (runStatus.status !== "completed");

        // Obtener la respuesta del assistant
        const messages = await openai.beta.threads.messages.list(threadId);
        const responseContent = messages.data[0]?.content[0]?.text.value || "No hay respuesta disponible.";
        
        return responseContent
    } catch (error) {
        console.error("Error en sendToCeoAgent:", error);
        return null;
    }
}

// Exportar la función
module.exports = { sendToInfoAgent };