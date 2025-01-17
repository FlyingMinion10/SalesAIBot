// Importar dependencias
const { OpenAI } = require("openai");
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const { createReadStream } = fs;
const path = require('path');
require("dotenv").config();

// Importaciones de funciones locales
const { getThread, registerThread } = require('./database.js'); 
const { sendToMeetAgent } = require('./meetAgent');
const { sendToPriceAgent } = require('./priceAgent');
const { sendToInfoAgent } = require('./infoAgent');
const { l, f, flat } = require('./tools/utils');
const { json } = require("express");

// Importar texto de instrucciones
const pathPrompt = path.join(__dirname, "prompts", "/formatPrompt.txt");
const prompt = fs.readFileSync(pathPrompt, "utf8")

// Importar variables de entorno
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID_CEO;

// Conrfguración de modelos GPT
const models = {
    "audio": "whisper-1",
    "verificador": "gpt-4o-mini",
    "autoparser": "gpt-4o-mini",
};

// Configurar conexión con OpenAI
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});
const client = openai;

// --------------------------
// Funciones de utilidad
// --------------------------

const isDebuggingActive = true;
function callback(text, mod = isDebuggingActive) {
    mod ? console.log(text) : null;
}

// --------------------------
//   FUNCIONES INTELIGENTES
// --------------------------

// Función para manejar las acciones requeridas
async function handleAgentChooser(run, threadId) {
    const toolCalls = run.required_action.submit_tool_outputs.tool_calls;
    const toolOutputs = [];

    for (const toolCall of toolCalls) {
        try {

            const { id, function: { name, arguments: args } } = toolCall;
            const functionArgs = typeof args === 'object' ? 
                args : 
                JSON.parse(args);
            const { agent } = functionArgs;
            
            // Switch case eliminado test
            
            // Importante: Guardar el resultado
            toolOutputs.push({
                tool_call_id: id,
                output: JSON.stringify({success: true})
            });
            
            // Devolver el agente seleccionado
            console.log('Agente seleeccionado: ', agent);
            return agent

        } catch (error) {
            console.error('Error procesando toolCall:', {
                error: error.message,
                toolCall
            });
            // Continuar con el siguiente toolCall
            continue;
        }
    }

    // Enviar los resultados al asistente
    await openai.beta.threads.runs.submitToolOutputs(
        threadId,
        run.id,
        { tool_outputs: toolOutputs }
    );
    return result.responseContent
}

async function subAgentManager(selectedAgent, threadId, userMessage) {

    console.log('Choosed agent (98): ' + selectedAgent); // MFM 
    switch (selectedAgent) {
        case 'reuniones':
            result = await sendToMeetAgent(threadId, userMessage);
            break;

        case 'cotizaciones':
            result = await sendToPriceAgent(threadId, userMessage);
            break;

        case 'informacion':
            result = await sendToInfoAgent(threadId, userMessage);
            break;

        default:
            console.warn(`Función no reconocida: ${selectedAgent} \n`);
    }

    return result.responseContent    
}

// Función principal modificada
async function sendToCeoAgent(userId, userMessage) {
    try {

        // Crear o recuperar thread
        if (!userId || !userMessage) {
            console.error("Error:", "user_id y message son requeridos");
            return "Hubo un error al procesar tu solicitud.";
        }

        let threadId = await getThread(userId);
        if (threadId === null) {
            const thread = await openai.beta.threads.create();
            threadId = thread.id;
            await registerThread(userId, threadId);
        }

        // Añadir el mensaje al thread
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
        let subAgentResponse;
        do {
            runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
            await new Promise((resolve) => setTimeout(resolve, 500)); // MFM
            if (runStatus.status === "requires_action") {
                l.red(runStatus.required_action);
                // choosedAgent = await handleAgentChooser(runStatus, threadId);
            }
        } while (runStatus.status !== "completed");

        // Obtener la respuesta del assistant
        const messages = await openai.beta.threads.messages.list(threadId);
        const responseContent = messages.data[0]?.content[0]?.text.value || "No hay respuesta disponible.";
        const parsedResponse = JSON.parse(responseContent);
        const choosedAgent = parsedResponse.agent;
        
        subAgentResponse = await subAgentManager(choosedAgent, threadId, userMessage);

        return subAgentResponse || responseContent;
    } catch (error) {
        console.error("Error en sendToCeoAgent:", error);
        return null;
    }
}

// ----------------------------------------------------
//                FUNCIONES OPERATIVAS
// ----------------------------------------------------

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

        const flatMsg = flat(assistantResponse);
        let formatedMsg = await formatear(assistantResponse);
        // l.blue(`\nRespuesta inicial del modelo:`, flatMsg);
        l.blue(`\nRespuesta formateada del modelo:`, formatedMsg);
        
        return assistantResponse;
        // return formatedMsg;

    } catch (error) {
        console.error("Error en sendToverificador:", error.message);
        return null;
    }
}


// Exportar la funcion
module.exports = { sendToCeoAgent, sendToWhisper, sendToverificador };