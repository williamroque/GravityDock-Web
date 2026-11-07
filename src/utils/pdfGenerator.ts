import * as cheerio from 'cheerio';

export interface PdfOptions {
    pageSize?: string;
    orientation?: string;
    marginTop?: number;
    marginBottom?: number;
    marginLeft?: number;
    marginRight?: number;
    fontFamily?: string;
    fontSize?: number;
    lineHeight?: number;
    title?: string;
    author?: string;
    includeHeader?: boolean;
    headerText?: string;
    includeFooter?: boolean;
    footerText?: string;
}

export interface PdfResult {
    bytes: Uint8Array;
    base64Uri: string;
    pdfString: string;
    pageCount: number;
    byteLength: number;
}

interface PageDimensions {
    width: number;
    height: number;
}

const PAGE_SIZES: Record<string, PageDimensions> = {
    'A4': { width: 595.28, height: 841.89 },
    'Letter': { width: 612.0, height: 792.0 },
    'Legal': { width: 612.0, height: 1008.0 },
    'A3': { width: 841.89, height: 1190.55 },
    'A5': { width: 420.94, height: 595.28 }
};

function getPageDimensions(size: string, orientation: string): PageDimensions {
    const base = PAGE_SIZES[size] || PAGE_SIZES['A4'];
    if (orientation.toLowerCase() === 'landscape') {
        return { width: base.height, height: base.width };
    }
    return { width: base.width, height: base.height };
}

function escapePdfString(str: string): string {
    let result = '';
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const code = str.charCodeAt(i);
        if (char === '\\') {
            result += '\\\\';
        } else if (char === '(') {
            result += '\\(';
        } else if (char === ')') {
            result += '\\)';
        } else if (code >= 32 && code <= 126) {
            result += char;
        } else if (code >= 160 && code <= 255) {
            result += '\\' + code.toString(8).padStart(3, '0');
        } else if (char === '\n' || char === '\r' || char === '\t') {
            result += ' ';
        } else {
            result += '?';
        }
    }
    return result;
}

function resolveFontFamily(family?: string) {
    const raw = (family || 'Helvetica').trim().toLowerCase();
    if (raw.includes('courier') || raw.includes('mono') || raw.includes('code') || raw.includes('consolas')) {
        return {
            isCourier: true,
            isTimes: false,
            regular: '/F4',
            bold: '/F5',
            italic: '/F6'
        };
    }
    if (raw.includes('times') || raw.includes('serif') || raw.includes('georgia') || raw.includes('garamond') || raw.includes('roman')) {
        return {
            isCourier: false,
            isTimes: true,
            regular: '/F7',
            bold: '/F8',
            italic: '/F9'
        };
    }
    return {
        isCourier: false,
        isTimes: false,
        regular: '/F1',
        bold: '/F2',
        italic: '/F3'
    };
}

function measureCharWidth(char: string, fontSize: number, isCourier: boolean, isTimes: boolean): number {
    if (isCourier) return fontSize * 0.6;
    if (char === ' ') return fontSize * 0.28;
    const narrow = 'ijltrfI1.,:;!\'|';
    if (narrow.includes(char)) return fontSize * 0.28;
    const wide = 'wmABCDEFGHJKLNOPQRSTUVXYZ';
    if (wide.includes(char)) return fontSize * 0.68;
    const extraWide = 'WM@%';
    if (extraWide.includes(char)) return fontSize * 0.85;
    return fontSize * (isTimes ? 0.48 : 0.52);
}

function measureTextWidth(text: string, fontSize: number, isCourier: boolean, isTimes: boolean): number {
    let total = 0;
    for (let i = 0; i < text.length; i++) {
        total += measureCharWidth(text[i], fontSize, isCourier, isTimes);
    }
    return total;
}

function wrapText(text: string, maxWidth: number, fontSize: number, isCourier: boolean, isTimes: boolean): string[] {
    const clean = text.replace(/[\r\n\t]+/g, ' ').trim();
    if (!clean) return [];
    const words = clean.split(' ').filter(Boolean);
    if (words.length === 0) return [];
    const lines: string[] = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const candidate = currentLine + ' ' + word;
        const width = measureTextWidth(candidate, fontSize, isCourier, isTimes);
        if (width <= maxWidth) {
            currentLine = candidate;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
}

interface PageStream {
    commands: string[];
}

export function generatePdfFromHtml(html: string, options: PdfOptions = {}): PdfResult {
    const pageSize = options.pageSize || 'A4';
    const orientation = options.orientation || 'portrait';
    const { width: pageWidth, height: pageHeight } = getPageDimensions(pageSize, orientation);

    const marginTop = options.marginTop !== undefined ? options.marginTop : 36;
    const marginBottom = options.marginBottom !== undefined ? options.marginBottom : 36;
    const marginLeft = options.marginLeft !== undefined ? options.marginLeft : 36;
    const marginRight = options.marginRight !== undefined ? options.marginRight : 36;

    const printableWidth = pageWidth - marginLeft - marginRight;
    const baseFontSize = options.fontSize || 11;
    const lineHeightMult = options.lineHeight || 1.4;

    const fontConfig = resolveFontFamily(options.fontFamily);
    const { isCourier, isTimes, regular: fontRegular, bold: fontBold, italic: fontItalic } = fontConfig;

    const pages: PageStream[] = [];
    let currentCommands: string[] = [];
    let currentY = pageHeight - marginTop;

    const startNewPage = () => {
        if (currentCommands.length > 0) {
            pages.push({ commands: currentCommands });
            currentCommands = [];
        }
        currentY = pageHeight - marginTop;
    };

    const ensureSpace = (neededHeight: number) => {
        if (currentY - neededHeight < marginBottom) {
            startNewPage();
        }
    };

    const addText = (text: string, x: number, y: number, fontRef: string, size: number, r = 0.1, g = 0.1, b = 0.1) => {
        const escaped = escapePdfString(text);
        currentCommands.push(
            'BT',
            `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`,
            `${fontRef} ${size.toFixed(2)} Tf`,
            `${x.toFixed(2)} ${y.toFixed(2)} Td`,
            `(${escaped}) Tj`,
            'ET'
        );
    };

    const addRect = (x: number, y: number, w: number, h: number, r: number, g: number, b: number, fill = true) => {
        if (fill) {
            currentCommands.push(
                `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`,
                `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`,
                'f'
            );
        } else {
            currentCommands.push(
                `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`,
                `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`,
                's'
            );
        }
    };

    const addLine = (x1: number, y1: number, x2: number, y2: number, lineWidth = 0.5, r = 0.8, g = 0.8, b = 0.8) => {
        currentCommands.push(
            `${lineWidth.toFixed(2)} w`,
            `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`,
            `${x1.toFixed(2)} ${y1.toFixed(2)} m`,
            `${x2.toFixed(2)} ${y2.toFixed(2)} l`,
            'S'
        );
    };

    const renderParagraph = (text: string, fontRef = fontRegular, size = baseFontSize, isBlockquote = false) => {
        const clean = text.replace(/[\r\n\t]+/g, ' ').trim();
        if (!clean) return;

        const indent = isBlockquote ? 14 : 0;
        const availableW = printableWidth - indent;
        const lines = wrapText(clean, availableW, size, isCourier, isTimes);
        const lineH = size * lineHeightMult;
        const totalH = lines.length * lineH + 6;

        ensureSpace(totalH);

        if (isBlockquote) {
            addLine(marginLeft + 4, currentY + 2, marginLeft + 4, currentY - totalH + 8, 2, 0.4, 0.4, 0.9);
        }

        for (const line of lines) {
            addText(line, marginLeft + indent, currentY - size, fontRef, size, 0.15, 0.15, 0.15);
            currentY -= lineH;
        }
        currentY -= 6;
    };

    const renderHeading = (text: string, sizeMultiplier: number) => {
        const clean = text.replace(/[\r\n\t]+/g, ' ').trim();
        if (!clean) return;

        const size = baseFontSize * sizeMultiplier;
        const lines = wrapText(clean, printableWidth, size, isCourier, isTimes);
        const lineH = size * 1.25;
        const totalH = lines.length * lineH + 10;

        ensureSpace(totalH);
        currentY -= 6;

        for (const line of lines) {
            addText(line, marginLeft, currentY - size, fontBold, size, 0.05, 0.05, 0.05);
            currentY -= lineH;
        }
        currentY -= 4;
    };

    const renderCodeBlock = (code: string) => {
        const lines = code.split('\n');
        const codeSize = Math.max(8, baseFontSize * 0.85);
        const lineH = codeSize * 1.35;
        const pad = 6;

        for (const rawLine of lines) {
            ensureSpace(lineH + pad);
            const line = rawLine.replace(/\t/g, '    ');
            addRect(marginLeft, currentY - lineH, printableWidth, lineH, 0.95, 0.96, 0.98, true);
            addText(line, marginLeft + pad, currentY - codeSize, fontRegular, codeSize, 0.2, 0.2, 0.3);
            currentY -= lineH;
        }
        currentY -= 8;
    };

    const renderListItem = (text: string, bullet: string) => {
        const clean = text.replace(/[\r\n\t]+/g, ' ').trim();
        if (!clean) return;

        const indent = 16;
        const availableW = printableWidth - indent;
        const lines = wrapText(clean, availableW, baseFontSize, isCourier, isTimes);
        const lineH = baseFontSize * lineHeightMult;
        const totalH = lines.length * lineH + 4;

        ensureSpace(totalH);

        addText(bullet, marginLeft + 2, currentY - baseFontSize, fontBold, baseFontSize, 0.25, 0.25, 0.25);

        for (let i = 0; i < lines.length; i++) {
            addText(lines[i], marginLeft + indent, currentY - baseFontSize, fontRegular, baseFontSize, 0.15, 0.15, 0.15);
            currentY -= lineH;
        }
        currentY -= 3;
    };

    const renderTable = ($table: cheerio.Cheerio<any>, $: cheerio.CheerioAPI) => {
        const rows: string[][] = [];
        const isHeaderRow: boolean[] = [];

        $table.find('tr').each((_, tr) => {
            const cols: string[] = [];
            const isTh = $(tr).find('th').length > 0;
            $(tr).find('th, td').each((__, td) => {
                cols.push($(td).text().replace(/[\r\n\t]+/g, ' ').trim());
            });
            if (cols.length > 0) {
                rows.push(cols);
                isHeaderRow.push(isTh);
            }
        });

        if (rows.length === 0) return;

        const colCount = Math.max(...rows.map(r => r.length));
        const colW = printableWidth / colCount;
        const cellPad = 4;
        const tableFontSize = Math.max(8, baseFontSize * 0.9);
        const cellLineH = tableFontSize * 1.3;

        for (let rIdx = 0; rIdx < rows.length; rIdx++) {
            const row = rows[rIdx];
            const isHdr = isHeaderRow[rIdx];
            const rowH = cellLineH + (cellPad * 2);

            ensureSpace(rowH + 2);

            if (isHdr) {
                addRect(marginLeft, currentY - rowH, printableWidth, rowH, 0.92, 0.94, 0.97, true);
            } else if (rIdx % 2 === 1) {
                addRect(marginLeft, currentY - rowH, printableWidth, rowH, 0.97, 0.98, 0.99, true);
            }

            for (let cIdx = 0; cIdx < colCount; cIdx++) {
                const cellText = row[cIdx] || '';
                const cellX = marginLeft + (cIdx * colW);
                const truncated = wrapText(cellText, colW - (cellPad * 2), tableFontSize, isCourier, isTimes)[0] || '';
                const font = isHdr ? fontBold : fontRegular;
                addText(truncated, cellX + cellPad, currentY - cellPad - tableFontSize, font, tableFontSize, 0.15, 0.15, 0.15);
                addLine(cellX, currentY, cellX, currentY - rowH, 0.5, 0.85, 0.88, 0.92);
            }
            addLine(marginLeft + printableWidth, currentY, marginLeft + printableWidth, currentY - rowH, 0.5, 0.85, 0.88, 0.92);
            addLine(marginLeft, currentY - rowH, marginLeft + printableWidth, currentY - rowH, 0.5, 0.85, 0.88, 0.92);

            currentY -= rowH;
        }
        currentY -= 8;
    };

    const docTitle = options.title || '';
    if (docTitle) {
        renderHeading(docTitle, 2.0);
        addLine(marginLeft, currentY, marginLeft + printableWidth, currentY, 1, 0.3, 0.4, 0.8);
        currentY -= 12;
    }

    try {
        const $ = cheerio.load(html);

        $('script, style, noscript').remove();

        const titleTag = $('title').text().trim();
        if (!docTitle && titleTag) {
            renderHeading(titleTag, 1.8);
            addLine(marginLeft, currentY, marginLeft + printableWidth, currentY, 1, 0.3, 0.4, 0.8);
            currentY -= 12;
        }

        const rootElements = $('body').children().length > 0 ? $('body').children() : $.root().children();

        const traverseNode = (el: any) => {
            const tagName = el.tagName ? el.tagName.toLowerCase() : '';

            if (['h1'].includes(tagName)) {
                renderHeading($(el).text(), 1.6);
            } else if (['h2'].includes(tagName)) {
                renderHeading($(el).text(), 1.4);
            } else if (['h3'].includes(tagName)) {
                renderHeading($(el).text(), 1.25);
            } else if (['h4', 'h5', 'h6'].includes(tagName)) {
                renderHeading($(el).text(), 1.1);
            } else if (tagName === 'p') {
                renderParagraph($(el).text());
            } else if (tagName === 'blockquote') {
                renderParagraph($(el).text(), fontItalic, baseFontSize, true);
            } else if (tagName === 'pre') {
                renderCodeBlock($(el).text());
            } else if (tagName === 'hr') {
                ensureSpace(16);
                addLine(marginLeft, currentY - 6, marginLeft + printableWidth, currentY - 6, 0.5, 0.8, 0.85, 0.9);
                currentY -= 14;
            } else if (tagName === 'ul') {
                $(el).find('> li').each((_, li) => {
                    renderListItem($(li).text(), '•');
                });
                currentY -= 4;
            } else if (tagName === 'ol') {
                $(el).find('> li').each((idx, li) => {
                    renderListItem($(li).text(), `${idx + 1}.`);
                });
                currentY -= 4;
            } else if (tagName === 'table') {
                renderTable($(el), $);
            } else if (['div', 'section', 'article', 'main'].includes(tagName)) {
                $(el).children().each((_, child) => {
                    traverseNode(child);
                });
            } else {
                const text = $(el).text().trim();
                if (text && $(el).children().length === 0) {
                    renderParagraph(text);
                } else {
                    $(el).children().each((_, child) => traverseNode(child));
                }
            }
        };

        rootElements.each((_, el) => {
            traverseNode(el);
        });
    } catch {
        const plainLines = html.split('\n');
        for (const l of plainLines) {
            renderParagraph(l);
        }
    }

    if (currentCommands.length > 0) {
        pages.push({ commands: currentCommands });
        currentCommands = [];
    }
    if (pages.length === 0) {
        pages.push({ commands: [] });
    }

    const totalPages = pages.length;

    for (let pIdx = 0; pIdx < totalPages; pIdx++) {
        const page = pages[pIdx];
        const pageNum = pIdx + 1;

        if (options.includeHeader && options.headerText) {
            const hText = options.headerText
                .replace('{page}', String(pageNum))
                .replace('{total}', String(totalPages))
                .replace('{title}', docTitle || 'Document');
            const hEscaped = escapePdfString(hText);
            const headerY = pageHeight - (marginTop / 2);
            page.commands.push(
                'BT',
                '0.400 0.400 0.400 rg',
                `${fontRegular} 9.00 Tf`,
                `${marginLeft.toFixed(2)} ${headerY.toFixed(2)} Td`,
                `(${hEscaped}) Tj`,
                'ET',
                `0.50 w 0.850 0.850 0.850 RG ${marginLeft.toFixed(2)} ${(pageHeight - marginTop + 6).toFixed(2)} m ${(pageWidth - marginRight).toFixed(2)} ${(pageHeight - marginTop + 6).toFixed(2)} l S`
            );
        }

        if (options.includeFooter !== false) {
            const fTemplate = options.footerText || 'Page {page} of {total}';
            const fText = fTemplate
                .replace('{page}', String(pageNum))
                .replace('{total}', String(totalPages))
                .replace('{title}', docTitle || 'Document');
            const fEscaped = escapePdfString(fText);
            const footerY = marginBottom / 2;
            const textW = measureTextWidth(fText, 9, isCourier, isTimes);
            const footerX = pageWidth - marginRight - textW;

            page.commands.push(
                'BT',
                '0.400 0.400 0.400 rg',
                `${fontRegular} 9.00 Tf`,
                `${footerX.toFixed(2)} ${footerY.toFixed(2)} Td`,
                `(${fEscaped}) Tj`,
                'ET',
                `0.50 w 0.850 0.850 0.850 RG ${marginLeft.toFixed(2)} ${(marginBottom - 4).toFixed(2)} m ${(pageWidth - marginRight).toFixed(2)} ${(marginBottom - 4).toFixed(2)} l S`
            );
        }
    }

    const objects: string[] = [];

    objects.push('<< /Type /Catalog /Pages 2 0 R >>');

    const pageObjStart = 3;
    const pageObjIds: number[] = [];
    for (let i = 0; i < totalPages; i++) {
        pageObjIds.push(pageObjStart + (i * 2));
    }
    const kidsStr = pageObjIds.map(id => `${id} 0 R`).join(' ');
    objects.push(`<< /Type /Pages /Kids [${kidsStr}] /Count ${totalPages} >>`);

    const fontStart = pageObjStart + (totalPages * 2);
    const fonts = [
        { id: '/F1', base: 'Helvetica' },
        { id: '/F2', base: 'Helvetica-Bold' },
        { id: '/F3', base: 'Helvetica-Oblique' },
        { id: '/F4', base: 'Courier' },
        { id: '/F5', base: 'Courier-Bold' },
        { id: '/F6', base: 'Courier-Oblique' },
        { id: '/F7', base: 'Times-Roman' },
        { id: '/F8', base: 'Times-Bold' },
        { id: '/F9', base: 'Times-Italic' }
    ];

    let fontDictStr = '';
    fonts.forEach((f, idx) => {
        fontDictStr += `${f.id} ${fontStart + idx} 0 R `;
    });

    for (let i = 0; i < totalPages; i++) {
        const contentObjId = pageObjStart + (i * 2) + 1;
        objects.push(
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /Font << ${fontDictStr}>> /ProcSet [/PDF /Text] >> /Contents ${contentObjId} 0 R >>`
        );
        const streamData = pages[i].commands.join('\n') + '\n';
        objects.push(
            `<< /Length ${streamData.length} >>\nstream\n${streamData}endstream`
        );
    }

    for (const f of fonts) {
        objects.push(
            `<< /Type /Font /Subtype /Type1 /BaseFont /${f.base} /Encoding /WinAnsiEncoding >>`
        );
    }

    const infoObjId = fontStart + fonts.length;
    const now = new Date();
    const dateStr = 'D:' + now.toISOString().replace(/[-:T]/g, '').slice(0, 14) + 'Z';
    const authorStr = escapePdfString(options.author || 'Gravity Dock');
    const titleMetaStr = escapePdfString(docTitle || 'Document');
    objects.push(
        `<< /Title (${titleMetaStr}) /Author (${authorStr}) /Creator (Gravity Dock Web Package) /CreationDate (${dateStr}) >>`
    );

    let pdf = '%PDF-1.4\n%GravityDock\n';
    const offsets: number[] = [];

    for (let i = 0; i < objects.length; i++) {
        offsets.push(pdf.length);
        pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    }

    const xrefOffset = pdf.length;
    pdf += `xref\r\n0 ${objects.length + 1}\r\n`;
    pdf += '0000000000 65535 f \r\n';

    for (let i = 0; i < objects.length; i++) {
        const offStr = String(offsets[i]).padStart(10, '0');
        pdf += `${offStr} 00000 n \r\n`;
    }

    pdf += `trailer\r\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoObjId} 0 R >>\r\nstartxref\r\n${xrefOffset}\r\n%%EOF\r\n`;

    const bytes = new TextEncoder().encode(pdf);

    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    const base64Uri = 'data:application/pdf;base64,' + btoa(binary);

    return {
        bytes,
        base64Uri,
        pdfString: pdf,
        pageCount: totalPages,
        byteLength: len
    };
}
