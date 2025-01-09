// Importar dependencias
const { OpenAI } = require("openai");
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const { createReadStream } = fs;
const path = require('path');
const { DateTime } = require("luxon");
require("dotenv").config();

// Importaciones de funciones locales
const { getThread, registerThread } = require('./database.js'); 
const progressManager = require('./progressManager');

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

// Funcion CALLBACK
const isDebuggingActive = false;
// function callback(text, text2 = "", text3 = "") {
function callback(text, mod = isDebuggingActive) {
    mod ? console.log(text) : null;
}

// Configurar conexión con OpenAI
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});
const client = openai;

// Definimos las funciones disponibles para el modelo


// --------------------------
//   FUNCIONES INTELIGENTES
// --------------------------

async function agendar_reserva(date, time) {
    callback(`agendar_reserva recibió: ${date}, ${time}`);
    const ISOdate = date + 'T' + time;
    
    if (!ISOdate) {
        throw new Error('Fecha inválida');
    }
    
    const result = {
        success: true,
        reservation: {
            date: ISOdate,
            original: {date, time}
        }
    };

    return result;
}

async function send_email(email, details) {
    callback(`agendar_reserva recibió: ${email}, ${details}`);
    
    if (!email || !details) {
        throw new Error('Parámetros incompletos');
    }
    
    const result = {
        success: true,
        sent_to: email,
        reservation: details
    };
    
    return result;
}


// Función para manejar las acciones requeridas
async function handleRequiresAction(run, threadId) {
    const toolCalls = run.required_action.submit_tool_outputs.tool_calls;
    const toolOutputs = [];

    progressManager.updateProgress(40, "Procesando acciones requeridas");
    for (const toolCall of toolCalls) {
        try {

            const { id, function: { name, arguments: args } } = toolCall;
            // console.log('Argumentos raw:', args);
            
            const functionArgs = typeof args === 'object' ? 
                args : 
                JSON.parse(args);
                
            callback(`Argumentos parseados: ${functionArgs}`);

            // Ejecutar la función correspondiente
            let result;
            switch (name) {
                case 'agendar_reserva':
                    const date = functionArgs.date;
                    const time = functionArgs.time;
                    
                    result = await agendar_reserva(date, time);
                    break;

                case 'send_email':
                    const email = functionArgs.email_address;
                    const details = functionArgs.reservation_details;

                    result = await send_email(email, details);
                    break;

                default:
                    console.warn(`Función no reconocida: ${name}`);
            }
            callback(result)

            // Importante: Guardar el resultado
            progressManager.updateProgress(60, "Retroalimentando al asistente");
            toolOutputs.push({
                tool_call_id: id,
                output: JSON.stringify(result || {success: false})
            });
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
    callback("Enviar los resultados al asistente")
    await openai.beta.threads.runs.submitToolOutputs(
        threadId,
        run.id,
        { tool_outputs: toolOutputs }
    );
}

// Función principal modificada
async function sendToOpenAIAssistant(userId, userMessage) {
    try {

        // Crear o recuperar thread
        if (!userId || !userMessage) {
            console.error("Error:", "user_id y message son requeridos");
            return "Hubo un error al procesar tu solicitud.";
        }

        progressManager.updateProgress(10, "Retrieving thread");
        let threadId = await getThread(userId);
        if (threadId === null) {
            const thread = await openai.beta.threads.create();
            threadId = thread.id;
            await registerThread(userId, threadId);
        }
        

        // Agregar mensaje al thread
        const now = DateTime.now().toISO();
        callback("Now:" + now);
        await client.beta.threads.messages.create(threadId, {
            role: "user",
            content: userMessage + now
        });

        // Crear y ejecutar el run
        progressManager.updateProgress(20, "Running assistant");
        let run = await client.beta.threads.runs.create(threadId, {
            assistant_id: OPENAI_ASSISTANT_ID
        });

        // Manejar el estado del run
        
        let runStatus;
        do {
            runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
            await new Promise((resolve) => setTimeout(resolve, 2000));
            if (runStatus.status === "requires_action") {
                callback("REQUIRES ACTION")
                callback(runStatus.required_action);
                await handleRequiresAction(runStatus, threadId);}
        } while (runStatus.status !== "completed");

        progressManager.updateProgress(70, "Getting assistant response");
        // Obtener la respuesta del assistant
        const messages = await openai.beta.threads.messages.list(threadId);
        const responseContent = messages.data[0]?.content[0]?.text.value || "No hay respuesta disponible.";
        
        return responseContent
    } catch (error) {
        console.error("Error en sendToOpenAIAssistant:", error);
        return null;
    }
}

// --------------------------
//   FUNCIONES OPERATIVAS
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

        progressManager.updateProgress(85, "Parseando respuesta");
        let formatedMsg = await formatear(assistantResponse);
        progressManager.updateProgress(100)
        console.log("\n\nRespuesta inicial del modelo:", assistantResponse);
        
        // console.log("Respuesta formateada:", formatedMsg);

        return formatedMsg;
    } catch (error) {
        console.error("Error en sendToverificador:", error.message);
        return null;
    }
}


// Exportar la funcion
module.exports = { sendToOpenAIAssistant, sendToWhisper, sendToverificador };