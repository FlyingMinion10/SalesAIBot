// Dependencies
const { DateTime } = require("luxon");
// Importar dependencias
const { OpenAI } = require("openai");
const fs = require('fs');
const path = require('path');
require("dotenv").config();

// Importaciones de funciones locales
const { emailManager } = require('./tools/sendMail');
const { calendarManager } = require('./tools/calendarAPI');
const { l, f, flat } = require('./tools/utils');

// Importar variables de entorno
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID_Meet;

// Configurar conexión con OpenAI
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});
const client = openai;


async function agendarReserva(date, time) {
    if (!date || !time) { throw new Error('Parámetros incompletos'); }
    
    let calendar_results = await calendarManager(date, time);
    calendar_results ? l.blue(`\nRESERVA AGENDADA ${date} ${time}`) : l.red(`\nError al agendar la reserva ${date} ${time}`);
    
    const result = {
        success: true,
    };
    return result;
}

async function sendEmail(email, details) {
    if (!email || !details) { throw new Error('Parámetros incompletos'); }

    let manager_results =  await emailManager(email, 'Reserva confirmada', details);
    manager_results ? l.blue(`\nEMAIL ENVIADO ${ email }`) : l.red(`Error al enviar el email ${ email }`);
    
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
async function sendToMeetAgent(threadId, userMessage) {
    try {
        
        // Agregar mensaje al thread
        const now = DateTime.now();
        const dayOfWeek = now.toFormat('cccc'); // Nombre completo del día de la semana
        const formattedDate = now.toFormat('yyyy-MM-dd\' \'HH:mm'); // Formato de fecha y hora

        const timestamp = ` (timestamp: ${dayOfWeek} ${formattedDate})`;

        await client.beta.threads.messages.create(threadId, {
            role: "user",
            content: userMessage + timestamp
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
                await handleRequiresAction(runStatus, threadId);}

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
module.exports = { sendToMeetAgent };