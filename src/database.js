// Importar dependencias
const { Pool } = require("pg");
require("dotenv").config();

// Variables
const table_name = "node_threads";

// Configurar conexión con PostgreSQL
const pool = new Pool({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
});

// Función para crear la tabla si no existe
const createTableIfNotExists = async () => {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS ${table_name} (
                user_id VARCHAR(255) NOT NULL,
                thread_id VARCHAR(255) NOT NULL,
                PRIMARY KEY (user_id, thread_id)
            )
        `);
    } catch (error) {
        console.error("Error creando la tabla (createTableIfNotExists):", error);
        throw error;
    } finally {
        client.release();
    }
};

// Función para obtener o crear un thread
const getThread = async (userId) => {
    await createTableIfNotExists(); // Asegurarse de que la tabla exista
    const client = await pool.connect();

    try {
        // Buscar thread existente
        const result = await client.query(`SELECT thread_id FROM ${table_name} WHERE user_id = $1`, [userId]);
        if (result.rows.length > 0) {
            return result.rows[0].thread_id; // Retorna el thread_id existente
        } else {
            return null; // Retorna null si no existe
        }

    } catch (error) {
        console.error("Error gestionando el thread (getThread):", error);
        throw error;

    } finally {
        client.release();
    }
};

// Función para registrar un thread
const registerThread = async (userId, threadId) => {
    await createTableIfNotExists(); // Asegurarse de que la tabla exista
    const client = await pool.connect();
    try {
        // Almacena el nuevo thread en la base de datos
        await client.query(`INSERT INTO ${table_name} (user_id, thread_id) VALUES ($1, $2)`, [userId, threadId]);
        return true; // Retorna el nuevo thread_id

    } catch (error) {
        console.error("Error gestionando el thread (registerThread):", error);
        throw error;

    } finally {
        client.release();
    }
};

// Exportar las funciones
module.exports = { getThread, registerThread };