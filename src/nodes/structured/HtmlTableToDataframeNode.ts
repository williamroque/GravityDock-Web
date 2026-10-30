import { ExecuteNode } from '@gravitydock/types';
import type { InputDefinition, OutputDefinition, PropertyDefinition } from '@gravitydock/types';
import { WebStructuredCategory } from '../../category';
import * as cheerio from 'cheerio';
import * as aq from 'arquero';

const EMPTY_OUTPUTS = { 'Dataframe': { __arqueroData: [] }, 'Success': false, 'Row Count': 0, 'Error': '', 'Event': true };

export class HtmlTableToDataframeNode extends ExecuteNode {
    readonly typeId = 'web.html-table-to-dataframe';
    readonly displayName = 'HTML Table to Dataframe';
    readonly category = WebStructuredCategory;
    readonly visible = true;

    readonly inputs: InputDefinition[] = [
        { name: 'HTML', acceptsType: 'core:string' }
    ];

    readonly outputs: OutputDefinition[] = [
        { name: 'Dataframe', outputType: 'core:dataframe' },
        { name: 'Success', outputType: 'core:boolean' },
        { name: 'Row Count', outputType: 'core:number' },
        { name: 'Error', outputType: 'core:string' }
    ];

    readonly properties: PropertyDefinition[] = [
        { name: 'tableSelector', label: 'Table Selector', type: 'string', defaultValue: 'table' },
        {
            name: 'headerRow',
            label: 'Header Row',
            type: 'select',
            options: [
                { label: 'First Row', value: 'first' },
                { label: 'None (auto-generate)', value: 'none' }
            ],
            defaultValue: 'first'
        },
        { name: 'stripHtml', label: 'Strip Inner HTML', type: 'boolean', defaultValue: true },
        { name: 'trimValues', label: 'Trim Values', type: 'boolean', defaultValue: true },
        { name: 'inferNumbers', label: 'Infer Numbers', type: 'boolean', defaultValue: true }
    ];

    private cellValue($: cheerio.CheerioAPI, el: any, stripHtml: boolean, trim: boolean, inferNumbers: boolean): string | number {
        const raw = stripHtml ? $(el).text() : ($(el).html() ?? $(el).text());
        const text = trim ? raw.trim() : raw;
        if (inferNumbers && text !== '') {
            const n = Number(text.replace(/,/g, ''));
            if (!isNaN(n)) return n;
        }
        return text;
    }

    async evaluate(inputs: Record<string, any>, properties: Record<string, any>): Promise<Record<string, any>> {
        const html = inputs['HTML'] != null ? String(inputs['HTML']) : '';
        if (!html) return { ...EMPTY_OUTPUTS, 'Error': 'HTML input is empty' };

        const tableSelector = String(properties['tableSelector'] || 'table');
        const headerRow = String(properties['headerRow'] || 'first');
        const stripHtml = properties['stripHtml'] !== false;
        const trim = properties['trimValues'] !== false;
        const inferNumbers = properties['inferNumbers'] !== false;

        try {
            const $ = cheerio.load(html);
            const table = $(tableSelector).first();
            if (!table.length) return { ...EMPTY_OUTPUTS, 'Error': `No element found for selector: "${tableSelector}"` };

            const allRows = table.find('tr').toArray();
            if (allRows.length === 0) return { ...EMPTY_OUTPUTS, 'Error': 'Table has no rows' };

            let headers: string[];
            let dataRowEls: any[];

            if (headerRow === 'first') {
                const headerCells = $(allRows[0]).find('th, td').toArray();
                headers = headerCells.map((el, i) => {
                    const text = $(el).text().trim();
                    return text || `Col${i + 1}`;
                });
                dataRowEls = allRows.slice(1);
            } else {
                const firstRowCellCount = $(allRows[0]).find('th, td').length;
                headers = Array.from({ length: firstRowCellCount }, (_, i) => `Col${i + 1}`);
                dataRowEls = allRows;
            }

            const rows: Record<string, string | number>[] = [];
            for (const rowEl of dataRowEls) {
                const cells = $(rowEl).find('td, th').toArray();
                if (cells.length === 0) continue;
                const record: Record<string, string | number> = {};
                for (let i = 0; i < headers.length; i++) {
                    record[headers[i]] = cells[i]
                        ? this.cellValue($, cells[i], stripHtml, trim, inferNumbers)
                        : '';
                }
                rows.push(record);
            }

            if (rows.length === 0) return { ...EMPTY_OUTPUTS, 'Success': true, 'Error': '' };

            const table2 = aq.from(rows);
            return {
                'Dataframe': { __arqueroData: table2.objects() },
                'Success': true,
                'Row Count': rows.length,
                'Error': '',
                'Event': true
            };
        } catch (e: any) {
            return { ...EMPTY_OUTPUTS, 'Error': e.message || String(e) };
        }
    }
}
