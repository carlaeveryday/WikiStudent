function calcPond(n) {
    const nota = parseFloat(document.getElementById('nota' + n).value);
    const pond = parseFloat(document.getElementById('pond' + n).value);
    const resSpan = document.getElementById('res' + n);

    if (!isNaN(nota) && nota >= 0 && nota <= 10 && pond > 0) {
        resSpan.textContent = '+' + (nota * pond).toFixed(3);
        resSpan.classList.add('activo');
    } else {
        resSpan.textContent = '—';
        resSpan.classList.remove('activo');
    }

    // Mostrar aviso si hay más de 2 asignaturas con ponderación
    let conPond = 0;
    for (let i = 1; i <= 4; i++) {
        const p = parseFloat(document.getElementById('pond' + i).value);
        const v = parseFloat(document.getElementById('nota' + i).value);
        if (!isNaN(v) && v >= 0 && v <= 10 && p > 0) conPond++;
    }
    document.getElementById('aviso-pond').style.display = conPond > 2 ? 'block' : 'none';
}

function calcular() {
    const bachillerato = parseFloat(document.getElementById('bachillerato').value);
    const faseObligatoria = parseFloat(document.getElementById('fase_obligatoria').value);

    if (isNaN(bachillerato) || isNaN(faseObligatoria)) {
        alert('Introduce la nota de bachillerato y la fase obligatoria antes de calcular.');
        return;
    }

    if (bachillerato < 0 || bachillerato > 10 || faseObligatoria < 0 || faseObligatoria > 10) {
        alert('Las notas deben estar entre 0 y 10.');
        return;
    }

    const notaAcceso = (bachillerato * 0.6) + (faseObligatoria * 0.4);

    // Recoger las 4 asignaturas voluntarias
    let contribuciones = [];
    for (let i = 1; i <= 4; i++) {
        const nota = parseFloat(document.getElementById('nota' + i).value);
        const pond = parseFloat(document.getElementById('pond' + i).value);
        if (!isNaN(nota) && nota >= 0 && nota <= 10 && pond > 0) {
            contribuciones.push(nota * pond);
        }
    }

    // Solo las 2 mejores ponderaciones
    contribuciones.sort((a, b) => b - a);
    const top2 = contribuciones.slice(0, 2);
    const notaExtra = top2.reduce((sum, val) => sum + val, 0);

    const notaFinal = notaAcceso + notaExtra;

    // Mensaje según nota final
    const msgEl = document.getElementById('popup-mensaje');
    if (notaFinal >= 12) {
        msgEl.textContent = '🎉 Excelente — puedes optar a las carreras más competitivas.';
        msgEl.style.color = '#4ecb71';
    } else if (notaFinal >= 10) {
        msgEl.textContent = '👍 Muy buena nota — tienes muchas opciones.';
        msgEl.style.color = 'var(--azul-neon)';
    } else if (notaFinal >= 8) {
        msgEl.textContent = '📚 Buena nota — consulta las notas de corte de tu carrera.';
        msgEl.style.color = '#ffc845';
    } else {
        msgEl.textContent = '⚠️ Revisa si necesitas mejorar para tu carrera objetivo.';
        msgEl.style.color = '#e05252';
    }

    animarContador('resultado-acceso', notaAcceso, 800);
    animarContador('resultado-extra', notaExtra, 800);
    animarContador('resultado-final', notaFinal, 800);

    document.getElementById('popup-overlay').style.display = 'flex';
}

function cerrarPopup() {
    document.getElementById('popup-overlay').style.display = 'none';
}

function animarContador(elementoId, valorFinal, duracion) {
    let inicio = 0;
    const incremento = valorFinal / (duracion / 16);
    const intervalo = setInterval(() => {
        inicio += incremento;
        if (inicio >= valorFinal) {
            inicio = valorFinal;
            clearInterval(intervalo);
        }
        document.getElementById(elementoId).textContent = inicio.toFixed(3);
    }, 16);
}