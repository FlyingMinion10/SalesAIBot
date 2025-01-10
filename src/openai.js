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
const { emailManager, managerTest} = require('./sendMail');
const { calendarManager } = require('./calendarAPI');

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

function blueLog(text, text2='') {
    console.log(`\x1b[34m${text}\x1b[0m`, text2);
}

function redLog(text, text2='') {
    console.log(`\x1b[31m${text}\x1b[0m`, text2);
}

function red(text) {
    return (`\x1b[31m${text}\x1b[0m`);
}

function flat(text) {
    const flatResponseV3 = text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    return flatResponseV3;
}


// --------------------------
//   FUNCIONES INTELIGENTES
// --------------------------

// Código de escape ANSI para color rojo

async function agendarReserva(date, time) {
    if (!date || !time) { throw new Error('Parámetros incompletos'); }
    
    let calendar_results = await calendarManager(date, time);
    calendar_results ? blueLog(`\nRESERVA AGENDADA ${date} ${time}`) : redLog(`\nError al agendar la reserva ${date} ${time}`);
    
    const result = {
        success: true,
    };
    return result;
}

async function sendEmail(email, details) {
    if (!email || !details) { throw new Error('Parámetros incompletos'); }

    let manager_results =  await emailManager(email, 'Reserva confirmada', details);
    manager_results ? blueLog(`\nEMAIL ENVIADO ${ email }`) : redLog(`Error al enviar el email ${ email }`);
    
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
                

            // Ejecutar la función correspondiente
            let result;
            switch (name) {
                case 'agendar_reserva':
                    
                    const { date, time } = functionArgs;
                    result = await agendarReserva(date, time);
                    break;

                case 'send_email':
                    
                    const { email_address, reservation_details } = functionArgs;
                    result = await sendEmail(email_address, reservation_details);
                    break;

                default:
                    console.warn(`Función no reconocida: ${name} \n`);
            }
            console.log(`Tool Callback (149) ${name}: ${result.success}`); // MFM \n

            // Importante: Guardar el resultado
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
        const now = DateTime.now();
        const dayOfWeek = now.toFormat('cccc'); // Nombre completo del día de la semana
        const formattedDate = now.toFormat('yyyy-MM-dd\' \'HH:mm'); // Formato de fecha y hora

        const timestamp = ` (${dayOfWeek} ${formattedDate})`;

        await client.beta.threads.messages.create(threadId, {
            role: "user",
            content: userMessage + timestamp
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
                callback(runStatus.required_action, false);
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
        blueLog(`\nRespuesta inicial del modelo:`, flat(assistantResponse));
        
        // console.log("Respuesta formateada:", formatedMsg);

        return formatedMsg;
    } catch (error) {
        console.error("Error en sendToverificador:", error.message);
        return null;
    }
}


// Exportar la funcion
module.exports = { sendToOpenAIAssistant, sendToWhisper, sendToverificador };