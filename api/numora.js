/**
 * AnualPrint - Funcion Vercel: /api/numora
 * Numora es el asesor interno de AnualPrint.
 * Funciona con reglas locales y analisis basico del dashboard.
 * No llama APIs externas ni requiere variables de entorno.
 */

const MAX_MSG_LEN = 800;
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function json(res, status, payload) {
  return res.status(status).json(payload);
}

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (_) {
      return {};
    }
  }
  return req.body;
}

function cleanText(value, max = MAX_MSG_LEN) {
  return String(value || '').trim().slice(0, max);
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function money(value, currency = 'PEN') {
  const symbol = currency === 'USD' ? '$' : 'S/';
  return `${symbol} ${toNumber(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function normalizeContext(context = {}) {
  const ventas = Array.isArray(context.ventas) ? context.ventas.slice(0, 12).map(toNumber) : Array(12).fill(0);
  const compras = Array.isArray(context.compras) ? context.compras.slice(0, 12).map(toNumber) : Array(12).fill(0);
  const gastos = Array.isArray(context.gastos) ? context.gastos.slice(0, 12).map(toNumber) : Array(12).fill(0);
  while (ventas.length < 12) ventas.push(0);
  while (compras.length < 12) compras.push(0);
  while (gastos.length < 12) gastos.push(0);

  const totalVentas = toNumber(context.totalVentas ?? ventas.reduce((a, b) => a + b, 0));
  const totalCompras = toNumber(context.totalCompras ?? compras.reduce((a, b) => a + b, 0));
  const totalGastos = toNumber(context.totalGastos ?? gastos.reduce((a, b) => a + b, 0));
  const utilidadBruta = toNumber(context.utilidadBruta ?? (totalVentas - totalCompras));
  const utilidadNeta = toNumber(context.utilidadNeta ?? (utilidadBruta - totalGastos));
  const margenBruto = totalVentas > 0 ? toNumber(context.margenBruto ?? context.margen ?? (utilidadBruta / totalVentas * 100)) : 0;
  const margenNeto = totalVentas > 0 ? toNumber(context.margenNeto ?? (utilidadNeta / totalVentas * 100)) : 0;

  return {
    year: Number.parseInt(context.year, 10) || new Date().getFullYear(),
    currency: context.currency === 'USD' ? 'USD' : 'PEN',
    ventas,
    compras,
    gastos,
    totalVentas,
    totalCompras,
    totalGastos,
    utilidadBruta,
    utilidadNeta,
    margenBruto,
    margenNeto,
    margen: margenBruto,
    hasLoadedReport: Boolean(context.hasLoadedReport),
    reportTitle: cleanText(context.reportTitle, 120)
  };
}

function allZero(ctx) {
  return ctx.totalVentas === 0 && ctx.totalCompras === 0 && ctx.totalGastos === 0;
}

function indexOfMax(values) {
  let index = 0;
  let max = Number.NEGATIVE_INFINITY;
  values.forEach((value, i) => {
    if (value > max) {
      max = value;
      index = i;
    }
  });
  return index;
}

function monthlyUtilities(ctx) {
  return ctx.ventas.map((venta, index) => toNumber(venta - ctx.compras[index]));
}

function monthlyNetUtilities(ctx) {
  return ctx.ventas.map((venta, index) => toNumber(venta - ctx.compras[index] - ctx.gastos[index]));
}

function negativeUtilityMonths(ctx) {
  return monthlyNetUtilities(ctx)
    .map((value, index) => ({ value, month: MONTHS[index] }))
    .filter((item) => item.value < 0);
}

function highExpenseMonths(ctx) {
  return ctx.gastos
    .map((value, index) => ({
      value,
      month: MONTHS[index],
      ratio: ctx.ventas[index] > 0 ? value / ctx.ventas[index] : 0
    }))
    .filter((item) => item.ratio > 0.35);
}

function resultStatus(ctx) {
  if (ctx.utilidadNeta < 0) return 'negativo';
  if (ctx.margenBruto < 15) return 'bajo';
  if (ctx.margenBruto < 30) return 'moderado';
  return 'saludable';
}

function analyzeDashboard(ctx) {
  if (allZero(ctx)) {
    return 'Aun no hay datos registrados para este ano. Para obtener un analisis, ingresa tus ventas, compras y gastos en **Registro de Datos**. Te recomiendo comenzar con enero o con el periodo que tengas disponible.';
  }
  const status = resultStatus(ctx);
  const bestSalesMonth = MONTHS[indexOfMax(ctx.ventas)];
  const bestPurchaseMonth = MONTHS[indexOfMax(ctx.compras)];
  const negativeMonths = negativeUtilityMonths(ctx);
  const bestExpenseMonth = MONTHS[indexOfMax(ctx.gastos)];
  const expenseMonths = highExpenseMonths(ctx);
  const updatedLines = [
    `En el ano ${ctx.year} tienes:`,
    `1. Ventas totales: **${money(ctx.totalVentas, ctx.currency)}**.`,
    `2. Compras totales: **${money(ctx.totalCompras, ctx.currency)}**.`,
    `3. Gastos totales: **${money(ctx.totalGastos, ctx.currency)}**.`,
    `4. Utilidad bruta: **${money(ctx.utilidadBruta, ctx.currency)}**.`,
    `5. Utilidad neta: **${money(ctx.utilidadNeta, ctx.currency)}**.`,
    `6. Margen bruto: **${ctx.margenBruto.toFixed(2)}%**.`,
    '',
    status === 'negativo'
      ? 'La utilidad neta es negativa. Revisa compras y gastos del periodo, especialmente los meses donde compras + gastos superan ventas.'
      : status === 'bajo'
        ? 'El margen bruto es bajo. Podrias revisar precios, costos de compra o meses con menor rentabilidad.'
        : status === 'moderado'
          ? 'El resultado neto es positivo, pero todavia hay espacio para mejorar el margen revisando costos, gastos y meses con menor rendimiento.'
          : 'El resultado neto es positivo. Puedes usar este reporte para comparar si este comportamiento se mantiene en los siguientes meses.',
    '',
    `Mes con mayores ventas: **${bestSalesMonth}**.`,
    `Mes con mayores compras: **${bestPurchaseMonth}**.`,
    `Mes con mayores gastos: **${bestExpenseMonth}**.`
  ];
  if (negativeMonths.length) {
    updatedLines.push(`Meses con utilidad neta negativa: **${negativeMonths.map((item) => item.month).join(', ')}**.`);
  }
  if (expenseMonths.length) {
    updatedLines.push(`Meses con gastos altos respecto a ventas: **${expenseMonths.map((item) => item.month).join(', ')}**.`);
  }
  return updatedLines.join('\n');

}

function replyForIntent(message, ctx) {
  const text = normalizeText(message);
  const has = (...items) => items.some((item) => text.includes(normalizeText(item)));

  if (has('diferencia entre compras y gastos', 'compras y gastos', 'compras vs gastos')) {
    return 'En AnualPrint, las compras representan costos directos relacionados con la adquisicion de productos, insumos o mercaderia. Los gastos representan desembolsos operativos o administrativos, como servicios, alquileres, sueldos u otros gastos del negocio.';
  }

  if (has('que son los gastos', 'que es gasto', 'gastos operativos', 'gasto operativo')) {
    return 'Los **gastos** son desembolsos operativos o administrativos que no se registran como compras directas: servicios, alquileres, sueldos, mantenimiento, comisiones u otros gastos del negocio. En AnualPrint reducen la utilidad neta.';
  }

  if (has('registrar gastos', 'ingresar gastos', 'guiame para registrar gastos', 'guia me para registrar gastos')) {
    return 'Para registrar gastos:\n1. Abre **Registro de Datos**.\n2. Ubica la columna **Gastos**.\n3. Ingresa gastos operativos o administrativos por mes.\n4. AnualPrint recalculara automaticamente utilidad neta y margen.';
  }

  if (has('utilidad neta negativa', 'neta negativa', 'por que mi utilidad neta es negativa', 'porque mi utilidad neta es negativa', 'perdida neta', 'por que mi utilidad neta bajo', 'porque mi utilidad neta bajo')) {
    if (ctx.utilidadNeta >= 0) {
      return `Con los datos actuales tu utilidad neta no es negativa: es **${money(ctx.utilidadNeta, ctx.currency)}**. Si baja, normalmente se debe a mayores compras directas, mayores gastos operativos o menores ventas.`;
    }
    return `Tu utilidad neta es negativa porque ventas menos compras y gastos da **${money(ctx.utilidadNeta, ctx.currency)}**. Datos actuales: ventas **${money(ctx.totalVentas, ctx.currency)}**, compras **${money(ctx.totalCompras, ctx.currency)}** y gastos **${money(ctx.totalGastos, ctx.currency)}**. Revisa meses con gastos altos y meses donde compras + gastos superan ventas.`;
  }

  if (has('analiza mi utilidad neta', 'analizar utilidad neta')) {
    if (allZero(ctx)) return 'Aun no hay datos registrados. Ingresa ventas, compras y gastos para analizar tu utilidad neta.';
    const base = `Tu utilidad neta actual es **${money(ctx.utilidadNeta, ctx.currency)}**. Se calcula desde ventas **${money(ctx.totalVentas, ctx.currency)}** menos compras **${money(ctx.totalCompras, ctx.currency)}** y gastos **${money(ctx.totalGastos, ctx.currency)}**.`;
    return ctx.utilidadNeta < 0
      ? `${base} El resultado neto es negativo; revisa meses con gastos altos o compras que superen las ventas.`
      : `${base} El resultado neto del periodo es positivo.`;
  }

  if (has('que es utilidad neta', 'utilidad neta', 'resultado neto')) {
    return `La **utilidad neta** es el resultado final despues de restar compras y gastos a las ventas. En AnualPrint se calcula como: **ventas - compras - gastos**. Con tus datos actuales es **${money(ctx.utilidadNeta, ctx.currency)}**.`;
  }

  if (has('diferencia entre utilidad bruta y utilidad neta', 'bruta y neta')) {
    return 'La **utilidad bruta** mide ventas menos compras directas. La **utilidad neta** descuenta ademas los gastos operativos. Por eso la utilidad neta puede ser menor que la utilidad bruta.';
  }

  if (has('que hago primero', 'primer paso', 'empezar', 'inicio', 'como empiezo', 'nuevo usuario')) {
    return 'Primero ve a **Registro de Datos**. Ingresa las ventas, compras y gastos de cada mes. Luego revisa la **Vista General** para ver totales, utilidad bruta, utilidad neta y margen bruto. Finalmente usa **Guardar reporte** para consultarlo despues.';
  }

  if (has('registrar datos', 'ingresar datos', 'registro de datos', 'registrar ventas', 'registrar compras', 'ventas y compras', 'guia me para registrar', 'guiame para registrar')) {
    return 'Para registrar datos:\n1. Abre **Registro de Datos**.\n2. Selecciona el ano y la moneda correcta.\n3. Ingresa ventas, compras y gastos por cada mes.\n4. Al salir del campo, el monto se formatea automaticamente.\n5. Revisa utilidad bruta, utilidad neta y margen bruto en la misma tabla.';
  }

  if (has('margen bruto', 'margen', 'rentabilidad', 'porcentaje')) {
    return 'El **margen bruto** indica que porcentaje de tus ventas queda como utilidad bruta despues de restar compras.\n\n**Margen bruto = Utilidad bruta / Ventas x 100**.\n\nLos gastos afectan la utilidad neta, no el margen bruto.';
  }

  if (has('que hago primero', 'primer paso', 'empezar', 'inicio', 'como empiezo', 'nuevo usuario')) {
    return 'Primero ve a **Registro de Datos**. Ingresa las ventas, compras y gastos de cada mes. Luego revisa la **Vista General** para ver totales, utilidad bruta, utilidad neta y margen bruto. Finalmente usa **Guardar reporte** para consultarlo después.';
  }

  if (has('para que sirve', 'que es anualprint', 'anualprint')) {
    return 'AnualPrint sirve para registrar ventas, compras y gastos mensuales, calcular utilidad bruta, utilidad neta y margen bruto, guardar reportes por usuario y generar un informe anual imprimible para revisión financiera.';
  }

  if (has('iniciar sesion', 'login', 'registrarme', 'crear cuenta', 'crear usuario', 'acceder')) {
    return 'Para usar AnualPrint debes iniciar sesión. Si eres nuevo, crea una cuenta con correo y contraseña o usa Google. Una vez dentro, tus reportes se guardan asociados a tu usuario.';
  }

  if (has('registrar datos', 'ingresar datos', 'registro de datos', 'registrar ventas', 'registrar compras', 'ventas y compras', 'guia me para registrar', 'guiame para registrar')) {
    return 'Para registrar datos:\n1. Abre **Registro de Datos**.\n2. Selecciona el año y la moneda correcta.\n3. Ingresa ventas, compras y gastos por cada mes.\n4. Al salir del campo, el monto se formatea automáticamente.\n5. Revisa utilidad bruta, utilidad neta y margen bruto en la misma tabla.';
  }

  if (has('ventas', 'total ventas', 'venta')) {
    return 'Las **ventas** son los ingresos registrados por mes. En AnualPrint se suman para mostrar el total anual, la tendencia de ventas y el comparativo contra compras.';
  }

  if (has('compras', 'total compras', 'compra')) {
    return 'Las **compras** representan costos directos o adquisiciones registradas por mes. AnualPrint las compara con ventas para calcular utilidad bruta y margen bruto; los gastos se descuentan luego para obtener utilidad neta.';
  }

  if (has('utilidad bruta', 'utilidad', 'ganancia')) {
    return 'La **utilidad bruta** es la diferencia entre tus ventas y tus compras. En AnualPrint se calcula como:\n\n**Utilidad bruta = Ventas - Compras**.\n\nSi es negativa, significa que las compras superan las ventas en el periodo analizado.';
  }

  if (has('margen', 'rentabilidad', 'porcentaje')) {
    return 'El **margen** indica qué porcentaje de tus ventas queda como utilidad después de restar compras.\n\n**Margen = Utilidad bruta / Ventas × 100**.\n\nSi el margen es bajo, conviene revisar precios, costos de compra o meses con menor rentabilidad.';
  }

  if (has('guardar como nuevo')) {
    return 'Usa **Guardar como nuevo** cuando quieras duplicar el reporte actual con otro nombre. Es útil para crear versiones, escenarios o reportes de otro periodo sin sobrescribir el reporte cargado.';
  }

  if (has('guardar', 'guardar reporte')) {
    return 'Para guardar un reporte:\n1. Verifica que el año, moneda y datos estén correctos.\n2. Haz clic en **Guardar reporte**.\n3. Si es nuevo, escribe un nombre.\n4. Luego podrás verlo en **Mis reportes**.';
  }

  if (has('cargar', 'reportes anteriores', 'mis reportes', 'historial')) {
    return 'Para cargar un reporte anterior:\n1. Abre **Mis reportes**.\n2. Ubica el reporte por nombre, año o moneda.\n3. Haz clic en **Cargar**.\n4. AnualPrint actualizará el año, moneda, datos, KPIs, gráficos y tabla.';
  }

  if (has('renombrar', 'editar nombre', 'cambiar nombre')) {
    return 'Para renombrar un reporte, entra a **Mis reportes** y usa **Editar nombre**. Esto solo cambia el título; no modifica ventas, compras, gastos ni cálculos.';
  }

  if (has('eliminar', 'borrar reporte', 'eliminar reporte')) {
    return 'Para eliminar un reporte, entra a **Mis reportes** y presiona **Eliminar**. La app pedirá confirmación porque esa acción borra el reporte guardado.';
  }

  if (has('imprimir', 'pdf', 'generar informe', 'generar un informe', 'informe', 'reporte imprimible')) {
    return 'Para generar el informe:\n1. Revisa que tus datos estén completos.\n2. Haz clic en **Imprimir Reporte**.\n3. Se abrirá una versión formal del reporte.\n4. Desde el navegador puedes imprimirlo o guardarlo como PDF.';
  }

  if (has('como voy', 'cómo voy', 'resultado', 'resultados', 'analisis', 'análisis', 'dashboard', 'avance anual', 'revisa mi avance', 'explicame mi dashboard', 'explícame mi dashboard')) {
    return analyzeDashboard(ctx);
  }

  if (has('cambiar de año', 'cambiar año', 'seleccionar año', 'selector año', 'ano', 'año', 'periodo')) {
    return 'Para cambiar de año, usa el selector **Año** en la cabecera. Cada año tiene sus propios datos. Si el año no tiene información registrada, iniciará en cero.';
  }

  if (has('moneda', 'soles', 'dolares', 'dólares', 'pen', 'usd')) {
    return 'Para cambiar moneda, usa **S/ Soles** o **$ Dólares** en la cabecera. Esto cambia la moneda de visualización del dashboard y del informe.';
  }

  if (has('modo normal', 'modo nocturno', 'tema', 'oscuro', 'claro')) {
    return 'Para cambiar el tema, usa el selector **Tema**. Puedes elegir **Modo normal** o **Modo nocturno**. La preferencia queda guardada en tu navegador.';
  }

  if (has('datos en cero', 'cero', 'sin datos', 'no hay datos', 'no hay operaciones')) {
    return 'Aún no hay datos registrados. Te recomiendo comenzar ingresando ventas, compras y gastos del mes de enero o del periodo que tengas disponible en **Registro de Datos**.';
  }

  if (has('comparativo mensual', 'comparar meses', 'tendencia', 'distribucion', 'distribución')) {
    return 'El comparativo mensual permite ver cómo se comportan ventas, compras y gastos mes a mes. La tendencia ayuda a identificar crecimiento o caída. La distribución anual muestra compras, gastos y utilidad neta del periodo.';
  }

  if (has('utilidad negativa', 'negativa', 'perdida', 'pérdida')) {
    const negativeMonths = negativeUtilityMonths(ctx);
    if (!negativeMonths.length) return 'No detecto meses con utilidad negativa en los datos actuales. Si luego registras compras mayores a ventas, AnualPrint lo resaltará para que revises esos meses.';
    return `Detecto utilidad negativa en: **${negativeMonths.map((item) => item.month).join(', ')}**. Tus compras superan tus ventas en esos meses. Revisa si corresponden a inversión, inventario o exceso de costos.`;
  }

  return 'Puedo ayudarte principalmente con el uso de AnualPrint, registro de datos, reportes, ventas, compras, gastos, utilidad bruta, utilidad neta, margen y análisis financiero básico dentro de la aplicación.';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Método no permitido. Usa POST.' });
  }

  const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
  if (!String(authHeader).startsWith('Bearer ')) {
    return json(res, 401, { error: 'Para usar Númora, inicia sesión.' });
  }

  const body = getBody(req);
  const message = cleanText(body.message);
  if (!message) return json(res, 400, { error: 'El mensaje no puede estar vacío.' });
  if (String(body.message || '').length > MAX_MSG_LEN) {
    return json(res, 400, { error: `El mensaje supera los ${MAX_MSG_LEN} caracteres.` });
  }

  const ctx = normalizeContext(body.context || {});
  return json(res, 200, {
    reply: replyForIntent(message, ctx),
    mode: 'local'
  });
}
