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


// async function fucntionName(arg1, arg2) {
//     if (!arg1 || !arg2) { throw new Error('Parámetros incompletos'); }
    
//     // let fucntion_results = await fucntionManager(arg1, arg2);
//     let fucntion_results = true;
//     fucntion_results ? l.blue(`\FUNCION EXITOSA ${arg1} ${arg2}`) : l.red(`\nError al ejecutar funcion ${arg1} ${arg2}`);
    
//     const result = {
//         success: fucntion_results,
//     };
//     return result;
// }

// // Función para manejar las acciones requeridas
// async function handleRequiresAction(run, threadId) {
//     const toolCalls = run.required_action.submit_tool_outputs.tool_calls;
//     const toolOutputs = [];

//     for (const toolCall of toolCalls) {
//         try {

//             const { id, function: { name, arguments: args } } = toolCall;
//             // console.log('Argumentos raw:', args);
            
//             const functionArgs = typeof args === 'object' ? 
//                 args : 
//                 JSON.parse(args);
                

//             // Ejecutar la función correspondiente
//             let result;
//             switch (name) {
//                 case 'function_name':
//                     const { arg1, arg2 } = functionArgs;
//                     result = await fucntionName(arg1, arg2);
//                     break;

//                 default:
//                     console.warn(`Función no reconocida: ${name} \n`);
//             }
//             console.log(`Tool Callback (149) ${name}: ${result.success}`); 

//             // Importante: Guardar el resultado
//             toolOutputs.push({
//                 tool_call_id: id,
//                 output: JSON.stringify(result || {success: false})
//             });
//         } catch (error) {
//             console.error('Error procesando toolCall:', {
//                 error: error.message,
//                 toolCall
//             });
//             // Continuar con el siguiente toolCall
//             continue;
//         }
//     }

//     // Enviar los resultados al asistente
//     await openai.beta.threads.runs.submitToolOutputs(
//         threadId,
//         run.id,
//         { tool_outputs: toolOutputs }
//     );
// }

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
        
        const result = {
            success: true,
            responseContent: responseContent,
        };
        return result
    } catch (error) {
        console.error("Error en sendToCeoAgent:", error);
        return null;
    }
}

// Exportar la función
module.exports = { sendToInfoAgent };