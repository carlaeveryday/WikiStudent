function calcular() {
    let bachillerato = parseFloat(document.getElementById('bachillerato').value);
    let faseObligatoria = parseFloat(document.getElementById('fase_obligatoria').value);
    let nota1 = parseFloat(document.getElementById('nota1').value);
    let nota2 = parseFloat(document.getElementById('nota2').value);
    console.log(bachillerato, faseObligatoria, nota1, nota2);
    let notaAcceso = (bachillerato * 0.6) + (faseObligatoria * 0.4);
    console.log(notaAcceso);
    let carrera = document.getElementById('carrera-select').value;
    let asig1 = document.getElementById('asig1').value;
    let asig2 = document.getElementById('asig2').value;
    let pond1 = ponderaciones[carrera][asig1];
    let pond2 = ponderaciones[carrera][asig2];
    console.log(pond1, pond2);
    let notaFinal = notaAcceso + (nota1 * pond1) + (nota2 * pond2);
    console.log(notaFinal);
}

const ponderaciones = {
    "ing_arq": {
        "matematicasII": 0.2,
        "fisica": 0.2,
        "quimica": 0.2,
        "dibujo_tec": 0.2,
        "tec_ing": 0.2,
        "geologia": 0.1,
        "dibujo_art": 0.1,
    },
    "ciencias_salud": {
        "matematicasII": 0.2,
        "fisica": 0.2,
        "quimica": 0.2,
        "biologia": 0.2,
        "geologia": 0.1,
    },
    "ciencias": {
        "matematicasII": 0.2,
        "fisica": 0.2,
        "quimica": 0.2,
        "biologia": 0.2,
        "geologia": 0.2,
        "matematicas_aplicadas": 0.1,
    },
    "ccss": {
        "matematicas_aplicadas": 0.2,
        "historia_españa": 0.1,
        "geografia": 0.2,
        "empresa": 0.2,
        "historia_filosofia": 0.1,
        "latinII": 0.1,
        "matematicasII": 0.1,
    },
    "arte_humanidades": {
        "latinII": 0.2,
        "historia_españa": 0.2,
        "historia_filosofia": 0.2,
        "historia_arte": 0.2,
        "artes_escenicas": 0.2,
        "dibujo_art": 0.2,
        "analisis_musical": 0.2,
        "griegoII": 0.2,
        "geografia": 0.1,
        "segunda_lengua": 0.1,
    }
}

function cerrarPopup() {
    document.getElementById('popup-overlay').style.display = 'none';
}