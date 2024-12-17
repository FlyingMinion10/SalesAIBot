// Importar dependencias
const { OpenAI } = require("openai");
require("dotenv").config();
const { getOrCreateThread } = require('./database'); // Importa la función sendToOpenAIAssistant

// Configurar conexión con OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Conrfguración de modelos GPT
const models = {
    "audio": "whisper-1",
    "verificador": "gpt-4o",
    "autoparser": "gpt-4o-mini",
};

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
        const threadId = await getOrCreateThread(userId);

        // Crear un nuevo mensaje en el thread
        await openai.beta.threads.messages.create(threadId, {
            role: "user",
            content: userMessage,
        });

        // Ejecutar el assistant
        const run = await openai.beta.threads.runs.create(threadId, {
            assistant_id: process.env.OPENAI_ASSISTANT_ID,
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

// Esquema de salida esperado
const outputSchema = {
    response: {
        parte_uno: "Texto correspondiente a la primera parte de la respuesta.",
        parte_dos: "Texto correspondiente a la segunda parte de la respuesta.",
        parte_tres: "Texto correspondiente a la tercera parte de la respuesta (opcional).",
        imagen: ["la imagen"]
    }
};

// Función para validar la salida contra el esquema
function validateOutput(output) {
    try {
        if (
            output.response &&
            typeof output.response.parte_uno === "string" &&
            typeof output.response.parte_dos === "string" &&
            typeof output.response.parte_tres === "string" &&
            Array.isArray(output.response.imagen)
        ) {
            return true;
        }
    } catch (e) {
        return false;
    }
    return false;
}

// Dar formato a las respuestas del assistant
async function darFormato(assistantResponse) {
    const response = await openai.chat.completions.create({
        model: models.verificador, // Modelo usado
        messages: [
            {
                role: "system",
                content: `Especificaciones para el formato de respuesta: Divide tu respuesta en tres partes solo si es necesario, si el contenido es corto utiliza únicamente "parte_uno" y deja "parte_dos" vacía. Dale una tonalidad animada a tu mensaje y un estilo de acento Mexicano. Devuelve la respuesta en formato JSON.`
            },
            {
                role: "user",
                content: assistantResponse
            }
        ],
        response_format: { type: "json" }, // Asegura salida JSON
    });
    return JSON.parse(response.choices[0].message.content);
}

// Dar formato a las respuestas del assistant
async function sendToverificador(assistantResponse) {
    let output = await darFormato(assistantResponse);

    console.log("Respuesta inicial del modelo:", output);

    if (!validateOutput(output)) {
        console.log("Formato inválido. Corrigiendo con un auto-fixer...");
        // Auto-fixing: Solicita al modelo corregir el formato
        const fixingPrompt = `Corrige el siguiente JSON para que coincida con el esquema: ${JSON.stringify(outputSchema)}.\n\nJSON recibido: ${JSON.stringify(output)}`;
        output = await darFormato(fixingPrompt);
    }

    console.log("Respuesta final validada:", output);
    return output;
}

// Exportar la funcion
module.exports = { sendToOpenAIAssistant, transcribeAudio, sendToverificador };