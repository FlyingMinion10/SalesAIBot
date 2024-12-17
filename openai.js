// Importar dependencias
const { OpenAI } = require("openai");
require("dotenv").config();
const { getOrCreateThread } = require('./database'); // Importa la función sendToOpenAIAssistant

// Configurar conexión con OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Función para enviar audio a Whisper de OpenAI
async function transcribeAudio(audioFilePath) {
    const formData = new FormData();
    formData.append('file', createReadStream(audioFilePath));
    formData.append('model', 'whisper-1');

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
            return res.status(400).json({ error: "user_id y message son requeridos." });
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

// Funcion para dar formato a las respuestas del assistant
async function sendToverificador(assistantResponse) {

}



// Exportar la funcion
module.exports = { sendToOpenAIAssistant, transcribeAudio, sendToverificador };