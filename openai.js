// Importar dependencias
const { OpenAI } = require("openai");
const express = require("express");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
require("dotenv").config();

// Configurar conexión con OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configurar conexión con PostgreSQL
const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

// Función para obtener o crear un thread
const getOrCreateThread = async (userId) => {
  const client = await pool.connect();
  try {
    // Buscar thread existente
    const result = await client.query("SELECT thread_id FROM threads WHERE user_id = $1", [userId]);
    if (result.rows.length > 0) {
      return result.rows[0].thread_id; // Retorna el thread_id existente
    }

    // Si no existe, crea un nuevo thread
    const thread = await openai.beta.threads.create();
    const threadId = thread.id;

    // Almacena el nuevo thread en la base de datos
    await client.query("INSERT INTO threads (user_id, thread_id) VALUES ($1, $2)", [userId, threadId]);

    return threadId; // Retorna el nuevo thread_id
  } catch (error) {
    console.error("Error gestionando el thread:", error);
    throw error;
  } finally {
    client.release();
  }
};

// Endpoint para manejar mensajes del usuario
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

// Exportar la funcion
module.exports = { sendToOpenAIAssistant };