// Inyección de un gráfico NATIVO y editable de Excel dentro de un .xlsx ya
// generado por ExcelJS. ExcelJS no sabe crear gráficos, así que abrimos el zip
// del .xlsx (con JSZip, que ya viene como dependencia de exceljs) y agregamos a
// mano las partes OOXML del gráfico: chart1.xml + drawing1.xml + sus rels, y
// parchamos [Content_Types].xml y la hoja para que Excel lo muestre.
//
// El gráfico queda enlazado a las celdas de la hoja: es un gráfico real de
// Excel, editable (cambiar tipo, colores, series), NO una imagen y NO dinámico.

export type ExcelChartSeriesType = "bar" | "line";

export interface ResolvedChartSeries {
  name: string;
  type: ExcelChartSeriesType;
  colLetter: string; // columna de los valores en la hoja (ej. "C")
  values: number[];
}

export interface InjectChartOptions {
  sheetName: string;
  nDataRows: number; // filas de datos (sin contar el encabezado)
  categoryColLetter: string;
  categories: string[];
  series: ResolvedChartSeries[];
  title?: string;
}

const NS_C = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_XDR = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const CAT_AX_ID = "111111111";
const VAL_AX_ID = "222222222";
const CAT_AX_ID2 = "333333333"; // eje X secundario (oculto), para las líneas
const VAL_AX_ID2 = "444444444"; // eje Y secundario (derecha), para las líneas

export function colLetter(index0: number): string {
  let n = index0 + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Nombre de hoja citado para fórmulas (siempre entre comillas simples: seguro
// aunque tenga espacios; una comilla simple interna se duplica).
function sheetRef(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

function buildChartXml(o: InjectChartOptions): string {
  const sh = sheetRef(o.sheetName);
  const n = o.nDataRows;
  const first = 2;
  const last = n + 1;
  const catRange = `${sh}!$${o.categoryColLetter}$${first}:$${o.categoryColLetter}$${last}`;
  const catPts = o.categories
    .slice(0, n)
    .map((c, i) => `<c:pt idx="${i}"><c:v>${esc(c)}</c:v></c:pt>`)
    .join("");
  const catCacheXml = `<c:strRef><c:f>${catRange}</c:f><c:strCache><c:ptCount val="${n}"/>${catPts}</c:strCache></c:strRef>`;

  const ser = (s: ResolvedChartSeries, idx: number, smooth: boolean): string => {
    const valRange = `${sh}!$${s.colLetter}$${first}:$${s.colLetter}$${last}`;
    const nameRef = `${sh}!$${s.colLetter}$1`;
    const valPts = s.values
      .slice(0, n)
      .map((v, i) => `<c:pt idx="${i}"><c:v>${Number.isFinite(v) ? v : 0}</c:v></c:pt>`)
      .join("");
    return (
      `<c:ser>` +
      `<c:idx val="${idx}"/>` +
      `<c:order val="${idx}"/>` +
      `<c:tx><c:strRef><c:f>${nameRef}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${esc(s.name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>` +
      `<c:cat>${catCacheXml}</c:cat>` +
      `<c:val><c:numRef><c:f>${valRange}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${n}"/>${valPts}</c:numCache></c:numRef></c:val>` +
      (smooth ? `<c:smooth val="0"/>` : ``) +
      `</c:ser>`
    );
  };

  const barSeries = o.series.filter((s) => s.type === "bar");
  const lineSeries = o.series.filter((s) => s.type === "line");
  // Eje secundario (derecha) para las líneas solo cuando conviven con barras
  // (ej. kg en barras + % en líneas): así las dos escalas no se aplastan.
  const dualAxis = barSeries.length > 0 && lineSeries.length > 0;
  const lineCatAx = dualAxis ? CAT_AX_ID2 : CAT_AX_ID;
  const lineValAx = dualAxis ? VAL_AX_ID2 : VAL_AX_ID;

  let idx = 0;
  let barChart = "";
  if (barSeries.length) {
    const sers = barSeries.map((s) => ser(s, idx++, false)).join("");
    barChart =
      `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>` +
      sers +
      `<c:axId val="${CAT_AX_ID}"/><c:axId val="${VAL_AX_ID}"/></c:barChart>`;
  }
  let lineChart = "";
  if (lineSeries.length) {
    const sers = lineSeries.map((s) => ser(s, idx++, true)).join("");
    lineChart =
      `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>` +
      sers +
      `<c:marker val="1"/><c:axId val="${lineCatAx}"/><c:axId val="${lineValAx}"/></c:lineChart>`;
  }

  // Ejes primarios (siempre). Si no hay barras, las líneas usan estos mismos.
  const primaryAxes =
    `<c:catAx><c:axId val="${CAT_AX_ID}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="${VAL_AX_ID}"/></c:catAx>` +
    `<c:valAx><c:axId val="${VAL_AX_ID}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="${CAT_AX_ID}"/></c:valAx>`;
  // Ejes secundarios (solo en combo barras+líneas): valAx a la derecha y un
  // catAx oculto que lo cruza (patrón estándar de eje secundario en OOXML).
  const secondaryAxes = dualAxis
    ? `<c:valAx><c:axId val="${VAL_AX_ID2}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="r"/><c:crossAx val="${CAT_AX_ID2}"/><c:crosses val="max"/></c:valAx>` +
      `<c:catAx><c:axId val="${CAT_AX_ID2}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="1"/><c:axPos val="b"/><c:crossAx val="${VAL_AX_ID2}"/></c:catAx>`
    : ``;

  const title = o.title
    ? `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>${esc(o.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`
    : `<c:autoTitleDeleted val="1"/>`;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}">` +
    `<c:chart>` +
    title +
    `<c:plotArea><c:layout/>` +
    barChart +
    lineChart +
    primaryAxes +
    secondaryAxes +
    `</c:plotArea>` +
    `<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>` +
    `<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>` +
    `</c:chart></c:chartSpace>`
  );
}

function buildDrawingXml(anchorRow: number, nCols: number): string {
  // Ancla el gráfico debajo de la tabla, ocupando ~9 columnas y ~20 filas.
  const fromCol = 0;
  const toCol = Math.max(nCols, 8);
  const fromRow = anchorRow;
  const toRow = anchorRow + 20;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<xdr:wsDr xmlns:xdr="${NS_XDR}" xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:c="${NS_C}">` +
    `<xdr:twoCellAnchor editAs="oneCell">` +
    `<xdr:from><xdr:col>${fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
    `<xdr:to><xdr:col>${toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
    `<xdr:graphicFrame macro="">` +
    `<xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Grafico 1"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
    `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
    `<a:graphic><a:graphicData uri="${NS_C}"><c:chart xmlns:c="${NS_C}" xmlns:r="${NS_R}" r:id="rId1"/></a:graphicData></a:graphic>` +
    `</xdr:graphicFrame><xdr:clientData/>` +
    `</xdr:twoCellAnchor></xdr:wsDr>`
  );
}

// Mapea el NOMBRE de cada hoja a su archivo xl/worksheets/sheetN.xml, leyendo
// xl/workbook.xml (orden + r:id) y xl/_rels/workbook.xml.rels (r:id → target).
// Necesario para un libro con varias hojas: el nombre de hoja no coincide con
// el número de archivo.
function mapSheetFiles(workbookXml: string, relsXml: string): Map<string, string> {
  const relTarget = new Map<string, string>(); // rId → target relativo a xl/
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const tag = m[0];
    const id = /Id="([^"]+)"/.exec(tag)?.[1];
    const type = /Type="([^"]+)"/.exec(tag)?.[1];
    const target = /Target="([^"]+)"/.exec(tag)?.[1];
    if (id && target && type && /worksheet$/.test(type)) relTarget.set(id, target);
  }
  const nameToFile = new Map<string, string>();
  for (const m of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    const tag = m[0];
    const name = /name="([^"]+)"/.exec(tag)?.[1];
    const rid = /r:id="([^"]+)"/.exec(tag)?.[1];
    if (name && rid && relTarget.has(rid)) {
      const target = relTarget.get(rid)!;
      const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
      // El nombre en workbook.xml viene escapado (&amp; etc.); se desescapa para
      // comparar contra el sheetName que nos pasan.
      const clean = name
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
      nameToFile.set(clean, path);
    }
  }
  return nameToFile;
}

/**
 * Inyecta VARIOS gráficos nativos (uno por hoja) en un .xlsx multi-hoja de
 * ExcelJS. Cada gráfico apunta a su hoja por nombre. Devuelve un nuevo buffer;
 * si algo falla, relanza para que el llamador descargue solo-datos como
 * respaldo. Los gráficos cuya hoja no se encuentre se omiten en silencio.
 */
export async function injectChartsIntoXlsx(
  buffer: ArrayBuffer | Uint8Array,
  charts: InjectChartOptions[]
): Promise<ArrayBuffer> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);

  const workbookXml = await zip.file("xl/workbook.xml")!.async("string");
  const wbRelsXml = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  const nameToFile = mapSheetFiles(workbookXml, wbRelsXml);

  const overrides: string[] = [];
  let k = 0;
  for (const opts of charts) {
    const sheetFile = nameToFile.get(opts.sheetName);
    if (!sheetFile) continue; // hoja no encontrada: se omite ese gráfico
    k++;
    const chartName = `chart${k}.xml`;
    const drawingName = `drawing${k}.xml`;
    const nCols = 1 + opts.series.length;
    const anchorRow = opts.nDataRows + 3;
    zip.file(`xl/charts/${chartName}`, buildChartXml(opts));
    zip.file(`xl/drawings/${drawingName}`, buildDrawingXml(anchorRow, Math.max(nCols, 8)));
    zip.file(
      `xl/drawings/_rels/${drawingName}.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="${NS_R}/chart" Target="../charts/${chartName}"/>` +
        `</Relationships>`
    );

    const sheetBase = sheetFile.split("/").pop()!;
    const sheetRelsPath = `xl/worksheets/_rels/${sheetBase}.rels`;
    const relsExisting = zip.file(sheetRelsPath);
    let drawingRelId = "rId1";
    if (relsExisting) {
      const relsXml = await relsExisting.async("string");
      const ids = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
      const next = (ids.length ? Math.max(...ids) : 0) + 1;
      drawingRelId = `rId${next}`;
      const rel = `<Relationship Id="${drawingRelId}" Type="${NS_R}/drawing" Target="../drawings/${drawingName}"/>`;
      zip.file(sheetRelsPath, relsXml.replace("</Relationships>", `${rel}</Relationships>`));
    } else {
      zip.file(
        sheetRelsPath,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="${NS_R}/drawing" Target="../drawings/${drawingName}"/>` +
          `</Relationships>`
      );
    }

    const sheetXml = await zip.file(sheetFile)!.async("string");
    if (!sheetXml.includes("<drawing ")) {
      zip.file(sheetFile, sheetXml.replace("</worksheet>", `<drawing r:id="${drawingRelId}"/></worksheet>`));
    }

    overrides.push(
      `<Override PartName="/xl/drawings/${drawingName}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`,
      `<Override PartName="/xl/charts/${chartName}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`
    );
  }

  if (overrides.length) {
    const ctPath = "[Content_Types].xml";
    const ct = await zip.file(ctPath)!.async("string");
    zip.file(ctPath, ct.replace("</Types>", `${overrides.join("")}</Types>`));
  }

  return zip.generateAsync({ type: "arraybuffer" });
}

/**
 * Inyecta un gráfico nativo en el buffer de un .xlsx generado por ExcelJS.
 * Devuelve un nuevo buffer. Si algo falla, relanza para que el llamador use el
 * buffer original (descarga solo-datos) como respaldo.
 */
export async function injectChartIntoXlsx(
  buffer: ArrayBuffer | Uint8Array,
  opts: InjectChartOptions
): Promise<ArrayBuffer> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);

  // Localiza la primera hoja (xl/worksheets/sheetN.xml).
  const sheetFile = Object.keys(zip.files).find((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f));
  if (!sheetFile) throw new Error("No se encontró la hoja en el .xlsx");
  const sheetBase = sheetFile.split("/").pop()!; // sheet1.xml
  const sheetRelsPath = `xl/worksheets/_rels/${sheetBase}.rels`;

  const nCols = 1 + opts.series.length; // aproximado, solo para el ancho del gráfico
  const anchorRow = opts.nDataRows + 3; // debajo de la tabla
  const chartXml = buildChartXml(opts);
  const drawingXml = buildDrawingXml(anchorRow, Math.max(nCols, 8));

  // 1) Partes nuevas.
  zip.file("xl/charts/chart1.xml", chartXml);
  zip.file("xl/drawings/drawing1.xml", drawingXml);
  zip.file(
    "xl/drawings/_rels/drawing1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${NS_R}/chart" Target="../charts/chart1.xml"/>` +
      `</Relationships>`
  );

  // 2) Rels de la hoja → agrega (o crea) la relación al drawing.
  const relsExisting = zip.file(sheetRelsPath);
  let drawingRelId = "rId1";
  if (relsExisting) {
    const relsXml = await relsExisting.async("string");
    const ids = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
    const next = (ids.length ? Math.max(...ids) : 0) + 1;
    drawingRelId = `rId${next}`;
    const rel = `<Relationship Id="${drawingRelId}" Type="${NS_R}/drawing" Target="../drawings/drawing1.xml"/>`;
    zip.file(sheetRelsPath, relsXml.replace("</Relationships>", `${rel}</Relationships>`));
  } else {
    zip.file(
      sheetRelsPath,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="${NS_R}/drawing" Target="../drawings/drawing1.xml"/>` +
        `</Relationships>`
    );
  }

  // 3) Referencia <drawing> dentro de la hoja (antes de </worksheet>).
  const sheetXml = await zip.file(sheetFile)!.async("string");
  if (!sheetXml.includes("<drawing ")) {
    zip.file(sheetFile, sheetXml.replace("</worksheet>", `<drawing r:id="${drawingRelId}"/></worksheet>`));
  }

  // 4) [Content_Types].xml → registra las partes nuevas.
  const ctPath = "[Content_Types].xml";
  const ct = await zip.file(ctPath)!.async("string");
  const overrides =
    `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` +
    `<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`;
  zip.file(ctPath, ct.replace("</Types>", `${overrides}</Types>`));

  return zip.generateAsync({ type: "arraybuffer" });
}
