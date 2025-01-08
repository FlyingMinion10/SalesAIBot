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

const client = openai;

// Definimos las funciones disponibles para el modelo


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

// Mantener las funciones disponibles existentes
const availableFunctions = {
    agendar_reserva: async (args) => {
        console.log("Function call agendar_reserva()");
        const { date, time } = args;
        const ISOdate = asignarFechaHora(date, time);
        return { status: "success"};
    },
    send_email: async (args) => {
        console.log("Function call send_email()");
        const { email_address, reservation_details } = args;
        return { status: "success" };
    }
};

// Función para manejar las acciones requeridas
const handleRequiresAction = async (run, threadId) => {
    if (
        run.required_action &&
        run.required_action.submit_tool_outputs &&
        run.required_action.submit_tool_outputs.tool_calls
    ) {
        const toolOutputs = await Promise.all(
            run.required_action.submit_tool_outputs.tool_calls.map(async (tool) => {
                const functionName = tool.function.name;
                const functionArgs = JSON.parse(tool.function.arguments);
                
                if (functionName in availableFunctions) {
                    const result = await availableFunctions[functionName](functionArgs);
                    return {
                        tool_call_id: tool.id,
                        output: JSON.stringify(result)
                    };
                }
            })
        );

        if (toolOutputs.length > 0) {
            run = await client.beta.threads.runs.submitToolOutputs(
                threadId,
                run.id,
                { tool_outputs: toolOutputs }
            );
            console.log("Tool outputs submitted successfully.");
        }
        
        // return handleRunStatus(run, threadId);
        return
    }
};

// Función para manejar el estado del run
const handleRunStatus = async (run, threadId) => {
    if (run.status === "completed") {
        const messages = await client.beta.threads.messages.list(threadId);
        return messages.data;
    } else if (run.status === "requires_action") {
        return await handleRequiresAction(run, threadId);
    } else {
        console.error("Run did not complete:", run);
        return null;
    }
};

// Función principal modificada
async function sendToOpenAIAssistant(userId, userMessage) {
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

        // Agregar mensaje al thread
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
                print("REQUIRES ACTION")
                print(runStatus)
                print(runStatus.status)
                await handleRequiresAction(run, threadId);}
        } while (runStatus.status !== "completed");

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
        console.log("    Respuesta inicial del modelo:", assistantResponse);
        let formatedMsg = await formatear(assistantResponse);

        // console.log("Respuesta formateada:", formatedMsg);


        return formatedMsg;
    } catch (error) {
        console.error("Error en sendToverificador:", error.message);
        return null;
    }
}


// Exportar la funcion
module.exports = { sendToOpenAIAssistant, sendToWhisper, sendToverificador };