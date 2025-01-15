const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// IMPORTANT: Use the refresh token that has both Gmail & Calendar permissions
oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const calendar = google.calendar({
    version: 'v3',
    auth: oauth2Client,
});

async function createCalendarEvent(body, date, hour, name) {
  try {
    // 1. Construimos la fecha/hora de inicio con offset -06:00
    //    Ejemplo: date = '2025-01-10', hour = '10'  => '2025-01-10T10:00:00-06:00'
    const startDate = new Date(`${date}T${hour}:00-06:00`);

    // 2. Sumamos 1 hora (60 * 60 * 1000 ms) para la fecha/hora de fin
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

    // 3. Creamos el objeto del evento usando las fechas convertidas a ISO
    const event = {
      summary: `Reunión con ${name}`,
      description: body,
      start: {
        dateTime: startDate.toISOString(),
      },
      end: {
        dateTime: endDate.toISOString(),
      },
      attendees: [
        { email: 'example@example.com' },
      ],
    };

    // 4. Insertamos el evento en el calendario indicado
    const response = await calendar.events.insert({
      calendarId: '72c091d537e2db9716837b39091db892d031eb5e41b698ccb0690aebc56f31f4@group.calendar.google.com',
      requestBody: event,
    });

    console.log('Event created:', response.data.htmlLink);
    return true;
  } catch (error) {
    console.error('Error creating event:', error);
  }
}


async function calendarManager(date, time, name) {
    const body = `
    ¡Tu reunión ha sido agendada!
    - Reserva agendada en el calendario de prueba.

    [Espacio para detalles adicionales en un futuro]
    `;

    return await createCalendarEvent( body, date, time, name) == true ? true : false;
}

module.exports = {
    calendarManager,
};
  