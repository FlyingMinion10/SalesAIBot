// --------------------------
// Funciones de utilidad
// --------------------------

class l {
    static red(text, text2 = '') {
      console.log(`\x1b[31m${text}\x1b[0m`, text2);
    }
    static green(text, text2 = '') {
      console.log(`\x1b[32m${text}\x1b[0m`, text2);
    }
    static blue(text, text2 = '') {
      console.log(`\x1b[34m${text}\x1b[0m`, text2);
    }

}
 
class f {
    static red(text) {
      return (`\x1b[31m${text}\x1b[0m`);
    }
    
    static green(text) {
      return (`\x1b[32m${text}\x1b[0m`);
    }
  
    static blue (text) {
      return (`\x1b[34m${text}\x1b[0m`);
    }

}

function flat(text) {
    const flatResponseV3 = text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    return flatResponseV3;
}

module.exports = { l, f, flat };