// const { google } = require('googleapis');
// require("dotenv").config();

// // Replace these values with your own
// const CLIENT_ID = process.env.CLIENT_ID;
// const CLIENT_SECRET = process.env.CLIENT_SECRET;
// const REDIRECT_URI = process.env.REDIRECT_URI;

// // Create the OAuth2 client
// const oauth2Client = new google.auth.OAuth2(
//   CLIENT_ID,
//   CLIENT_SECRET,
//   REDIRECT_URI
// );

// // Set the required Gmail scopes.
// // For sending emails, 'https://mail.google.com/' is sufficient.
// const SCOPES = ['https://mail.google.com/'];

// // Generate the url that we need to visit
// const authUrl = oauth2Client.generateAuthUrl({
//   access_type: 'offline',
//   scope: SCOPES,
//   prompt: 'consent', // ensures we always get a refresh token
// });

// console.log('Authorize this app by visiting this url:', authUrl);

// // After visiting the URL and granting permission, Google will redirect
// // to your REDIRECT_URI, e.g. http://localhost:3000/oauth2callback?code=<CODE>
// // Paste that <CODE> value into the function below:

// async function getTokens(code) {
//   const { tokens } = await oauth2Client.getToken(code);
//   console.log('Tokens:', tokens);
//   // The refresh token is tokens.refresh_token
//   // The access token is tokens.access_token
//   // Save them somewhere secure (e.g. environment variables)
// }

// getTokens("4/0AanRRrur12ErfgpBZP0MJKtKU9MGs98MyA76OZK-TQqEs1mUosu53lRTBiA5XIA68GdpZA&scope=https://mail.google.com/");

// // Uncomment and paste the authorization code (from the URL redirect) below, then run:
// // getTokens('PASTE_AUTHORIZATION_CODE_HERE');

const { google } = require('googleapis');
require('dotenv').config();


const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

const sender_mail = '"Juan Felipe" <zepedajuande9@gmail.com>';


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

    const { guest_name: name, reservation_date: date, num_of_guests: guests, table_type: table } = details;
    // console.log('Email manager parameters:', to, name, date, guests, table );

    let body = `
    Hola, ${name}!

    Tu reserva ha sido confirmada. Aquí están los detalles:
    
    - Personas: ${guests}
    - Fecha: ${date}
    - Mesa: ${table}

    ¡Gracias por elegirnos!
    `;

    let result = await sendEmail({
        from: sender_mail,
        to: to,
        subject: subject,
        body: body
    });

    return result;
}

async function managerTest() {
    console.log('Probando emailManager...');
}

// Exportar la función
module.exports = { emailManager, managerTest };