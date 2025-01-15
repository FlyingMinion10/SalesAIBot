const { google } = require('googleapis');
require('dotenv').config();


const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const MY_GOOGLE_GMAIL = process.env.MY_GOOGLE_GMAIL;

const sender_mail = `"Juan Felipe" <${MY_GOOGLE_GMAIL}>`;


/**
 * Sends an email using the Gmail API.
 */
async function sendEmail({ to, subject, body }) {
  // --------------------------------------------------------
  // 1. Configure OAuth2 client
  // --------------------------------------------------------
  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,     // e.g. '1234567890-abcdefg.apps.googleusercontent.com'
    GOOGLE_CLIENT_SECRET, // e.g. 'ABCD-XYZ123'
    GOOGLE_REDIRECT_URI   // e.g. 'http://localhost:3000/oauth2callback'
  );

  // Set your refresh token (from the step above)
  oauth2Client.setCredentials({
    refresh_token: GOOGLE_REFRESH_TOKEN, 
  });

  // --------------------------------------------------------
  // 2. Create a Gmail client
  // --------------------------------------------------------
    const gmail = google.gmail({
        version: 'v1',
        auth: oauth2Client,
    });

  // --------------------------------------------------------
  // 3. Compose the raw email
  // --------------------------------------------------------
  // The message must have these parts:
  //  - From
  //  - To
  //  - Subject
  //  - Body
  //  - A blank line separating headers from the body
  //
  // Then Base64URL-encode it.

    const messageParts = [
        `From: ${sender_mail}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        '',
        body
    ];

    const message = messageParts.join('\n');

    // Base64URL-encode the message (RFC 4648 §5)
    const encodedMessage = Buffer
        .from(message, 'utf-8')
        .toString('base64')
        // Convert base64 to "Base64URL"
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    // --------------------------------------------------------
    // 4. Send the email using gmail.users.messages.send
    // --------------------------------------------------------
    try {
        const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
            raw: encodedMessage,
        },
        });

        console.log('Email sent! Message ID:', response.data.id);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
    }
}

// --------------------------------------------------------
// 5. Call the function or export it
// --------------------------------------------------------
// Ejemplo de uso:
// await sendEmail({
//     from: '"Juan Felipe" <zepedajuande9@gmail.com>',
//     to: 'juanfezepeda@icloud.com',
//     subject: 'Hello from the Gmail API',
//     body: 'This is a test email sent via the Gmail API in Node.js!'
// });

async function emailManager(to, subject, details) {

    const { client_name: name, appointment_date: date, business_description: bussiness, specific_task: task } = details;
    // console.log('Email manager parameters:', to, name, date, guests, table );

    let body = `
    Hola, ${name}!

    Recibimos tu solicitud para agendar una reunión con uno de nuestros expertos quien se asegurará de que cumplamos con tus expectativas 📈.
    
    Te confirmamos la información que nos facilitaste:
    - Descripción general de tu negocio: ${bussiness}
    - Tarea en la que se especializara nuestro agente: ${task}
    - Agendado el día: ${date}

    Listo para llevar tu negocio al siguiente nivel? 🚀
    `;

    let result = await sendEmail({
        from: sender_mail,
        to: to,
        subject: subject,
        body: body
    });

    return result == true ? true : false;
}

async function managerTest() {
    console.log('Probando emailManager...');
}

// Exportar la función
module.exports = { emailManager, managerTest };