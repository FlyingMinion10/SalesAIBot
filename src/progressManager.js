// progressManager.js
class ProgressManager {
    constructor() {
        this.currentProgress = 0;
        this.totalSteps = 100;
        this.isFirstUpdate = true;
    }

    drawProgressBar(progress, message) {
        const barWidth = 30;
        const filledWidth = Math.floor(progress / 100 * barWidth);
        const emptyWidth = barWidth - filledWidth;
        const progressBar = '█'.repeat(filledWidth) + '▒'.repeat(emptyWidth);
        return `\rProgress: [${progressBar}] ${progress}% ${message}`;
    }

    updateProgress(steps, message = '') {
        // Si es la primera actualización, agregar una línea nueva
        if (this.isFirstUpdate) {
            console.log(''); // Línea en blanco para la barra
            this.isFirstUpdate = false;
        }

        this.currentProgress = Math.min(this.currentProgress + steps, this.totalSteps);
        const output = this.drawProgressBar(this.currentProgress, message);
        
        // Usar write para actualizar la misma línea
        process.stdout.write(output);

        if (this.currentProgress >= this.totalSteps) {
            process.stdout.write('\n'); // Nueva línea al completar
            this.reset();
        }
    }

    reset() {
        this.currentProgress = 0;
        this.isFirstUpdate = true;
    }
}

const progressManager = new ProgressManager();
module.exports = progressManager;