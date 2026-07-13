
function generarPrompt() {
    const asignatura = document.getElementById('asignatura').value;
    const detalle = document.getElementById('detalle').value;
    const enfoque = document.getElementById('enfoque').value;    // Se obtiene el valor de cada campo del formulario
    const tarea = document.getElementById('tarea').value;

    if (asignatura == "" || tarea == "") {
        alert("Rellena al menos la asignatura y la tarea");   // Validación básica para asegurarse de que se han ingresado los campos necesarios
        return;
    }

    // Construcción del prompt basado en las opciones seleccionadas

    switch (tarea) {
    case "resumir":
        prompt = "Actúa como un profesor experto en " + asignatura + ". Resume el siguiente texto de forma " + detalle + ", usando párrafos cortos y lenguaje claro. Destaca los conceptos más importantes. El objetivo es " + enfoque + ". Aquí está el texto: [PEGA TU TEXTO AQUÍ]"
        break;
    case "esquema":
        prompt = "Actúa como un profesor experto en " + asignatura + ". Crea un esquema visual jerárquico del siguiente texto con nivel de detalle" + detalle + ". Usa sangría, títulos y subtítulos. El objetivo es" + enfoque + ". Aquí está el texto: [PEGA TU TEXTO AQUÍ]"
        break;
    case "test":
        prompt = "Actúa como un profesor experto en " + asignatura + ". Genera 10 preguntas tipo test con 4 opciones cada una y señala la respuesta correcta. Nivel de dificultad" + detalle + ". El objetivo es" + enfoque + ". Basa las preguntas en: [PEGA TU TEXTO AQUÍ]"
        break;
    case "explicar":
        prompt = "Actúa como un profesor experto en " + asignatura + ". Explica el siguiente concepto de forma" + detalle + "usando ejemplos reales y analogías fáciles de entender. El objetivo es" + enfoque+ ". El concepto es: [PEGA TU TEXTO AQUÍ]"
        break;
    case "flashcards":
        prompt = "Actúa como un profesor experto en " + asignatura + ". Crea 15 tarjetas de memoria en formato 'Pregunta → Respuesta' con nivel de detalle"+ detalle + ". El objetivo es" + enfoque + ". Basa las tarjetas en: [PEGA TU TEXTO AQUÍ]"
        break;
    }

    document.getElementById('prompt-generado').innerText = prompt;

    document.getElementById('overlay-prompt').classList.add('active');  // Muestra el overlay con el prompt generado

}

function cerrarPrompt() {
    document.getElementById('overlay-prompt').classList.remove('active');  // Oculta el overlay
}

function copiarPrompt() {
    navigator.clipboard.writeText(prompt);  // Copia el prompt al portapapeles
}
