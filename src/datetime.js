const { DateTime } = require("luxon");

function clearText(txt) {
    let res = txt.toLowerCase();
    res = res.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return res;
}

// ---------------------
//     FECHA Y HORA
// ---------------------
function asignarFechaHora(dateProvided, horaProvided) {
  const now = DateTime.now();
  
  // Procesar fecha primero
  const frase = dateProvided.toLowerCase();
  const diasSemana = {
    lunes: 0, martes: 1, miércoles: 2, miercoles: 2,
    jueves: 3, viernes: 4, sábado: 5, sabado: 5, domingo: 6
  };
  const offsetEspecial = { hoy: 0, mañana: 1, "pasado mañana": 2 };
  const patronSemana = /\b(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo|hoy|mañana|pasado mañana)\b/gi;
  const patronMod = /(proximo|próximo|siguiente)/;
  const patronDia = /\b-?\d+\b/g;
  const patronMes = /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/gi;

  // Obtener fecha en formato YYYY-MM-DD
  let fechaISO;
  let weekMatch = frase.match(patronSemana);
  if (weekMatch) {
    let fechaMasProxima = null, diaActual = now.weekday - 1, modMatch = frase.match(patronMod);
    weekMatch.forEach(d => {
      let offset = offsetEspecial[d] ?? ((diasSemana[d] - diaActual + 7) % 7 + (modMatch ? 7 : 0));
      let fechaCandidata = now.plus({ days: offset });
      if (!fechaMasProxima || fechaCandidata < fechaMasProxima) fechaMasProxima = fechaCandidata;
    });
    fechaISO = `${fechaMasProxima.year}-${String(fechaMasProxima.month).padStart(2, '0')}-${String(fechaMasProxima.day).padStart(2, '0')}`;
  } else {
    let dayMatch = frase.match(patronDia);
    if (!dayMatch) return "Falta el día numérico.";
    let day = parseInt(dayMatch);
    if (day < 1 || day > 31) return "Ooops ese día parece no existir...";
    
    let mes;
    let monthMatch = frase.match(patronMes);
    if (!monthMatch) {
      mes = now.month + (day < now.day ? 1 : 0);
      if (mes > 12) mes = 1;
    } else {
      const mesesMap = {
        "enero": "01", "febrero": "02", "marzo": "03", "abril": "04",
        "mayo": "05", "junio": "06", "julio": "07", "agosto": "08",
        "septiembre": "09", "octubre": "10", "noviembre": "11", "diciembre": "12"
      };
      mes = mesesMap[monthMatch[0].toLowerCase()];
    }
    fechaISO = `${now.year}-${String(mes).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Procesar hora
  let horaFinal;
  try {
    const regex = /(\d+).*?(mañana|tarde|am|pm)/i;
    const match = horaProvided.match(regex);

    if (match) {
      const horaNumero = parseInt(match[1], 10);
      const periodo = match[2].toLowerCase();
      
      if (horaNumero < 1 || horaNumero > 12) {
        return "Ingresa una hora válida por favor";
      }

      if (["mañana", "am"].includes(periodo)) {
        horaFinal = horaNumero === 12 ? "00:00" : `${horaNumero.toString().padStart(2, '0')}:00`;
      } else {
        horaFinal = horaNumero === 12 ? "12:00" : `${(horaNumero + 12).toString().padStart(2, '0')}:00`;
      }
    } else {
      const horaLimpia = horaProvided.match(/\d+/g)?.[0];
      if (!horaLimpia) return "Ingresa una hora válida por favor";

      const horaNum = parseInt(horaLimpia);
      if (horaNum >= 0 && horaNum <= 23) {
        if (horaLimpia.length === 1) return 'AM o PM?';
        const horaFinalNum = horaNum < 6 ? horaNum + 12 : horaNum;
        horaFinal = `${horaFinalNum.toString().padStart(2, '0')}:00`;
      } else {
        return "Ingresa una hora válida por favor";
      }
    }
  } catch (error) {
    return "Ingresa una hora válida por favor";
  }

  // Combinar fecha y hora en formato ISO
  return `${fechaISO}T${horaFinal}:00`;
}

// REVERTIR FECHA ISO ////////////////////////////////
function reverseISO(fechaISO) {
    // Check if fechaISO is an object    
    if (fechaISO instanceof Date) {
        const month = fechaISO.getMonth() + 1; // Los meses en JavaScript son 0-indexados
        const day = fechaISO.getDate();

        // Obtener el nombre del mes basado en el número de mes
        const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
        const mesNombre = meses[month - 1];

        // Formatear el día a eliminar ceros a la izquierda
        const diaFormateado = day.toString();

        // Construir la fecha en el formato deseado
        const fechaFormateada = `${diaFormateado} de ${mesNombre}`;

        return fechaFormateada;
    } else {
        // Dividir la fecha en año, mes y día
        const [year, month, day] = fechaISO.split("-");
        
        // Obtener el nombre del mes basado en el número de mes
        const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
        const mesNombre = meses[parseInt(month) - 1];
        
        // Formatear el día a eliminar ceros a la izquierda
        const diaFormateado = parseInt(day).toString();
        
        // Construir la fecha en el formato deseado
        const fechaFormateada = `${diaFormateado} de ${mesNombre}`;
        
        return fechaFormateada;
    }
    
}

// VALIDACION DE MESA ////////////////////////////////
function asignarCancha(input, canchasDisponibles) {
    input = clearText(input);
    if (input.includes('no')) { return 'No hay problema, que tenga buen día';}

    const canchasExistentes = /\b(1|2|3|4)\b/gi;
    let cancha;
    let message;

    if (input.includes('si')) {
        cancha = canchasDisponibles[0].match(canchasExistentes);
    } else {
        cancha = input.match(canchasExistentes); 
        // canchasDisponibles = canchasDisponibles[0].match(cancha);
        canchasDisponibles = canchasDisponibles[0].match(cancha);
        if (canchasDisponibles == null) {
            return "Por favor seleccione una chancha de las que tenemos disponibles"
        }
    }
    
    if (cancha == null) {
        return "Elige una cancha válida";
    } else {
        cancha = cancha.toString();
        return cancha;
    }    
}

// VALIDACION DE ID ////////////////////////////////
function asignarRow(frase) {
    const ordinales = {
        "primer": 1,
        "segund": 2,
        "tercer": 3,
        "cuart": 4,
        "quint": 5,
        "sext": 6,
        "septim": 7,
        "octav": 8,
        "noven": 9,
        "decim": 10,
        // "utim": rows.length-1        //  FUTURE IMPLEMENTATION
    };

    frase = clearText(frase);
    const patronOrdinales = /(primer|segund|tercer|cuart|quint|sext|septim|octav|noven|decim|utim)/gi;
    const numMatch = frase.match(patronOrdinales);

    // Buscar coincidencias con los números ordinales
    let coincidencia = ordinales[numMatch];
    
    // Si no hay coincidencias, devolver el mismo texto
    if (coincidencia == undefined) {
        return null;
    } else {
        return coincidencia;
    }
}

// Exportar las funciones asignarHora y asignarISOdate
module.exports = { asignarFechaHora, reverseISO, asignarCancha, asignarRow };

